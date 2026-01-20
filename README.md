# Sports2 Backend API

REST API for the Sports2 collegiate baseball scouting and team management platform.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL 15 with Sequelize ORM
- **Authentication:** JWT with HTTP-only cookies
- **Security:** CSRF protection, Helmet, rate limiting

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start backend with PostgreSQL
docker compose up -d

# View logs
docker compose logs -f backend

# Stop
docker compose down
```

The API will be available at `http://localhost:5000`

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example .env

# Start PostgreSQL (via Docker or local install)
docker compose up -d postgres

# Run database migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Start development server
npm run dev
```

## Using Infisical for Secrets

For secret management, we use [Infisical](https://infisical.com/).

```bash
# Install Infisical CLI
brew install infisical/get-cli/infisical

# Login
infisical login

# Copy config template
cp .infisical.json.example .infisical.json
# Edit .infisical.json with your workspace ID

# Run with secrets injected
infisical run -- npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get current user profile
- `GET /api/auth/csrf-token` - Get CSRF token

### Players
- `GET /api/players` - List players
- `GET /api/players/:id` - Get player details
- `POST /api/players` - Create player
- `PUT /api/players/:id` - Update player
- `DELETE /api/players/:id` - Delete player

### Teams
- `GET /api/teams` - List teams
- `GET /api/teams/:id` - Get team details
- `POST /api/teams` - Create team
- `PUT /api/teams/:id` - Update team

### Reports
- `GET /api/reports/scouting` - List scouting reports
- `POST /api/reports/scouting` - Create scouting report
- `GET /api/reports/daily` - List daily reports
- `POST /api/reports/daily` - Create daily report

### Health
- `GET /health` - Health check endpoint

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 5000 |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_NAME` | Database name | sports2 |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | JWT expiration | 7d |
| `CORS_ORIGIN` | Allowed CORS origins | - |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Database

### Migrations

```bash
# Run pending migrations
npm run db:migrate

# Rollback last migration
npx sequelize-cli db:migrate:undo

# Reset database (drops, creates, migrates, seeds)
npm run db:reset
```

### Schema

The database schema is managed via Sequelize migrations in `src/migrations/`.

Key tables:
- `users` - User accounts and authentication
- `teams` - Team information
- `players` - Player profiles and stats
- `scouting_reports` - Scouting evaluations
- `daily_reports` - Practice/game reports
- `preference_lists` - Recruiting preference lists

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm test -- auth.test.js
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database and app configuration
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Express middleware
│   ├── migrations/      # Sequelize migrations
│   ├── models/          # Sequelize models
│   ├── routes/          # API route definitions
│   │   └── __tests__/   # Route tests
│   ├── seeders/         # Database seeders
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   └── server.js        # Application entry point
├── database/
│   ├── init.sql         # Initial schema
│   └── seed.sql         # Development seed data
├── uploads/             # File uploads directory
├── docker-compose.yml   # Local development setup
├── Dockerfile           # Production container
└── package.json
```

## Deployment

### Docker Build

```bash
# Build production image
docker build -t sports2-backend:latest .

# Run container
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  sports2-backend:latest
```

### CI/CD

This repo uses GitHub Actions for CI/CD. See `.github/workflows/` for:
- `ci.yml` - Tests and linting on PRs
- `deploy.yml` - Build and push Docker image on main

## Contributing

1. Create a feature branch from `develop`
2. Make changes with tests
3. Run `npm test` and `npm run lint`
4. Submit PR to `develop`

## License

Proprietary - The Program 1814
