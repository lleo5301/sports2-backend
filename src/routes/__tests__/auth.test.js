const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team } = require('../../models');
const jwt = require('jsonwebtoken');

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
      sport: 'baseball',
      season: 'spring',
      year: 2024
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
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            ...validUserData,
            password: weakPasswords.commonWeak
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should reject commonly used weak password "password"', async () => {
        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            ...validUserData,
            password: strongPassword
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.email).toBe(validUserData.email);
        expect(response.body.data).toHaveProperty('token');
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

          const response = await request(app)
            .post('/api/auth/register')
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

        const response = await request(app)
          .post('/api/auth/register')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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

        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
          .send({
            current_password: strongPassword,
            new_password: 'NewStr0ng!Pass'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should return 401 when invalid token is provided', async () => {
        const response = await request(app)
          .put('/api/auth/change-password')
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
        const response = await request(app)
          .put('/api/auth/change-password')
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

      const response = await request(app)
        .post('/api/auth/register')
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
});
