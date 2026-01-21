# Development Testing Scripts

This directory contains scripts to help with development and testing of the Sports2 backend.

## Quick Start

### Using npm scripts (recommended)

```bash
# Setup database and run migrations
npm run dev:setup

# Start backend with hot reload (nodemon)
npm run dev:start

# Run all tests
npm run dev:test

# Run only unit tests
npm run dev:test:unit

# Run only E2E tests
npm run dev:test:e2e

# Check status of containers and services
npm run dev:status

# Cleanup (stop all containers)
npm run dev:cleanup
```

### Using the script directly

```bash
# Setup database
./scripts/dev-test.sh setup

# Start backend with hot reload
./scripts/dev-test.sh start

# Start backend in Docker (with hot reload via volume mount)
./scripts/dev-test.sh start:docker

# Run tests
./scripts/dev-test.sh test --test-type all

# Check status
./scripts/dev-test.sh status

# Cleanup
./scripts/dev-test.sh cleanup
```

## Features

### Hot Reloading
- **Local mode** (`dev:start`): Uses `nodemon` for automatic restart on file changes
- **Docker mode** (`dev:start:docker`): Uses volume mounts for hot reloading in container

### Database Management
- Automatically starts PostgreSQL container if not running
- Runs migrations automatically
- Optional database seeding with `--seed` flag
- Waits for database to be ready before proceeding

### Testing
- Runs unit tests (Jest) and E2E tests (Mocha) in parallel
- Configures test database automatically
- Provides separate commands for unit vs E2E tests

### Port Management
- Checks for port conflicts before starting services
- Configurable ports via environment variables or flags
- Default: Backend on 5000, PostgreSQL on 5432

## Environment Variables

You can customize the setup using environment variables:

```bash
export BACKEND_PORT=5001        # Change backend port
export DB_PORT=5433             # Change database port
export USE_DOCKER_BACKEND=true  # Use Docker for backend
export JWT_SECRET=your_secret   # Custom JWT secret
```

## Common Workflows

### Development Workflow
```bash
# 1. Initial setup
npm run dev:setup --seed

# 2. Start backend (in one terminal)
npm run dev:start

# 3. Run tests (in another terminal)
npm run dev:test
```

### Testing Workflow
```bash
# Setup and start everything
npm run dev:setup && npm run dev:start:docker

# Wait for backend to be ready, then run tests
npm run dev:test:all
```

### Clean Development Environment
```bash
# Clean everything and start fresh
npm run dev:cleanup
npm run dev:setup --seed
npm run dev:start
```

## Troubleshooting

### Port Already in Use
If you get port conflicts:
```bash
# Use different ports
BACKEND_PORT=5001 DB_PORT=5433 npm run dev:start
```

### Database Connection Issues
```bash
# Check database status
npm run dev:status

# Restart database
npm run dev:cleanup
npm run dev:setup
```

### Docker Issues
If Docker isn't working, the script will fall back to local execution where possible. For database, Docker is required.

## Script Options

See all available options:
```bash
./scripts/dev-test.sh help
```
