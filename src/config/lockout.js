require('dotenv').config();

/**
 * Account Lockout Configuration
 *
 * Centralized configuration for account lockout functionality.
 * These settings control how the system responds to repeated failed login attempts.
 *
 * Environment Variables:
 * - ACCOUNT_LOCKOUT_ENABLED: Enable/disable account lockout (default: true)
 * - ACCOUNT_LOCKOUT_MAX_ATTEMPTS: Maximum failed attempts before lockout (default: 5)
 * - ACCOUNT_LOCKOUT_DURATION_MINUTES: Duration of lockout in minutes (default: 15)
 * - ACCOUNT_LOCKOUT_RESET_ON_SUCCESS: Reset failed attempts counter on successful login (default: true)
 */

/**
 * Parse and validate a boolean environment variable
 * @param {string} value - The environment variable value
 * @param {boolean} defaultValue - Default value if not set or invalid
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const normalized = value.toLowerCase().trim();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

/**
 * Parse and validate a positive integer environment variable
 * @param {string} value - The environment variable value
 * @param {number} defaultValue - Default value if not set or invalid
 * @param {string} name - Variable name for error messages
 * @returns {number}
 */
function parsePositiveInteger(value, defaultValue, name) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    process.stderr.write(`⚠️  ${name} must be a positive integer, using default: ${defaultValue}\n`);
    return defaultValue;
  }
  return parsed;
}

// Parse and validate configuration values
const LOCKOUT_ENABLED = parseBoolean(process.env.ACCOUNT_LOCKOUT_ENABLED, true);
const MAX_FAILED_ATTEMPTS = parsePositiveInteger(
  process.env.ACCOUNT_LOCKOUT_MAX_ATTEMPTS,
  5,
  'ACCOUNT_LOCKOUT_MAX_ATTEMPTS'
);
const LOCKOUT_DURATION_MINUTES = parsePositiveInteger(
  process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES,
  15,
  'ACCOUNT_LOCKOUT_DURATION_MINUTES'
);
const RESET_FAILED_ATTEMPTS_ON_SUCCESS = parseBoolean(
  process.env.ACCOUNT_LOCKOUT_RESET_ON_SUCCESS,
  true
);

module.exports = {
  /**
   * Whether account lockout functionality is enabled
   * @type {boolean}
   */
  LOCKOUT_ENABLED,

  /**
   * Maximum number of failed login attempts before account is locked
   * @type {number}
   */
  MAX_FAILED_ATTEMPTS,

  /**
   * Duration of account lockout in minutes
   * @type {number}
   */
  LOCKOUT_DURATION_MINUTES,

  /**
   * Whether to reset failed attempts counter on successful login
   * @type {boolean}
   */
  RESET_FAILED_ATTEMPTS_ON_SUCCESS
};
