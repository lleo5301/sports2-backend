const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const IntegrationCredential = sequelize.define('IntegrationCredential', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Integration provider: presto, hudl, synergy, etc.'
  },
  credential_type: {
    type: DataTypes.ENUM('oauth2', 'basic', 'api_key'),
    allowNull: false,
    defaultValue: 'basic'
  },
  credentials_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encrypted JSON with username/password or API key'
  },
  access_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encrypted access token'
  },
  refresh_token_encrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encrypted refresh token'
  },
  token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the access token expires'
  },
  refresh_token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the refresh token expires'
  },
  last_refreshed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last successful token refresh'
  },
  refresh_error_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Consecutive refresh failures'
  },
  last_refresh_error: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Last refresh error message (sanitized)'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'False if deactivated'
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Provider-specific configuration'
  }
}, {
  tableName: 'integration_credentials',
  timestamps: true,
  indexes: [
    {
      fields: ['team_id', 'provider'],
      unique: true
    },
    {
      fields: ['provider']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['token_expires_at']
    }
  ]
});

// ============================================
// Constants
// ============================================

IntegrationCredential.PROVIDERS = {
  PRESTO: 'presto',
  HUDL: 'hudl',
  SYNERGY: 'synergy'
};

IntegrationCredential.CREDENTIAL_TYPES = {
  OAUTH2: 'oauth2',
  BASIC: 'basic',
  API_KEY: 'api_key'
};

// Max consecutive refresh failures before deactivation
IntegrationCredential.MAX_REFRESH_ERRORS = 3;

// Buffer time before expiration to trigger refresh (5 minutes)
IntegrationCredential.REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============================================
// Instance Methods
// ============================================

/**
 * Check if the access token is expired or about to expire
 */
IntegrationCredential.prototype.isTokenExpired = function () {
  if (!this.token_expires_at) {
    return true; // No expiration set, treat as expired
  }
  const bufferTime = new Date(Date.now() + IntegrationCredential.REFRESH_BUFFER_MS);
  return new Date(this.token_expires_at) <= bufferTime;
};

/**
 * Check if the refresh token is expired
 */
IntegrationCredential.prototype.isRefreshTokenExpired = function () {
  if (!this.refresh_token_expires_at) {
    return false; // No expiration set, assume valid
  }
  return new Date(this.refresh_token_expires_at) <= new Date();
};

/**
 * Check if credentials should be deactivated due to errors
 */
IntegrationCredential.prototype.shouldDeactivate = function () {
  return this.refresh_error_count >= IntegrationCredential.MAX_REFRESH_ERRORS;
};

/**
 * Record a successful refresh
 */
IntegrationCredential.prototype.recordRefreshSuccess = async function () {
  await this.update({
    refresh_error_count: 0,
    last_refresh_error: null,
    last_refreshed_at: new Date()
  });
};

/**
 * Record a failed refresh attempt
 * @param {string} errorMessage - Sanitized error message
 * @returns {boolean} True if credentials were deactivated
 */
IntegrationCredential.prototype.recordRefreshFailure = async function (errorMessage) {
  const newErrorCount = this.refresh_error_count + 1;
  const shouldDeactivate = newErrorCount >= IntegrationCredential.MAX_REFRESH_ERRORS;

  await this.update({
    refresh_error_count: newErrorCount,
    last_refresh_error: errorMessage,
    is_active: !shouldDeactivate
  });

  return shouldDeactivate;
};

module.exports = IntegrationCredential;
