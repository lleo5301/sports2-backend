# AI Coach Assistant — API Reference

> AI-powered chat system where coaches can ask natural-language questions about their team's data.
> The AI uses 18 specialized baseball analysis tools to query the database and provide data-driven answers.
> All endpoints require JWT authentication (`Authorization: Bearer <token>`).
> All responses follow `{ success: boolean, data: {...} }` format unless noted otherwise.

**Provider:** Uses [OpenRouter](https://openrouter.ai) to access AI models (Claude, GPT-4o, etc.) via a single API key. Teams can bring their own key (BYOK) or use a platform-provided key.

---

## Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/ai/conversations` | Create a new conversation |
| `GET` | `/api/v1/ai/conversations` | List conversations (paginated) |
| `GET` | `/api/v1/ai/conversations/:id` | Get conversation with all messages |
| `PATCH` | `/api/v1/ai/conversations/:id` | Update title or archive status |
| `DELETE` | `/api/v1/ai/conversations/:id` | Delete conversation and all messages |
| `POST` | `/api/v1/ai/conversations/:id/messages` | Send message (SSE streaming) |
| `POST` | `/api/v1/ai/insights/generate` | Generate an AI insight |
| `GET` | `/api/v1/ai/insights` | List insights (paginated) |
| `GET` | `/api/v1/ai/insights/:id` | Get single insight |
| `PATCH` | `/api/v1/ai/insights/:id` | Pin/unpin an insight |
| `DELETE` | `/api/v1/ai/insights/:id` | Delete an insight |
| `GET` | `/api/v1/ai/prompts` | Get pre-built prompt templates |
| `POST` | `/api/v1/ai/api-keys` | Save OpenRouter API key (BYOK) |
| `GET` | `/api/v1/ai/api-keys` | Check API key status |
| `DELETE` | `/api/v1/ai/api-keys` | Remove BYOK key |
| `POST` | `/api/v1/ai/api-keys/test` | Test if a key is valid |
| `GET` | `/api/v1/ai/usage` | Usage summary for team |
| `GET` | `/api/v1/ai/usage/detail` | Detailed per-request usage logs |

**Auth:** All endpoints require `Authorization: Bearer <JWT>`. State-changing methods (`POST`, `PATCH`, `DELETE`) also require a CSRF token via the `x-csrf-token` header.

---

## Conversations

### 1. Create Conversation

### `POST /api/v1/ai/conversations`

Start a new AI chat conversation. Optionally specify a model and system prompt.

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | No | — | Display title for the conversation |
| `model` | string | No | `claude-sonnet-4-6` | AI model to use (see [Available Models](#available-ai-models)) |
| `system_prompt` | string | No | — | Custom system prompt override |

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  // UUID
    "team_id": 1,
    "user_id": 1,
    "title": "Roster Analysis",
    "model": "claude-sonnet-4-6",
    "is_archived": false,
    "created_at": "2026-02-23T14:30:00.000Z",
    "updated_at": "2026-02-23T14:30:00.000Z"
  }
}
```

---

### 2. List Conversations

### `GET /api/v1/ai/conversations`

Returns paginated list of conversations for the authenticated user.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page (1-50) |
| `archived` | boolean | — | Filter by archived status |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "title": "Roster Analysis",
        "model": "claude-sonnet-4-6",
        "is_archived": false,
        "created_at": "2026-02-23T14:30:00.000Z",
        "updated_at": "2026-02-23T15:10:00.000Z"
      }
      // ... more conversations
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8,
      "pages": 1
    }
  }
}
```

---

### 3. Get Conversation

### `GET /api/v1/ai/conversations/:id`

Returns a conversation with its full message history, sorted by `created_at` ascending.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | UUID | Conversation ID |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Roster Analysis",
    "model": "claude-sonnet-4-6",
    "is_archived": false,
    "created_at": "2026-02-23T14:30:00.000Z",
    "messages": [
      {
        "id": "msg-uuid-1",
        "role": "user",
        "content": "Who are our top 3 hitters by batting average?",
        "created_at": "2026-02-23T14:31:00.000Z"
      },
      {
        "id": "msg-uuid-2",
        "role": "assistant",
        "content": "Based on the current season stats, your top 3 hitters are...",
        "created_at": "2026-02-23T14:31:05.000Z"
      }
      // ... messages sorted chronologically
    ]
  }
}
```

---

### 4. Update Conversation

### `PATCH /api/v1/ai/conversations/:id`

Update a conversation's title or archive status. Requires CSRF token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | New display title |
| `is_archived` | boolean | No | Archive or unarchive |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Updated Title",
    "is_archived": false,
    "updated_at": "2026-02-23T16:00:00.000Z"
  }
}
```

