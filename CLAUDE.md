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
