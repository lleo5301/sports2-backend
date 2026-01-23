/**
 * Secure Logger Utility
 *
 * Provides secure logging functionality that automatically sanitizes sensitive data
 * before output. Prevents exposure of PII, credentials, and other sensitive information
 * in production logs.
 *
 * Features:
 * - Automatic sanitization of sensitive fields (email, password, tokens, user IDs, etc.)
 * - Environment-aware behavior (verbose in development, restricted in production)
 * - Stack trace removal in production mode
 * - Multiple log levels: debug, info, warn, error
 * - Deep object sanitization with circular reference handling
 *
 * Usage:
 * const logger = require('./utils/logger');
 * logger.info('User logged in', { userId: 123 }); // userId will be masked
 * logger.error('Authentication failed', { email: 'user@example.com' }); // Email will be redacted
 */

/**
 * List of field names and patterns that should be sanitized in logs.
 * These patterns match common sensitive data fields across the application.
 */
const SENSITIVE_FIELDS = [
  // Authentication & Authorization
  'password',
  'password_hash',
  'passwordHash',
  'newPassword',
  'new_password',
  'currentPassword',
  'current_password',
  'oldPassword',
  'old_password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'jwt',
  'bearer',
  'authorization',
  'auth',
  'api_key',
  'apiKey',
  'api_secret',
  'apiSecret',
  'secret',
  'secretKey',
  'secret_key',
  'private_key',
  'privateKey',

  // Personal Identifiable Information
  'email',
  'email_address',
  'emailAddress',
  'ssn',
  'social_security',
  'phone',
  'phone_number',
  'phoneNumber',
  'mobile',
  'credit_card',
  'creditCard',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',

  // Internal IDs (configurable - may want to mask in production)
  'user_id',
  'userId',
  'team_id',
  'teamId',

  // Database & Infrastructure
  'database_url',
  'databaseUrl',
  'db_password',
  'dbPassword',
  'connection_string',
  'connectionString',
  'credential',
  'credentials',

  // Stack traces and error details
  'stack',
  'stackTrace',
  'stack_trace'
];

/**
 * Replacement text for different types of sensitive data
 */
const REDACTION_LABELS = {
  email: '[REDACTED_EMAIL]',
  password: '[REDACTED_PASSWORD]',
  token: '[REDACTED_TOKEN]',
  secret: '[REDACTED_SECRET]',
  key: '[REDACTED_KEY]',
  id: '[REDACTED_ID]',
  phone: '[REDACTED_PHONE]',
  ssn: '[REDACTED_SSN]',
  card: '[REDACTED_CARD]',
  credential: '[REDACTED_CREDENTIAL]',
  stack: '[REDACTED_STACK]',
  default: '[REDACTED]'
};

/**
 * Get appropriate redaction label for a field name
 * @param {string} fieldName - Name of the field being redacted
 * @returns {string} Appropriate redaction label
 */
const getRedactionLabel = (fieldName) => {
  const lowerField = fieldName.toLowerCase();

  if (lowerField.includes('email')) {
    return REDACTION_LABELS.email;
  }
  if (lowerField.includes('password')) {
    return REDACTION_LABELS.password;
  }
  if (lowerField.includes('token') || lowerField.includes('jwt') || lowerField.includes('bearer')) {
    return REDACTION_LABELS.token;
  }
  if (lowerField.includes('secret')) {
    return REDACTION_LABELS.secret;
  }
  if (lowerField.includes('key')) {
    return REDACTION_LABELS.key;
  }
  if (lowerField.includes('id') && (lowerField.includes('user') || lowerField.includes('team'))) {
    return REDACTION_LABELS.id;
  }
  if (lowerField.includes('phone') || lowerField.includes('mobile')) {
    return REDACTION_LABELS.phone;
  }
  if (lowerField.includes('ssn') || lowerField.includes('social')) {
    return REDACTION_LABELS.ssn;
  }
  if (lowerField.includes('card') || lowerField.includes('cvv') || lowerField.includes('cvc')) {
    return REDACTION_LABELS.card;
  }
  if (lowerField.includes('credential') || lowerField.includes('auth')) {
    return REDACTION_LABELS.credential;
  }
  if (lowerField.includes('stack')) {
    return REDACTION_LABELS.stack;
  }

  return REDACTION_LABELS.default;
};

/**
 * Check if a field name is sensitive and should be redacted
 * @param {string} fieldName - Name of the field to check
 * @returns {boolean} True if field is sensitive
 */
const isSensitiveField = (fieldName) => {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }

  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some(sensitiveField =>
    lowerField === sensitiveField.toLowerCase() ||
    lowerField.includes(sensitiveField.toLowerCase())
  );
};

/**
 * Sanitize a single value by redacting sensitive information
 * @param {*} value - Value to sanitize
 * @param {string} fieldName - Name of the field (for context-aware redaction)
 * @returns {*} Sanitized value
 */