---

### 5. Delete Conversation

### `DELETE /api/v1/ai/conversations/:id`

Permanently deletes a conversation and all its messages (cascading delete). Requires CSRF token.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "message": "Conversation deleted"
  }
}
```

---

### 6. Send Message (SSE Streaming)

### `POST /api/v1/ai/conversations/:id/messages`

Send a user message and receive the AI response as a Server-Sent Events (SSE) stream. This endpoint does **not** return JSON — it returns an `text/event-stream` response. Requires CSRF token.

The AI may call multiple tools sequentially in a single turn (e.g., `search_players` then `get_player_stats` then compose a response).

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | User message (1-10,000 characters) |

**Response — 200 (SSE stream):**

```
event: message_start
data: {"conversation_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890"}

event: content_delta
data: {"text":"Based on the current season"}

event: content_delta
data: {"text":" stats, your top 3 hitters"}

event: tool_use
data: {"tool":"search_players","status":"calling"}

event: tool_result
data: {"tool":"search_players","status":"complete"}

event: content_delta
data: {"text":" by batting average are:\n\n1. Marcus Rivera — .345\n2. ..."}

event: message_end
data: {"tokens":{"input":5579,"output":351,"cost_usd":0.022}}

```

**SSE Event Reference:**

| Event | Description | Payload |
|-------|-------------|---------|
| `message_start` | Stream has begun | `{ conversation_id }` |
| `content_delta` | Partial text chunk (may arrive many times) | `{ text }` |
| `tool_use` | AI is calling a data analysis tool | `{ tool, status: "calling" }` |
| `tool_result` | Tool returned data to the AI | `{ tool, status: "complete" }` |
| `message_end` | Stream complete; includes token usage | `{ tokens: { input, output, cost_usd } }` |
| `error` | An error occurred | `{ error }` |

**Error event example:**

```
event: error
data: {"error":"API key is invalid or expired"}
```

> **Frontend implementation note:** Concatenate all `content_delta` text values to build the full response. Show tool events as loading indicators (e.g., "Searching players..."). The `message_end` event signals the response is complete.

---

## Insights

### 7. Generate Insight

### `POST /api/v1/ai/insights/generate`

Generate an AI-powered insight for a specific category. The AI analyzes relevant team data and produces a structured summary. Requires CSRF token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category` | string | Yes | One of: `player_performance`, `pitching_analysis`, `recruiting`, `lineup`, `scouting`, `game_recap`, `weekly_digest` |
| `prompt` | string | No | Additional context or specific question |
| `player_id` | int | No | Target player (for player-specific insights) |
| `game_id` | int | No | Target game (for game-specific insights) |

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "id": 42,
    "team_id": 1,
    "user_id": 1,
    "category": "player_performance",
    "title": "Player Performance Report — Marcus Rivera",
    "content": "Marcus Rivera is having a breakout season...",
    "is_pinned": false,
    "tokens_used": 1250,
    "created_at": "2026-02-23T14:35:00.000Z"
  }
}
```

---

### 8. List Insights

### `GET /api/v1/ai/insights`

Returns paginated list of insights for the team.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `pinned` | boolean | — | Filter by pinned status |
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "insights": [
      {
        "id": 42,
        "category": "player_performance",
        "title": "Player Performance Report — Marcus Rivera",
        "content": "Marcus Rivera is having a breakout season...",
        "is_pinned": true,
        "tokens_used": 1250,
        "created_at": "2026-02-23T14:35:00.000Z"
      }
      // ... more insights
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    }
  }
}
```

---

### 9. Get Insight

