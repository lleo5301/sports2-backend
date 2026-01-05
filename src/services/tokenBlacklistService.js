const { TokenBlacklist } = require('../models');
const { Op } = require('sequelize');

/**
 * Token Blacklist Service for Sports2 Application
 * Handles JWT token revocation and blacklist management
 */
class TokenBlacklistService {
  /**
   * Add a token to the blacklist
   * @param {string} jti - JWT ID (unique token identifier)
   * @param {number} userId - User ID who owns the token
   * @param {Date} expiresAt - Token expiration date
   * @param {string} reason - Reason for blacklisting (logout, password_change, admin_revoke, security_revoke)
   * @returns {Promise<Object>} - Created blacklist entry
   */
  async addToBlacklist(jti, userId, expiresAt, reason) {
    try {
      const blacklistEntry = await TokenBlacklist.create({
        jti,
        user_id: userId,
        expires_at: expiresAt,
        reason
      });

      return blacklistEntry;
    } catch (error) {
      console.error('Error adding token to blacklist:', error);
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   * Checks both individual token blacklist and user-level revocation markers
   * @param {string} jti - JWT ID to check
   * @param {number} userId - Optional user ID to check for user-level revocation
   * @param {Date} tokenIssuedAt - Optional token issue timestamp (for user-level revocation check)
   * @returns {Promise<boolean>} - True if token is blacklisted, false otherwise
   */
  async isBlacklisted(jti, userId = null, tokenIssuedAt = null) {
    try {
      // Check if specific token is blacklisted
      const blacklistEntry = await TokenBlacklist.findOne({
        where: {
          jti,
          expires_at: {
            [Op.gt]: new Date() // Only check non-expired entries
          }
        }
      });

      if (blacklistEntry) {
        return true;
      }

      // If userId is provided, check for user-level revocation marker
      if (userId && tokenIssuedAt) {
        const markerJti = `user_${userId}_revoke_all`;
        const userRevocationMarker = await TokenBlacklist.findOne({
          where: {
            jti: markerJti,
            user_id: userId,
            expires_at: {
              [Op.gt]: new Date()
            }
          }
        });

        // If marker exists and token was issued before revocation, it's blacklisted
        if (userRevocationMarker && tokenIssuedAt < userRevocationMarker.revoked_at) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking token blacklist status:', error);
      // In case of error, treat as not blacklisted to avoid blocking legitimate users
      // The error is logged for debugging
      return false;
    }
  }

  /**
   * Revoke all tokens for a specific user
   * Creates a special marker entry in the blacklist that indicates all tokens
   * issued before this timestamp should be revoked for this user.
   * The auth middleware will need to check both individual JTI and this marker.
   * @param {number} userId - User ID whose tokens should be revoked
   * @param {string} reason - Reason for revocation (password_change, admin_revoke, security_revoke)
   * @returns {Promise<Object>} - Created marker entry
   */
  async revokeAllUserTokens(userId, reason) {
    try {
      // Create a special marker entry using a pattern: user_${userId}_revoke_all
      // This marker will have a far-future expiration date and can be checked by auth middleware
      // The revoked_at timestamp indicates when the revocation was triggered
      const markerJti = `user_${userId}_revoke_all`;

      // Set expiration to 7 days from now (matching JWT_EXPIRES_IN)
      // This ensures the marker stays active as long as any token could be valid
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // First, remove any existing marker for this user to avoid duplicates
      await TokenBlacklist.destroy({
        where: {
          jti: markerJti,
          user_id: userId
        }
      });

      // Create new revocation marker
      const markerEntry = await TokenBlacklist.create({
        jti: markerJti,
        user_id: userId,
        expires_at: expiresAt,
        reason
      });

      console.log(`Revoked all tokens for user ${userId} with reason: ${reason}`);
      return markerEntry;
    } catch (error) {
      console.error('Error revoking all user tokens:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens from the blacklist
   * Should be run periodically (e.g., daily via cron job)
   * @returns {Promise<number>} - Number of expired entries deleted
   */
  async cleanupExpiredTokens() {
    try {
      const result = await TokenBlacklist.destroy({
        where: {
          expires_at: {
            [Op.lt]: new Date() // Delete entries that have expired
          }
        }
      });

      console.log(`Cleaned up ${result} expired token blacklist entries`);
      return result;
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new TokenBlacklistService();
