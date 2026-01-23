const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Auth Routes - Password Validation', () => {
  let testTeam;
  let testUser;
  let authToken;

  // Strong password that meets all requirements
  const strongPassword = 'StrongP@ss1';

  // Weak passwords for testing (each fails one or more requirements)
  const weakPasswords = {
    tooShort: 'Sh0rt!', // Less than 8 characters
    noUppercase: 'weakpassword1!', // No uppercase letter
    noLowercase: 'WEAKPASSWORD1!', // No lowercase letter
    noDigit: 'WeakPassword!', // No digit
    noSpecialChar: 'WeakPassword1', // No special character
    commonWeak: '123456', // Commonly used weak password
    anotherCommon: 'password' // Another common weak password
  };

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'Auth Test Team',
      program_name: 'Auth Test Team Program'
    });

    // Create existing test user for change-password tests
    testUser = await User.create({
      first_name: 'Auth',
      last_name: 'TestUser',
      email: 'auth-test-existing@example.com',
      password: strongPassword,
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token for protected routes
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await User.destroy({
      where: {
        email: {
          [sequelize.Sequelize.Op.like]: '%auth-test%@example.com'
        }
      }
    });
    await testTeam.destroy();
  });

  describe('POST /api/auth/register - Password Validation', () => {
    const validUserData = {
      email: 'auth-test-register@example.com',
      first_name: 'Test',
      last_name: 'Register',
      role: 'head_coach'
    };

    beforeEach(async () => {
      // Clean up any test users from previous test runs
      await User.destroy({ where: { email: validUserData.email } });
    });

    afterEach(async () => {
      // Clean up created users after each test
      await User.destroy({ where: { email: validUserData.email } });
    });

    describe('should reject weak passwords', () => {
      it('should reject password that is too short', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.tooShort
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'password',
              msg: expect.stringContaining('8 characters')
            })
          ])
        );
      });

      it('should reject password without uppercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.noUppercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'password',
              msg: expect.stringContaining('uppercase')
            })
          ])
        );
      });

      it('should reject password without lowercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.noLowercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'password',
              msg: expect.stringContaining('lowercase')
            })
          ])
        );
      });

      it('should reject password without digit', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.noDigit
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'password',
              msg: expect.stringContaining('digit')
            })
          ])
        );
      });

      it('should reject password without special character', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.noSpecialChar
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'password',
              msg: expect.stringContaining('special character')
            })
          ])
        );
      });

      it('should reject commonly used weak password "123456"', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.commonWeak
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject commonly used weak password "password"', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: weakPasswords.anotherCommon
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('should accept strong passwords', () => {
      it('should accept password meeting all requirements', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: strongPassword
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.email).toBe(validUserData.email);
        // Token should NOT be in response body (now in httpOnly cookie)
        expect(response.body.data).not.toHaveProperty('token');
        // Verify JWT cookie is set
        const responseCookies = response.headers['set-cookie'];
        expect(responseCookies).toBeDefined();
        const tokenCookie = responseCookies.find(cookie => cookie.startsWith('token='));
        expect(tokenCookie).toBeDefined();
        expect(tokenCookie).toContain('HttpOnly');
      });

      it('should accept password with various special characters', async () => {
        const passwordsWithSpecialChars = [
          'Password1!',
          'Password1@',
          'Password1#',
          'Password1$',
          'Password1%',
          'Password1^',
          'Password1&'
        ];

        for (const password of passwordsWithSpecialChars) {
          // Clean up before each attempt
          await User.destroy({ where: { email: validUserData.email } });

          const { token, cookies } = await getCsrfToken(app);
          const response = await request(app)
            .post('/api/v1/auth/register')
            .set('Cookie', cookies)
            .set('x-csrf-token', token)
            .send({
              ...validUserData,
              password
            })
            .expect(201);

          expect(response.body.success).toBe(true);
        }
      });

      it('should accept password at exactly minimum length (8 chars)', async () => {
        const exactMinPassword = 'Aa1!aaaa'; // Exactly 8 characters

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/v1/auth/register')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            ...validUserData,
            password: exactMinPassword
          })
          .expect(201);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('PUT /api/auth/change-password - Password Validation', () => {
    describe('should reject weak new passwords', () => {
      it('should reject new password that is too short', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: weakPasswords.tooShort
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'new_password',
              msg: expect.stringContaining('8 characters')
            })
          ])
        );
      });

      it('should reject new password without uppercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: weakPasswords.noUppercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'new_password',
              msg: expect.stringContaining('uppercase')
            })
          ])
        );
      });

      it('should reject new password without lowercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: weakPasswords.noLowercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'new_password',
              msg: expect.stringContaining('lowercase')
            })
          ])
        );
      });

      it('should reject new password without digit', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: weakPasswords.noDigit
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'new_password',
              msg: expect.stringContaining('digit')
            })
          ])
        );
      });

      it('should reject new password without special character', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: weakPasswords.noSpecialChar
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'new_password',
              msg: expect.stringContaining('special character')
            })
          ])
        );
      });
    });

    describe('should accept strong new passwords', () => {
      it('should accept new password meeting all requirements', async () => {
        const newStrongPassword = 'NewStr0ng!Pass';

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: strongPassword,
            new_password: newStrongPassword
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Password updated successfully');

        // Reset password back for other tests
        await User.update(
          { password: strongPassword },
          { where: { id: testUser.id }, individualHooks: true }
        );
      });
    });

    describe('should require authentication', () => {
      it('should return 401 when no token is provided', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            current_password: strongPassword,
            new_password: 'NewStr0ng!Pass'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should return 401 when invalid token is provided', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', 'Bearer invalid_token')
          .send({
            current_password: strongPassword,
            new_password: 'NewStr0ng!Pass'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('should validate current password', () => {
      it('should reject when current password is incorrect', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/v1/auth/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            current_password: 'WrongP@ss1',
            new_password: 'NewStr0ng!Pass'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Current password is incorrect');
      });
    });
  });

  describe('Error Message Quality', () => {
    it('should provide clear error messages for multiple missing requirements', async () => {
      // Password missing multiple requirements
      const veryWeakPassword = 'weak';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: 'auth-test-multiple-errors@example.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'head_coach',
          password: veryWeakPassword
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');

      // The error message should mention multiple requirements
      const errorDetails = response.body.details;
      expect(errorDetails).toBeDefined();
      expect(errorDetails.length).toBeGreaterThan(0);

      const passwordError = errorDetails.find(e => e.path === 'password');
      expect(passwordError).toBeDefined();
      expect(passwordError.msg).toContain('8 characters');
    });
  });

  describe('POST /api/auth/login - Cookie-Based Authentication', () => {
    it('should set JWT token as httpOnly cookie on successful login', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: strongPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(testUser.email);
      // Token should NOT be in response body (now in httpOnly cookie)
      expect(response.body.data).not.toHaveProperty('token');

      // Verify JWT cookie is set
      const responseCookies = response.headers['set-cookie'];
      expect(responseCookies).toBeDefined();
      const tokenCookie = responseCookies.find(cookie => cookie.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
      expect(tokenCookie).toContain('Path=/');
    });

    it('should include team information in login response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: strongPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('team');
      expect(response.body.data.team).toHaveProperty('id');
      expect(response.body.data.team).toHaveProperty('name');
    });

    it('should reject login with invalid credentials', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');

      // No cookie should be set on failed login
      const responseCookies = response.headers['set-cookie'];
      if (responseCookies) {
        const tokenCookie = responseCookies.find(cookie => cookie.startsWith('token='));
        expect(tokenCookie).toBeUndefined();
      }
    });

    it('should reject login with non-existent email', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: 'nonexistent@example.com',
          password: strongPassword
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /api/auth/logout - Cookie Clearing', () => {
    it('should clear JWT token cookie on logout', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();

      // Verify cookies are cleared
      const responseCookies = response.headers['set-cookie'];
      expect(responseCookies).toBeDefined();

      // Check that token cookie is cleared (value should be empty or expired)
      const tokenCookie = responseCookies.find(cookie => cookie.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      // Cleared cookies have empty value or very old expiry
      expect(tokenCookie).toMatch(/token=;|expires=Thu, 01 Jan 1970/);
    });

    it('should clear CSRF token cookie on logout', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(200);

      expect(response.body.success).toBe(true);

      const responseCookies = response.headers['set-cookie'];
      expect(responseCookies).toBeDefined();

      // Check that CSRF cookie is cleared
      const csrfCookie = responseCookies.find(cookie => cookie.includes('csrf-token'));
      expect(csrfCookie).toBeDefined();
    });

    it('should allow logout even without authentication', async () => {
      // Logout should work even if user is not authenticated
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Protected Routes - Cookie-Based Authentication', () => {
    let loginCookies;

    beforeAll(async () => {
      // Login to get cookies for protected route tests
      const { token, cookies } = await getCsrfToken(app);
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: strongPassword
        });

      loginCookies = loginResponse.headers['set-cookie'];
    });

    it('should access protected route with cookie authentication', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', loginCookies)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(testUser.email);
    });

    it('should support Bearer token authentication (backward compatibility)', async () => {
      // Tests should still work with Bearer token for backward compatibility
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe(testUser.email);
    });

    it('should reject access without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Not authorized');
    });

    it('should change password with cookie authentication', async () => {
      const newPassword = 'NewStr0ng!Pass2';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', [...loginCookies, ...cookies])
        .set('x-csrf-token', token)
        .send({
          current_password: strongPassword,
          new_password: newPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Password changed successfully');

      // Change password back for other tests
      const { token: token2, cookies: cookies2 } = await getCsrfToken(app);
      await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', [...loginCookies, ...cookies2])
        .set('x-csrf-token', token2)
        .send({
          current_password: newPassword,
          new_password: strongPassword
        });
    });
  });
});