### `GET /api/v1/ai/insights/:id`

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "id": 42,
    "category": "player_performance",
    "title": "Player Performance Report — Marcus Rivera",
    "content": "Marcus Rivera is having a breakout season...",
    "is_pinned": true,
    "tokens_used": 1250,
    "created_at": "2026-02-23T14:35:00.000Z"
  }
}
```

---

### 10. Pin/Unpin Insight

### `PATCH /api/v1/ai/insights/:id`

Toggle pin status on an insight. Requires CSRF token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `is_pinned` | boolean | Yes | Pin or unpin the insight |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "id": 42,
    "is_pinned": true,
    "updated_at": "2026-02-23T16:00:00.000Z"
  }
}
```

---

### 11. Delete Insight

### `DELETE /api/v1/ai/insights/:id`

Permanently deletes an insight. Requires CSRF token.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "message": "Insight deleted"
  }
}
```

---

## Prompt Templates

### 12. Get Prompt Templates

### `GET /api/v1/ai/prompts`

Returns all pre-built prompt templates organized by category. These are starter prompts coaches can use or customize before sending.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "player_performance": [
      {
        "id": "player_report",
        "label": "Player Report",
        "description": "Comprehensive performance report for a player",
        "prompt": "Give me a detailed report on {{player_name}}...",
        "variables": ["player_name"]       // Placeholders the frontend should fill in
      },
      {
        "id": "hot_cold_report",
        "label": "Hot/Cold Report",
        "description": "Identify who is trending up or down",
        "prompt": "Which players are hot and which are cold over the last 2 weeks?",
        "variables": []
      },
      {
        "id": "pitching_staff_check",
        "label": "Pitching Staff Check",
        "description": "Overview of pitching staff workload and performance",
        "prompt": "How is our pitching staff doing? Check workload and recent performance.",
        "variables": []
      }
    ],
    "game_prep": [
      {
        "id": "scouting_opponent",
        "label": "Scout Opponent",
        "description": "Pre-game scouting report on an opponent",
        "prompt": "Scout {{opponent_team}} for our upcoming game...",
        "variables": ["opponent_team"]
      },
      {
        "id": "lineup_builder",
        "label": "Lineup Builder",
        "description": "Suggest an optimal lineup",
        "prompt": "Build me an optimal lineup for our next game...",
        "variables": []
      },
      {
        "id": "bullpen_plan",
        "label": "Bullpen Plan",
        "description": "Plan bullpen usage based on recent workload",
        "prompt": "Create a bullpen plan considering recent pitch counts and rest days.",
        "variables": []
      }
    ],
    "recruiting": [
      {
        "id": "recruiting_board",
        "label": "Recruiting Board",
        "description": "Overview of current recruiting targets",
        "prompt": "Show me our recruiting board and top prospects.",
        "variables": []
      },
      {
        "id": "player_development",
        "label": "Player Development",
        "description": "Development progress for current roster",
        "prompt": "Which players have shown the most improvement this season?",
        "variables": []
      },
      {
        "id": "roster_gaps",
        "label": "Roster Gaps",
        "description": "Identify roster needs for recruiting",
        "prompt": "What positions or skill gaps should we prioritize in recruiting?",
        "variables": []
      }
    ],
    "season_analysis": [
      {
        "id": "season_summary",
        "label": "Season Summary",
        "description": "Full season performance overview",
        "prompt": "Give me a comprehensive season summary so far.",
        "variables": []
      },
      {
        "id": "conference_standings",
        "label": "Conference Standings",
        "description": "Where we stand in conference play",
        "prompt": "How do we stack up in conference play?",
        "variables": []
      },
      {
        "id": "weekly_recap",
        "label": "Weekly Recap",
        "description": "Recap of the past week's performance",
        "prompt": "Give me a recap of how we performed this past week.",
        "variables": []
      }
    ]
  }
}
```

---

## API Keys (BYOK)

Teams can bring their own OpenRouter API key for AI access. Keys are encrypted with AES-256 before storage and are never returned in plaintext.

### 13. Save API Key

### `POST /api/v1/ai/api-keys`

