const lockoutService = require('../lockoutService');
const lockoutConfig = require('../../config/lockout');

// Mock dependencies
jest.mock('../../config/lockout');

describe('LockoutService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default config values
    lockoutConfig.LOCKOUT_ENABLED = true;
    lockoutConfig.MAX_FAILED_ATTEMPTS = 5;
    lockoutConfig.LOCKOUT_DURATION_MINUTES = 15;
    lockoutConfig.RESET_FAILED_ATTEMPTS_ON_SUCCESS = true;
  });

  describe('calculateRemainingLockoutMinutes', () => {
    it('should return 0 when lockedUntil is null', () => {
      const result = lockoutService.calculateRemainingLockoutMinutes(null);
      expect(result).toBe(0);
    });

    it('should return 0 when lockedUntil is undefined', () => {
      const result = lockoutService.calculateRemainingLockoutMinutes(undefined);
      expect(result).toBe(0);
    });

    it('should return 0 when lock has expired', () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 10);
      const result = lockoutService.calculateRemainingLockoutMinutes(pastDate);
      expect(result).toBe(0);
    });

    it('should calculate remaining minutes correctly', () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 15);
      const result = lockoutService.calculateRemainingLockoutMinutes(futureDate);
      expect(result).toBeGreaterThan(14);
      expect(result).toBeLessThanOrEqual(15);
    });

    it('should round up to nearest minute', () => {
      const futureDate = new Date();
      futureDate.setSeconds(futureDate.getSeconds() + 90); // 1.5 minutes
      const result = lockoutService.calculateRemainingLockoutMinutes(futureDate);
      expect(result).toBe(2); // Should round up from 1.5 to 2
    });
  });

  describe('checkAccountLockout', () => {
    it('should return not locked when user is null', () => {
      const result = lockoutService.checkAccountLockout(null);
      expect(result).toEqual({
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null
      });
    });

    it('should return not locked when user is undefined', () => {
      const result = lockoutService.checkAccountLockout(undefined);
      expect(result).toEqual({
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null
      });
    });

    it('should return not locked when lockout is globally disabled', () => {
      lockoutConfig.LOCKOUT_ENABLED = false;
      const mockUser = {
        locked_until: new Date(Date.now() + 60000),
        isLocked: jest.fn().mockReturnValue(true)
      };

      const result = lockoutService.checkAccountLockout(mockUser);

      expect(result).toEqual({
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null
      });
      expect(mockUser.isLocked).not.toHaveBeenCalled();
    });

    it('should return not locked when user.isLocked() returns false', () => {
      const mockUser = {
        locked_until: null,
        isLocked: jest.fn().mockReturnValue(false)
      };

      const result = lockoutService.checkAccountLockout(mockUser);

      expect(result).toEqual({
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null
      });
      expect(mockUser.isLocked).toHaveBeenCalled();
    });

    it('should return locked status when account is locked', () => {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);

      const mockUser = {
        locked_until: lockUntil,
        isLocked: jest.fn().mockReturnValue(true)
      };

      const result = lockoutService.checkAccountLockout(mockUser);

      expect(result.isLocked).toBe(true);
      expect(result.remainingMinutes).toBeGreaterThan(14);
      expect(result.remainingMinutes).toBeLessThanOrEqual(15);
      expect(result.lockedUntil).toBe(lockUntil);
      expect(mockUser.isLocked).toHaveBeenCalled();
    });

    it('should handle expired lock correctly', () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 10);

      const mockUser = {
        locked_until: pastDate,
        isLocked: jest.fn().mockReturnValue(false) // User model would return false for expired lock
      };

      const result = lockoutService.checkAccountLockout(mockUser);

      expect(result).toEqual({
        isLocked: false,
        remainingMinutes: 0,
        lockedUntil: null
      });
    });
  });

  describe('handleFailedLogin', () => {
    it('should throw error when user is null', async () => {
      await expect(
        lockoutService.handleFailedLogin(null)
      ).rejects.toThrow('User object is required for handleFailedLogin');
    });

    it('should throw error when user is undefined', async () => {
      await expect(
        lockoutService.handleFailedLogin(undefined)
      ).rejects.toThrow('User object is required for handleFailedLogin');
    });

    it('should return status without modifying user when lockout is disabled', async () => {
      lockoutConfig.LOCKOUT_ENABLED = false;

      const mockUser = {
        failed_login_attempts: 3,
        incrementFailedAttempts: jest.fn(),
        lockAccount: jest.fn()
      };

      const result = await lockoutService.handleFailedLogin(mockUser);

      expect(result).toEqual({
        accountLocked: false,
        failedAttempts: 3,
        attemptsRemaining: 5,
        lockedUntil: null
      });
      expect(mockUser.incrementFailedAttempts).not.toHaveBeenCalled();
      expect(mockUser.lockAccount).not.toHaveBeenCalled();
    });

    it('should increment failed attempts counter', async () => {
      const mockUser = {
        failed_login_attempts: 2,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 3;
        }),
        lockAccount: jest.fn()
      };

      const result = await lockoutService.handleFailedLogin(mockUser);

      expect(mockUser.incrementFailedAttempts).toHaveBeenCalled();
      expect(result).toEqual({
        accountLocked: false,
        failedAttempts: 3,
        attemptsRemaining: 2,
        lockedUntil: null
      });
    });

    it('should lock account when threshold is reached', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);

      const mockUser = {
        id: 123,
        email: 'test@example.com',
        failed_login_attempts: 4,
        locked_until: null,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 5;
        }),
        lockAccount: jest.fn().mockImplementation(function () {
          this.locked_until = lockUntil;
        })
      };

      const result = await lockoutService.handleFailedLogin(mockUser, '192.168.1.1');

      expect(mockUser.incrementFailedAttempts).toHaveBeenCalled();
      expect(mockUser.lockAccount).toHaveBeenCalledWith(15);
      expect(result).toEqual({
        accountLocked: true,
        failedAttempts: 5,
        attemptsRemaining: 0,
        lockedUntil: lockUntil
      });

      // Check security logging
      expect(consoleSpy).toHaveBeenCalledWith(
        'SECURITY: Account locked due to failed login attempts',
        expect.objectContaining({
          email: 'test@example.com',
          userId: 123,
          failedAttempts: 5,
          lockedUntil: lockUntil,
          ipAddress: '192.168.1.1',
          timestamp: expect.any(String)
        })
      );

      consoleSpy.mockRestore();
    });

    it('should not lock account before threshold is reached', async () => {
      const mockUser = {
        failed_login_attempts: 1,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 2;
        }),
        lockAccount: jest.fn()
      };

      const result = await lockoutService.handleFailedLogin(mockUser);

      expect(mockUser.incrementFailedAttempts).toHaveBeenCalled();
      expect(mockUser.lockAccount).not.toHaveBeenCalled();
      expect(result.accountLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
      expect(result.attemptsRemaining).toBe(3);
    });

    it('should use default IP address when not provided', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const lockUntil = new Date();

      const mockUser = {
        id: 123,
        email: 'test@example.com',
        failed_login_attempts: 4,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 5;
        }),
        lockAccount: jest.fn().mockImplementation(function () {
          this.locked_until = lockUntil;
        })
      };

      await lockoutService.handleFailedLogin(mockUser);

      expect(consoleSpy).toHaveBeenCalledWith(
        'SECURITY: Account locked due to failed login attempts',
        expect.objectContaining({
          ipAddress: 'unknown'
        })
      );

      consoleSpy.mockRestore();
    });

    it('should respect custom MAX_FAILED_ATTEMPTS configuration', async () => {
      lockoutConfig.MAX_FAILED_ATTEMPTS = 3;

      const mockUser = {
        failed_login_attempts: 1,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 2;
        }),
        lockAccount: jest.fn()
      };

      const result = await lockoutService.handleFailedLogin(mockUser);

      expect(result).toEqual({
        accountLocked: false,
        failedAttempts: 2,
        attemptsRemaining: 1,
        lockedUntil: null
      });
    });

    it('should respect custom LOCKOUT_DURATION_MINUTES configuration', async () => {
      lockoutConfig.LOCKOUT_DURATION_MINUTES = 30;

      const mockUser = {
        failed_login_attempts: 4,
        incrementFailedAttempts: jest.fn().mockImplementation(function () {
          this.failed_login_attempts = 5;
        }),
        lockAccount: jest.fn()
      };

      await lockoutService.handleFailedLogin(mockUser);

      expect(mockUser.lockAccount).toHaveBeenCalledWith(30);
    });
  });

  describe('handleSuccessfulLogin', () => {
    it('should throw error when user is null', async () => {
      await expect(
        lockoutService.handleSuccessfulLogin(null)
      ).rejects.toThrow('User object is required for handleSuccessfulLogin');
    });

    it('should throw error when user is undefined', async () => {
      await expect(
        lockoutService.handleSuccessfulLogin(undefined)
      ).rejects.toThrow('User object is required for handleSuccessfulLogin');
    });

    it('should do nothing when lockout is disabled', async () => {
      lockoutConfig.LOCKOUT_ENABLED = false;

      const mockUser = {
        failed_login_attempts: 3,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser);

      expect(mockUser.resetFailedAttempts).not.toHaveBeenCalled();
    });

    it('should do nothing when RESET_FAILED_ATTEMPTS_ON_SUCCESS is disabled', async () => {
      lockoutConfig.RESET_FAILED_ATTEMPTS_ON_SUCCESS = false;

      const mockUser = {
        failed_login_attempts: 3,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser);

      expect(mockUser.resetFailedAttempts).not.toHaveBeenCalled();
    });

    it('should not reset when there are no failed attempts', async () => {
      const mockUser = {
        failed_login_attempts: 0,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser);

      expect(mockUser.resetFailedAttempts).not.toHaveBeenCalled();
    });

    it('should reset failed attempts when there are failed attempts', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockUser = {
        id: 123,
        email: 'test@example.com',
        failed_login_attempts: 3,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser, '192.168.1.1');

      expect(mockUser.resetFailedAttempts).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'SECURITY: Successful login after failed attempts',
        expect.objectContaining({
          email: 'test@example.com',
          userId: 123,
          previousFailedAttempts: 3,
          wasLocked: false,
          ipAddress: '192.168.1.1',
          timestamp: expect.any(String)
        })
      );

      consoleSpy.mockRestore();
    });

    it('should reset and log when account was locked', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);

      const mockUser = {
        id: 123,
        email: 'test@example.com',
        failed_login_attempts: 5,
        locked_until: lockUntil,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser, '192.168.1.1');

      expect(mockUser.resetFailedAttempts).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'SECURITY: Successful login after failed attempts',
        expect.objectContaining({
          email: 'test@example.com',
          userId: 123,
          previousFailedAttempts: 5,
          wasLocked: true,
          ipAddress: '192.168.1.1',
          timestamp: expect.any(String)
        })
      );

      consoleSpy.mockRestore();
    });

    it('should use default IP address when not provided', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockUser = {
        id: 123,
        email: 'test@example.com',
        failed_login_attempts: 2,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser);

      expect(consoleSpy).toHaveBeenCalledWith(
        'SECURITY: Successful login after failed attempts',
        expect.objectContaining({
          ipAddress: 'unknown'
        })
      );

      consoleSpy.mockRestore();
    });

    it('should not log when failed attempts are 0', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockUser = {
        failed_login_attempts: 0,
        locked_until: null,
        resetFailedAttempts: jest.fn()
      };

      await lockoutService.handleSuccessfulLogin(mockUser);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('generateLockedAccountResponse', () => {
    it('should generate correct response structure', () => {
      const lockoutStatus = {
        isLocked: true,
        remainingMinutes: 15,
        lockedUntil: new Date()
      };

      const result = lockoutService.generateLockedAccountResponse(lockoutStatus);

      expect(result).toEqual({
        statusCode: 423,
        body: {
          success: false,
          error: 'Account is temporarily locked due to too many failed login attempts',
          locked: true,
          remainingMinutes: 15,
          message: 'Please try again in 15 minutes'
        }
      });
    });

    it('should use singular "minute" when remainingMinutes is 1', () => {
      const lockoutStatus = {
        isLocked: true,
        remainingMinutes: 1,
        lockedUntil: new Date()
      };

      const result = lockoutService.generateLockedAccountResponse(lockoutStatus);

      expect(result.body.message).toBe('Please try again in 1 minute');
    });

    it('should use plural "minutes" when remainingMinutes is not 1', () => {
      const lockoutStatus = {
        isLocked: true,
        remainingMinutes: 10,
        lockedUntil: new Date()
      };

      const result = lockoutService.generateLockedAccountResponse(lockoutStatus);

      expect(result.body.message).toBe('Please try again in 10 minutes');
    });

    it('should return HTTP 423 Locked status code', () => {
      const lockoutStatus = {
        isLocked: true,
        remainingMinutes: 5,
        lockedUntil: new Date()
      };

      const result = lockoutService.generateLockedAccountResponse(lockoutStatus);

      expect(result.statusCode).toBe(423);
    });
  });
});