const sanitizeValue = (value, fieldName = '') => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Don't sanitize empty strings
    if (value.trim() === '') {
      return value;
    }

    // If this is a sensitive field, redact it
    if (isSensitiveField(fieldName)) {
      return getRedactionLabel(fieldName);
    }

    // Sanitize email patterns in string content (even if not in field name)
    if (/@.*\.(com|org|net|edu|gov|io|co)/.test(value)) {
      return REDACTION_LABELS.email;
    }

    // Sanitize potential JWT tokens (pattern: xxx.yyy.zzz)
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value) && value.length > 50) {
      return REDACTION_LABELS.token;
    }

    return value;
  }

  // Handle numbers (be careful not to redact legitimate numeric data)
  if (typeof value === 'number') {
    // Only redact IDs if specifically marked as sensitive
    if (isSensitiveField(fieldName)) {
      return getRedactionLabel(fieldName);
    }
    return value;
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle dates
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${fieldName}[${index}]`));
  }

  // Handle objects (including nested objects)
  if (typeof value === 'object') {
    return sanitizeObject(value, fieldName);
  }

  // For functions, symbols, and other types, convert to string
  return String(value);
};

/**
 * Sanitize an object by recursively redacting sensitive fields
 * Handles circular references to prevent infinite loops
 * @param {Object} obj - Object to sanitize
 * @param {string} parentKey - Parent key for nested objects
 * @param {WeakSet} seen - Set of objects already processed (for circular reference detection)
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj, parentKey = '', seen = new WeakSet()) => {
  // Handle null
  if (obj === null) {
    return null;
  }

  // Handle non-objects
  if (typeof obj !== 'object') {
    return sanitizeValue(obj, parentKey);
  }

  // Handle circular references
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => sanitizeValue(item, `${parentKey}[${index}]`));
  }

  // Handle Error objects specially
  if (obj instanceof Error) {
    return sanitizeError(obj);
  }

  // Handle regular objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check if this key is sensitive
    if (isSensitiveField(key)) {
      sanitized[key] = getRedactionLabel(key);
    } else {
      // Recursively sanitize nested values
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      sanitized[key] = sanitizeValue(value, fullKey);
    }
  }

  return sanitized;
};

/**
 * Sanitize Error objects
 * In production, remove stack traces. In development, keep them for debugging.
 * @param {Error} error - Error object to sanitize
 * @returns {Object} Sanitized error representation
 */
const sanitizeError = (error) => {
  const isProduction = process.env.NODE_ENV === 'production';

  const sanitized = {
    name: error.name,
    message: error.message
  };

  // Only include stack traces in development
  if (!isProduction && error.stack) {
    // Even in development, truncate very long stack traces
    sanitized.stack = error.stack.length > 2000
      ? error.stack.substring(0, 2000) + '... [truncated]'
      : error.stack;
  }

  // Include any custom error properties (but sanitize them)
  for (const [key, value] of Object.entries(error)) {
    if (key !== 'name' && key !== 'message' && key !== 'stack') {
      sanitized[key] = sanitizeValue(value, key);
    }
  }

  return sanitized;
};

/**
 * Format log arguments for output
 * @param {Array} args - Arguments passed to log function
 * @returns {string} Formatted log message
 */
const formatLogMessage = (...args) => {
  return args.map(arg => {
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg instanceof Error) {
      return JSON.stringify(sanitizeError(arg), null, 2);
    }
    if (typeof arg === 'object') {
      return JSON.stringify(sanitizeObject(arg), null, 2);
    }
    return String(arg);
  }).join(' ');
};

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO timestamp
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Log level configuration
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Current log level based on environment
 * Production: info and above
 * Development: debug and above
 */
const currentLogLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] || LOG_LEVELS.info
  : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug);

/**
 * Check if a log level should be output
 * @param {string} level - Log level to check
 * @returns {boolean} True if should log
 */
const shouldLog = (level) => {
  return LOG_LEVELS[level] >= currentLogLevel;
};

/**
 * Internal logging function
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {Array} args - Arguments to log
 */
const log = (level, ...args) => {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = getTimestamp();
  const sanitizedMessage = formatLogMessage(...args);
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  // Use appropriate console method
  switch (level) {
    case 'error':
      console.error(prefix, sanitizedMessage);
      break;
    case 'warn':
      console.warn(prefix, sanitizedMessage);
      break;
    case 'debug':
    case 'info':
    default:
      console.log(prefix, sanitizedMessage);
      break;
  }
};

/**
 * Logger instance with public methods
 */
const logger = {
  /**
   * Log debug message (only in development or when LOG_LEVEL=debug)
   * @param {...*} args - Arguments to log
   */
  debug(...args) {
    log('debug', ...args);
  },

  /**
   * Log informational message
   * @param {...*} args - Arguments to log
   */
  info(...args) {
    log('info', ...args);
  },

  /**
   * Log warning message
   * @param {...*} args - Arguments to log
   */
  warn(...args) {
    log('warn', ...args);
  },

  /**
   * Log error message
   * @param {...*} args - Arguments to log
   */
  error(...args) {
    log('error', ...args);
  },

  /**
   * Manually sanitize data without logging
   * Useful for preparing data before passing to other systems
   * @param {*} data - Data to sanitize
   * @returns {*} Sanitized data
   */
  sanitize(data) {
    if (typeof data === 'object' && data !== null) {
      return sanitizeObject(data);
    }
    return sanitizeValue(data);
  }
};

module.exports = logger;
