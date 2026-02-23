const OpenAI = require('openai');
const axios = require('axios');
const encryptionService = require('./encryptionService');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5002';
const PLATFORM_API_KEY = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || null;

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Default model (OpenRouter format: provider/model)
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';

// Model mapping: user-facing names → OpenRouter model IDs
const MODEL_MAP = {
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
  'claude-sonnet-4': 'anthropic/claude-sonnet-4',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini'
};

// Pricing per million tokens (approximate via OpenRouter)
const PRICING = {
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
  'anthropic/claude-haiku-4-5': { input: 0.80, output: 4.0 },
  'openai/gpt-4o': { input: 2.50, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 }
};

class AiService {
  constructor() {
    this._toolCache = null;
    this._toolCacheTime = 0;
  }

  /**
   * Resolve the API key for a team.
   * Check for BYOK key first, fall back to platform key.
   */
  async resolveApiKey(teamId) {
    const { AiApiKey } = require('../models');

    const byokKey = await AiApiKey.findOne({
      where: { team_id: teamId, provider: 'anthropic', is_active: true }
    });

    if (byokKey) {
      const apiKey = encryptionService.decrypt(byokKey.api_key_enc);
      return { apiKey, keySource: 'byok' };
    }

    if (!PLATFORM_API_KEY) {
      throw new Error('No AI API key configured. Ask your admin to add an API key in settings.');
    }

    return { apiKey: PLATFORM_API_KEY, keySource: 'platform' };
  }

