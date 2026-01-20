const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Settings Routes - Password Change Validation', () => {
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
      name: 'Settings Test Team',
      program_name: 'Settings Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test user for password change tests
    testUser = await User.create({
      first_name: 'Settings',
      last_name: 'TestUser',
      email: 'settings-test-user@example.com',
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
          [sequelize.Sequelize.Op.like]: '%settings-test%@example.com'
        }
      }
    });
    await testTeam.destroy();
  });

  describe('PUT /api/settings/change-password - Password Validation', () => {
    describe('should reject weak new passwords', () => {
      it('should reject new password that is too short', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.tooShort,
            confirmPassword: weakPasswords.tooShort
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword',
              msg: expect.stringContaining('8 characters')
            })
          ])
        );
      });

      it('should reject new password without uppercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.noUppercase,
            confirmPassword: weakPasswords.noUppercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword',
              msg: expect.stringContaining('uppercase')
            })
          ])
        );
      });

      it('should reject new password without lowercase letter', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.noLowercase,
            confirmPassword: weakPasswords.noLowercase
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword',
              msg: expect.stringContaining('lowercase')
            })
          ])
        );
      });

      it('should reject new password without digit', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.noDigit,
            confirmPassword: weakPasswords.noDigit
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword',
              msg: expect.stringContaining('digit')
            })
          ])
        );
      });

      it('should reject new password without special character', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.noSpecialChar,
            confirmPassword: weakPasswords.noSpecialChar
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword',
              msg: expect.stringContaining('special character')
            })
          ])
        );
      });

      it('should reject commonly used weak password "123456"', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.commonWeak,
            confirmPassword: weakPasswords.commonWeak
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject commonly used weak password "password"', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: weakPasswords.anotherCommon,
            confirmPassword: weakPasswords.anotherCommon
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });
    });

    describe('should accept strong new passwords', () => {
      it('should accept new password meeting all requirements', async () => {
        const newStrongPassword = 'NewStr0ng!Pass';

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: newStrongPassword,
            confirmPassword: newStrongPassword
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Password changed successfully');

        // Reset password back for other tests
        await User.update(
          { password: strongPassword },
          { where: { id: testUser.id }, individualHooks: true }
        );
      });

      it('should accept password with various special characters', async () => {
        const passwordsWithSpecialChars = [
          'Password1!',
          'Password1@',
          'Password1#',
          'Password1$'
        ];

        for (const password of passwordsWithSpecialChars) {
          const { token, cookies } = await getCsrfToken(app);
          const response = await request(app)
            .put('/api/settings/change-password')
            .set('Cookie', cookies)
            .set('x-csrf-token', token)
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              currentPassword: strongPassword,
              newPassword: password,
              confirmPassword: password
            })
            .expect(200);

          expect(response.body.success).toBe(true);

          // Reset password back for next iteration
          await User.update(
            { password: strongPassword },
            { where: { id: testUser.id }, individualHooks: true }
          );
        }
      });

      it('should accept password at exactly minimum length (8 chars)', async () => {
        const exactMinPassword = 'Aa1!aaaa'; // Exactly 8 characters

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: exactMinPassword,
            confirmPassword: exactMinPassword
          })
          .expect(200);

        expect(response.body.success).toBe(true);

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
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            currentPassword: strongPassword,
            newPassword: 'NewStr0ng!Pass',
            confirmPassword: 'NewStr0ng!Pass'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should return 401 when invalid token is provided', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', 'Bearer invalid_token')
          .send({
            currentPassword: strongPassword,
            newPassword: 'NewStr0ng!Pass',
            confirmPassword: 'NewStr0ng!Pass'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('should validate current password', () => {
      it('should reject when current password is incorrect', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: 'WrongP@ss1',
            newPassword: 'NewStr0ng!Pass',
            confirmPassword: 'NewStr0ng!Pass'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Current password is incorrect');
      });
    });

    describe('should validate password confirmation', () => {
      it('should reject when password confirmation does not match', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: 'NewStr0ng!Pass',
            confirmPassword: 'DifferentP@ss1'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'confirmPassword',
              msg: expect.stringContaining('does not match')
            })
          ])
        );
      });
    });

    describe('Error Message Quality', () => {
      it('should provide clear error messages for multiple missing requirements', async () => {
        // Password missing multiple requirements
        const veryWeakPassword = 'weak';

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            newPassword: veryWeakPassword,
            confirmPassword: veryWeakPassword
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');

        // The error message should mention multiple requirements
        const errors = response.body.errors;
        expect(errors).toBeDefined();
        expect(errors.length).toBeGreaterThan(0);

        const passwordError = errors.find(e => e.path === 'newPassword');
        expect(passwordError).toBeDefined();
        expect(passwordError.msg).toContain('8 characters');
      });

      it('should validate newPassword is required', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/settings/change-password')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            currentPassword: strongPassword,
            confirmPassword: strongPassword
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'newPassword'
            })
          ])
        );
      });
    });
  });
});
