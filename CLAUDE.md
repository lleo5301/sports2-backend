# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Express.js REST API backend for a collegiate baseball scouting and team management platform. Manages players, teams, coaches, scouts, games, schedules, depth charts, and scouting reports with multi-tenant team isolation.

**Stack:** Node.js 24+, Express 4.x, PostgreSQL 15, Sequelize ORM

## Common Commands

```bash
# Development
npm run dev                    # Start with nodemon (auto-reload)
npm start                      # Start production server

# Testing
npm test                       # Run Jest tests with coverage
npm test -- --testPathPattern="players"  # Run single test file
npm test -- --testNamePattern="should create"  # Run tests matching name

# Database
npm run db:migrate             # Run pending migrations
npm run db:reset               # Drop, recreate, migrate, seed (destructive)

# Linting
npm run lint                   # Check code style
npm run lint:fix               # Auto-fix code style
```

## Architecture

### API Structure
All routes are versioned under `/api/v1/`. Authentication uses JWT tokens (Bearer header or httpOnly cookies) with CSRF double-submit protection on state-changing requests.

### Data Model - Key Relationships
- **Team isolation:** Most entities belong to a team via `team_id` foreign key
- **Audit trail:** Entities have `created_by` linking to User who created them
- **User-Team:** Primary team via `team_id` FK, additional teams via `UserTeam` junction table

### Core Entities
```
Team (central tenant)
├── User (members with roles)
├── Player → GameStatistic, ScoutingReport, DepthChartPlayer
├── Coach, Scout
├── Game → GameStatistic
├── Schedule → ScheduleSection → ScheduleActivity
├── ScheduleTemplate → ScheduleEvent → ScheduleEventDate
├── DepthChart → DepthChartPosition, DepthChartPlayer
├── Location
├── Report, DailyReport, PreferenceList
└── Vendor, HighSchoolCoach
```

### Directory Layout
```
src/
├── routes/           # Express route handlers (one per resource)
├── models/           # Sequelize models and associations
├── middleware/       # auth, csrf, permissions, errorHandler
├── services/         # Business logic (email, lockout, tokens)
├── utils/            # Helpers (logger, validators, sorting)
├── config/           # Database, OAuth, helmet configuration
└── migrations/       # Sequelize migrations (33+ files)
```

### Response Format
```javascript
{ success: true, data: {...} }      // Success
{ success: false, error: "..." }    // Error
```

## Code Style

- **2-space indentation**, single quotes, semicolons required
- CommonJS (`module.exports`), not ES modules
- Prefix unused params with `_` (e.g., `_req`)
- Use `const` over `let`, arrow callbacks preferred
- Curly braces required for all control statements

## Testing Patterns

Tests use Jest with Supertest. Database syncs with `force: true` in test setup, so tests run serially (`maxWorkers: 1`).

```javascript
// Standard test setup pattern
const { sequelize, User, Team } = require('../../models');
const app = require('../../server');
const request = require('supertest');

beforeAll(async () => {
  await sequelize.sync({ force: true });
  // Create test team and user
});

afterAll(async () => {
  await sequelize.close();
});
```

**Test file location:** `src/routes/__tests__/*.test.js`

## Security Features

- **JWT + CSRF:** Tokens support `jti` for revocation via `TokenBlacklist`
- **Account lockout:** Failed login tracking with temporary locks
- **Rate limiting:** Per-IP throttling on `/api/` routes
- **Role checks:** `protect` middleware for auth, `isHeadCoach` for elevated access
- **Team validation:** Most routes verify `team_id` matches user's team

## Environment Variables

Required in `.env` (see `env.example`):
- `DB_*` - PostgreSQL connection
- `JWT_SECRET` - Min 32 chars, cryptographically random
- `CSRF_SECRET` - Min 32 chars, different from JWT_SECRET
- `CORS_ORIGIN` - Comma-separated allowed origins

Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Database Migrations

Use Sequelize CLI for schema changes:
```bash
npx sequelize-cli migration:generate --name add-column-to-table
npm run db:migrate
```

Never use `sequelize.sync({ alter: true })` in production—rely on migrations.

## Docker Dev Server (dev server test)

The primary development environment runs in Docker. **Always use Docker for testing, not local npm run dev.**

```bash
# Start all services
docker compose up -d

# Restart backend to pick up code changes (nodemon should auto-reload, but restart if needed)
docker restart sports2_backend

# View logs
docker logs sports2_backend --tail 50 -f

# Run migrations in Docker
docker exec sports2_backend npm run db:migrate

# Access container shell
docker exec -it sports2_backend sh
```

### Services & Ports
| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| Backend API | `sports2_backend` | 5000 | Express server with nodemon |
| PostgreSQL | `sports2_backend_db` | 5432 | Database (postgres/postgres123) |
| pgAdmin | `sports2_backend_pgadmin` | 5050 | DB admin (admin@example.com/admin123) |

### Key Environment Variables (from docker-compose.yml)
```
NODE_ENV=development
PORT=5000
DB_HOST=postgres (internal Docker network)
DB_NAME=sports2
DB_USER=postgres
DB_PASSWORD=postgres123
ENCRYPTION_KEY=60f5179292584b3e42e7edcebdde6d91f3cbbd6c8485edc15b594108ca5b20e8
CORS_ORIGIN=http://localhost:3000,http://localhost:4000,http://localhost
```

### Volume Mounts
- `.:/app` - Live code reload (nodemon watches for changes)
- `./uploads:/app/uploads` - File uploads persist

## AI Coach Assistant

Express backend orchestrates AI calls via OpenRouter (openrouter.ai), with a separate MCP server container (port 5002) providing 18 baseball data tools for player analysis, game planning, and coaching insights. All AI endpoints are versioned under `/api/v1/ai/`.

### Key Files

| File | Purpose |
|------|---------|
| `src/services/aiService.js` | AI orchestration (OpenRouter + tool loop) |
| `src/routes/ai.js` | All AI API endpoints |
| `mcp-server/` | Separate MCP microservice |
| `mcp-server/src/tools/` | 18 baseball analysis tools |

### Docker Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| MCP Server | `sports2_mcp` | 5002 | Baseball data tools for AI |

### Environment Variables

- `OPENROUTER_API_KEY` — OpenRouter API key (platform default)
- `ANTHROPIC_API_KEY` — Fallback if OPENROUTER_API_KEY not set
- `MCP_SERVER_URL` — Internal MCP server URL (default: `http://mcp-server:5002`)

### Quick Commands

```bash
# Check MCP server health
curl http://localhost:5002/health

# List available AI tools
curl http://localhost:5002/tools

# Rebuild MCP server after changes
docker compose up -d --build mcp-server
```

### API Reference

Full documentation: `docs/api/ai-coach-assistant-api.md`
