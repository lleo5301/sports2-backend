# Backend Test Fix Tasks

This directory contains individual task files for fixing backend test issues. Each task is designed to be worked on independently by a different agent.

## Task Overview

| Task | Priority | Status | Estimated Time | Assignee |
|------|----------|--------|----------------|----------|
| [TASK-01: CSRF E2E Tests](./TASK-01-CSRF-E2E-Tests.md) | 🔴 Critical | ✅ Complete | 2-3 hours | Agent 1 |
| [TASK-02: Auth Token Flow](./TASK-02-Auth-Token-Flow.md) | 🟡 Medium | ✅ Complete | 1 hour | Agent 2 |
| [TASK-03: Cookie Handling](./TASK-03-Cookie-Handling.md) | 🟡 Medium | ✅ Complete | 30 min | Agent 3 |
| [TASK-04: Database Migrations](./TASK-04-Database-Migrations.md) | 🟡 Medium | ✅ Complete | 1-2 hours | Agent 4 |
| [TASK-05: Test Data Setup](./TASK-05-Test-Data-Setup.md) | 🟡 Medium | ✅ Complete | 1-2 hours | Agent 5 |
| [TASK-06: Port Handling](./TASK-06-Port-Handling.md) | 🟢 Low | ✅ Complete | 30 min | Agent 6 |
| [TASK-07: Docker Compose Warning](./TASK-07-Docker-Compose-Warning.md) | 🟢 Low | ✅ Complete | 5 min | Agent 7 |

## Task Dependencies

```
TASK-01 (CSRF) ──┐
                 ├──> TASK-02 (Auth Flow)
TASK-03 (Cookies)┘

TASK-04 (Migrations) ──> TASK-05 (Test Data)
```

## Quick Start

1. **Pick a task** from the list above
2. **Read the task file** for detailed requirements
3. **Check dependencies** - ensure prerequisite tasks are done
4. **Implement the changes** as specified
5. **Test your changes** using the provided test commands
6. **Update task status** when complete

## Current Test Status

- **Unit Tests:** 15 passing, 20 failing (database connection issues - expected)
- **E2E Tests:** ✅ **35 passing, 0 failing** 🎉

## Priority Order

Work on tasks in this order for maximum impact:

1. **TASK-01** - Fixes 23 E2E test failures (critical blocker)
2. **TASK-03** - Required for TASK-01 to work properly
3. **TASK-02** - Improves reliability after TASK-01
4. **TASK-04** - Fixes database setup issues
5. **TASK-05** - Improves test reliability
6. **TASK-06** - Quality of life improvement
7. **TASK-07** - Quick cleanup

## Testing Commands

### Unit Tests
```bash
NODE_ENV=test DB_HOST=localhost DB_PORT=5432 DB_NAME=sports2_test \
DB_USER=postgres DB_PASSWORD=postgres123 \
JWT_SECRET=test_jwt_secret_for_ci npm test
```

### E2E Tests
```bash
# Start backend first
BACKEND_PORT=5001 npm run dev

# Then run tests
API_URL=http://localhost:5001 npm run test:api
```

### Using Dev Script
```bash
# Setup database
./scripts/dev-test.sh setup

# Start backend
./scripts/dev-test.sh start --port 5001

# Run tests
./scripts/dev-test.sh test --test-type e2e
```

## Notes

- Each task file contains detailed requirements and acceptance criteria
- Tasks can be worked on in parallel (except where dependencies exist)
- Update task status in the task file when complete
- Reference the main TODO.md for overall context