Save an OpenRouter API key for the team. Encrypted at rest with AES-256. Requires CSRF token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_key` | string | Yes | OpenRouter API key (min 10 characters) |
| `provider` | string | No | Provider name (default: `"anthropic"`) |

**Response — 201:**

```jsonc
{
  "success": true,
  "data": {
    "message": "API key saved",
    "provider": "anthropic",
    "is_active": true
  }
}
```

---

### 14. Check API Key Status

### `GET /api/v1/ai/api-keys`

Check whether the team has a stored API key, without revealing the key itself.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "has_key": true,
    "provider": "anthropic",
    "is_active": true,
    "created_at": "2026-01-15T10:00:00.000Z"
  }
}
```

**Response — 200 (no key stored):**

```jsonc
{
  "success": true,
  "data": {
    "has_key": false
  }
}
```

---

### 15. Remove API Key

### `DELETE /api/v1/ai/api-keys`

Delete the team's stored API key. Requires CSRF token.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "message": "API key removed"
  }
}
```

---

### 16. Test API Key

### `POST /api/v1/ai/api-keys/test`

Test whether an API key is valid by making a minimal request to OpenRouter. Requires CSRF token.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `api_key` | string | Yes | OpenRouter API key to test |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

**Response — 200 (invalid key):**

```jsonc
{
  "success": true,
  "data": {
    "valid": false,
    "error": "Invalid API key"
  }
}
```

---

## Usage Tracking

### 17. Usage Summary

### `GET /api/v1/ai/usage`

Returns aggregate AI usage for the team.

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "total_requests": 247,
    "total_tokens": 1250000,
    "total_cost_usd": 18.75,
    "month_tokens": 320000,       // Current calendar month
    "month_cost_usd": 4.80        // Current calendar month
  }
}
```

---

### 18. Usage Detail

### `GET /api/v1/ai/usage/detail`

Returns detailed per-request usage logs for the team.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `limit` | int | `20` | Results per page |

**Response — 200:**

```jsonc
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 501,
        "user_id": 1,
        "model": "claude-sonnet-4-6",
        "input_tokens": 5579,
        "output_tokens": 351,
        "cost_usd": 0.022,
        "created_at": "2026-02-23T14:31:05.000Z"
      }
      // ... more entries
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 247,
      "pages": 13
    }
  }
}
```

---

## Available AI Models

The following models are available via OpenRouter. Specify the user-facing name in the `model` field when creating a conversation.

| User-facing name | OpenRouter ID | Best for |
|------------------|---------------|----------|
| `claude-sonnet-4-6` (default) | `anthropic/claude-sonnet-4` | Best overall analysis quality |
| `claude-haiku-4-5` | `anthropic/claude-haiku-4-5` | Fast, cheaper responses |
| `gpt-4o` | `openai/gpt-4o` | Alternative high-quality model |
| `gpt-4o-mini` | `openai/gpt-4o-mini` | Budget-friendly alternative |

---

## Available AI Tools (18 total)

The AI has access to 18 specialized tools for querying team data. These are called automatically based on the user's question — no manual tool selection is needed.

### Player Analysis (5 tools)

| Tool | Description | Example questions |
|------|-------------|-------------------|
| `search_players` | Search roster by name, position, or attributes | "Find all left-handed pitchers" |
| `get_player_stats` | Fetch season/career stats for a player | "What are Marcus Rivera's stats this year?" |
| `get_player_splits` | Home/away, vs-LHP/RHP, situational splits | "How does Rivera hit on the road?" |
| `get_player_trend` | Recent performance trend (last N games) | "How has our cleanup hitter performed lately?" |
| `compare_players` | Side-by-side comparison of two players | "Compare Rivera and Johnson's batting stats" |

### Game & Team (5 tools)

| Tool | Description | Example questions |
|------|-------------|-------------------|
| `get_game_boxscore` | Full box score for a specific game | "Show me the box score from last Friday's game" |
| `get_play_by_play` | Play-by-play data for a game | "Walk me through the 7th inning of game 12" |
| `get_team_record` | Overall and conference win/loss record | "What's our record in conference play?" |
| `get_team_stats` | Aggregate team batting/pitching/fielding stats | "What's our team ERA this season?" |
| `get_season_leaders` | Stat leaders across the roster | "Who leads the team in home runs?" |

### Scouting (3 tools)

