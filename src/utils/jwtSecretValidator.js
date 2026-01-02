/**
 * JWT Secret Validator
 *
 * Validates JWT secret strength to prevent weak secrets in production.
 * Checks for minimum length, placeholder patterns, and basic entropy.
 */

// Minimum recommended secret length (32 bytes = 256 bits)
const MIN_SECRET_LENGTH = 32;

// Common placeholder patterns that indicate an insecure secret
const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /[_-]here$/i,
  /^change[_-]?this/i,
  /^replace[_-]?me/i,
  /^secret$/i,
  /^password$/i,
  /^test[_-]?secret/i,
  /^dev[_-]?secret/i,
  /^example/i,
  /^placeholder/i,
  /^default/i,
  /^sample/i,
  /super[_-]?secret/i,
  /jwt[_-]?secret[_-]?key/i,
  /your.*secret.*key/i,
  /change.*before.*production/i,
];

// Known weak/placeholder values to block explicitly
const BLOCKED_VALUES = [
  'your_super_secret_jwt_key_here',
  'secret',
  'password',
  'jwt_secret',
  'change_me',
  'replace_me',
  'your_secret_key',
  'my_secret_key',
  'development_secret',
  'test_secret',
  'supersecret',
  'mysecretkey',
];

/**
 * Calculate a simple entropy score for a string.
 * Higher scores indicate more randomness/complexity.
 *
 * @param {string} str - The string to analyze
 * @returns {number} - Entropy score (0-1 range, normalized)
 */
function calculateEntropyScore(str) {
  if (!str || str.length === 0) return 0;

  // Count character frequency
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  // Calculate Shannon entropy
  let entropy = 0;
  const len = str.length;
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }

  // Normalize to 0-1 range based on max possible entropy for the string length
  // Max entropy occurs when all characters are unique
  const maxEntropy = Math.log2(Math.min(len, 256));
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Check if the secret contains only repetitive or simple patterns.
 *
 * @param {string} secret - The secret to check
 * @returns {boolean} - True if the secret appears to be repetitive
 */
function isRepetitivePattern(secret) {
  if (!secret || secret.length < 4) return true;

  // Check for single character repetition (e.g., "aaaaaaaaaaaaaaaa")
  if (new Set(secret).size === 1) return true;

  // Check for simple alternating pattern (e.g., "abababababababab")
  if (new Set(secret).size === 2 && secret.length > 8) {
    const pattern = secret.slice(0, 2);
    if (secret === pattern.repeat(secret.length / 2)) return true;
  }

  // Check for sequential patterns (e.g., "12345678901234567890")
  const sequential = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (sequential.includes(secret) || sequential.toLowerCase().includes(secret.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * Validate a JWT secret for security strength.
 *
 * @param {string} secret - The JWT secret to validate
 * @param {Object} options - Validation options
 * @param {string} [options.nodeEnv] - The NODE_ENV value (defaults to process.env.NODE_ENV)
 * @returns {Object} - Validation result with { valid: boolean, errors: string[], warnings: string[] }
 */
function validateJwtSecret(secret, options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
  const isStrictMode = ['production', 'staging'].includes(nodeEnv);

  const errors = [];
  const warnings = [];

  // Check if secret is provided
  if (!secret) {
    errors.push('JWT_SECRET is not defined');
    return { valid: false, errors, warnings };
  }

  if (typeof secret !== 'string') {
    errors.push('JWT_SECRET must be a string');
    return { valid: false, errors, warnings };
  }

  // Trim whitespace for validation (but warn if there was whitespace)
  const trimmedSecret = secret.trim();
  if (trimmedSecret !== secret) {
    warnings.push('JWT_SECRET contains leading or trailing whitespace');
  }

  // Check against blocked values (case-insensitive)
  const lowerSecret = trimmedSecret.toLowerCase();
  if (BLOCKED_VALUES.some(blocked => lowerSecret === blocked.toLowerCase())) {
    errors.push(`JWT_SECRET is a known weak/placeholder value`);
  }

  // Check against placeholder patterns
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmedSecret)) {
      errors.push(`JWT_SECRET matches placeholder pattern: ${pattern}`);
      break; // Only report one pattern match
    }
  }

  // Check minimum length
  if (trimmedSecret.length < MIN_SECRET_LENGTH) {
    const msg = `JWT_SECRET is too short (${trimmedSecret.length} chars). Minimum recommended: ${MIN_SECRET_LENGTH} characters (256 bits)`;
    if (isStrictMode) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  // Check for repetitive patterns
  if (isRepetitivePattern(trimmedSecret)) {
    const msg = 'JWT_SECRET appears to be a repetitive or sequential pattern';
    if (isStrictMode) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  // Check entropy (complexity)
  const entropyScore = calculateEntropyScore(trimmedSecret);
  const minEntropyScore = 0.5; // Require at least 50% of maximum possible entropy

  if (entropyScore < minEntropyScore && trimmedSecret.length >= MIN_SECRET_LENGTH) {
    const msg = `JWT_SECRET has low entropy (complexity). Consider using a randomly generated secret`;
    if (isStrictMode) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  // In strict mode, any error makes it invalid
  // In development, we're more lenient but still flag placeholder values
  const hasBlockingErrors = errors.length > 0;

  return {
    valid: !hasBlockingErrors,
    errors,
    warnings
  };
}

/**
 * Check if a secret meets minimum security requirements.
 * This is a simpler function for quick checks.
 *
 * @param {string} secret - The secret to check
 * @returns {boolean} - True if the secret is strong enough
 */
function isSecureSecret(secret) {
  const result = validateJwtSecret(secret, { nodeEnv: 'production' });
  return result.valid;
}

/**
 * Get a human-readable recommendation for fixing weak secrets.
 *
 * @returns {string} - Instructions for generating a secure secret
 */
function getSecretGenerationInstructions() {
  return `
To generate a secure JWT secret, run:
  npm run generate:jwt-secret

Or use the following command directly:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

The generated secret should be:
- At least 32 characters (256 bits)
- Randomly generated using cryptographic functions
- Unique per environment (development, staging, production)
- Never committed to version control
`.trim();
}

module.exports = {
  validateJwtSecret,
  isSecureSecret,
  getSecretGenerationInstructions,
  MIN_SECRET_LENGTH,
  // Export for testing
  calculateEntropyScore,
  isRepetitivePattern,
  PLACEHOLDER_PATTERNS,
  BLOCKED_VALUES,
};
