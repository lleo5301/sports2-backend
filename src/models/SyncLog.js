const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SyncLog = sequelize.define('SyncLog', {
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
  sync_type: {
    type: DataTypes.ENUM(
      'roster', 'schedule', 'stats', 'team_record', 'season_stats', 'career_stats', 'full',
      'player_details', 'player_photos', 'press_releases', 'historical_stats', 'historical_season_stats',
      'player_videos', 'live_stats'
    ),
    allowNull: false
  },
  source_system: {
    type: DataTypes.ENUM('presto', 'manual', 'other'),
    allowNull: false,
    defaultValue: 'presto'
  },
  api_endpoint: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Sanitized API endpoint called (tokens redacted)'
  },
  status: {
    type: DataTypes.ENUM('started', 'completed', 'partial', 'failed'),
    allowNull: false,
    defaultValue: 'started'
  },
  initiated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  request_params: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  items_created: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  items_updated: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  items_skipped: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  items_failed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  response_summary: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  item_errors: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'sync_logs',
  timestamps: true,
  indexes: [
    { fields: ['team_id'] },
    { fields: ['sync_type'] },
    { fields: ['status'] },
    { fields: ['started_at'] },
    { fields: ['team_id', 'sync_type', 'started_at'] }
  ]
});

// ============================================
// Static Helper Methods
// ============================================

/**
 * Sanitize URL to remove sensitive tokens/credentials
 */
SyncLog.sanitizeEndpoint = function (url) {
  if (!url) {
    return null;
  }

  // Remove common auth patterns from URLs
  return url
    .replace(/token=[^&]+/gi, 'token=***REDACTED***')
    .replace(/key=[^&]+/gi, 'key=***REDACTED***')
    .replace(/auth=[^&]+/gi, 'auth=***REDACTED***')
    .replace(/password=[^&]+/gi, 'password=***REDACTED***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***REDACTED***')
    .replace(/idToken=[^&]+/gi, 'idToken=***REDACTED***');
};

/**
 * Sanitize error message to remove sensitive data
 */
SyncLog.sanitizeError = function (error) {
  if (!error) {
    return null;
  }

  const message = error.message || String(error);

  return message
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '***JWT_REDACTED***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***REDACTED***')
    .replace(/password['":\s]+[^\s,}]+/gi, 'password: ***REDACTED***')
    .replace(/token['":\s]+[^\s,}]+/gi, 'token: ***REDACTED***')
    .replace(/authorization['":\s]+[^\s,}]+/gi, 'authorization: ***REDACTED***');
};

/**
 * Sanitize request params to remove sensitive data
 */
SyncLog.sanitizeParams = function (params) {
  if (!params) {
    return null;
  }

  const sanitized = { ...params };

  // Remove known sensitive fields
  const sensitiveKeys = ['password', 'token', 'idToken', 'accessToken', 'refreshToken', 'credentials', 'auth', 'secret'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    }
  }

  return sanitized;
};

/**
 * Start a new sync log entry
 * @param {number} teamId - Team ID
 * @param {string} syncType - Type of sync operation
 * @param {number|null} userId - User who initiated (null for automated)
 * @param {string|null} endpoint - API endpoint being called
 * @param {object|null} params - Request parameters (will be sanitized)
 * @returns {Promise<SyncLog>} The created log entry
 */
SyncLog.logStart = async function (teamId, syncType, userId = null, endpoint = null, params = null) {
  return SyncLog.create({
    team_id: teamId,
    sync_type: syncType,
    source_system: 'presto',
    api_endpoint: SyncLog.sanitizeEndpoint(endpoint),
    status: 'started',
    initiated_by: userId,
    started_at: new Date(),
    request_params: SyncLog.sanitizeParams(params)
  });
};

/**
 * Mark a sync as completed with results
 * @param {number} logId - Sync log ID
 * @param {object} results - Sync results { created, updated, skipped, failed, summary }
 * @returns {Promise<SyncLog>} The updated log entry
 */
SyncLog.logComplete = async function (logId, results = {}) {
  const log = await SyncLog.findByPk(logId);
  if (!log) {
    throw new Error(`SyncLog ${logId} not found`);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - new Date(log.started_at).getTime();

  // Determine status based on failures
  let status = 'completed';
  if (results.failed > 0 && (results.created > 0 || results.updated > 0)) {
    status = 'partial';
  } else if (results.failed > 0 && results.created === 0 && results.updated === 0) {
    status = 'failed';
  }

  await log.update({
    status,
    completed_at: completedAt,
    duration_ms: durationMs,
    items_created: results.created || 0,
    items_updated: results.updated || 0,
    items_skipped: results.skipped || 0,
    items_failed: results.failed || 0,
    response_summary: results.summary || null,
    item_errors: results.itemErrors || null
  });

  return log;
};

/**
 * Mark a sync as failed with error details
 * @param {number} logId - Sync log ID
 * @param {Error|string} error - The error that occurred
 * @param {Array|null} itemErrors - Individual item failures
 * @returns {Promise<SyncLog>} The updated log entry
 */
SyncLog.logFailure = async function (logId, error, itemErrors = null) {
  const log = await SyncLog.findByPk(logId);
  if (!log) {
    throw new Error(`SyncLog ${logId} not found`);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - new Date(log.started_at).getTime();

  await log.update({
    status: 'failed',
    completed_at: completedAt,
    duration_ms: durationMs,
    error_message: SyncLog.sanitizeError(error),
    item_errors: itemErrors ? itemErrors.map(e => ({
      ...e,
      error: SyncLog.sanitizeError(e.error)
    })) : null
  });

  return log;
};

/**
 * Get the last successful sync of a specific type for a team
 * @param {number} teamId - Team ID
 * @param {string} syncType - Type of sync
 * @returns {Promise<SyncLog|null>}
 */
SyncLog.getLastSuccessfulSync = async function (teamId, syncType) {
  return SyncLog.findOne({
    where: {
      team_id: teamId,
      sync_type: syncType,
      status: ['completed', 'partial']
    },
    order: [['completed_at', 'DESC']]
  });
};

/**
 * Get sync history for a team
 * @param {number} teamId - Team ID
 * @param {object} options - Query options { limit, offset, syncType, status }
 * @returns {Promise<{ rows: SyncLog[], count: number }>}
 */
SyncLog.getSyncHistory = async function (teamId, options = {}) {
  const where = { team_id: teamId };

  if (options.syncType) {
    where.sync_type = options.syncType;
  }
  if (options.status) {
    where.status = options.status;
  }

  return SyncLog.findAndCountAll({
    where,
    order: [['started_at', 'DESC']],
    limit: options.limit || 50,
    offset: options.offset || 0
  });
};

module.exports = SyncLog;