describe('Auth Routes - Token Revocation', () => {
  let testTeam;
  let testUser;
  let authToken;

  const strongPassword = 'StrongP@ss1';

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'Revocation Test Team',
      program_name: 'Revocation Test Team Program'
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Revocation',
      last_name: 'TestUser',
      email: 'revocation-test@example.com',
      password: strongPassword,
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign(
      {
        id: testUser.id,
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET || 'test_secret',
      { jwtid: 'test-jti-' + Date.now() }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await User.destroy({
      where: {
        email: {
          [sequelize.Sequelize.Op.like]: '%revocation-test%@example.com'
        }
      }
    });
    await testTeam.destroy();
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout and blacklist the current token', async () => {
      // First, verify the token works
      const preLogoutResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(preLogoutResponse.body.success).toBe(true);

      // Logout
      const { token, cookies } = await getCsrfToken(app);
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Verify the token no longer works
      const postLogoutResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(postLogoutResponse.body.success).toBe(false);
      expect(postLogoutResponse.body.error).toBe('Token has been revoked');
    });

    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should handle logout with invalid token', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/revoke-all-sessions', () => {
    let userForRevocation;
    let token1;
    let token2;

    beforeEach(async () => {
      // Create a fresh user for each test
      userForRevocation = await User.create({
        first_name: 'Revoke',
        last_name: 'AllUser',
        email: `revocation-test-all-${Date.now()}@example.com`,
        password: strongPassword,
        role: 'head_coach',
        team_id: testTeam.id
      });

      // Generate two tokens at different times
      token1 = jwt.sign(
        {
          id: userForRevocation.id,
          iat: Math.floor(Date.now() / 1000) - 10 // 10 seconds ago
        },
        process.env.JWT_SECRET || 'test_secret',
        { jwtid: 'token1-' + Date.now() }
      );

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      token2 = jwt.sign(
        {
          id: userForRevocation.id,
          iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_SECRET || 'test_secret',
        { jwtid: 'token2-' + Date.now() }
      );
    });

    afterEach(async () => {
      if (userForRevocation) {
        await User.destroy({ where: { id: userForRevocation.id } });
      }
    });

    it('should revoke all sessions without keeping current session', async () => {
      // Verify both tokens work before revocation
      const preRevoke1 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);
      expect(preRevoke1.body.success).toBe(true);

      const preRevoke2 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      expect(preRevoke2.body.success).toBe(true);

      // Revoke all sessions without keeping current
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const revokeResponse = await request(app)
        .post('/api/v1/auth/revoke-all-sessions')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${token1}`)
        .send({ keepCurrent: false })
        .expect(200);

      expect(revokeResponse.body.success).toBe(true);
      expect(revokeResponse.body.message).toContain('revoked');
      expect(revokeResponse.body.data).toBeUndefined();

      // Verify both tokens are now invalid
      const postRevoke1 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);
      expect(postRevoke1.body.error).toBe('Token has been revoked');

      const postRevoke2 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);
      expect(postRevoke2.body.error).toBe('Token has been revoked');
    });

    it('should revoke all sessions while keeping current session active', async () => {
      // Verify both tokens work before revocation
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Revoke all sessions while keeping current
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const revokeResponse = await request(app)
        .post('/api/v1/auth/revoke-all-sessions')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${token1}`)
        .send({ keepCurrent: true })
        .expect(200);

      expect(revokeResponse.body.success).toBe(true);
      expect(revokeResponse.body.message).toContain('revoked');
      expect(revokeResponse.body.data).toBeDefined();
      expect(revokeResponse.body.data.token).toBeDefined();

      const newToken = revokeResponse.body.data.token;

      // Verify old tokens are now invalid
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);

      // Verify new token works
      const newTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(newTokenResponse.body.success).toBe(true);
      expect(newTokenResponse.body.data.id).toBe(userForRevocation.id);
    });

    it('should require authentication', async () => {
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/revoke-all-sessions')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .send({ keepCurrent: false })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should default to keepCurrent=false when not specified', async () => {
      // Revoke without specifying keepCurrent
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const revokeResponse = await request(app)
        .post('/api/v1/auth/revoke-all-sessions')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${token1}`)
        .send({})
        .expect(200);

      expect(revokeResponse.body.success).toBe(true);
      expect(revokeResponse.body.data).toBeUndefined();

      // Verify token is revoked
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);
    });
  });

  describe('PUT /api/auth/change-password - Token Revocation', () => {
    let userForPasswordChange;
    let oldToken;

    beforeEach(async () => {
      // Create a fresh user for password change tests
      userForPasswordChange = await User.create({
        first_name: 'Password',
        last_name: 'ChangeUser',
        email: `revocation-test-password-${Date.now()}@example.com`,
        password: strongPassword,
        role: 'head_coach',
        team_id: testTeam.id
      });

      // Generate token
      oldToken = jwt.sign(
        {
          id: userForPasswordChange.id,
          iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_SECRET || 'test_secret',
        { jwtid: 'old-token-' + Date.now() }
      );
    });

    afterEach(async () => {
      if (userForPasswordChange) {
        await User.destroy({ where: { id: userForPasswordChange.id } });
      }
    });

    it('should return a new token after password change', async () => {
      const newPassword = 'NewStr0ng!Pass';

      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          current_password: strongPassword,
          new_password: newPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Password updated successfully');
      expect(response.body.message).toContain('All other sessions have been logged out');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.token).not.toBe(oldToken);
    });

    it('should invalidate old token after password change', async () => {
      const newPassword = 'NewStr0ng!Pass2';

      // Verify old token works before password change
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);

      // Change password
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const changeResponse = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          current_password: strongPassword,
          new_password: newPassword
        })
        .expect(200);

      const newToken = changeResponse.body.data.token;

      // Verify old token is now invalid
      const oldTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);

      expect(oldTokenResponse.body.error).toBe('Token has been revoked');

      // Verify new token works
      const newTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(newTokenResponse.body.success).toBe(true);
      expect(newTokenResponse.body.data.id).toBe(userForPasswordChange.id);
    });

    it('should invalidate all existing tokens on password change', async () => {
      const newPassword = 'NewStr0ng!Pass3';

      // Generate a second token
      const oldToken2 = jwt.sign(
        {
          id: userForPasswordChange.id,
          iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_SECRET || 'test_secret',
        { jwtid: 'old-token-2-' + Date.now() }
      );

      // Verify both old tokens work
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken2}`)
        .expect(200);

      // Change password using first token
      const { token: csrfToken, cookies } = await getCsrfToken(app);
      const changeResponse = await request(app)
        .put('/api/v1/auth/change-password')
        .set('Cookie', cookies)
        .set('x-csrf-token', csrfToken)
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          current_password: strongPassword,
          new_password: newPassword
        })
        .expect(200);

      const newToken = changeResponse.body.data.token;

      // Verify both old tokens are now invalid
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);

      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken2}`)
        .expect(401);

      // Verify new token works
      const newTokenResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(newTokenResponse.body.success).toBe(true);
    });
  });
});
