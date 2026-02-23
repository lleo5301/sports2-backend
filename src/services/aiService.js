const Anthropic = require('@anthropic-ai/sdk').default;
const axios = require('axios');
const encryptionService = require('./encryptionService');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5002';
const PLATFORM_API_KEY = process.env.ANTHROPIC_API_KEY || null;

// Anthropic pricing per million tokens
const PRICING = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.80, output: 4.0 }
};

class AiService {
  constructor() {
    this._toolCache = null;
    this._toolCacheTime = 0;
  }

  /**
   * Resolve the Anthropic API key for a team.
   * Check for BYOK key first, fall back to platform key.
   */
  async resolveApiKey(teamId) {
    // Lazy-require to avoid circular dependency
    const { AiApiKey } = require('../models');

    const byokKey = await AiApiKey.findOne({
      where: { team_id: teamId, provider: 'anthropic', is_active: true }
    });

    if (byokKey) {
      const apiKey = encryptionService.decrypt(byokKey.api_key_enc);
      return { apiKey, keySource: 'byok' };
    }

    if (!PLATFORM_API_KEY) {
      throw new Error('No AI API key configured. Ask your admin to add an Anthropic API key in settings.');
    }

    return { apiKey: PLATFORM_API_KEY, keySource: 'platform' };
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
    const pricing = PRICING[model] || PRICING['claude-sonnet-4-6'];
    return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
  }

  /**
   * Send a message in a conversation and stream the response via SSE.
   *
   * This is the core method. It:
   * 1. Loads conversation history from DB
   * 2. Calls Claude with MCP tool definitions
   * 3. If Claude requests tools, executes them via MCP and continues the loop
   * 4. Streams text responses to the client via SSE
   * 5. Saves all messages (user, assistant, tool_call, tool_result) to DB
   * 6. Logs token usage
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
    const client = new Anthropic({ apiKey });

    // 4. Get MCP tools
    const mcpTools = await this.getMcpTools();
    const tools = mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));

    // 5. Build message history from DB
    const dbMessages = await AiMessage.findAll({
      where: { conversation_id: conversationId },
      order: [['created_at', 'ASC']]
    });

    const messages = this._buildAnthropicMessages(dbMessages);

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
    const model = conversation.model || 'claude-sonnet-4-6';
    let loopCount = 0;
    const maxLoops = 10;

    while (loopCount < maxLoops) {
      loopCount++;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: conversation.system_prompt || this.getDefaultSystemPrompt(),
        tools,
        messages: currentMessages
      });

      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;

      let hasToolUse = false;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantText += block.text;
          res.write(`event: content_delta\ndata: ${JSON.stringify({ text: block.text })}\n\n`);
        } else if (block.type === 'tool_use') {
          hasToolUse = true;

          res.write(`event: tool_use\ndata: ${JSON.stringify({ tool: block.name, status: 'calling' })}\n\n`);

          // Save tool call message
          await AiMessage.create({
            conversation_id: conversationId,
            role: 'tool_call',
            content: JSON.stringify({ name: block.name, input: block.input }),
            tool_name: block.name
          });

          // Execute tool via MCP
          let toolResult;
          try {
            toolResult = await this.executeMcpTool(block.name, block.input, teamId);
          } catch (err) {
            toolResult = { error: err.message };
          }

          // Save tool result
          await AiMessage.create({
            conversation_id: conversationId,
            role: 'tool_result',
            content: JSON.stringify(toolResult),
            tool_name: block.name
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          });

          res.write(`event: tool_result\ndata: ${JSON.stringify({ tool: block.name, status: 'complete' })}\n\n`);
        }
      }

      // If no tool calls or stop reason is end_turn, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        break;
      }

      // Continue the loop: add assistant response + tool results
      currentMessages.push({
        role: 'assistant',
        content: response.content
      });
      currentMessages.push({
        role: 'user',
        content: toolResults
      });
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
   * Convert DB messages to Anthropic API format.
   * Groups tool_call + tool_result pairs correctly.
   */
  _buildAnthropicMessages(dbMessages) {
    const messages = [];
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
        // Group consecutive tool_call + tool_result pairs
        const toolBlocks = [];
        const resultBlocks = [];

        while (i < dbMessages.length && (dbMessages[i].role === 'tool_call' || dbMessages[i].role === 'tool_result')) {
          const m = dbMessages[i];
          if (m.role === 'tool_call') {
            const parsed = JSON.parse(m.content);
            const toolUseId = `tool_${toolBlocks.length}_${Date.now()}`;
            toolBlocks.push({
              type: 'tool_use',
              id: toolUseId,
              name: parsed.name,
              input: parsed.input
            });
            // Look ahead for matching result
            if (i + 1 < dbMessages.length && dbMessages[i + 1].role === 'tool_result') {
              i++;
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: dbMessages[i].content
              });
            }
          }
          i++;
        }

        if (toolBlocks.length) {
          messages.push({ role: 'assistant', content: toolBlocks });
          if (resultBlocks.length) {
            messages.push({ role: 'user', content: resultBlocks });
          }
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
    return `You are a collegiate baseball analytics assistant. You help coaches make data-driven decisions about lineup construction, player development, pitching strategy, recruiting, and game preparation.

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
    const client = new Anthropic({ apiKey });

    const mcpTools = await this.getMcpTools();
    const tools = mcpTools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));

    let messages = [{ role: 'user', content: prompt }];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalText = '';
    const model = 'claude-sonnet-4-6';
    const dataSnapshot = {};

    let loopCount = 0;
    while (loopCount < 10) {
      loopCount++;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: this.getDefaultSystemPrompt(),
        tools,
        messages
      });

      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;

      let hasToolUse = false;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          finalText += block.text;
        } else if (block.type === 'tool_use') {
          hasToolUse = true;
          let result;
          try {
            result = await this.executeMcpTool(block.name, block.input, teamId);
            dataSnapshot[block.name] = result;
          } catch (err) {
            result = { error: err.message };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }

      if (!hasToolUse || response.stop_reason === 'end_turn') break;

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
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
