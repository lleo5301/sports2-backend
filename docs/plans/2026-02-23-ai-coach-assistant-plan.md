# AI Coach Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered baseball analytics assistant that lets coaches chat with Claude, which uses MCP tools to query the team's data and return data-driven insights.

**Architecture:** Express backend orchestrates Claude API calls with SSE streaming responses. A separate MCP microservice (port 5002) exposes 18 baseball-specific data tools backed by the existing PostgreSQL database. Hybrid API key model (platform + BYOK). Conversations and insights persisted for reference.

**Tech Stack:** Node.js 24, Express 4.x, Anthropic SDK (`@anthropic-ai/sdk`), MCP SDK (`@modelcontextprotocol/sdk`), Sequelize ORM, PostgreSQL 15, SSE streaming, AES-256 encryption

**Design doc:** `docs/plans/2026-02-23-ai-coach-assistant-design.md`

---

## Task 1: Database Migrations — AI Tables

Create the 5 new tables needed for the AI feature.

**Files:**
- Create: `src/migrations/20260223000001-create-ai-conversations.js`
- Create: `src/migrations/20260223000002-create-ai-messages.js`
- Create: `src/migrations/20260223000003-create-ai-insights.js`
- Create: `src/migrations/20260223000004-create-ai-api-keys.js`
- Create: `src/migrations/20260223000005-create-ai-usage-logs.js`

**Step 1: Create AiConversation migration**

```javascript
// src/migrations/20260223000001-create-ai-conversations.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_conversations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      model: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'claude-sonnet-4-6'
      },
      system_prompt: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      total_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_conversations', ['team_id']);
    await queryInterface.addIndex('ai_conversations', ['user_id']);
    await queryInterface.addIndex('ai_conversations', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_conversations');
  }
};
```

**Step 2: Create AiMessage migration**

```javascript
// src/migrations/20260223000002-create-ai-messages.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ai_conversations', key: 'id' },
        onDelete: 'CASCADE'
      },
      role: {
        type: Sequelize.ENUM('user', 'assistant', 'tool_call', 'tool_result'),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tool_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      token_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_messages', ['conversation_id']);
    await queryInterface.addIndex('ai_messages', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_messages');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_messages_role";');
  }
};
```

**Step 3: Create AiInsight migration**

```javascript
// src/migrations/20260223000003-create-ai-insights.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_insights', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      category: {
        type: Sequelize.ENUM(
          'player_performance', 'pitching_analysis', 'recruiting',
          'lineup', 'scouting', 'game_recap', 'weekly_digest'
        ),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      data_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      prompt_used: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_pinned: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_insights', ['team_id']);
    await queryInterface.addIndex('ai_insights', ['category']);
    await queryInterface.addIndex('ai_insights', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_insights');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_insights_category";');
  }
};
```

**Step 4: Create AiApiKey migration**

```javascript
// src/migrations/20260223000004-create-ai-api-keys.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_api_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onDelete: 'CASCADE'
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'anthropic'
      },
      api_key_enc: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_api_keys', ['team_id', 'provider'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_api_keys');
  }
};
```

**Step 5: Create AiUsageLog migration**

```javascript
// src/migrations/20260223000005-create-ai-usage-logs.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_usage_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE'
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'ai_conversations', key: 'id' },
        onDelete: 'SET NULL'
      },
      model: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      input_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      output_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_tokens: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cost_usd: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0
      },
      key_source: {
        type: Sequelize.ENUM('platform', 'byok'),
        allowNull: false,
        defaultValue: 'platform'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('ai_usage_logs', ['team_id']);
    await queryInterface.addIndex('ai_usage_logs', ['user_id']);
    await queryInterface.addIndex('ai_usage_logs', ['created_at']);
    await queryInterface.addIndex('ai_usage_logs', ['conversation_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_usage_logs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ai_usage_logs_key_source";');
  }
};
```

**Step 6: Run migrations**

```bash
docker exec sports2_backend npm run db:migrate
```

Expected: All 5 migrations run successfully.

**Step 7: Commit**

```bash
git add src/migrations/20260223000001-create-ai-conversations.js \
        src/migrations/20260223000002-create-ai-messages.js \
        src/migrations/20260223000003-create-ai-insights.js \
        src/migrations/20260223000004-create-ai-api-keys.js \
        src/migrations/20260223000005-create-ai-usage-logs.js
git commit -m "feat(ai): add database migrations for AI coach assistant tables"
```

---

## Task 2: Sequelize Models — AI Entities

Create the 5 Sequelize models and register them in `src/models/index.js`.

**Files:**
- Create: `src/models/AiConversation.js`
- Create: `src/models/AiMessage.js`
- Create: `src/models/AiInsight.js`
- Create: `src/models/AiApiKey.js`
- Create: `src/models/AiUsageLog.js`
- Modify: `src/models/index.js` — import models and define associations

**Step 1: Create AiConversation model**

```javascript
// src/models/AiConversation.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiConversation = sequelize.define('AiConversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  model: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'claude-sonnet-4-6'
  },
  system_prompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_archived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'ai_conversations',
  timestamps: true,
  underscored: true
});

module.exports = AiConversation;
```

**Step 2: Create AiMessage model**

```javascript
// src/models/AiMessage.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiMessage = sequelize.define('AiMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'ai_conversations', key: 'id' }
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant', 'tool_call', 'tool_result'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tool_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  token_count: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'ai_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiMessage;
```

**Step 3: Create AiInsight model**

```javascript
// src/models/AiInsight.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiInsight = sequelize.define('AiInsight', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  category: {
    type: DataTypes.ENUM(
      'player_performance', 'pitching_analysis', 'recruiting',
      'lineup', 'scouting', 'game_recap', 'weekly_digest'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data_snapshot: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  prompt_used: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'ai_insights',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiInsight;
```

**Step 4: Create AiApiKey model**

```javascript
// src/models/AiApiKey.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiApiKey = sequelize.define('AiApiKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'anthropic'
  },
  api_key_enc: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'ai_api_keys',
  timestamps: true,
  underscored: true
});

module.exports = AiApiKey;
```

**Step 5: Create AiUsageLog model**

```javascript
// src/models/AiUsageLog.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiUsageLog = sequelize.define('AiUsageLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'ai_conversations', key: 'id' }
  },
  model: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  input_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  output_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  cost_usd: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    defaultValue: 0
  },
  key_source: {
    type: DataTypes.ENUM('platform', 'byok'),
    allowNull: false,
    defaultValue: 'platform'
  }
}, {
  tableName: 'ai_usage_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiUsageLog;
```

**Step 6: Register models and associations in `src/models/index.js`**

Add imports after the existing model imports (after line 41 `const Tournament = require('./Tournament');`):

```javascript
const AiConversation = require('./AiConversation');
const AiMessage = require('./AiMessage');
const AiInsight = require('./AiInsight');
const AiApiKey = require('./AiApiKey');
const AiUsageLog = require('./AiUsageLog');
```

Add associations at the end of the associations section (before `module.exports`):

```javascript
// AI Coach Assistant associations
AiConversation.belongsTo(Team, { foreignKey: 'team_id' });
AiConversation.belongsTo(User, { foreignKey: 'user_id' });
AiConversation.hasMany(AiMessage, { foreignKey: 'conversation_id', as: 'messages' });
Team.hasMany(AiConversation, { foreignKey: 'team_id' });
User.hasMany(AiConversation, { foreignKey: 'user_id' });

AiMessage.belongsTo(AiConversation, { foreignKey: 'conversation_id' });

AiInsight.belongsTo(Team, { foreignKey: 'team_id' });
AiInsight.belongsTo(User, { foreignKey: 'user_id' });
Team.hasMany(AiInsight, { foreignKey: 'team_id' });

AiApiKey.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasOne(AiApiKey, { foreignKey: 'team_id' });

AiUsageLog.belongsTo(Team, { foreignKey: 'team_id' });
AiUsageLog.belongsTo(User, { foreignKey: 'user_id' });
AiUsageLog.belongsTo(AiConversation, { foreignKey: 'conversation_id' });
Team.hasMany(AiUsageLog, { foreignKey: 'team_id' });
```

