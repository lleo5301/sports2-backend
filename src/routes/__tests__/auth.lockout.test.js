const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team } = require('../../models');
const jwt = require('jsonwebtoken');
const lockoutConfig = require('../../config/lockout');
const { getCsrfToken } = require('../../test/helpers');

describe('Auth Routes - Account Lockout', () => {
  let testTeam;
  let testUser;
  let testUser2;
  let adminUser;
  let adminToken;

  const validPassword = 'TestP@ss123';
  const wrongPassword = 'WrongP@ss123';

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'Lockout Test Team',
      program_name: 'Lockout Test Team Program'
    });

    // Create test user for lockout tests
    testUser = await User.create({
      first_name: 'Lockout',
      last_name: 'TestUser',
      email: 'lockout-test@example.com',
      password: validPassword,
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Create second test user to verify lockout isolation
    testUser2 = await User.create({
      first_name: 'Lockout',
      last_name: 'TestUser2',
      email: 'lockout-test2@example.com',
      password: validPassword,
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Create admin user for admin unlock tests
    adminUser = await User.create({
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin-lockout-test@example.com',
      password: validPassword,
      role: 'super_admin',
      team_id: testTeam.id
    });

    // Generate admin token
    adminToken = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await User.destroy({
      where: {
        email: {
          [sequelize.Sequelize.Op.like]: '%lockout-test%@example.com'
        }
      }
    });
    await testTeam.destroy();
  });

  beforeEach(async () => {
    // Reset lockout state before each test
    await testUser.update({
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login: null
    });
    await testUser2.update({
      failed_login_attempts: 0,
      locked_until: null,
      last_failed_login: null
    });
  });

  describe('Failed Login Attempt Tracking', () => {
    it('should increment failed login attempts counter on invalid password', async () => {
      // First failed attempt
      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: wrongPassword
        })
        .expect(401);

      // Reload user to check updated counter
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(1);
      expect(testUser.last_failed_login).not.toBeNull();
    });

    it('should continue incrementing counter on subsequent failed attempts', async () => {
      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            email: testUser.email,
            password: wrongPassword
          })
          .expect(401);
      }

      // Check counter increased to 3
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(3);
    });

    it('should not increment counter on successful login', async () => {
      // Successful login
      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      // Counter should remain 0
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(0);
    });
  });

  describe('Account Lockout After Max Failed Attempts', () => {
    it('should lock account after max failed attempts', async () => {
      const maxAttempts = lockoutConfig.MAX_FAILED_ATTEMPTS;

      // Perform max failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            email: testUser.email,
            password: wrongPassword
          })
          .expect(401);
      }

      // Verify account is locked
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(maxAttempts);
      expect(testUser.locked_until).not.toBeNull();
      expect(testUser.isLocked()).toBe(true);
    });

    it('should set locked_until timestamp correctly', async () => {
      const maxAttempts = lockoutConfig.MAX_FAILED_ATTEMPTS;
      const beforeLockout = new Date();

      // Perform max failed attempts
      for (let i = 0; i < maxAttempts; i++) {
        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            email: testUser.email,
            password: wrongPassword
          })
          .expect(401);
      }

      await testUser.reload();
      const lockedUntil = new Date(testUser.locked_until);
      const expectedLockoutTime = new Date(beforeLockout.getTime() + lockoutConfig.LOCKOUT_DURATION_MINUTES * 60 * 1000);

      // Allow 5 second margin for test execution time
      const timeDiff = Math.abs(lockedUntil - expectedLockoutTime);
      expect(timeDiff).toBeLessThan(5000);
    });
  });

  describe('Locked Account Login Attempts', () => {
    beforeEach(async () => {
      // Lock the account manually
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: lockUntil
      });
    });

    it('should return 423 Locked status when account is locked', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      expect(response.body.success).toBe(false);
      expect(response.body.locked).toBe(true);
    });

    it('should include remaining lockout time in response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      expect(response.body.remainingMinutes).toBeDefined();
      expect(response.body.remainingMinutes).toBeGreaterThan(0);
      expect(response.body.remainingMinutes).toBeLessThanOrEqual(lockoutConfig.LOCKOUT_DURATION_MINUTES);
    });

    it('should include appropriate error message in locked response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      expect(response.body.error).toContain('locked');
      expect(response.body.message).toMatch(/try again in \d+ minute/i);
    });

    it('should block login even with correct password when locked', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      expect(response.body.success).toBe(false);
      expect(response.body.locked).toBe(true);
    });
  });

  describe('Lockout Expiration', () => {
    it('should allow successful login after lockout expires', async () => {
      // Set lockout to expire 1 second ago
      const expiredLockUntil = new Date();
      expiredLockUntil.setSeconds(expiredLockUntil.getSeconds() - 1);

      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: expiredLockUntil
      });

      // Attempt login with valid credentials
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should clear lockout data after expired lock and successful login', async () => {
      // Set lockout to expire 1 second ago
      const expiredLockUntil = new Date();
      expiredLockUntil.setSeconds(expiredLockUntil.getSeconds() - 1);

      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: expiredLockUntil
      });

      // Successful login
      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      // Verify lockout data is cleared
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(0);
      expect(testUser.locked_until).toBeNull();
      expect(testUser.last_failed_login).toBeNull();
    });
  });

  describe('Successful Login Resets Counter', () => {
    it('should reset failed attempts counter on successful login', async () => {
      // Set some failed attempts (but not enough to lock)
      await testUser.update({
        failed_login_attempts: 3,
        last_failed_login: new Date()
      });

      // Successful login
      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      // Verify counter is reset
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(0);
      expect(testUser.locked_until).toBeNull();
      expect(testUser.last_failed_login).toBeNull();
    });

    it('should allow new login attempts after counter reset', async () => {
      // Set some failed attempts
      await testUser.update({
        failed_login_attempts: 3
      });

      // Successful login resets counter
      const { token: token1, cookies: cookies1 } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies1)
        .set('x-csrf-token', token1)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      // Verify we can make failed attempts again from 0
      const { token: token2, cookies: cookies2 } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies2)
        .set('x-csrf-token', token2)
        .send({
          email: testUser.email,
          password: wrongPassword
        })
        .expect(401);

      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(1);
    });
  });

  describe('Lockout Isolation Between Accounts', () => {
    it('should not affect other accounts when one account is locked', async () => {
      // Lock testUser account
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: lockUntil
      });

      // Verify testUser is locked
      const { token: token1, cookies: cookies1 } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies1)
        .set('x-csrf-token', token1)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      // Verify testUser2 can still login
      const { token: token2, cookies: cookies2 } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies2)
        .set('x-csrf-token', token2)
        .send({
          email: testUser2.email,
          password: validPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should track failed attempts independently per account', async () => {
      // Make 2 failed attempts on testUser
      for (let i = 0; i < 2; i++) {
        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            email: testUser.email,
            password: wrongPassword
          })
          .expect(401);
      }

      // Make 3 failed attempts on testUser2
      for (let i = 0; i < 3; i++) {
        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .post('/api/v1/auth/login')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            email: testUser2.email,
            password: wrongPassword
          })
          .expect(401);
      }

      // Verify independent counters
      await testUser.reload();
      await testUser2.reload();
      expect(testUser.failed_login_attempts).toBe(2);
      expect(testUser2.failed_login_attempts).toBe(3);
    });
  });

  describe('Admin Unlock Functionality', () => {
    beforeEach(async () => {
      // Lock the account
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: lockUntil,
        last_failed_login: new Date()
      });
    });

    it('should allow admin to unlock a locked account', async () => {
      // Admin unlocks the account
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/v1/auth/admin/unlock/${testUser.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('unlocked');

      // Verify account is unlocked
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(0);
      expect(testUser.locked_until).toBeNull();
      expect(testUser.last_failed_login).toBeNull();
    });

    it('should allow immediate login after admin unlock', async () => {
      // Admin unlocks the account
      const { token: token1, cookies: cookies1 } = await getCsrfToken(app);
      await request(app)
        .post(`/api/v1/auth/admin/unlock/${testUser.id}`)
        .set('Cookie', cookies1)
        .set('x-csrf-token', token1)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify user can login immediately
      const { token: token2, cookies: cookies2 } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies2)
        .set('x-csrf-token', token2)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should return details about unlocked account state', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/v1/auth/admin/unlock/${testUser.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.wasLocked).toBeDefined();
      expect(response.body.data.previousFailedAttempts).toBeDefined();
      expect(response.body.data.wasLocked).toBe(true);
      expect(response.body.data.previousFailedAttempts).toBe(lockoutConfig.MAX_FAILED_ATTEMPTS);
    });

    it('should require admin role for unlock endpoint', async () => {
      // Generate token for non-admin user
      const userToken = jwt.sign({ id: testUser2.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/v1/auth/admin/unlock/${testUser.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('admin');
    });

    it('should return 404 for non-existent user unlock', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/admin/unlock/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should require authentication for unlock endpoint', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/v1/auth/admin/unlock/${testUser.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Admin Lockout Status Endpoint', () => {
    it('should return lockout status for locked account', async () => {
      // Lock the account
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: 3,
        locked_until: lockUntil,
        last_failed_login: new Date()
      });

      const response = await request(app)
        .get(`/api/v1/auth/admin/lockout-status/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isLocked).toBe(true);
      expect(response.body.data.failedLoginAttempts).toBe(3);
      expect(response.body.data.lockedUntil).toBeDefined();
      expect(response.body.data.remainingLockoutMinutes).toBeGreaterThan(0);
    });

    it('should return lockout status for unlocked account', async () => {
      const response = await request(app)
        .get(`/api/v1/auth/admin/lockout-status/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isLocked).toBe(false);
      expect(response.body.data.failedLoginAttempts).toBe(0);
      expect(response.body.data.lockedUntil).toBeNull();
      expect(response.body.data.lastFailedLogin).toBeNull();
    });

    it('should require admin role for status endpoint', async () => {
      const userToken = jwt.sign({ id: testUser2.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .get(`/api/v1/auth/admin/lockout-status/${testUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent user status', async () => {
      const response = await request(app)
        .get('/api/v1/auth/admin/lockout-status/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should use generic error message for locked account to prevent user enumeration', async () => {
      // Lock the account
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: lockUntil
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      // Error message should not reveal if user exists
      expect(response.body.error).toContain('locked');
      expect(response.body.locked).toBe(true);
    });

    it('should not increment counter for non-existent user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: 'nonexistent@example.com',
          password: wrongPassword
        })
        .expect(401);

      // Should not create any user record
      const user = await User.findOne({ where: { email: 'nonexistent@example.com' } });
      expect(user).toBeNull();
    });

    it('should handle lockout check before password verification', async () => {
      // Lock the account
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);
      await testUser.update({
        failed_login_attempts: lockoutConfig.MAX_FAILED_ATTEMPTS,
        locked_until: lockUntil
      });

      // Even with correct password, should return locked status
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          email: testUser.email,
          password: validPassword
        })
        .expect(423);

      expect(response.body.locked).toBe(true);

      // Failed attempts should not increment further when already locked
      await testUser.reload();
      expect(testUser.failed_login_attempts).toBe(lockoutConfig.MAX_FAILED_ATTEMPTS);
    });
  });
});
