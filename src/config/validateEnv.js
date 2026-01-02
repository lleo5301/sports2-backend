/**
 * Environment Variable Validation
 *
 * Centralized validation for all critical environment variables.
 * This module should be called at application startup to ensure
 * the environment is properly configured before proceeding.
 */

const { validateJwtSecret } = require('../utils/jwtSecretValidator');

/**
 * Validate all critical environment variables.
 *
 * @param {Object} options - Validation options
 * @param {Object} [options.env] - Environment variables object (defaults to process.env)
 * @param {string} [options.nodeEnv] - NODE_ENV value (defaults to env.NODE_ENV or 'development')
 * @returns {Object} - Validation result with { valid: boolean, errors: string[], warnings: string[] }
 */
function validateEnvironment(options = {}) {
  const env = options.env || process.env;
  const nodeEnv = options.nodeEnv || env.NODE_ENV || 'development';

  const errors = [];
  const warnings = [];

  // Validate JWT_SECRET
  const jwtResult = validateJwtSecret(env.JWT_SECRET, { nodeEnv });

  if (jwtResult.errors.length > 0) {
    errors.push(...jwtResult.errors);
  }

  if (jwtResult.warnings.length > 0) {
    warnings.push(...jwtResult.warnings);
  }

  // Future: Add validation for other critical environment variables here
  // Examples:
  // - DATABASE_URL or DB_* variables
  // - OAUTH_* secrets
  // - SMTP credentials
  // - API keys

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate environment and log results.
 * This is a convenience function for startup validation.
 *
 * @param {Object} options - Options passed to validateEnvironment
 * @returns {Object} - Validation result
 */
function validateAndLogEnvironment(options = {}) {
  const result = validateEnvironment(options);
  const { getSecretGenerationInstructions } = require('../utils/jwtSecretValidator');

  if (result.errors.length > 0) {
    process.stderr.write('\n\u274C ENVIRONMENT VALIDATION ERRORS\n');
    process.stderr.write('\u2550'.repeat(50) + '\n');
    result.errors.forEach(err => {
      process.stderr.write(`  \u2022 ${err}\n`);
    });
    process.stderr.write('\u2550'.repeat(50) + '\n');
    process.stderr.write('\n' + getSecretGenerationInstructions() + '\n\n');
  }

  if (result.warnings.length > 0) {
    process.stderr.write('\n\u26A0\uFE0F  ENVIRONMENT WARNINGS:\n');
    result.warnings.forEach(warn => {
      process.stderr.write(`  \u2022 ${warn}\n`);
    });
    process.stderr.write('\n');
  }

  return result;
}

module.exports = {
  validateEnvironment,
  validateAndLogEnvironment
};
