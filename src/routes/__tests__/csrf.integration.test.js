/**
 * @fileoverview Integration tests for CSRF protection across authentication routes.
 * Tests verify that CSRF protection works end-to-end for state-changing operations
 * while allowing safe read-only requests without CSRF tokens.
 *
 * @module routes/__tests__/csrf.integration.test
 */

const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team } = require('../../models');

describe('CSRF Protection - Integration Tests', () => {
  let testTeam;
  let testUser;
  const testPassword = 'TestP@ss1';

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'CSRF Test Team',
      program_name: 'CSRF Test Team Program'
    });

    // Create test user for authentication tests
    testUser = await User.create({
      first_name: 'CSRF',
      last_name: 'TestUser',
      email: 'csrf-test-user@example.com',
      password: testPassword,
      role: 'head_coach',
      team_id: testTeam.id
    });
  });

  afterAll(async () => {
    // Clean up test data
    await User.destroy({
      where: {
        email: {
          [sequelize.Sequelize.Op.like]: '%csrf-test%@example.com'
        }
      }
    });
    await testTeam.destroy();
  });

  describe('GET /api/auth/csrf-token - CSRF Token Endpoint', () => {
    it('should return a valid CSRF token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should set CSRF cookie when generating token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const csrfCookie = cookies.find(cookie => cookie.includes('csrf-token'));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('HttpOnly');
      expect(csrfCookie).toContain('Path=/');
    });

    it('should generate different tokens on subsequent calls', async () => {
      const response1 = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);

      const response2 = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);

      expect(response1.body.token).not.toBe(response2.body.token);
    });

    it('should not require CSRF token for GET request', async () => {
      // GET requests should work without CSRF token
      const response = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST Requests - CSRF Protection', () => {
    it('should reject POST /api/auth/register without CSRF token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'csrf-test-register@example.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'head_coach',
          password: testPassword
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should reject POST /api/auth/login without CSRF token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should reject POST /api/auth/logout without CSRF token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should accept POST /api/auth/register with valid CSRF token', async () => {
      // First, get a valid CSRF token
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      // Clean up any existing user with this email
      await User.destroy({
        where: { email: 'csrf-test-valid-register@example.com' }
      });

      // Now make the POST request with CSRF token
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          email: 'csrf-test-valid-register@example.com',
          first_name: 'Valid',
          last_name: 'User',
          role: 'head_coach',
          password: testPassword
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('csrf-test-valid-register@example.com');

      // Clean up
      await User.destroy({
        where: { email: 'csrf-test-valid-register@example.com' }
      });
    });

    it('should accept POST /api/auth/login with valid CSRF token', async () => {
      // Get CSRF token
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      // Login with CSRF token
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(testUser.email);

      // Verify JWT cookie is set
      const cookies = response.headers['set-cookie'];
      const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
      expect(tokenCookie).toBeDefined();
    });

    it('should accept POST /api/auth/logout with valid CSRF token', async () => {
      // Get CSRF token
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      // Logout with CSRF token
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
    });

    it('should reject POST request with invalid CSRF token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-csrf-token', 'invalid-token-12345')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should reject POST request with CSRF token but no cookie', async () => {
      // Get CSRF token (but don't use the cookie)
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;

      // Make request with token header but without cookie
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-csrf-token', csrfToken)
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should reject POST request with mismatched CSRF token and cookie', async () => {
      // Get first CSRF token
      const csrfResponse1 = await request(app)
        .get('/api/v1/auth/csrf-token');

      // Get second CSRF token
      const csrfResponse2 = await request(app)
        .get('/api/v1/auth/csrf-token');

      // Use token from first response with cookie from second response (mismatch)
      const token1 = csrfResponse1.body.token;
      const cookies2 = csrfResponse2.headers['set-cookie'];

      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies2)
        .set('x-csrf-token', token1)
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });
  });

  describe('GET Requests - No CSRF Protection Required', () => {
    it('should allow GET /api/auth/me without CSRF token (but requires auth)', async () => {
      // This test verifies CSRF isn't required for GET, but auth is still required
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401); // Unauthorized because no auth token, not 403 CSRF error

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Not authorized');
      // Should NOT be a CSRF error
      expect(response.body.error).not.toContain('CSRF');
    });

    it('should allow authenticated GET request without CSRF token', async () => {
      // Login to get auth cookie (with CSRF token for the POST)
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          email: testUser.email,
          password: testPassword
        });

      const authCookies = loginResponse.headers['set-cookie'];

      // Now GET request with auth cookie but no CSRF token should work
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', authCookies)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testUser.email);
    });
  });

  describe('PUT Requests - CSRF Protection', () => {
    it('should reject PUT /api/auth/change-password without CSRF token', async () => {
      // First login to get auth cookie
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', csrfResponse.headers['set-cookie'])
        .set('x-csrf-token', csrfResponse.body.token)
        .send({
          email: testUser.email,
          password: testPassword
        });

      const authCookies = loginResponse.headers['set-cookie'];

      // Try to change password without CSRF token
      const response = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', authCookies)
        .send({
          current_password: testPassword,
          new_password: 'NewP@ss123'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should accept PUT /api/auth/change-password with valid CSRF token', async () => {
      // Get CSRF token
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      // Login with CSRF token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          email: testUser.email,
          password: testPassword
        });

      const authCookies = loginResponse.headers['set-cookie'];

      // Get new CSRF token for the PUT request
      const csrfResponse2 = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken2 = csrfResponse2.body.token;
      const csrfCookies2 = csrfResponse2.headers['set-cookie'];

      // Combine auth cookie with CSRF cookie
      const allCookies = [...authCookies, ...csrfCookies2];

      const newPassword = 'NewP@ss123';

      // Change password with CSRF token
      const response = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', allCookies)
        .set('x-csrf-token', csrfToken2)
        .send({
          current_password: testPassword,
          new_password: newPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Change password back for other tests
      const csrfResponse3 = await request(app)
        .get('/api/v1/auth/csrf-token');

      await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', [...authCookies, ...csrfResponse3.headers['set-cookie']])
        .set('x-csrf-token', csrfResponse3.body.token)
        .send({
          current_password: newPassword,
          new_password: testPassword
        });
    });
  });

  describe('CSRF Token Lifecycle', () => {
    it('should maintain separate CSRF tokens for different sessions', async () => {
      // Get two separate CSRF tokens
      const response1 = await request(app)
        .get('/api/v1/auth/csrf-token');

      const response2 = await request(app)
        .get('/api/v1/auth/csrf-token');

      // Tokens should be different
      expect(response1.body.token).not.toBe(response2.body.token);

      // Each token should work with its own cookie
      const token1 = response1.body.token;
      const cookies1 = response1.headers['set-cookie'];

      // Clean up test user
      await User.destroy({
        where: { email: 'csrf-test-lifecycle1@example.com' }
      });

      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', cookies1)
        .set('x-csrf-token', token1)
        .send({
          email: 'csrf-test-lifecycle1@example.com',
          first_name: 'Lifecycle',
          last_name: 'Test',
          role: 'head_coach',
          password: testPassword
        })
        .expect(201);

      expect(registerResponse.body.success).toBe(true);

      // Clean up
      await User.destroy({
        where: { email: 'csrf-test-lifecycle1@example.com' }
      });
    });

    it('should allow reusing same CSRF token multiple times', async () => {
      // Get CSRF token once
      const csrfResponse = await request(app)
        .get('/api/v1/auth/csrf-token');

      const csrfToken = csrfResponse.body.token;
      const csrfCookies = csrfResponse.headers['set-cookie'];

      // Use the same token for multiple requests
      const response1 = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      expect(response1.body.success).toBe(true);

      const response2 = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', csrfCookies)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response2.body.success).toBe(true);
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format for CSRF violations', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(403);

      // Verify error response structure
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
      expect(response.body.error).toBe('Invalid or missing CSRF token');
    });

    it('should use 403 status code for CSRF violations', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('x-csrf-token', 'invalid-token')
        .send({
          email: testUser.email,
          password: testPassword
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
