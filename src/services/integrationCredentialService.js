const { IntegrationCredential } = require('../models');
const encryptionService = require('./encryptionService');
const logger = require('../utils/logger');

/**
 * Service for managing integration credentials with auto-refresh support
 */
class IntegrationCredentialService {
  /**
   * Get credentials for a team and provider
   * Automatically refreshes tokens if expired
   * @param {number} teamId
   * @param {string} provider
   * @returns {Promise<{credentials: object, accessToken: string|null, config: object}>}
   */
  async getCredentials(teamId, provider) {
    const credential = await IntegrationCredential.findOne({
      where: { team_id: teamId, provider, is_active: true }
    });

    if (!credential) {
      throw new Error(`No active ${provider} credentials found for team ${teamId}`);
    }

    // Decrypt basic credentials if present
    let credentials = null;
    if (credential.credentials_encrypted) {
      try {
        credentials = encryptionService.decrypt(credential.credentials_encrypted);
      } catch (error) {
        logger.error(`Failed to decrypt ${provider} credentials for team ${teamId}:`, error.message);
        throw new Error('Failed to decrypt credentials');
      }
    }

    // Get access token (decrypt if present)
    let accessToken = null;
    if (credential.access_token_encrypted) {
      try {
        accessToken = encryptionService.decrypt(credential.access_token_encrypted);
      } catch (error) {
        logger.error(`Failed to decrypt ${provider} access token for team ${teamId}:`, error.message);
        // Token decryption failed, but we might still have basic credentials
      }
    }

    return {
      credentials,
      accessToken,
      config: credential.config || {},
      isTokenExpired: credential.isTokenExpired(),
      credential // Return the model instance for further operations
    };
  }

  /**
   * Save basic auth credentials (username/password)
   * @param {number} teamId
   * @param {string} provider
   * @param {object} credentials - { username, password } or { apiKey }
   * @param {object} config - Provider-specific config (team_id, season_id, etc.)
   * @param {string} credentialType - 'basic', 'oauth2', or 'api_key'
   */
  async saveCredentials(teamId, provider, credentials, config = {}, credentialType = 'basic') {
    const encryptedCredentials = encryptionService.encrypt(credentials);

    const [credential, created] = await IntegrationCredential.upsert({
      team_id: teamId,
      provider,
      credential_type: credentialType,
      credentials_encrypted: encryptedCredentials,
      config,
      is_active: true,
      refresh_error_count: 0,
      last_refresh_error: null
    }, {
      returning: true
    });

    logger.info(`${created ? 'Created' : 'Updated'} ${provider} credentials for team ${teamId}`);
    return credential;
  }

  /**
   * Save OAuth tokens
   * @param {number} teamId
   * @param {string} provider
   * @param {object} tokens - { accessToken, refreshToken, expiresIn, refreshExpiresIn }
   */
  async saveTokens(teamId, provider, tokens) {
    const credential = await IntegrationCredential.findOne({
      where: { team_id: teamId, provider }
    });

    if (!credential) {
      throw new Error(`No ${provider} credentials found for team ${teamId}`);
    }

    const updates = {
      last_refreshed_at: new Date(),
      refresh_error_count: 0,
      last_refresh_error: null
    };

    // Encrypt and save access token
    if (tokens.accessToken) {
      updates.access_token_encrypted = encryptionService.encrypt(tokens.accessToken);
    }

    // Encrypt and save refresh token
    if (tokens.refreshToken) {
      updates.refresh_token_encrypted = encryptionService.encrypt(tokens.refreshToken);
    }

    // Calculate expiration times
    if (tokens.expiresIn) {
      updates.token_expires_at = new Date(Date.now() + tokens.expiresIn * 1000);
    } else if (tokens.expiresAt) {
      updates.token_expires_at = new Date(tokens.expiresAt);
    }

    if (tokens.refreshExpiresIn) {
      updates.refresh_token_expires_at = new Date(Date.now() + tokens.refreshExpiresIn * 1000);
    } else if (tokens.refreshExpiresAt) {
      updates.refresh_token_expires_at = new Date(tokens.refreshExpiresAt);
    }

    await credential.update(updates);
    logger.info(`Saved ${provider} tokens for team ${teamId}, expires at ${updates.token_expires_at}`);

    return credential;
  }

  /**
   * Update provider-specific config
   * @param {number} teamId
   * @param {string} provider
   * @param {object} config - Config to merge with existing
   */
  async updateConfig(teamId, provider, config) {
    const credential = await IntegrationCredential.findOne({
      where: { team_id: teamId, provider }
    });

    if (!credential) {
      throw new Error(`No ${provider} credentials found for team ${teamId}`);
    }

    const mergedConfig = { ...credential.config, ...config };
    await credential.update({ config: mergedConfig });

    logger.info(`Updated ${provider} config for team ${teamId}`);
    return credential;
  }

