require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./config/database');

const app = express();
app.use(cors());
app.use(express.json());

// Tool registry
const toolRegistry = new Map();

function registerTools(toolArray) {
  for (const tool of toolArray) {
    toolRegistry.set(tool.name, tool);
  }
}

// Load tool modules
const playerTools = require('./tools/playerTools');
const gameTools = require('./tools/gameTools');
const scoutingTools = require('./tools/scoutingTools');
const opsTools = require('./tools/opsTools');
const webTools = require('./tools/webTools');

registerTools(playerTools);
registerTools(gameTools);
registerTools(scoutingTools);
registerTools(opsTools);
registerTools(webTools);

// GET /tools — list all available tools
app.get('/tools', (_req, res) => {
  const tools = [];
  for (const [, tool] of toolRegistry) {
    tools.push({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    });
  }
  res.json({ tools });
});

// POST /tools/:name — execute a tool
app.post('/tools/:name', async (req, res) => {
  const { name } = req.params;
  const { input, team_id } = req.body;

  const tool = toolRegistry.get(name);
  if (!tool) {
    return res.status(404).json({ error: `Tool '${name}' not found` });
  }

  const noTeamTools = ['web_search', 'fetch_webpage'];
  if (!team_id && !noTeamTools.includes(name)) {
    return res.status(400).json({ error: 'team_id is required' });
  }

  try {
    const result = await tool.handler(input || {}, { team_id });
    res.json({ result });
  } catch (error) {
    console.error(`[MCP] Tool '${name}' error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', tools: toolRegistry.size });
});

const PORT = process.env.PORT || 5002;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('[MCP] Database connected');
    app.listen(PORT, () => {
      console.log(`[MCP] Server running on port ${PORT} with ${toolRegistry.size} tools`);
    });
  } catch (error) {
    console.error('[MCP] Failed to start:', error);
    process.exit(1);
  }
}

start();
