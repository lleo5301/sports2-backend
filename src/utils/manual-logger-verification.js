/**
 * Manual Logger Verification Script
 *
 * This script demonstrates the logger's sanitization capabilities by logging
 * various types of sensitive data and verifying the output is properly redacted.
 *
 * Run this script to manually verify log output:
 * node src/utils/manual-logger-verification.js
 */

const logger = require('./logger');

console.log('\n========================================');
console.log('MANUAL LOGGER VERIFICATION');
console.log('========================================\n');

console.log('This script will test the logger with various sensitive data patterns.');
console.log('Review the output below to confirm sensitive data is properly redacted.\n');

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Log Level:', process.env.LOG_LEVEL || 'debug (default)');
console.log('\n========================================\n');

// Test 1: Email addresses
console.log('TEST 1: Email Address Sanitization');
console.log('-----------------------------------');
logger.info('User login attempt', {
  email: 'john.doe@example.com',
  timestamp: new Date().toISOString()
});
logger.debug('Processing user data', {
  user: { email: 'admin@sports.com', name: 'Admin' }
});
console.log('✓ Expected: email values should show [REDACTED_EMAIL]\n');

// Test 2: Passwords and credentials
console.log('TEST 2: Password Sanitization');
console.log('------------------------------');
logger.info('User registration', {
  email: 'newuser@example.com',
  password: 'SuperSecret123!',
  confirmPassword: 'SuperSecret123!'
});
logger.debug('Password change request', {
  userId: 'user-123',
  currentPassword: 'OldPass123',
  newPassword: 'NewPass456'
});
console.log('✓ Expected: password fields should show [REDACTED_PASSWORD]\n');

// Test 3: Tokens and API keys
console.log('TEST 3: Token and API Key Sanitization');
console.log('---------------------------------------');
logger.info('Authentication successful', {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJpYXQiOjE2MzgzNjAwMDB9.dGVzdFNpZ25hdHVyZQ',
  refreshToken: 'rt_abc123def456ghi789',
  apiKey: 'sk_live_abc123def456'
});
logger.debug('API request', {
  authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
  api_key: 'pk_test_12345'
});
console.log('✓ Expected: token, apiKey, authorization should show [REDACTED_TOKEN] or [REDACTED_KEY]\n');

// Test 4: User IDs and Team IDs
console.log('TEST 4: User ID and Team ID Masking');
console.log('------------------------------------');
logger.debug('User action', {
  user_id: 12345,
  team_id: 67890,
  action: 'view_report'
});
logger.info('Team operation', {
  userId: 'user-abc-123',
  teamId: 'team-xyz-789',
  operation: 'add_member'
});
console.log('✓ Expected: user_id, team_id, userId, teamId should show [REDACTED_ID]\n');

// Test 5: PII (SSN, Phone, Credit Card)
console.log('TEST 5: PII Sanitization');
console.log('-------------------------');
logger.info('Profile update', {
  name: 'John Doe',
  phone: '555-123-4567',
  ssn: '123-45-6789',
  credit_card: '4111-1111-1111-1111',
  cvv: '123'
});
console.log('✓ Expected: phone, ssn, credit_card, cvv should be redacted\n');

// Test 6: Nested objects with sensitive data
console.log('TEST 6: Nested Object Sanitization');
console.log('-----------------------------------');
logger.info('Complex user object', {
  user: {
    id: 123,
    email: 'user@example.com',
    profile: {
      name: 'Test User',
      phone: '555-9999',
      settings: {
        apiKey: 'secret-key-123',
        notifications: true
      }
    },
    team: {
      team_id: 456,
      name: 'Team Alpha'
    }
  }
});
console.log('✓ Expected: email, phone, apiKey, team_id should be redacted in nested structure\n');

// Test 7: Arrays with sensitive data
console.log('TEST 7: Array Sanitization');
console.log('--------------------------');
logger.debug('User list', {
  users: [
    { userId: 1, email: 'user1@example.com', name: 'User 1' },
    { userId: 2, email: 'user2@example.com', name: 'User 2' },
    { userId: 3, email: 'user3@example.com', name: 'User 3' }
  ]
});
console.log('✓ Expected: userId and email should be redacted for each array item\n');

// Test 8: Error with stack trace (development vs production)
console.log('TEST 8: Error and Stack Trace Handling');
console.log('---------------------------------------');
const testError = new Error('Authentication failed');
testError.email = 'failed@example.com';
testError.token = 'invalid-token-123';
logger.error('Login error', testError);
console.log('✓ Expected: Stack trace present in DEVELOPMENT, removed in PRODUCTION\n');
console.log('✓ Expected: email and token in error object should be redacted\n');

// Test 9: Request object simulation
console.log('TEST 9: Request Object Simulation');
console.log('----------------------------------');
logger.debug('Incoming request', {
  method: 'POST',
  url: '/api/auth/login',
  body: {
    email: 'login@example.com',
    password: 'userPassword123'
  },
  headers: {
    authorization: 'Bearer token123',
    'content-type': 'application/json'
  },
  user: {
    user_id: 999,
    email: 'authenticated@example.com',
    team_id: 888
  }
});
console.log('✓ Expected: All sensitive fields (email, password, authorization, user_id, team_id) redacted\n');

// Test 10: Database credentials
console.log('TEST 10: Database and Infrastructure Credentials');
console.log('-------------------------------------------------');
logger.info('Database connection', {
  host: 'localhost',
  port: 5432,
  database: 'sports_app',
  db_password: 'super-secret-db-password',
  connection_string: 'postgresql://user:password@localhost:5432/db',
  credential: 'admin-access-key'
});
console.log('✓ Expected: db_password, connection_string, credential should be redacted\n');

// Test 11: Manual sanitize method
console.log('TEST 11: Manual Sanitize Method');
console.log('--------------------------------');
const sensitiveData = {
  user_id: 123,
  email: 'test@example.com',
  token: 'secret-token',
  publicInfo: 'This is safe to log'
};
const sanitized = logger.sanitize(sensitiveData);
console.log('Original data (DO NOT LOG):', '{ user_id, email, token, publicInfo }');
console.log('Sanitized data:', JSON.stringify(sanitized, null, 2));
console.log('✓ Expected: user_id, email, token are redacted; publicInfo remains\n');

// Test 12: Email pattern detection in strings
console.log('TEST 12: Email Pattern Detection');
console.log('---------------------------------');
logger.info('Email sent notification', {
  message: 'Email sent to user@example.com successfully',
  recipient: 'another@test.org'
});
console.log('✓ Expected: Email addresses in string values should be detected and redacted\n');

console.log('\n========================================');
console.log('VERIFICATION COMPLETE');
console.log('========================================\n');

console.log('ACCEPTANCE CRITERIA CHECKLIST:');
console.log('------------------------------');
console.log('[ ] Emails appear as [REDACTED_EMAIL]');
console.log('[ ] Tokens appear as [REDACTED_TOKEN]');
console.log('[ ] User/Team IDs are masked as [REDACTED_ID]');
console.log('[ ] Stack traces only in development mode');
console.log('[ ] Passwords appear as [REDACTED_PASSWORD]');
console.log('[ ] API keys and secrets are redacted');
console.log('[ ] Phone numbers and SSN are redacted');
console.log('[ ] Nested objects are properly sanitized');
console.log('[ ] Arrays of sensitive data are sanitized');
console.log('[ ] Database credentials are protected\n');

console.log('Review the log output above and verify each test meets expectations.');
console.log('To test production mode, run: NODE_ENV=production node src/utils/manual-logger-verification.js\n');
