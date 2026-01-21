-- Initialize the collegiate baseball database
-- This script runs when the PostgreSQL container starts for the first time
--
-- IMPORTANT: This file runs BEFORE the backend starts, so it cannot contain
-- INSERT statements for tables that Sequelize creates. Only include:
-- - Extensions
-- - Database-level configuration
--
-- For seed data, use: npm run db:seed (after migrations have run)

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: Tables are created by Sequelize migrations when the backend starts.
-- To seed development data after starting the backend:
--   docker compose exec backend npm run db:seed
--
-- Or run seed.sql manually after migrations:
--   docker compose exec postgres psql -U postgres -d sports2 -f /seed.sql 