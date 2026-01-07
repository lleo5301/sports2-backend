const tokenBlacklistService = require('../tokenBlacklistService');
const { TokenBlacklist } = require('../../models');
const { Op } = require('sequelize');

// Mock dependencies
jest.mock('../../models');

describe('TokenBlacklistService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addToBlacklist', () => {
    it('should successfully add a token to the blacklist', async () => {
      const mockBlacklistEntry = {
        id: 1,
        jti: 'test-jti-123',
        user_id: 1,
        expires_at: new Date('2026-01-12'),
        reason: 'logout',
        revoked_at: new Date()
      };

      TokenBlacklist.create = jest.fn().mockResolvedValue(mockBlacklistEntry);

      const result = await tokenBlacklistService.addToBlacklist(
        'test-jti-123',
        1,
        new Date('2026-01-12'),
        'logout'
      );

      expect(TokenBlacklist.create).toHaveBeenCalledWith({
        jti: 'test-jti-123',
        user_id: 1,
        expires_at: new Date('2026-01-12'),
        reason: 'logout'
      });
      expect(result).toEqual(mockBlacklistEntry);
    });

    it('should handle errors when adding to blacklist fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Database error');

      TokenBlacklist.create = jest.fn().mockRejectedValue(mockError);

      await expect(
        tokenBlacklistService.addToBlacklist(
          'test-jti-123',
          1,
          new Date('2026-01-12'),
          'logout'
        )
      ).rejects.toThrow('Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error adding token to blacklist:',
        mockError
      );

      consoleSpy.mockRestore();
    });

    it('should work with all valid reason types', async () => {
      const reasons = ['logout', 'password_change', 'admin_revoke', 'security_revoke'];

      for (const reason of reasons) {
        TokenBlacklist.create = jest.fn().mockResolvedValue({
          id: 1,
          jti: 'test-jti',
          user_id: 1,
          expires_at: new Date('2026-01-12'),
          reason
        });

        await tokenBlacklistService.addToBlacklist(
          'test-jti',
          1,
          new Date('2026-01-12'),
          reason
        );

        expect(TokenBlacklist.create).toHaveBeenCalledWith({
          jti: 'test-jti',
          user_id: 1,
          expires_at: new Date('2026-01-12'),
          reason
        });
      }
    });
  });

  describe('isBlacklisted', () => {
    it('should return true when token is individually blacklisted', async () => {
      TokenBlacklist.findOne = jest.fn().mockResolvedValue({
        id: 1,
        jti: 'test-jti-123',
        user_id: 1,
        expires_at: new Date('2026-01-12'),
        reason: 'logout'
      });

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123');

      expect(result).toBe(true);
      expect(TokenBlacklist.findOne).toHaveBeenCalledWith({
        where: {
          jti: 'test-jti-123',
          expires_at: {
            [Op.gt]: expect.any(Date)
          }
        }
      });
    });

    it('should return false when token is not blacklisted', async () => {
      TokenBlacklist.findOne = jest.fn().mockResolvedValue(null);

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123');

      expect(result).toBe(false);
    });

    it('should return false when token entry has expired', async () => {
      // First call checks individual token, second call checks user revocation marker
      TokenBlacklist.findOne = jest.fn().mockResolvedValue(null);

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123');

      expect(result).toBe(false);
    });

    it('should return true when user-level revocation marker exists for token issued before revocation', async () => {
      const revokedAt = new Date('2026-01-05T12:00:00Z');
      const tokenIssuedAt = new Date('2026-01-05T10:00:00Z'); // Before revocation

      // First call: individual token check (not found)
      // Second call: user revocation marker check (found)
      TokenBlacklist.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 2,
          jti: 'user_1_revoke_all',
          user_id: 1,
          revoked_at: revokedAt,
          expires_at: new Date('2026-01-12'),
          reason: 'password_change'
        });

      const result = await tokenBlacklistService.isBlacklisted(
        'test-jti-123',
        1,
        tokenIssuedAt
      );

      expect(result).toBe(true);
      expect(TokenBlacklist.findOne).toHaveBeenCalledTimes(2);
      expect(TokenBlacklist.findOne).toHaveBeenNthCalledWith(2, {
        where: {
          jti: 'user_1_revoke_all',
          user_id: 1,
          expires_at: {
            [Op.gt]: expect.any(Date)
          }
        }
      });
    });

    it('should return false when token was issued after user revocation', async () => {
      const revokedAt = new Date('2026-01-05T10:00:00Z');
      const tokenIssuedAt = new Date('2026-01-05T12:00:00Z'); // After revocation

      TokenBlacklist.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 2,
          jti: 'user_1_revoke_all',
          user_id: 1,
          revoked_at: revokedAt,
          expires_at: new Date('2026-01-12'),
          reason: 'password_change'
        });

      const result = await tokenBlacklistService.isBlacklisted(
        'test-jti-123',
        1,
        tokenIssuedAt
      );

      expect(result).toBe(false);
    });

    it('should return false when no user revocation marker exists', async () => {
      TokenBlacklist.findOne = jest.fn().mockResolvedValue(null);

      const result = await tokenBlacklistService.isBlacklisted(
        'test-jti-123',
        1,
        new Date()
      );

      expect(result).toBe(false);
    });

    it('should skip user revocation check when userId is not provided', async () => {
      TokenBlacklist.findOne = jest.fn().mockResolvedValue(null);

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123');

      expect(result).toBe(false);
      expect(TokenBlacklist.findOne).toHaveBeenCalledTimes(1);
    });

    it('should skip user revocation check when tokenIssuedAt is not provided', async () => {
      TokenBlacklist.findOne = jest.fn().mockResolvedValue(null);

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123', 1);

      expect(result).toBe(false);
      expect(TokenBlacklist.findOne).toHaveBeenCalledTimes(1);
    });

    it('should gracefully handle errors and return false', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Database error');

      TokenBlacklist.findOne = jest.fn().mockRejectedValue(mockError);

      const result = await tokenBlacklistService.isBlacklisted('test-jti-123');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error checking token blacklist status:',
        mockError
      );

      consoleSpy.mockRestore();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should create a user revocation marker', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockMarkerEntry = {
        id: 1,
        jti: 'user_1_revoke_all',
        user_id: 1,
        revoked_at: expect.any(Date),
        expires_at: expect.any(Date),
        reason: 'password_change'
      };

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(0);
      TokenBlacklist.create = jest.fn().mockResolvedValue(mockMarkerEntry);

      const result = await tokenBlacklistService.revokeAllUserTokens(1, 'password_change');

      expect(TokenBlacklist.destroy).toHaveBeenCalledWith({
        where: {
          jti: 'user_1_revoke_all',
          user_id: 1
        }
      });

      expect(TokenBlacklist.create).toHaveBeenCalledWith({
        jti: 'user_1_revoke_all',
        user_id: 1,
        expires_at: expect.any(Date),
        reason: 'password_change'
      });

      expect(result).toEqual(mockMarkerEntry);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Revoked all tokens for user 1 with reason: password_change'
      );

      consoleSpy.mockRestore();
    });

    it('should remove existing marker before creating new one', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(1); // 1 row deleted
      TokenBlacklist.create = jest.fn().mockResolvedValue({
        id: 2,
        jti: 'user_1_revoke_all',
        user_id: 1,
        expires_at: expect.any(Date),
        reason: 'security_revoke'
      });

      await tokenBlacklistService.revokeAllUserTokens(1, 'security_revoke');

      expect(TokenBlacklist.destroy).toHaveBeenCalled();
      expect(TokenBlacklist.create).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should set expiration to 7 days from now', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(0);
      TokenBlacklist.create = jest.fn().mockResolvedValue({
        id: 1,
        jti: 'user_1_revoke_all',
        user_id: 1,
        expires_at: expect.any(Date),
        reason: 'admin_revoke'
      });

      await tokenBlacklistService.revokeAllUserTokens(1, 'admin_revoke');

      const createCall = TokenBlacklist.create.mock.calls[0][0];
      const expiresAt = createCall.expires_at;
      const now = new Date();
      const expectedExpiration = new Date();
      expectedExpiration.setDate(expectedExpiration.getDate() + 7);

      // Check that expires_at is approximately 7 days from now (within 1 minute tolerance)
      const timeDiff = Math.abs(expiresAt - expectedExpiration);
      expect(timeDiff).toBeLessThan(60000); // Less than 1 minute difference

      consoleSpy.mockRestore();
    });

    it('should work with all valid reason types', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const reasons = ['password_change', 'admin_revoke', 'security_revoke'];

      for (const reason of reasons) {
        TokenBlacklist.destroy = jest.fn().mockResolvedValue(0);
        TokenBlacklist.create = jest.fn().mockResolvedValue({
          id: 1,
          jti: 'user_1_revoke_all',
          user_id: 1,
          expires_at: expect.any(Date),
          reason
        });

        await tokenBlacklistService.revokeAllUserTokens(1, reason);

        expect(TokenBlacklist.create).toHaveBeenCalledWith({
          jti: 'user_1_revoke_all',
          user_id: 1,
          expires_at: expect.any(Date),
          reason
        });
      }

      consoleSpy.mockRestore();
    });

    it('should handle errors when revoking tokens fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Database error');

      TokenBlacklist.destroy = jest.fn().mockRejectedValue(mockError);

      await expect(
        tokenBlacklistService.revokeAllUserTokens(1, 'password_change')
      ).rejects.toThrow('Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error revoking all user tokens:',
        mockError
      );

      consoleSpy.mockRestore();
    });

    it('should create unique markers for different users', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(0);
      TokenBlacklist.create = jest.fn()
        .mockResolvedValueOnce({
          id: 1,
          jti: 'user_1_revoke_all',
          user_id: 1,
          expires_at: expect.any(Date),
          reason: 'password_change'
        })
        .mockResolvedValueOnce({
          id: 2,
          jti: 'user_2_revoke_all',
          user_id: 2,
          expires_at: expect.any(Date),
          reason: 'password_change'
        });

      await tokenBlacklistService.revokeAllUserTokens(1, 'password_change');
      await tokenBlacklistService.revokeAllUserTokens(2, 'password_change');

      expect(TokenBlacklist.create).toHaveBeenNthCalledWith(1, {
        jti: 'user_1_revoke_all',
        user_id: 1,
        expires_at: expect.any(Date),
        reason: 'password_change'
      });

      expect(TokenBlacklist.create).toHaveBeenNthCalledWith(2, {
        jti: 'user_2_revoke_all',
        user_id: 2,
        expires_at: expect.any(Date),
        reason: 'password_change'
      });

      consoleSpy.mockRestore();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired blacklist entries', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(5);

      const result = await tokenBlacklistService.cleanupExpiredTokens();

      expect(TokenBlacklist.destroy).toHaveBeenCalledWith({
        where: {
          expires_at: {
            [Op.lt]: expect.any(Date)
          }
        }
      });

      expect(result).toBe(5);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cleaned up 5 expired token blacklist entries'
      );

      consoleSpy.mockRestore();
    });

    it('should return 0 when no expired entries exist', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(0);

      const result = await tokenBlacklistService.cleanupExpiredTokens();

      expect(result).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cleaned up 0 expired token blacklist entries'
      );

      consoleSpy.mockRestore();
    });

    it('should handle errors during cleanup', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Database error');

      TokenBlacklist.destroy = jest.fn().mockRejectedValue(mockError);

      await expect(
        tokenBlacklistService.cleanupExpiredTokens()
      ).rejects.toThrow('Database error');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error cleaning up expired tokens:',
        mockError
      );

      consoleSpy.mockRestore();
    });

    it('should only delete entries with expires_at in the past', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      TokenBlacklist.destroy = jest.fn().mockResolvedValue(3);

      await tokenBlacklistService.cleanupExpiredTokens();

      const destroyCall = TokenBlacklist.destroy.mock.calls[0][0];
      const whereClause = destroyCall.where;

      expect(whereClause.expires_at).toBeDefined();
      expect(whereClause.expires_at[Op.lt]).toBeInstanceOf(Date);

      // The date should be approximately now
      const now = new Date();
      const queryDate = whereClause.expires_at[Op.lt];
      const timeDiff = Math.abs(now - queryDate);
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference

      consoleSpy.mockRestore();
    });
  });
});