Add to `module.exports`:

```javascript
AiConversation,
AiMessage,
AiInsight,
AiApiKey,
AiUsageLog,
```

**Step 7: Verify backend restarts successfully**

```bash
docker restart sports2_backend && sleep 3 && docker logs sports2_backend --tail 10
```

Expected: Server starts without model/association errors.

**Step 8: Commit**

```bash
git add src/models/AiConversation.js src/models/AiMessage.js src/models/AiInsight.js \
        src/models/AiApiKey.js src/models/AiUsageLog.js src/models/index.js
git commit -m "feat(ai): add Sequelize models for AI coach assistant"
```

---

## Task 3: MCP Server — Project Scaffold & Player Tools

Create the MCP server as a separate Node.js project within the repo. Start with the server framework and the 5 player analysis tools.

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/Dockerfile`
- Create: `mcp-server/src/index.js` — Express server with tool registry
- Create: `mcp-server/src/config/database.js` — Sequelize connection (same DB)
- Create: `mcp-server/src/tools/playerTools.js` — `get_player_stats`, `get_player_splits`, `get_player_trend`, `compare_players`, `search_players`

**Step 1: Create `mcp-server/package.json`**

```json
{
  "name": "sports2-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for Sports2 AI Coach Assistant",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "sequelize": "^6.37.0",
    "pg": "^8.13.0",
    "pg-hstore": "^2.3.4",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

**Step 2: Create `mcp-server/Dockerfile`**

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5002

CMD ["node", "src/index.js"]
```

**Step 3: Create `mcp-server/src/config/database.js`**

```javascript
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'sports2',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres123',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
  }
);

module.exports = { sequelize };
```

**Step 4: Create `mcp-server/src/index.js`**

This is the MCP server entry point. It exposes `GET /tools` and `POST /tools/:name` endpoints.

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./config/database');

const app = express();
app.use(cors());
app.use(express.json());

// Tool registry — tools register themselves here
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

registerTools(playerTools);
registerTools(gameTools);
registerTools(scoutingTools);
registerTools(opsTools);

// GET /tools — list all available tools (name, description, parameters)
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

  if (!team_id) {
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
```

**Step 5: Create `mcp-server/src/tools/playerTools.js`**

These tools query the existing `players`, `player_season_stats`, `player_career_stats`, and `game_statistics` tables.

```javascript
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'search_players',
    description: 'Search for players by name, position, or class year. Use this to find player IDs before calling other player tools.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search by player name (first or last)' },
        position: { type: 'string', description: 'Filter by position (P, C, 1B, 2B, 3B, SS, LF, CF, RF, OF, DH)' },
        class_year: { type: 'string', description: 'Filter by class year (FR, SO, JR, SR, GR)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['p.team_id = :team_id'];
      const replacements = { team_id };

      if (input.query) {
        conditions.push("(LOWER(p.first_name) LIKE LOWER(:q) OR LOWER(p.last_name) LIKE LOWER(:q) OR LOWER(CONCAT(p.first_name, ' ', p.last_name)) LIKE LOWER(:q))");
        replacements.q = `%${input.query}%`;
      }
      if (input.position) {
        conditions.push('p.position = :position');
        replacements.position = input.position;
      }
      if (input.class_year) {
        conditions.push('p.class_year = :class_year');
        replacements.class_year = input.class_year;
      }

      const players = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.position, p.jersey_number,
               p.class_year, p.bats, p.throws, p.height, p.weight,
               p.batting_avg, p.home_runs, p.rbi, p.era, p.wins, p.losses,
               p.status, p.photo_url
        FROM players p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.last_name, p.first_name
        LIMIT 25
      `, { replacements, type: QueryTypes.SELECT });

      return { players, count: players.length };
    }
  },

  {
    name: 'get_player_stats',
    description: 'Get detailed batting, pitching, or fielding statistics for a specific player. Returns season stats if season specified, career stats otherwise.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID (use search_players to find)' },
        season: { type: 'string', description: 'Season name (e.g., "2026 Baseball"). Omit for career stats.' },
        stat_type: { type: 'string', enum: ['batting', 'pitching', 'fielding'], description: 'Type of stats to return' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      // Get player info
      const [player] = await sequelize.query(`
        SELECT id, first_name, last_name, position, jersey_number, class_year, bats, throws
        FROM players WHERE id = :player_id AND team_id = :team_id
      `, { replacements: { player_id: input.player_id, team_id }, type: QueryTypes.SELECT });

      if (!player) return { error: 'Player not found' };

      if (input.season) {
        // Season stats
        const [stats] = await sequelize.query(`
          SELECT * FROM player_season_stats
          WHERE player_id = :player_id AND season = :season
        `, { replacements: { player_id: input.player_id, season: input.season }, type: QueryTypes.SELECT });

        return { player, season: input.season, stats: stats || null };
      } else {
        // Career stats
        const [stats] = await sequelize.query(`
          SELECT * FROM player_career_stats WHERE player_id = :player_id
        `, { replacements: { player_id: input.player_id }, type: QueryTypes.SELECT });

        return { player, career_stats: stats || null };
      }
    }
  },

  {
    name: 'get_player_splits',
    description: 'Get a player\'s split statistics (vs LHP/RHP, home/away, RISP, with runners, two outs, bases loaded, leadoff, conference). Requires season stats with split_stats JSONB field.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID' },
        season: { type: 'string', description: 'Season name. Omit for most recent.' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      const seasonCondition = input.season ? 'AND pss.season = :season' : '';
      const replacements = { player_id: input.player_id, team_id };
      if (input.season) replacements.season = input.season;

      const stats = await sequelize.query(`
        SELECT pss.season, pss.split_stats
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE pss.player_id = :player_id AND p.team_id = :team_id ${seasonCondition}
        ORDER BY pss.season DESC
        LIMIT 1
      `, { replacements, type: QueryTypes.SELECT });

      if (!stats.length || !stats[0].split_stats) {
        return { error: 'No split stats available for this player/season' };
      }

      return { season: stats[0].season, splits: stats[0].split_stats };
    }
  },

  {
    name: 'get_player_trend',
    description: 'Get a player\'s game-by-game performance over recent games to identify hot/cold streaks and trends.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID' },
        last_n_games: { type: 'integer', description: 'Number of recent games (default 10)' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      const limit = input.last_n_games || 10;

      const games = await sequelize.query(`
        SELECT g.game_date, g.opponent, g.result, g.team_score, g.opponent_score,
               gs.at_bats, gs.runs, gs.hits, gs.doubles, gs.triples, gs.home_runs,
               gs.rbi, gs.walks, gs.strikeouts_batting, gs.stolen_bases,
               gs.innings_pitched, gs.hits_allowed, gs.runs_allowed, gs.earned_runs,
               gs.walks_allowed, gs.strikeouts_pitching, gs.pitches_thrown,
               gs.position_played
        FROM game_statistics gs
        JOIN games g ON g.id = gs.game_id
        JOIN players p ON p.id = gs.player_id
        WHERE gs.player_id = :player_id AND p.team_id = :team_id
        ORDER BY g.game_date DESC
        LIMIT :limit
      `, { replacements: { player_id: input.player_id, team_id, limit }, type: QueryTypes.SELECT });

      return { player_id: input.player_id, games: games.reverse(), count: games.length };
    }
  },

  {
    name: 'compare_players',
    description: 'Compare 2 or more players side-by-side on their season or career statistics.',
    parameters: {
      type: 'object',
      properties: {
        player_ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Array of 2+ player IDs to compare'
        },
        season: { type: 'string', description: 'Season name. Omit for career stats.' }
      },
      required: ['player_ids']
    },
    handler: async (input, { team_id }) => {
      const ids = input.player_ids;
      if (!ids || ids.length < 2) return { error: 'Need at least 2 player IDs' };

      const players = await sequelize.query(`
        SELECT id, first_name, last_name, position, jersey_number, class_year, bats, throws
        FROM players WHERE id IN (:ids) AND team_id = :team_id
      `, { replacements: { ids, team_id }, type: QueryTypes.SELECT });

      let stats;
      if (input.season) {
        stats = await sequelize.query(`
          SELECT player_id, season, games_played, games_started,
                 at_bats, runs, hits, doubles, triples, home_runs, rbi,
                 walks, strikeouts, stolen_bases, caught_stealing,
                 batting_average, on_base_percentage, slugging_percentage, ops,
                 innings_pitched, wins, losses, saves, era, whip,
                 strikeouts_pitching, walks_pitching
          FROM player_season_stats WHERE player_id IN (:ids) AND season = :season
        `, { replacements: { ids, season: input.season }, type: QueryTypes.SELECT });
      } else {
        stats = await sequelize.query(`
          SELECT * FROM player_career_stats WHERE player_id IN (:ids)
        `, { replacements: { ids }, type: QueryTypes.SELECT });
      }

      return { players, stats, comparison_type: input.season ? 'season' : 'career' };
    }
  }
];
```

**Step 6: Create stub tool files for game, scouting, and ops tools (empty arrays for now)**

```javascript
// mcp-server/src/tools/gameTools.js
module.exports = [];
```

```javascript
// mcp-server/src/tools/scoutingTools.js
module.exports = [];
```

```javascript
// mcp-server/src/tools/opsTools.js
module.exports = [];
```

**Step 7: Add MCP server to `docker-compose.yml`**

Add after the `pgadmin` service in the root `docker-compose.yml`:

```yaml
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: sports2_mcp
    restart: unless-stopped
    environment:
      - NODE_ENV=development
      - PORT=5002
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=sports2
      - DB_USER=postgres
      - DB_PASSWORD=postgres123
    ports:
      - "5002:5002"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - backend-network
    command: npm run dev
    volumes:
      - ./mcp-server:/app
      - /app/node_modules