  /**
   * Create an OpenAI client pointed at OpenRouter.
   */
  _createClient(apiKey) {
    return new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:5000',
        'X-Title': 'The Program 1814 - AI Coach'
      }
    });
  }

  /**
   * Resolve a user-facing model name to an OpenRouter model ID.
   */
  _resolveModel(model) {
    return MODEL_MAP[model] || model || DEFAULT_MODEL;
  }

  /**
   * Get MCP tools from the MCP server (cached for 5 minutes).
   */
  async getMcpTools() {
    const now = Date.now();
    if (this._toolCache && (now - this._toolCacheTime) < 300000) {
      return this._toolCache;
    }

    const response = await axios.get(`${MCP_SERVER_URL}/tools`, { timeout: 5000 });
    this._toolCache = response.data.tools;
    this._toolCacheTime = now;
    return this._toolCache;
  }

  /**
   * Execute an MCP tool by calling the MCP server.
   */
  async executeMcpTool(toolName, input, teamId) {
    const response = await axios.post(`${MCP_SERVER_URL}/tools/${toolName}`, {
      input,
      team_id: teamId
    }, { timeout: 30000 });
    return response.data.result;
  }

  /**
   * Calculate USD cost from token usage.
   */
  calculateCost(model, inputTokens, outputTokens) {
    const pricing = PRICING[model] || PRICING[DEFAULT_MODEL];
    return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
  }

  /**
   * Convert MCP tool definitions to OpenAI function-calling format.
   */
  _formatToolsForOpenAI(mcpTools) {
    return mcpTools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));
  }

  /**
   * Send a message in a conversation and stream the response via SSE.
   */
  async sendMessage({ conversationId, content, teamId, userId, res }) {
    const { AiConversation, AiMessage, AiUsageLog } = require('../models');

    // 1. Get conversation
    const conversation = await AiConversation.findOne({
      where: { id: conversationId, team_id: teamId }
    });
    if (!conversation) throw new Error('Conversation not found');

    // 2. Save user message
    await AiMessage.create({
      conversation_id: conversationId,
      role: 'user',
      content
    });

    // 3. Resolve API key
    const { apiKey, keySource } = await this.resolveApiKey(teamId);
    const client = this._createClient(apiKey);

    // 4. Get MCP tools in OpenAI format
    const mcpTools = await this.getMcpTools();
    const tools = this._formatToolsForOpenAI(mcpTools);

    // 5. Build message history from DB
    const dbMessages = await AiMessage.findAll({
      where: { conversation_id: conversationId },
      order: [['created_at', 'ASC']]
    });

    const messages = this._buildOpenAIMessages(dbMessages, conversation.system_prompt);

    // 6. Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`event: message_start\ndata: ${JSON.stringify({ conversation_id: conversationId })}\n\n`);

    // 7. Tool-calling loop
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let assistantText = '';
    let currentMessages = [...messages];
    const model = this._resolveModel(conversation.model);
    let loopCount = 0;
    const maxLoops = 10;

    while (loopCount < maxLoops) {
      loopCount++;

      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        tools,
        messages: currentMessages
      });

      const choice = response.choices[0];
      const message = choice.message;

      totalInputTokens += response.usage?.prompt_tokens || 0;
      totalOutputTokens += response.usage?.completion_tokens || 0;

      // Handle text content
      if (message.content) {
        assistantText += message.content;
        res.write(`event: content_delta\ndata: ${JSON.stringify({ text: message.content })}\n\n`);
      }

      // Handle tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Add assistant message with tool calls to history
        currentMessages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolInput;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          res.write(`event: tool_use\ndata: ${JSON.stringify({ tool: toolName, status: 'calling' })}\n\n`);

          // Save tool call message
          await AiMessage.create({
            conversation_id: conversationId,
            role: 'tool_call',
            content: JSON.stringify({ name: toolName, input: toolInput }),
            tool_name: toolName
          });

          // Execute tool via MCP
          let toolResult;
          try {
            toolResult = await this.executeMcpTool(toolName, toolInput, teamId);
          } catch (err) {
            toolResult = { error: err.message };
          }

          // Save tool result
          await AiMessage.create({
            conversation_id: conversationId,
            role: 'tool_result',
            content: JSON.stringify(toolResult),
            tool_name: toolName
          });

          // Add tool result to messages (OpenAI format)
          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });

          res.write(`event: tool_result\ndata: ${JSON.stringify({ tool: toolName, status: 'complete' })}\n\n`);
        }

        // Continue loop to get Claude's response after tool results
        if (choice.finish_reason !== 'stop') {
          continue;
        }
      }

      // No tool calls or stop reason — we're done
      break;
    }

    // 8. Save assistant response
    await AiMessage.create({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantText,
      token_count: totalOutputTokens
    });

    // 9. Update conversation
    const updates = { total_tokens: conversation.total_tokens + totalInputTokens + totalOutputTokens };
    if (!conversation.title && content) {
      updates.title = content.substring(0, 100);
    }
    await conversation.update(updates);

    // 10. Log usage
    const costUsd = this.calculateCost(model, totalInputTokens, totalOutputTokens);
    await AiUsageLog.create({
      team_id: teamId,
      user_id: userId,
      conversation_id: conversationId,
      model,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
      cost_usd: costUsd,
      key_source: keySource
    });

    // 11. End SSE stream
    res.write(`event: message_end\ndata: ${JSON.stringify({
      tokens: { input: totalInputTokens, output: totalOutputTokens, cost_usd: costUsd }
    })}\n\n`);
    res.end();
  }

  /**
   * Convert DB messages to OpenAI API format.
   * Prepends system prompt. Groups tool_call + tool_result pairs correctly.
   */
  _buildOpenAIMessages(dbMessages, systemPrompt) {
    const messages = [];

    // System prompt as first message
    messages.push({
      role: 'system',
      content: systemPrompt || this.getDefaultSystemPrompt()
    });

    let i = 0;
    while (i < dbMessages.length) {
      const msg = dbMessages[i];

      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
        i++;
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
        i++;
      } else if (msg.role === 'tool_call') {
        // Group consecutive tool_call + tool_result pairs into one assistant message
        const toolCalls = [];
        const toolResults = [];

        while (i < dbMessages.length && (dbMessages[i].role === 'tool_call' || dbMessages[i].role === 'tool_result')) {
          const m = dbMessages[i];
          if (m.role === 'tool_call') {
            const parsed = JSON.parse(m.content);
            const callId = `call_${toolCalls.length}_${Date.now()}`;
            toolCalls.push({
              id: callId,
              type: 'function',
              function: {
                name: parsed.name,
                arguments: JSON.stringify(parsed.input)
              }
            });
            // Look ahead for matching result
            if (i + 1 < dbMessages.length && dbMessages[i + 1].role === 'tool_result') {
              i++;
              toolResults.push({
                role: 'tool',
                tool_call_id: callId,
                content: dbMessages[i].content
              });
            }
          }
          i++;
        }

        if (toolCalls.length) {
          messages.push({ role: 'assistant', tool_calls: toolCalls });
          toolResults.forEach(tr => messages.push(tr));
        }
        continue;
      } else {
        i++;
      }
    }

    return messages;
  }

  /**
   * Default system prompt for baseball coaching.
   */
  getDefaultSystemPrompt() {
    return `You are a collegiate baseball analytics assistant for a coaching staff. You help coaches make data-driven decisions about lineup construction, player development, pitching strategy, recruiting, and game preparation.

You have access to the team's full database through tools. USE THEM PROACTIVELY — do not ask the user for information you can look up yourself.

Context Resolution:
- When the user says "latest game", "last game", or "most recent game", call get_schedule with upcoming=false and limit=1 to find it
- When the user says "next game", "next opponent", or "upcoming game", call get_schedule with upcoming=true and limit=1 to find it
- When the user mentions a player by partial name, call search_players to resolve the full name and ID
- When the user asks to "scout the opponent" without specifying, look up the next upcoming game first
- NEVER ask the user for information that your tools can provide — look it up first, then present your analysis

Rules:
- Always reference specific stats and data when making recommendations
- Use standard baseball terminology and abbreviations (OPS, ERA, WHIP, K/9, etc.)
- When comparing players, present data in tables for clarity
- Flag small sample sizes (< 20 AB, < 10 IP) as unreliable
- If asked about something outside the available data, say so clearly
- Keep responses concise and actionable — coaches are busy
- Never fabricate statistics — only use data returned by tools
- Present insights with context (league averages, team averages, trends)`;
  }

  /**
   * Generate an on-demand insight (non-streaming, returns complete text).
   */
  async generateInsight({ teamId, userId, category, prompt }) {
    const { AiUsageLog } = require('../models');

    const { apiKey, keySource } = await this.resolveApiKey(teamId);
    const client = this._createClient(apiKey);

    const mcpTools = await this.getMcpTools();
    const tools = this._formatToolsForOpenAI(mcpTools);

    let messages = [
      { role: 'system', content: this.getDefaultSystemPrompt() },
      { role: 'user', content: prompt }
    ];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalText = '';
    const model = DEFAULT_MODEL;
    const dataSnapshot = {};

    let loopCount = 0;
    while (loopCount < 10) {
      loopCount++;

      const response = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        tools,
        messages
      });

      const choice = response.choices[0];
      const message = choice.message;

      totalInputTokens += response.usage?.prompt_tokens || 0;
      totalOutputTokens += response.usage?.completion_tokens || 0;

      if (message.content) {
        finalText += message.content;
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolInput;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          let result;
          try {
            result = await this.executeMcpTool(toolName, toolInput, teamId);
            dataSnapshot[toolName] = result;
          } catch (err) {
            result = { error: err.message };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        if (choice.finish_reason !== 'stop') continue;
      }

      break;
    }

    // Log usage
    const costUsd = this.calculateCost(model, totalInputTokens, totalOutputTokens);
    await AiUsageLog.create({
      team_id: teamId,
      user_id: userId,
      model,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
      cost_usd: costUsd,
      key_source: keySource
    });

    return { content: finalText, dataSnapshot, tokens: { input: totalInputTokens, output: totalOutputTokens, cost_usd: costUsd } };
  }
}

module.exports = new AiService();