| Tool | Description | Example questions |
|------|-------------|-------------------|
| `get_scouting_reports` | Scouting reports for players or prospects | "Pull up scouting reports on our shortstop" |
| `get_prospect_pipeline` | View the prospect pipeline | "Show me our top recruiting prospects" |
| `get_recruiting_board` | Current recruiting board and targets | "What does our recruiting board look like?" |

### Operations (5 tools)

| Tool | Description | Example questions |
|------|-------------|-------------------|
| `get_depth_chart` | Current depth chart by position | "Who's our backup catcher?" |
| `get_schedule` | Upcoming and past schedule | "What games do we have this week?" |
| `get_roster` | Full team roster | "Show me the full roster" |
| `get_daily_reports` | Daily team reports and notes | "Any notes from yesterday's practice?" |
| `get_matchup_analysis` | Analyze batter vs pitcher matchups | "How do our lefties match up against their starter?" |

---

## Architecture

```
  Frontend (React)          Backend (Express)           MCP Server (Docker)
  ┌──────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │              │  HTTP   │                 │  HTTP   │  18 data tools  │
  │  Chat UI     │────────>│  /api/v1/ai/*   │────────>│  (port 5002)    │
  │  (SSE)       │<────────│  orchestrator   │<────────│  team-isolated  │
  └──────────────┘  SSE    └─────────────────┘         └─────────────────┘
                                   │
                                   │ SQL
                                   v
                           ┌─────────────────┐
                           │  PostgreSQL      │
                           │  (port 5432)     │
                           └─────────────────┘
```

Key architecture points:

- **MCP server** runs as a separate Docker container on port 5002 (internal only, not exposed externally).
- **Backend orchestrates everything** — the frontend only communicates with the backend API. The backend forwards tool calls to the MCP server and streams results back.
- **Team data isolation** — all data queries are filtered by `team_id`, ensuring coaches only see their own team's data.
- **Conversation persistence** — full conversation history is stored in PostgreSQL and can be resumed at any time.
- **Streaming architecture** — the backend opens an SSE connection to the client and proxies AI model output in real time, so coaches see responses as they are generated.

---

## Example: Full Chat Session

A complete example of creating a conversation and sending a message using curl:

```bash
# 1. Get CSRF token
CSRF=$(curl -s -c cookies.txt http://localhost:5000/api/v1/auth/csrf-token | jq -r '.token')

# 2. Login
curl -s -c cookies.txt -b cookies.txt -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -d '{"email":"admin@sports2.com","password":"Admin123!"}'

# 3. Create conversation
CSRF=$(curl -s -b cookies.txt http://localhost:5000/api/v1/auth/csrf-token | jq -r '.token')
CONV_ID=$(curl -s -b cookies.txt -X POST http://localhost:5000/api/v1/ai/conversations \
  -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -d '{"title":"Roster Analysis"}' | jq -r '.data.id')

# 4. Send message (SSE stream — use -N to disable buffering)
CSRF=$(curl -s -b cookies.txt http://localhost:5000/api/v1/auth/csrf-token | jq -r '.token')
curl -N -b cookies.txt -X POST "http://localhost:5000/api/v1/ai/conversations/$CONV_ID/messages" \
  -H 'Content-Type: application/json' \
  -H "x-csrf-token: $CSRF" \
  -d '{"content":"Who are our top 3 hitters by batting average?"}'
```

**Expected SSE output:**

```
event: message_start
data: {"conversation_id":"a1b2c3d4-..."}

event: tool_use
data: {"tool":"get_season_leaders","status":"calling"}

event: tool_result
data: {"tool":"get_season_leaders","status":"complete"}

event: content_delta
data: {"text":"Here are your top 3 hitters by batting average this season:\n\n"}

event: content_delta
data: {"text":"1. **Marcus Rivera** (.345) — 38-for-110, 10 HR, 28 RBI\n"}

event: content_delta
data: {"text":"2. **Jake Thompson** (.312) — 34-for-109, 6 HR, 22 RBI\n"}

event: content_delta
data: {"text":"3. **Chris Morales** (.298) — 31-for-104, 4 HR, 19 RBI\n"}

event: message_end
data: {"tokens":{"input":5579,"output":351,"cost_usd":0.022}}
```