  /**
   * Check if tokens need refresh and refresh if possible
   * @param {number} teamId
   * @param {string} provider
   * @param {function} refreshFn - Async function that takes (refreshToken) and returns new tokens
   * @returns {Promise<{accessToken: string, refreshed: boolean}>}
   */
  async refreshTokenIfNeeded(teamId, provider, refreshFn) {
    const credential = await IntegrationCredential.findOne({
      where: { team_id: teamId, provider, is_active: true }
    });

    if (!credential) {
      throw new Error(`No active ${provider} credentials found for team ${teamId}`);
    }

    // Check if refresh is needed
    if (!credential.isTokenExpired()) {
      // Token still valid, just decrypt and return
      const accessToken = credential.access_token_encrypted
        ? encryptionService.decrypt(credential.access_token_encrypted)
        : null;
      return { accessToken, refreshed: false };
    }

    // Check if refresh token is available and not expired
    if (!credential.refresh_token_encrypted) {
      throw new Error(`No refresh token available for ${provider} team ${teamId}`);
    }

    if (credential.isRefreshTokenExpired()) {
      await credential.update({ is_active: false });
      throw new Error(`Refresh token expired for ${provider} team ${teamId}. Re-authentication required.`);
    }

    // Attempt to refresh
    try {
      const refreshToken = encryptionService.decrypt(credential.refresh_token_encrypted);
      const newTokens = await refreshFn(refreshToken);

      // Save new tokens
      await this.saveTokens(teamId, provider, newTokens);
      await credential.recordRefreshSuccess();

      logger.info(`Successfully refreshed ${provider} tokens for team ${teamId}`);

      return {
        accessToken: newTokens.accessToken,
        refreshed: true
      };
    } catch (error) {
      const sanitizedError = this.sanitizeError(error.message);
      const deactivated = await credential.recordRefreshFailure(sanitizedError);

      if (deactivated) {
        logger.error(`${provider} credentials deactivated for team ${teamId} after ${IntegrationCredential.MAX_REFRESH_ERRORS} failures`);
        throw new Error(`${provider} credentials deactivated due to repeated refresh failures. Re-authentication required.`);
      }

      logger.warn(`${provider} token refresh failed for team ${teamId} (attempt ${credential.refresh_error_count + 1}): ${sanitizedError}`);
      throw error;
    }
  }

  /**
   * Deactivate credentials (soft delete)
   * @param {number} teamId
   * @param {string} provider
   */
  async deactivateCredentials(teamId, provider) {
    const credential = await IntegrationCredential.findOne({
      where: { team_id: teamId, provider }
    });

    if (credential) {
      await credential.update({ is_active: false });
      logger.info(`Deactivated ${provider} credentials for team ${teamId}`);
    }

    return credential;
  }

  /**
   * Delete credentials completely
   * @param {number} teamId
   * @param {string} provider
   */
  async deleteCredentials(teamId, provider) {
    const deleted = await IntegrationCredential.destroy({
      where: { team_id: teamId, provider }
    });

    if (deleted) {
      logger.info(`Deleted ${provider} credentials for team ${teamId}`);
    }

    return deleted > 0;
  }

  /**
   * Get all active credentials for a team
   * @param {number} teamId
   */
  async getTeamIntegrations(teamId) {
    const credentials = await IntegrationCredential.findAll({
      where: { team_id: teamId },
      attributes: ['provider', 'credential_type', 'is_active', 'token_expires_at', 'last_refreshed_at', 'config', 'refresh_error_count']
    });

    return credentials.map(c => ({
      provider: c.provider,
      credentialType: c.credential_type,
      isActive: c.is_active,
      tokenExpiresAt: c.token_expires_at,
      lastRefreshedAt: c.last_refreshed_at,
      config: c.config,
      hasErrors: c.refresh_error_count > 0
    }));
  }

  /**
   * Find credentials that need refresh (for background job)
   * @param {number} bufferMinutes - Minutes before expiration to include
   */
  async findCredentialsNeedingRefresh(bufferMinutes = 5) {
    const bufferTime = new Date(Date.now() + bufferMinutes * 60 * 1000);

    return IntegrationCredential.findAll({
      where: {
        is_active: true,
        token_expires_at: {
          [require('sequelize').Op.lt]: bufferTime
        },
        refresh_token_encrypted: {
          [require('sequelize').Op.ne]: null
        }
      }
    });
  }

  /**
   * Sanitize error messages to remove sensitive data
   */
  sanitizeError(message) {
    if (!message) {
      return 'Unknown error';
    }

    return message
      .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '***JWT***')
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
      .replace(/password['":\s]+[^\s,}]+/gi, 'password: ***')
      .replace(/token['":\s]+[^\s,}]+/gi, 'token: ***');
  }
}

module.exports = new IntegrationCredentialService();