```

**Step 8: Build and start MCP server**

```bash
cd /Users/leo/testcopy/sports2-backend && docker compose up -d mcp-server
```

**Step 9: Verify tools endpoint**

```bash
curl -s http://localhost:5002/tools | python3 -m json.tool
```

Expected: JSON with 5 player tools listed.

**Step 10: Commit**

```bash
git add mcp-server/ docker-compose.yml
git commit -m "feat(ai): scaffold MCP server with player analysis tools"
```

---

## Task 4: MCP Server — Game & Team Tools

Add the 5 game and team analysis tools.

**Files:**
- Modify: `mcp-server/src/tools/gameTools.js`

**Step 1: Implement game tools**

```javascript
// mcp-server/src/tools/gameTools.js
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_game_boxscore',
    description: 'Get the full box score for a specific game including all player stats, line score, and game summary.',
    parameters: {
      type: 'object',
      properties: {
        game_id: { type: 'integer', description: 'Game ID' }
      },
      required: ['game_id']
    },
    handler: async (input, { team_id }) => {
      const [game] = await sequelize.query(`
        SELECT id, opponent, game_date, home_away, team_score, opponent_score,
               result, location, season_name, venue_name, game_status, attendance,
               weather, game_duration, game_summary, team_stats, opponent_stats,
               running_record, play_by_play
        FROM games WHERE id = :game_id AND team_id = :team_id
      `, { replacements: { game_id: input.game_id, team_id }, type: QueryTypes.SELECT });

      if (!game) return { error: 'Game not found' };

      const playerStats = await sequelize.query(`
        SELECT gs.*, p.first_name, p.last_name, p.jersey_number, p.position
        FROM game_statistics gs
        JOIN players p ON p.id = gs.player_id
        WHERE gs.game_id = :game_id
        ORDER BY gs.position_played, p.last_name
      `, { replacements: { game_id: input.game_id }, type: QueryTypes.SELECT });

      return { game, player_stats: playerStats };
    }
  },

  {
    name: 'get_play_by_play',
    description: 'Get play-by-play data for a game, optionally filtered by inning.',
    parameters: {
      type: 'object',
      properties: {
        game_id: { type: 'integer', description: 'Game ID' },
        inning: { type: 'integer', description: 'Filter to specific inning number' }
      },
      required: ['game_id']
    },
    handler: async (input, { team_id }) => {
      const [game] = await sequelize.query(`
        SELECT id, opponent, game_date, play_by_play
        FROM games WHERE id = :game_id AND team_id = :team_id
      `, { replacements: { game_id: input.game_id, team_id }, type: QueryTypes.SELECT });

      if (!game) return { error: 'Game not found' };
      if (!game.play_by_play) return { error: 'No play-by-play data available for this game' };

      let pbp = game.play_by_play;
      if (input.inning && Array.isArray(pbp)) {
        pbp = pbp.filter(p => p.inning === input.inning);
      }

      return { game_id: game.id, opponent: game.opponent, game_date: game.game_date, plays: pbp };
    }
  },

  {
    name: 'get_team_record',
    description: 'Get the team\'s win-loss record, optionally filtered by conference, home/away, or season.',
    parameters: {
      type: 'object',
      properties: {
        season: { type: 'string', description: 'Season name to filter' },
        split: { type: 'string', enum: ['overall', 'conference', 'home', 'away', 'neutral'], description: 'Record split type' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['team_id = :team_id', "game_status = 'completed'"];
      const replacements = { team_id };

      if (input.season) {
        conditions.push('season_name = :season');
        replacements.season = input.season;
      }
      if (input.split === 'conference') conditions.push('is_conference = true');
      if (input.split === 'home') conditions.push("home_away = 'home'");
      if (input.split === 'away') conditions.push("home_away = 'away'");
      if (input.split === 'neutral') conditions.push('is_neutral = true');

      const [record] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE result = 'W') AS wins,
          COUNT(*) FILTER (WHERE result = 'L') AS losses,
          COUNT(*) FILTER (WHERE result = 'T') AS ties,
          COUNT(*) AS total_games,
          ROUND(AVG(team_score)::numeric, 1) AS avg_runs_scored,
          ROUND(AVG(opponent_score)::numeric, 1) AS avg_runs_allowed,
          SUM(team_score) AS total_runs_scored,
          SUM(opponent_score) AS total_runs_allowed
        FROM games WHERE ${conditions.join(' AND ')}
      `, { replacements, type: QueryTypes.SELECT });

      return { record, split: input.split || 'overall', season: input.season || 'all' };
    }
  },

  {
    name: 'get_team_stats',
    description: 'Get aggregated team-level batting or pitching statistics for the season.',
    parameters: {
      type: 'object',
      properties: {
        season: { type: 'string', description: 'Season name' },
        stat_type: { type: 'string', enum: ['batting', 'pitching'], description: 'Type of stats' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['g.team_id = :team_id'];
      const replacements = { team_id };

      if (input.season) {
        conditions.push('g.season_name = :season');
        replacements.season = input.season;
      }

      if (input.stat_type === 'pitching') {
        const [stats] = await sequelize.query(`
          SELECT
            COUNT(DISTINCT g.id) AS games,
            SUM(gs.innings_pitched) AS total_ip,
            SUM(gs.hits_allowed) AS total_hits_allowed,
            SUM(gs.earned_runs) AS total_earned_runs,
            SUM(gs.walks_allowed) AS total_walks,
            SUM(gs.strikeouts_pitching) AS total_strikeouts,
            SUM(gs.home_runs_allowed) AS total_hr_allowed,
            ROUND((SUM(gs.earned_runs) * 9.0 / NULLIF(SUM(gs.innings_pitched), 0))::numeric, 2) AS team_era,
            ROUND(((SUM(gs.walks_allowed) + SUM(gs.hits_allowed)) / NULLIF(SUM(gs.innings_pitched), 0))::numeric, 2) AS team_whip
          FROM game_statistics gs
          JOIN games g ON g.id = gs.game_id
          WHERE ${conditions.join(' AND ')} AND gs.innings_pitched > 0
        `, { replacements, type: QueryTypes.SELECT });
        return { stat_type: 'pitching', stats };
      } else {
        const [stats] = await sequelize.query(`
          SELECT
            COUNT(DISTINCT g.id) AS games,
            SUM(gs.at_bats) AS total_ab,
            SUM(gs.hits) AS total_hits,
            SUM(gs.runs) AS total_runs,
            SUM(gs.doubles) AS total_doubles,
            SUM(gs.triples) AS total_triples,
            SUM(gs.home_runs) AS total_hr,
            SUM(gs.rbi) AS total_rbi,
            SUM(gs.walks) AS total_walks,
            SUM(gs.strikeouts_batting) AS total_strikeouts,
            SUM(gs.stolen_bases) AS total_sb,
            ROUND((SUM(gs.hits)::numeric / NULLIF(SUM(gs.at_bats), 0))::numeric, 3) AS team_avg,
            ROUND(((SUM(gs.hits) + SUM(gs.walks) + COALESCE(SUM(gs.hit_by_pitch), 0))::numeric /
              NULLIF(SUM(gs.at_bats) + SUM(gs.walks) + COALESCE(SUM(gs.hit_by_pitch), 0) + COALESCE(SUM(gs.sacrifice_flies), 0), 0))::numeric, 3) AS team_obp
          FROM game_statistics gs
          JOIN games g ON g.id = gs.game_id
          WHERE ${conditions.join(' AND ')} AND gs.at_bats > 0
        `, { replacements, type: QueryTypes.SELECT });
        return { stat_type: 'batting', stats };
      }
    }
  },

  {
    name: 'get_season_leaders',
    description: 'Get the top players in a specific statistical category for the season. Use minimum qualifiers to filter out small sample sizes.',
    parameters: {
      type: 'object',
      properties: {
        stat_field: {
          type: 'string',
          description: 'Stat field to rank by (e.g., batting_average, home_runs, rbi, era, strikeouts_pitching, stolen_bases, ops, wins)'
        },
        top_n: { type: 'integer', description: 'Number of top players to return (default 10)' },
        season: { type: 'string', description: 'Season name' },
        min_at_bats: { type: 'integer', description: 'Minimum at-bats qualifier for batting stats (default 20)' },
        min_innings: { type: 'number', description: 'Minimum innings pitched for pitching stats (default 10)' }
      },
      required: ['stat_field']
    },
    handler: async (input, { team_id }) => {
      const pitchingStats = ['era', 'whip', 'wins', 'losses', 'saves', 'strikeouts_pitching', 'walks_pitching', 'innings_pitched'];
      const isPitching = pitchingStats.includes(input.stat_field);
      const topN = input.top_n || 10;

      const conditions = ['p.team_id = :team_id'];
      const replacements = { team_id, limit: topN };

      if (input.season) {
        conditions.push('pss.season = :season');
        replacements.season = input.season;
      }

      if (isPitching) {
        const minIP = input.min_innings || 10;
        conditions.push('pss.innings_pitched >= :min_ip');
        replacements.min_ip = minIP;
      } else {
        const minAB = input.min_at_bats || 20;
        conditions.push('pss.at_bats >= :min_ab');
        replacements.min_ab = minAB;
      }

      // Determine sort direction (lower is better for ERA, WHIP)
      const ascStats = ['era', 'whip'];
      const sortDir = ascStats.includes(input.stat_field) ? 'ASC' : 'DESC';

      const leaders = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.position, p.jersey_number, p.class_year,
               pss.season, pss.games_played, pss.at_bats, pss.innings_pitched,
               pss.${input.stat_field} AS stat_value
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE ${conditions.join(' AND ')} AND pss.${input.stat_field} IS NOT NULL
        ORDER BY pss.${input.stat_field} ${sortDir}
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { stat_field: input.stat_field, leaders, qualifier: isPitching ? `${replacements.min_ip}+ IP` : `${replacements.min_ab}+ AB` };
    }
  }
];
```

**Step 2: Restart MCP server and verify**

```bash
docker compose restart mcp-server
curl -s http://localhost:5002/tools | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"tools\"])} tools loaded')"
```

Expected: `10 tools loaded`

**Step 3: Commit**

```bash
git add mcp-server/src/tools/gameTools.js
git commit -m "feat(ai): add game and team MCP tools"
```

---

## Task 5: MCP Server — Scouting & Operations Tools

Add the remaining 8 tools (scouting, recruiting, operations).

**Files:**
- Modify: `mcp-server/src/tools/scoutingTools.js`
- Modify: `mcp-server/src/tools/opsTools.js`

**Step 1: Implement scouting tools**

```javascript
// mcp-server/src/tools/scoutingTools.js
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_scouting_reports',
    description: 'Get scouting reports for a player or prospect. Returns 20-80 scale grades, notes, and evaluation details.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID (for rostered players)' },
        prospect_id: { type: 'integer', description: 'Prospect ID (for recruits)' },
        latest_only: { type: 'boolean', description: 'Only return the most recent report (default false)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['sr.team_id = :team_id'];
      const replacements = { team_id };

      if (input.player_id) {
        conditions.push('sr.player_id = :player_id');
        replacements.player_id = input.player_id;
      } else if (input.prospect_id) {
        conditions.push('sr.prospect_id = :prospect_id');
        replacements.prospect_id = input.prospect_id;
      } else {
        return { error: 'Either player_id or prospect_id is required' };
      }

      const limit = input.latest_only ? 'LIMIT 1' : 'LIMIT 10';

      const reports = await sequelize.query(`
        SELECT sr.id, sr.report_date, sr.game_date, sr.opponent, sr.event_type,
               sr.overall_present, sr.overall_future, sr.overall_future_potential,
               sr.hitting_present, sr.hitting_future,
               sr.bat_speed_present, sr.bat_speed_future,
               sr.raw_power_present, sr.raw_power_future,
               sr.game_power_present, sr.game_power_future,
               sr.plate_discipline_present, sr.plate_discipline_future,
               sr.pitching_present, sr.pitching_future,
               sr.fastball_present, sr.fastball_future,
               sr.curveball_present, sr.curveball_future,
               sr.slider_present, sr.slider_future,
               sr.changeup_present, sr.changeup_future,
               sr.command_present, sr.command_future,
               sr.fielding_present, sr.fielding_future,
               sr.arm_strength_present, sr.arm_strength_future,
               sr.speed_present, sr.speed_future,
               sr.baserunning_present, sr.baserunning_future,
               sr.intangibles_present, sr.intangibles_future,
               sr.baseball_iq_present, sr.baseball_iq_future,
               sr.work_ethic_grade, sr.coachability_grade,
               sr.overall_notes, sr.hitting_notes, sr.pitching_notes,
               sr.fielding_notes, sr.speed_notes, sr.intangibles_notes,
               sr.projection_notes, sr.mlb_comparison,
               sr.sixty_yard_dash, sr.fastball_velocity, sr.home_to_first,
               u.first_name AS scout_first, u.last_name AS scout_last
        FROM scouting_reports sr
        LEFT JOIN users u ON u.id = sr.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY sr.report_date DESC
        ${limit}
      `, { replacements, type: QueryTypes.SELECT });

      return { reports, count: reports.length };
    }
  },

  {
    name: 'get_prospect_pipeline',
    description: 'Get the recruiting prospect pipeline. Shows all prospects with their status, position, grades, and school info.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by pipeline status (identified, evaluating, contacted, visiting, offered, committed, signed, passed)' },
        position: { type: 'string', description: 'Filter by position' },
        grad_year: { type: 'integer', description: 'Filter by graduation year' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['pr.team_id = :team_id'];
      const replacements = { team_id };

      if (input.status) {
        conditions.push('pr.status = :status');
        replacements.status = input.status;
      }
      if (input.position) {
        conditions.push('(pr.primary_position = :position OR pr.secondary_position = :position)');
        replacements.position = input.position;
      }
      if (input.grad_year) {
        conditions.push('pr.graduation_year = :grad_year');
        replacements.grad_year = input.grad_year;
      }

      const prospects = await sequelize.query(`
        SELECT pr.id, pr.first_name, pr.last_name, pr.primary_position, pr.secondary_position,
               pr.status, pr.school_name, pr.school_type, pr.city, pr.state,
               pr.graduation_year, pr.class_year, pr.height, pr.weight,
               pr.bats, pr.throws, pr.gpa, pr.sat_score, pr.act_score,
               pr.sixty_yard_dash, pr.fastball_velocity, pr.home_to_first,
               pr.video_url, pr.notes
        FROM prospects pr
        WHERE ${conditions.join(' AND ')}
        ORDER BY pr.status, pr.last_name
      `, { replacements, type: QueryTypes.SELECT });

      return { prospects, count: prospects.length };
    }
  },

  {
    name: 'get_recruiting_board',
    description: 'Get the preference list (recruiting board) showing ranked recruiting targets.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'integer', description: 'Specific preference list ID. Omit for all lists.' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['pl.team_id = :team_id'];
      const replacements = { team_id };

      if (input.list_id) {
        conditions.push('pl.id = :list_id');
        replacements.list_id = input.list_id;
      }

      const lists = await sequelize.query(`
        SELECT pl.*,
               p.first_name AS player_first, p.last_name AS player_last, p.position AS player_position,
               pr.first_name AS prospect_first, pr.last_name AS prospect_last, pr.primary_position AS prospect_position,
               pr.status AS prospect_status, pr.school_name AS prospect_school
        FROM preference_lists pl
        LEFT JOIN players p ON p.id = pl.player_id
        LEFT JOIN prospects pr ON pr.id = pl.prospect_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY pl.rank ASC NULLS LAST, pl.created_at DESC
      `, { replacements, type: QueryTypes.SELECT });

      return { entries: lists, count: lists.length };
    }
  }
];
```

**Step 2: Implement operations tools**

```javascript
// mcp-server/src/tools/opsTools.js
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_depth_chart',
    description: 'Get the current active depth chart showing positions and ranked player assignments.',
    parameters: {
      type: 'object',
      properties: {
        depth_chart_id: { type: 'integer', description: 'Specific depth chart ID. Omit for the active/default chart.' }
      }
    },
    handler: async (input, { team_id }) => {
      let chartCondition;
      const replacements = { team_id };

      if (input.depth_chart_id) {
        chartCondition = 'dc.id = :dc_id AND dc.team_id = :team_id';
        replacements.dc_id = input.depth_chart_id;
      } else {
        chartCondition = 'dc.team_id = :team_id AND dc.is_active = true';
      }

      const [chart] = await sequelize.query(`
        SELECT dc.id, dc.name, dc.description, dc.is_active, dc.version, dc.effective_date, dc.notes
        FROM depth_charts dc WHERE ${chartCondition} LIMIT 1
      `, { replacements, type: QueryTypes.SELECT });

      if (!chart) return { error: 'No active depth chart found' };

      const positions = await sequelize.query(`
        SELECT dcp.id AS position_id, dcp.position_name, dcp.display_order,
               dchp.assignment_order,
               p.id AS player_id, p.first_name, p.last_name, p.jersey_number, p.position, p.class_year
        FROM depth_chart_positions dcp
        LEFT JOIN depth_chart_players dchp ON dchp.depth_chart_position_id = dcp.id
        LEFT JOIN players p ON p.id = dchp.player_id
        WHERE dcp.depth_chart_id = :dc_id
        ORDER BY dcp.display_order, dchp.assignment_order
      `, { replacements: { dc_id: chart.id }, type: QueryTypes.SELECT });

      return { chart, positions };
    }
  },

  {
    name: 'get_schedule',
    description: 'Get team schedule — upcoming games, past games, or practice events.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['game', 'all'], description: 'Event type (default: game)' },
        upcoming: { type: 'boolean', description: 'If true, only future events. If false, only past. Omit for all.' },
        limit: { type: 'integer', description: 'Max results (default 20)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['g.team_id = :team_id'];
      const replacements = { team_id, limit: input.limit || 20 };

      if (input.upcoming === true) {
        conditions.push('g.game_date >= CURRENT_DATE');
      } else if (input.upcoming === false) {
        conditions.push('g.game_date < CURRENT_DATE');
      }

      const sortDir = input.upcoming ? 'ASC' : 'DESC';

      const games = await sequelize.query(`
        SELECT g.id, g.opponent, g.game_date, g.game_time, g.home_away,
               g.team_score, g.opponent_score, g.result, g.game_status,
               g.location, g.venue_name, g.is_conference, g.event_type,
               g.season_name, g.opponent_logo_url
        FROM games g
        WHERE ${conditions.join(' AND ')}
        ORDER BY g.game_date ${sortDir}
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { games, count: games.length };
    }
  },

  {
    name: 'get_roster',
    description: 'Get the current team roster with player info, positions, and key stats.',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'string', description: 'Filter by position' },
        class_year: { type: 'string', description: 'Filter by class year (FR, SO, JR, SR, GR)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['p.team_id = :team_id', "p.status = 'active'"];
      const replacements = { team_id };

      if (input.position) {
        conditions.push('p.position = :position');
        replacements.position = input.position;
      }
      if (input.class_year) {
        conditions.push('p.class_year = :class_year');
        replacements.class_year = input.class_year;
      }

      const players = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position,
               p.class_year, p.bats, p.throws, p.height, p.weight,
               p.hometown, p.high_school, p.batting_avg, p.home_runs, p.rbi,
               p.era, p.wins, p.losses, p.status, p.photo_url
        FROM players p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.jersey_number
      `, { replacements, type: QueryTypes.SELECT });

      return { roster: players, count: players.length };
    }
  },

  {
    name: 'get_daily_reports',
    description: 'Get daily practice or game reports with highlights, concerns, and attendance.',
    parameters: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['practice', 'game', 'scrimmage', 'workout'], description: 'Filter by report type' },
        limit: { type: 'integer', description: 'Max results (default 10)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['dr.team_id = :team_id'];
      const replacements = { team_id, limit: input.limit || 10 };

      if (input.report_type) {
        conditions.push('dr.report_type = :report_type');
        replacements.report_type = input.report_type;
      }

      const reports = await sequelize.query(`
        SELECT dr.id, dr.report_date, dr.report_type, dr.opponent, dr.location,
               dr.start_time, dr.end_time, dr.duration_minutes,
               dr.activities, dr.highlights, dr.concerns, dr.next_steps,
               dr.players_present, dr.players_absent,
               dr.temperature, dr.weather, dr.is_complete,
               u.first_name AS author_first, u.last_name AS author_last
        FROM daily_reports dr
        LEFT JOIN users u ON u.id = dr.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY dr.report_date DESC
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { reports, count: reports.length };
    }
  },

  {
    name: 'get_matchup_analysis',
    description: 'Get historical data against a specific opponent: past game results, stats in those games, and tendencies.',
    parameters: {
      type: 'object',
      properties: {
        opponent_name: { type: 'string', description: 'Opponent team name (partial match supported)' }
      },
      required: ['opponent_name']
    },
    handler: async (input, { team_id }) => {
      const games = await sequelize.query(`
        SELECT g.id, g.opponent, g.game_date, g.home_away, g.team_score, g.opponent_score,
               g.result, g.game_status, g.team_stats, g.opponent_stats, g.game_summary
        FROM games g
        WHERE g.team_id = :team_id AND LOWER(g.opponent) LIKE LOWER(:opp)
          AND g.game_status = 'completed'
        ORDER BY g.game_date DESC
        LIMIT 20
      `, { replacements: { team_id, opp: `%${input.opponent_name}%` }, type: QueryTypes.SELECT });

      if (!games.length) return { error: `No completed games found against "${input.opponent_name}"` };

      // Aggregate record
      const wins = games.filter(g => g.result === 'W').length;
      const losses = games.filter(g => g.result === 'L').length;

      return {
        opponent: input.opponent_name,
        record: { wins, losses, total: games.length },
        games
      };
    }
  }
];
```

**Step 3: Restart and verify all 18 tools**

```bash
docker compose restart mcp-server
curl -s http://localhost:5002/tools | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"tools\"])} tools loaded')"
```

Expected: `18 tools loaded`

**Step 4: Commit**

```bash
git add mcp-server/src/tools/scoutingTools.js mcp-server/src/tools/opsTools.js
git commit -m "feat(ai): add scouting, recruiting, and operations MCP tools"
```

---

## Task 6: AI Service — Claude Orchestrator

Create the core AI service that orchestrates Claude API calls, handles tool execution via MCP, and manages streaming responses.

**Files:**
- Create: `src/services/aiService.js`

**Step 1: Install Anthropic SDK in the backend**

```bash
docker exec sports2_backend npm install @anthropic-ai/sdk
```

**Step 2: Create `src/services/aiService.js`**

This is the core orchestration layer. It:
1. Resolves the API key (BYOK or platform)
2. Fetches MCP tools from the MCP server
3. Sends messages to Claude with tool definitions
4. Handles the tool-call loop (Claude calls tools → we execute via MCP → send results back)
5. Streams the final response
6. Logs token usage

```javascript
// src/services/aiService.js
const Anthropic = require('@anthropic-ai/sdk').default;
const axios = require('axios');
const encryptionService = require('./encryptionService');
const { AiApiKey, AiUsageLog, AiMessage, AiConversation } = require('../models');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5002';
const PLATFORM_API_KEY = process.env.ANTHROPIC_API_KEY || null;

