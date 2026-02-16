// Force test database to prevent tests from wiping development data.
// This MUST override DB_NAME from .env — tests use sync({ force: true })
// which drops and recreates all tables.
process.env.DB_NAME = 'sports2_test';
process.env.NODE_ENV = 'test';

// Use a proper 32+ character test secret to match production requirements
// This is a deterministic test value, NOT used in production
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
