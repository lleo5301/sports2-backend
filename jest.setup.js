// Use a proper 32+ character test secret to match production requirements
// This is a deterministic test value, NOT used in production
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
process.env.NODE_ENV = 'test';