// Anthropic pricing per million tokens (as of 2026)
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
   * Returns { apiKey, keySource } where keySource is 'byok' or 'platform'.
   */
  async resolveApiKey(teamId) {
    // Check for BYOK key
    const byokKey = await AiApiKey.findOne({
      where: { team_id: teamId, provider: 'anthropic', is_active: true }
    });

    if (byokKey) {
      const apiKey = encryptionService.decrypt(byokKey.api_key_enc);
      return { apiKey, keySource: 'byok' };
    }

    // Fall back to platform key
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
   * Execute an MCP tool.
   */
  async executeMcpTool(toolName, input, teamId) {
    const response = await axios.post(`${MCP_SERVER_URL}/tools/${toolName}`, {
      input,
      team_id: teamId
    }, { timeout: 30000 });
    return response.data.result;
  }

  /**
   * Calculate cost from token usage.
   */
  calculateCost(model, inputTokens, outputTokens) {
    const pricing = PRICING[model] || PRICING['claude-sonnet-4-6'];
    return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
  }

  /**
   * Send a message in a conversation and stream the response.
   *
   * @param {object} params
   * @param {string} params.conversationId - Conversation UUID
   * @param {string} params.content - User message text
   * @param {number} params.teamId - Team ID for data isolation
   * @param {number} params.userId - User ID
   * @param {object} params.res - Express response object for SSE streaming
   */
  async sendMessage({ conversationId, content, teamId, userId, res }) {
    // 1. Get conversation and its history
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

    // 6. Set up SSE
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
    const maxLoops = 10; // Prevent infinite tool loops

    while (loopCount < maxLoops) {
      loopCount++;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: conversation.system_prompt || this.getDefaultSystemPrompt(teamId),
        tools,
        messages: currentMessages
      });

      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;

      // Process response content blocks
      let hasToolUse = false;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantText += block.text;
          // Stream text to client
          res.write(`event: content_delta\ndata: ${JSON.stringify({ text: block.text })}\n\n`);
        } else if (block.type === 'tool_use') {
          hasToolUse = true;

          // Notify client about tool call
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

      // If no tool calls, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        break;
      }

      // Continue the loop: add assistant response + tool results to messages
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

    // 9. Update conversation token count and auto-title
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
   * Groups tool_call + tool_result into the Anthropic tool_use flow.
   */
  _buildAnthropicMessages(dbMessages) {
    const messages = [];
    let i = 0;

    while (i < dbMessages.length) {
      const msg = dbMessages[i];

      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'tool_call') {
        // Group consecutive tool_call + tool_result pairs into an assistant turn
        const toolBlocks = [];
        const resultBlocks = [];

        while (i < dbMessages.length && (dbMessages[i].role === 'tool_call' || dbMessages[i].role === 'tool_result')) {
          const m = dbMessages[i];
          if (m.role === 'tool_call') {
            const parsed = JSON.parse(m.content);
            const toolUseId = `tool_${Date.now()}_${toolBlocks.length}`;
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
        continue; // Skip the i++ at the end
      }

      i++;
    }

    return messages;
  }

  /**
   * Get the default system prompt for baseball coaching.
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
```

**Step 3: Add environment variable to docker-compose.yml backend service**

Add to the backend environment section:

```yaml
      - MCP_SERVER_URL=http://mcp-server:5002
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
```

**Step 4: Commit**

```bash
git add src/services/aiService.js docker-compose.yml
git commit -m "feat(ai): add AI orchestration service with Claude + MCP tool loop"
```

---

## Task 7: AI Routes — Conversations, Messages, Insights

Create the Express routes for the AI feature.

**Files:**
- Create: `src/routes/ai.js`
- Modify: `src/server.js` — register the new route

**Step 1: Create `src/routes/ai.js`**

```javascript
// src/routes/ai.js
const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  AiConversation, AiMessage, AiInsight, AiApiKey, AiUsageLog
} = require('../models');
const aiService = require('../services/aiService');
const encryptionService = require('../services/encryptionService');
const { Op } = require('sequelize');

// All routes require authentication
router.use(protect);

// ============================================
// Conversations
// ============================================

// POST /conversations — Start a new conversation
router.post('/conversations', [
  body('model').optional().isIn(['claude-sonnet-4-6', 'claude-haiku-4-5']),
  body('system_prompt').optional().isString(),
  body('title').optional().isString().isLength({ max: 255 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  const conversation = await AiConversation.create({
    team_id: req.user.team_id,
    user_id: req.user.id,
    model: req.body.model || 'claude-sonnet-4-6',
    system_prompt: req.body.system_prompt || null,
    title: req.body.title || null
  });

  res.status(201).json({ success: true, data: conversation });
});

// GET /conversations — List conversations
router.get('/conversations', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('archived').optional().isBoolean()
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isArchived = req.query.archived === 'true';

  const { rows, count } = await AiConversation.findAndCountAll({
    where: {
      team_id: req.user.team_id,
      user_id: req.user.id,
      is_archived: isArchived
    },
    order: [['updated_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// GET /conversations/:id — Load conversation with messages
router.get('/conversations/:id', [
  param('id').isUUID()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id },
    include: [{ model: AiMessage, as: 'messages', order: [['created_at', 'ASC']] }]
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  res.json({ success: true, data: conversation });
});

// PATCH /conversations/:id — Update title or archive
router.patch('/conversations/:id', [
  param('id').isUUID(),
  body('title').optional().isString().isLength({ max: 255 }),
  body('is_archived').optional().isBoolean()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const updates = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.is_archived !== undefined) updates.is_archived = req.body.is_archived;

  await conversation.update(updates);
  res.json({ success: true, data: conversation });
});

// DELETE /conversations/:id
router.delete('/conversations/:id', [
  param('id').isUUID()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  await conversation.destroy();
  res.json({ success: true, data: { message: 'Conversation deleted' } });
});

// POST /conversations/:id/messages — Send a message (SSE streaming)
router.post('/conversations/:id/messages', [
  param('id').isUUID(),
  body('content').isString().isLength({ min: 1, max: 10000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  try {
    await aiService.sendMessage({
      conversationId: req.params.id,
      content: req.body.content,
      teamId: req.user.team_id,
      userId: req.user.id,
      res
    });
  } catch (error) {
    console.error('[AI] Message error:', error.message);
    // If headers already sent (SSE started), send error event
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// ============================================
// Insights
// ============================================

// POST /insights/generate — Generate an on-demand insight
router.post('/insights/generate', [
  body('category').isIn([
    'player_performance', 'pitching_analysis', 'recruiting',
    'lineup', 'scouting', 'game_recap', 'weekly_digest'
  ]),
  body('prompt').optional().isString(),
  body('player_id').optional().isInt(),
  body('game_id').optional().isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  const prompt = req.body.prompt || getInsightPrompt(req.body.category, req.body);

  try {
    const result = await aiService.generateInsight({
      teamId: req.user.team_id,
      userId: req.user.id,
      category: req.body.category,
      prompt
    });

    // Generate a title from the first line
    const title = result.content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 255);

    const insight = await AiInsight.create({
      team_id: req.user.team_id,
      user_id: req.user.id,
      category: req.body.category,
      title,
      content: result.content,
      data_snapshot: result.dataSnapshot,
      prompt_used: prompt
    });

    res.status(201).json({ success: true, data: insight, tokens: result.tokens });
  } catch (error) {
    console.error('[AI] Insight generation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /insights — List insights
router.get('/insights', [
  query('category').optional().isString(),
  query('pinned').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const where = { team_id: req.user.team_id };

  if (req.query.category) where.category = req.query.category;
  if (req.query.pinned === 'true') where.is_pinned = true;

  const { rows, count } = await AiInsight.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// GET /insights/:id
router.get('/insights/:id', [
  param('id').isUUID()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  res.json({ success: true, data: insight });
});

// PATCH /insights/:id — Pin/unpin
router.patch('/insights/:id', [
  param('id').isUUID(),
  body('is_pinned').optional().isBoolean()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  if (req.body.is_pinned !== undefined) {
    await insight.update({ is_pinned: req.body.is_pinned });
  }

  res.json({ success: true, data: insight });
});

// DELETE /insights/:id
router.delete('/insights/:id', [
  param('id').isUUID()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  await insight.destroy();
  res.json({ success: true, data: { message: 'Insight deleted' } });
});

// ============================================
// Pre-Built Prompts
// ============================================

router.get('/prompts', (_req, res) => {
  res.json({ success: true, data: PROMPT_TEMPLATES });
});

// ============================================
// API Keys (BYOK)
// ============================================

// POST /api-keys — Save BYOK key
router.post('/api-keys', [
  body('api_key').isString().isLength({ min: 10 }),
  body('provider').optional().isIn(['anthropic'])
], async (req, res) => {
  if (!encryptionService.isConfigured()) {
    return res.status(500).json({ success: false, error: 'Encryption not configured on server' });
  }

  const encrypted = encryptionService.encrypt(req.body.api_key);

  const [apiKey, created] = await AiApiKey.findOrCreate({
    where: { team_id: req.user.team_id, provider: req.body.provider || 'anthropic' },
    defaults: { api_key_enc: encrypted, is_active: true }
  });

  if (!created) {
    await apiKey.update({ api_key_enc: encrypted, is_active: true });
  }

  res.status(created ? 201 : 200).json({
    success: true,
    data: { has_key: true, provider: apiKey.provider, created_at: apiKey.created_at }
  });
});

// GET /api-keys — Check key status
router.get('/api-keys', async (req, res) => {
  const apiKey = await AiApiKey.findOne({
    where: { team_id: req.user.team_id, provider: 'anthropic' },
    attributes: ['provider', 'is_active', 'created_at', 'updated_at']
  });

  res.json({
    success: true,
    data: apiKey
      ? { has_key: true, provider: apiKey.provider, is_active: apiKey.is_active, created_at: apiKey.created_at }
      : { has_key: false }
  });
});

// DELETE /api-keys
router.delete('/api-keys', async (req, res) => {
  await AiApiKey.destroy({
    where: { team_id: req.user.team_id, provider: 'anthropic' }
  });

  res.json({ success: true, data: { message: 'API key removed' } });
});

// POST /api-keys/test — Validate key
router.post('/api-keys/test', [
  body('api_key').isString().isLength({ min: 10 })
], async (req, res) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({ apiKey: req.body.api_key });
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });
    res.json({ success: true, data: { valid: true } });
  } catch (error) {
    res.json({ success: true, data: { valid: false, error: error.message } });
  }
});

// ============================================
// Usage
// ============================================

// GET /usage — Team usage summary
router.get('/usage', async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  const [summary] = await sequelize.query(`
    SELECT
      COUNT(*) AS total_requests,
      SUM(total_tokens) AS total_tokens,
      SUM(cost_usd) AS total_cost_usd,
      SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN total_tokens ELSE 0 END) AS month_tokens,
      SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN cost_usd ELSE 0 END) AS month_cost_usd
    FROM ai_usage_logs WHERE team_id = :team_id
  `, { replacements: { team_id: req.user.team_id }, type: QueryTypes.SELECT });

  res.json({ success: true, data: summary });
});

// GET /usage/detail — Per-conversation breakdown
router.get('/usage/detail', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const { rows, count } = await AiUsageLog.findAndCountAll({
    where: { team_id: req.user.team_id },
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// ============================================
// Prompt Templates
// ============================================

const PROMPT_TEMPLATES = {
  player_performance: [
    {
      id: 'player_report',
      label: 'Player Report',
      description: 'Complete performance report for a specific player',
      prompt: 'Give me a complete performance report on {player}. Include current season stats, trends over the last 10 games, splits vs LHP/RHP, and how they compare to team averages. Flag any areas of concern or improvement.',
      variables: ['player']
    },
    {
      id: 'hot_cold_report',
      label: 'Hot/Cold Report',
      description: 'Who is hot and who is cold on the roster',
      prompt: 'Who are the hottest and coldest hitters on the roster over the last 7 games? Show their recent stats vs season averages and note any trends.',
      variables: []
    },
    {
      id: 'pitching_staff_check',
      label: 'Pitching Staff Check',
      description: 'Overview of the pitching staff health and performance',
      prompt: 'Give me a pitching staff overview: each pitcher\'s current season line, workload (innings pitched, pitch counts if available), and any concerning trends in walks or hard contact.',
      variables: []
    }
  ],
  game_prep: [
    {
      id: 'scouting_opponent',
      label: 'Scout Opponent',
      description: 'Scouting report on an upcoming opponent',
      prompt: 'Pull together everything we know about {opponent}. Past game results, their tendencies, and how our hitters/pitchers performed against them.',
      variables: ['opponent']
    },
    {
      id: 'lineup_builder',
      label: 'Lineup Builder',
      description: 'Optimal lineup suggestion based on stats and matchups',
      prompt: 'Based on current stats and splits, suggest an optimal lineup for today\'s game. Consider hot streaks, platoon advantages, and defensive positioning.',
      variables: []
    },
    {
      id: 'bullpen_plan',
      label: 'Bullpen Plan',
      description: 'Reliever availability and readiness ranking',
      prompt: 'Based on recent workload and performance, which relievers are available today and who should be avoided? Rank by readiness.',
      variables: []
    }
  ],
  recruiting: [
    {
      id: 'recruiting_board',
      label: 'Recruiting Board',
      description: 'Overview of recruiting targets and pipeline',
      prompt: 'Show me the current recruiting board. Summarize the top prospects by position, their grades, and where each stands in the pipeline.',
      variables: []
    },
    {
      id: 'player_development',
      label: 'Player Development',
      description: 'Players with the most development upside',
      prompt: 'Identify 3 players who have the most room for improvement based on the gap between their scouting grades (future potential) and current production. Suggest development focus areas.',
      variables: []
    },
    {
      id: 'roster_gaps',
      label: 'Roster Gaps',
      description: 'Identify thin positions and recruiting needs',
      prompt: 'Analyze our depth chart and recruiting board. Where are we thin? Which graduating seniors create holes, and do we have recruits lined up to fill them?',
      variables: []
    }
  ],
  season_analysis: [
    {
      id: 'season_summary',
      label: 'Season Summary',
      description: 'Mid-season team performance report',
      prompt: 'Give me a mid-season report: team record, key stats vs conference averages, biggest wins/losses, and standout individual performances.',
      variables: []
    },
    {
      id: 'conference_standings',
      label: 'Conference Standings',
      description: 'How our stats compare in the conference',
      prompt: 'How do our team stats stack up? Show where we rank in key offensive and pitching categories.',
      variables: []
    },
    {
      id: 'weekly_recap',
      label: 'Weekly Recap',
      description: 'Recap of the past week\'s games and highlights',
      prompt: 'Recap this past week\'s games: results, standout performers, concerning trends, and what to focus on in practice.',
      variables: []
    }
  ]
};

function getInsightPrompt(category, params) {
  const prompts = {
    game_recap: 'Generate a game recap for the most recent completed game. Include key performances, turning points, and box score highlights.',
    player_performance: params.player_id
      ? `Generate a detailed performance analysis for player ID ${params.player_id}. Include trends, splits, and development notes.`
      : 'Generate performance highlights for the top performers on the roster this season.',
    pitching_analysis: 'Generate a pitching staff analysis: each pitcher\'s season line, workload tracking, bullpen health, and efficiency metrics.',
    lineup: 'Generate an optimal lineup recommendation for the next game based on current stats, splits, and recent performance.',
    recruiting: 'Generate a recruiting pipeline status report: top prospects by position, pipeline stage, and priority actions needed.',
    scouting: 'Generate a scouting summary of recent evaluation reports and notable grades across the roster.',
    weekly_digest: 'Generate a weekly digest: games played, record, standout performances, areas of concern, and practice recommendations.'
  };
  return prompts[category] || prompts.player_performance;
}

module.exports = router;
```

**Step 2: Register the route in `src/server.js`**

Add after line 36 (existing imports):

```javascript
const aiRoutes = require('./routes/ai');
```

Add after line 147 (after the tournaments route):

```javascript
app.use('/api/v1/ai', aiRoutes);
```

**Step 3: Verify backend restarts**

```bash
docker restart sports2_backend && sleep 3 && docker logs sports2_backend --tail 5
```

Expected: Server starts without errors.

**Step 4: Commit**

```bash
git add src/routes/ai.js src/server.js
git commit -m "feat(ai): add AI routes for conversations, insights, prompts, API keys, and usage"
```

---

## Task 8: Docker & Deployment — MCP Server in Production

Add the MCP server to both the dev and production docker-compose files, and update the deploy script.

**Files:**
- Modify: `deployments/miamidade/docker-compose.yml` — add mcp-server service
- Modify: `deployments/miamidade/deploy.sh` — rsync mcp-server directory and deploy it

**Step 1: Add MCP server to production `docker-compose.yml`**

Add after the `backend` service:

```yaml
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: miamidade_mcp
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=5002
      - DB_HOST=miamidade_postgres
      - DB_PORT=5432
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - miamidade_network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:5002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s
```

Also add `MCP_SERVER_URL` and `ANTHROPIC_API_KEY` to backend environment:

```yaml
      - MCP_SERVER_URL=http://miamidade_mcp:5002
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
```

**Step 2: Update `deploy.sh` to handle MCP server**

Add rsync for the mcp-server directory alongside the existing backend rsync. Add `mcp-server` as a deployment option (e.g., `./deploy.sh mcp` or include it in the `backend` deploy).

**Step 3: Add `.env` variable placeholder**

Add `ANTHROPIC_API_KEY=` to the production `.env` file (value to be set by user).

**Step 4: Commit**

```bash
git add deployments/miamidade/docker-compose.yml deployments/miamidade/deploy.sh
git commit -m "feat(ai): add MCP server to production deployment"
```

---

## Task 9: Update OpenAPI Spec

Add the new AI endpoints to both `openapi.yaml` files.

**Files:**
- Modify: `openapi.yaml`
- Modify: `docs/openapi.yaml`

Add paths for:
- `/api/v1/ai/conversations` (GET, POST)
- `/api/v1/ai/conversations/{id}` (GET, PATCH, DELETE)
- `/api/v1/ai/conversations/{id}/messages` (POST)
- `/api/v1/ai/insights` (GET)
- `/api/v1/ai/insights/generate` (POST)
- `/api/v1/ai/insights/{id}` (GET, PATCH, DELETE)
- `/api/v1/ai/prompts` (GET)
- `/api/v1/ai/api-keys` (GET, POST, DELETE)
- `/api/v1/ai/api-keys/test` (POST)
- `/api/v1/ai/usage` (GET)
- `/api/v1/ai/usage/detail` (GET)

Add schemas for: AiConversation, AiMessage, AiInsight, PromptTemplate

**Step 1: Add the new paths and schemas**

(Full OpenAPI YAML additions — follow existing patterns in the file)

**Step 2: Commit**

```bash
git add openapi.yaml docs/openapi.yaml
git commit -m "docs: add AI coach assistant endpoints to OpenAPI spec"
```

---

## Task 10: Integration Test — End-to-End Chat Flow

Verify the full flow works: create conversation → send message → Claude calls MCP tools → response streams back.

**Prerequisites:**
- `ANTHROPIC_API_KEY` set in docker-compose.yml or .env
- MCP server running on port 5002
- Backend running on port 5000
- At least one team with players and game data in the DB

**Step 1: Get auth token**

```bash
curl -s -c /tmp/ai-test-cookies.txt -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sports2.com","password":"Admin123!"}'
```

Extract the JWT token from the response.

**Step 2: Create a conversation**

```bash
curl -s -X POST http://localhost:5000/api/v1/ai/conversations \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-sonnet-4-6"}'
```

**Step 3: Send a message (test SSE streaming)**

```bash
curl -N -X POST http://localhost:5000/api/v1/ai/conversations/<CONV_ID>/messages \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"content":"Who are the top 5 hitters on the roster by batting average?"}'
```

Expected: SSE stream with `tool_use` events for `get_season_leaders`, followed by `content_delta` events with the ranked list.

**Step 4: List prompts**

```bash
curl -s http://localhost:5000/api/v1/ai/prompts \
  -H 'Authorization: Bearer <TOKEN>' | python3 -m json.tool
```

Expected: JSON with all 12 prompt templates organized by category.

**Step 5: Generate an insight**

```bash
curl -s -X POST http://localhost:5000/api/v1/ai/insights/generate \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"category":"weekly_digest"}'
```

Expected: 201 with a generated weekly digest insight.

**Step 6: Check usage**

```bash
curl -s http://localhost:5000/api/v1/ai/usage \
  -H 'Authorization: Bearer <TOKEN>'
```

Expected: Usage summary with token counts and cost.

---

## Summary

| Task | Description | Deliverable |
|------|-------------|-------------|
| 1 | Database migrations | 5 new tables |
| 2 | Sequelize models | 5 models + associations |
| 3 | MCP server scaffold + player tools | Docker service + 5 tools |
| 4 | Game & team MCP tools | 5 additional tools |
| 5 | Scouting & ops MCP tools | 8 additional tools (18 total) |
| 6 | AI orchestration service | Claude + MCP tool loop + streaming |
| 7 | Express routes | Conversations, insights, prompts, keys, usage |
| 8 | Production deployment config | Docker compose + deploy script updates |
| 9 | OpenAPI spec update | API documentation |
| 10 | Integration test | End-to-end verification |
