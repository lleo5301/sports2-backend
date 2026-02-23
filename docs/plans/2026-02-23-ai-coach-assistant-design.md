# AI Coach Assistant — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered baseball analytics assistant that lets coaches ask natural-language questions and receive data-driven insights powered by Claude and MCP tools.

**Architecture:** Express backend orchestrates Claude API calls with SSE streaming. A separate MCP microservice exposes 18 baseball-specific data tools backed by the existing PostgreSQL database. Hybrid API key model (platform-provided + BYOK). Conversation history and generated insights persisted for future reference.

**Tech Stack:** Anthropic Claude API (Sonnet/Haiku), MCP protocol, Node.js, Express, Sequelize, SSE, AES-256 encryption

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Chat Panel   │  │ Insight Cards│  │ Prompt Templates  │ │
│  │  (streaming)  │  │ (dashboard)  │  │ (quick actions)   │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                Express Backend (:5000)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /api/v1/ai/*  routes                                │   │
│  │  - POST /conversations          (start/list)         │   │
│  │  - POST /conversations/:id/messages  (send message)  │   │
│  │  - GET  /conversations/:id       (load history)      │   │
│  │  - POST /insights/generate       (on-demand)         │   │
│  │  - GET  /insights                (list saved)        │   │
│  │  - GET  /prompts                 (pre-built prompts) │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │  Anthropic SDK                             │
│                 │  (orchestrates Claude + MCP tool calls)    │
│                 ▼                                            │
│  ┌──────────────────────┐    ┌────────────────────────┐     │
│  │  Token Usage Tracker  │    │  API Key Manager       │     │
│  │  (per team/user)      │    │  (platform + BYOK)     │     │
│  └──────────────────────┘    └────────────────────────┘     │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (internal Docker network)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              MCP Server (:5002) — separate container         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Baseball Tools (~18 tools)                          │   │
│  │  - get_player_stats       - get_team_record          │   │
│  │  - compare_players        - get_depth_chart          │   │
│  │  - get_game_boxscore      - get_scouting_reports     │   │
│  │  - get_player_splits      - get_prospect_pipeline    │   │
│  │  - get_season_leaders     - get_schedule             │   │
│  │  - search_players         - get_daily_reports        │   │
│  │  - get_matchup_analysis   - get_roster               │   │
│  │  - get_team_stats         - get_play_by_play         │   │
│  │  - get_recruiting_board   - get_player_trend         │   │
│  └──────────────────────────────────────────────────────┘   │
│                 │                                            │
│           Sequelize ORM (shared models)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  PostgreSQL DB  │
         │  (existing)     │
         └────────────────┘
```

**Key decisions:**
- Express backend is the **orchestrator** — calls Claude API, which in turn calls MCP tools
- MCP server is a lightweight Node.js service on port 5002, sharing the same Postgres DB
- Streaming responses via SSE (Server-Sent Events) so coaches see answers as they generate
- Team isolation enforced at MCP tool level — every tool receives `team_id` and filters queries

---

## 2. Data Model

### AiConversation

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| team_id | INT (FK→Team) | Team isolation |
| user_id | INT (FK→User) | Who started it |
| title | VARCHAR(255) | Auto-generated from first message |
| model | VARCHAR(50) | "claude-sonnet-4-6", "claude-haiku-4-5" |
| system_prompt | TEXT | Which pre-built prompt was used |
| is_archived | BOOLEAN | Soft archive |
| total_tokens | INT | Running token count |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### AiMessage

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| conversation_id | UUID (FK→AiConversation) | |
| role | ENUM('user','assistant','tool_call','tool_result') | Message type |
| content | TEXT | Message text or JSON for tool calls |
| tool_name | VARCHAR(100) | Null unless role is tool_call/tool_result |
| token_count | INT | Tokens used for this message |
| created_at | TIMESTAMP | |

### AiInsight

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| team_id | INT (FK→Team) | |
| user_id | INT (FK→User) | Who requested (null if scheduled) |
| category | ENUM | player_performance, pitching_analysis, recruiting, lineup, scouting, game_recap, weekly_digest |
| title | VARCHAR(255) | |
| content | TEXT | Markdown-formatted insight |
| data_snapshot | JSONB | Raw data used to generate (reproducibility) |
| prompt_used | TEXT | Prompt that generated this |
| is_pinned | BOOLEAN | Coach can pin important insights |
| created_at | TIMESTAMP | |

### AiApiKey

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| team_id | INT (FK→Team) | |
| provider | VARCHAR(50) | 'anthropic' (extensible) |
| api_key_enc | TEXT | Encrypted with ENCRYPTION_KEY (AES-256) |
| is_active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### AiUsageLog

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| team_id | INT (FK→Team) | |
| user_id | INT (FK→User) | |
| conversation_id | UUID (FK, nullable) | Null for insight generation |
| model | VARCHAR(50) | |
| input_tokens | INT | |
| output_tokens | INT | |
| total_tokens | INT | |
| cost_usd | DECIMAL(10,6) | Calculated from token pricing |
| key_source | ENUM('platform','byok') | |
| created_at | TIMESTAMP | |

---

## 3. MCP Tools (18 total)

### Player Analysis

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `get_player_stats` | Season/career stats for a player | player_id, season?, stat_type: batting\|pitching\|fielding | Full stat line with calculated metrics |
| `get_player_splits` | Splits: vs LHP/RHP, home/away, RISP | player_id, season?, split_type | Split comparison table |
| `get_player_trend` | Game-by-game stat progression | player_id, stat_fields[], last_n_games? | Per-game values for trend analysis |
| `compare_players` | Side-by-side comparison of 2+ players | player_ids[], stat_type | Comparison table |
| `search_players` | Find players by name, position, criteria | query?, position?, min_avg?, class_year? | Matching players with key stats |

### Game & Team

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `get_game_boxscore` | Full box score for a game | game_id | Both teams' stats, line score |
| `get_play_by_play` | Play-by-play breakdown | game_id, inning? | Parsed PBP events |
| `get_team_record` | W-L record with splits | season?, split | Record breakdown |
| `get_team_stats` | Aggregated team batting/pitching | season?, stat_type | Team totals and averages |
| `get_season_leaders` | Leaderboard for a stat category | stat_field, top_n?, min_qualifier? | Ranked player list |

### Scouting & Recruiting

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `get_scouting_reports` | Reports for player/prospect | player_id?, prospect_id?, latest_only? | Reports with 20-80 grades |
| `get_prospect_pipeline` | Recruiting board overview | status?, position?, grad_year? | Prospects with status |
| `get_recruiting_board` | Preference list rankings | list_id? | Ranked targets |

### Operations

| Tool | Description | Parameters | Returns |
|------|-------------|------------|---------|
| `get_depth_chart` | Current depth chart | depth_chart_id? | Positions with ranked players |
| `get_schedule` | Upcoming/past schedule | date_range?, type | Events with locations |
| `get_roster` | Current roster | position?, class_year? | Player list |
| `get_daily_reports` | Practice/game daily reports | date_range?, report_type? | Reports with highlights |
| `get_matchup_analysis` | Opponent scouting data | opponent_name | Past results, tendencies |

---

## 4. Pre-Built Prompt Templates

### System Prompt

```
You are a collegiate baseball analytics assistant for {team_name}. You help
coaches make data-driven decisions about lineup construction, player development,
pitching strategy, recruiting, and game preparation.

Rules:
- Always reference specific stats and data when making recommendations
- Use standard baseball terminology and abbreviations (OPS, ERA, WHIP, K/9, etc.)
- When comparing players, present data in tables for clarity
- Flag small sample sizes (< 20 AB, < 10 IP) as unreliable
- If asked about something outside the available data, say so clearly
- Keep responses concise and actionable — coaches are busy
- Never fabricate statistics — only use data returned by tools
- Present insights with context (league averages, team averages, trends)
```

### Coach Quick-Action Prompts

#### Player Performance

**Player Report**
```
Give me a complete performance report on {player}. Include current season stats,
trends over the last 10 games, splits vs LHP/RHP, and how they compare to team
averages. Flag any areas of concern or improvement.
```

**Hot/Cold Report**
```
Who are the hottest and coldest hitters on the roster over the last 7 games?
Show their recent stats vs season averages and note any trends.
```

**Pitching Staff Check**
```
Give me a pitching staff overview: each pitcher's current season line, workload
(innings pitched, pitch counts if available), and any concerning trends in walks
or hard contact.
```

#### Game Prep

**Scouting Opponent**
```
Pull together everything we know about {opponent}. Past game results, their
tendencies, and how our hitters/pitchers performed against them.
```

**Lineup Builder**
```
Based on current stats and splits, suggest an optimal lineup for today's game.
Consider hot streaks, platoon advantages, and defensive positioning.
```

**Bullpen Plan**
```
Based on recent workload and performance, which relievers are available today
and who should be avoided? Rank by readiness.
```

#### Recruiting & Development

**Recruiting Board**
```
Show me the current recruiting board. Summarize the top prospects by position,
their grades, and where each stands in the pipeline.
```

**Player Development**
```
Identify 3 players who have the most room for improvement based on the gap
between their scouting grades (future potential) and current production.
Suggest development focus areas.
```

**Roster Gaps**
```
Analyze our depth chart and recruiting board. Where are we thin? Which graduating
seniors create holes, and do we have recruits lined up to fill them?
```

#### Season Analysis

**Season Summary**
```
Give me a mid-season report: team record, key stats vs conference averages,
biggest wins/losses, and standout individual performances.
```

**Conference Standings**
```
How do our team stats stack up? Show where we rank in key offensive and
pitching categories.
```

**Weekly Recap**
```
Recap this past week's games: results, standout performers, concerning trends,
and what to focus on in practice.
```

### On-Demand Insight Categories

| Category | What It Generates |
|----------|-------------------|
| `game_recap` | Post-game summary with key performances, turning points, box score highlights |
| `player_performance` | Individual player deep-dive with trends, splits, projections |
| `pitching_analysis` | Staff-wide pitching breakdown: workloads, efficiency, bullpen health |
| `lineup` | Data-backed lineup recommendation for next game |
| `recruiting` | Recruiting pipeline status with priority actions |
| `weekly_digest` | Week-in-review with key metrics and coach action items |

---

## 5. API Key Management & Cost Tracking

### Hybrid Key Flow

1. Coach sends a message
2. Check if team has active BYOK key in `AiApiKey` (encrypted, `is_active=true`)
3. If yes → decrypt team's key, use it for Claude API call, log as `key_source: 'byok'`
4. If no → use platform key from `ANTHROPIC_API_KEY` env var, log as `key_source: 'platform'`
5. Log token usage to `AiUsageLog` regardless of source

### API Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/ai/api-keys | Save encrypted BYOK key |
| GET | /api/v1/ai/api-keys | Check key status (never returns the key) |
| DELETE | /api/v1/ai/api-keys | Remove BYOK key |
| POST | /api/v1/ai/api-keys/test | Validate key before saving |

### Usage Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/ai/usage | Team usage summary (monthly, total, by user) |
| GET | /api/v1/ai/usage/detail | Per-conversation token breakdown |

### Platform Rate Limits

- Configurable per team: `Team.ai_monthly_token_limit` (default: 500,000 tokens/month)
- When limit reached: return 429 with message suggesting BYOK
- Super admin can adjust limits per team

---

## 6. API Routes

```
/api/v1/ai/
├── conversations/
│   ├── POST   /                     → Start new conversation
│   ├── GET    /                     → List conversations (paginated)
│   ├── GET    /:id                  → Load conversation with messages
│   ├── PATCH  /:id                  → Update title, archive
│   ├── DELETE /:id                  → Delete conversation
│   └── POST   /:id/messages         → Send message (SSE streaming)
│
├── insights/
│   ├── POST   /generate             → Generate on-demand insight
│   ├── GET    /                     → List saved insights
│   ├── GET    /:id                  → Get single insight
│   ├── PATCH  /:id                  → Pin/unpin insight
│   └── DELETE /:id                  → Delete insight
│
├── prompts/
│   └── GET    /                     → List pre-built prompt templates
│
├── api-keys/
│   ├── POST   /                     → Save BYOK key
│   ├── GET    /                     → Check key status
│   ├── DELETE /                     → Remove BYOK key
│   └── POST   /test                 → Validate key
│
└── usage/
    ├── GET    /                     → Team usage summary
    └── GET    /detail               → Per-conversation breakdown
```

### Message Flow

1. Coach sends message → `POST /conversations/:id/messages`
2. Backend saves user message to `AiMessage`
3. Backend builds Claude API call with system prompt + conversation history + MCP tool definitions
4. Claude responds — may call MCP tools (search_players → get_player_trend → final answer)
5. Backend forwards each tool call to MCP server over internal HTTP
6. MCP server queries DB with team_id isolation, returns results
7. Backend streams Claude's final response via SSE
8. All messages (user, assistant, tool_call, tool_result) saved to `AiMessage`
9. Token usage logged to `AiUsageLog`

### SSE Event Format

```
event: message_start
data: {"conversation_id": "uuid-..."}

event: content_delta
data: {"text": "partial response text"}

event: tool_use
data: {"tool": "get_player_trend", "status": "calling"}

event: tool_result
data: {"tool": "get_player_trend", "status": "complete"}

event: message_end
data: {"tokens": {"input": 2340, "output": 890}}
```

---

## 7. MCP Server Structure

Separate Node.js service, own Docker container, port 5002.

```
mcp-server/
├── package.json
├── Dockerfile
├── src/
│   ├── index.js              # Express server + tool registry
│   ├── config/
│   │   └── database.js       # Sequelize connection (same DB)
│   ├── models/               # Shared Sequelize models (symlink or copy)
│   └── tools/
│       ├── playerStats.js    # get_player_stats, get_player_splits, get_player_trend
│       ├── playerSearch.js   # search_players, compare_players
│       ├── gameTools.js      # get_game_boxscore, get_play_by_play
│       ├── teamTools.js      # get_team_record, get_team_stats, get_season_leaders
│       ├── scoutingTools.js  # get_scouting_reports, get_prospect_pipeline, get_recruiting_board
│       └── opsTools.js       # get_depth_chart, get_schedule, get_roster, get_daily_reports, get_matchup_analysis
└── docker-compose.yml        # Added to existing compose
```

### Tool Registration Format

Each tool file exports an array:
```javascript
module.exports = [
  {
    name: 'get_player_stats',
    description: 'Get batting, pitching, or fielding stats for a player by season or career',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID' },
        season: { type: 'string', description: 'Season name (e.g., "2026"). Omit for career.' },
        stat_type: { type: 'string', enum: ['batting', 'pitching', 'fielding'] }
      },
      required: ['player_id']
    },
    handler: async ({ player_id, season, stat_type }, { team_id }) => {
      // Sequelize query with team_id isolation
    }
  }
];
```

---

## 8. Docker Compose Addition

```yaml
  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    container_name: ${COMPOSE_PROJECT_NAME}_mcp
    restart: unless-stopped
    ports:
      - "${MCP_PORT:-5002}:5002"
    environment:
      - NODE_ENV=${NODE_ENV}
      - PORT=5002
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      - postgres
    networks:
      - app-network
```

---

## 9. Verification Plan

1. MCP server starts and lists 18 tools at `GET /tools`
2. Each tool returns data with team_id isolation
3. Chat flow: send message → Claude calls tools → streams response
4. Conversation history persists and replays correctly
5. BYOK key encryption/decryption round-trips correctly
6. Platform key usage tracks tokens and computes cost
7. Pre-built prompts render and produce useful baseball analysis
8. On-demand insight generation saves to AiInsight table
9. SSE streaming delivers incremental response chunks
10. Token usage limits enforce 429 when exceeded
