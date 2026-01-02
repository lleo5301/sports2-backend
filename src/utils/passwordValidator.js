/**
 * Password Validator Utility
 *
 * Provides strong password validation functions based on NIST SP 800-63B recommendations.
 * Requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 */

// Password requirement constants
const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_REGEX = /[A-Z]/;
const LOWERCASE_REGEX = /[a-z]/;
const DIGIT_REGEX = /[0-9]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

/**
 * Check if password meets minimum length requirement
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const hasMinLength = (password) => {
  return password && password.length >= PASSWORD_MIN_LENGTH;
};

/**
 * Check if password contains at least one uppercase letter
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const hasUppercase = (password) => {
  return password && UPPERCASE_REGEX.test(password);
};

/**
 * Check if password contains at least one lowercase letter
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const hasLowercase = (password) => {
  return password && LOWERCASE_REGEX.test(password);
};

/**
 * Check if password contains at least one digit
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const hasDigit = (password) => {
  return password && DIGIT_REGEX.test(password);
};

/**
 * Check if password contains at least one special character
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const hasSpecialChar = (password) => {
  return password && SPECIAL_CHAR_REGEX.test(password);
};

/**
 * Get detailed validation results for each password requirement
 * @param {string} password - The password to validate
 * @returns {Object} Object containing validation result for each requirement
 */
const getPasswordRequirements = (password) => {
  return {
    minLength: {
      met: hasMinLength(password),
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
    },
    uppercase: {
      met: hasUppercase(password),
      message: 'Password must contain at least one uppercase letter'
    },
    lowercase: {
      met: hasLowercase(password),
      message: 'Password must contain at least one lowercase letter'
    },
    digit: {
      met: hasDigit(password),
      message: 'Password must contain at least one digit'
    },
    specialChar: {
      met: hasSpecialChar(password),
      message: 'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?`~)'
    }
  };
};

/**
 * Validate password and return detailed error messages for failed requirements
 * @param {string} password - The password to validate
 * @returns {Object} Object with isValid boolean and array of error messages
 */
const validatePassword = (password) => {
  const requirements = getPasswordRequirements(password);
  const errors = [];

  for (const [key, requirement] of Object.entries(requirements)) {
    if (!requirement.met) {
      errors.push(requirement.message);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check if password is valid (returns boolean only)
 * @param {string} password - The password to validate
 * @returns {boolean}
 */
const isPasswordValid = (password) => {
  return validatePassword(password).isValid;
};

/**
 * Custom validator function for express-validator
 * Can be used with .custom() in express-validator chains
 * @param {string} password - The password to validate
 * @throws {Error} Error with combined message if validation fails
 * @returns {boolean} true if password is valid
 */
const expressValidatorCheck = (password) => {
  const { isValid, errors } = validatePassword(password);

  if (!isValid) {
    throw new Error(errors.join('. '));
  }

  return true;
};

/**
 * Import express-validator body function for creating validators
 * Using lazy loading to avoid issues when module is used without express-validator
 */
let body;
try {
  body = require('express-validator').body;
} catch {
  body = null;
}

/**
 * Create an express-validator chain for password validation on a specific field
 * @param {string} fieldName - The name of the field to validate (default: 'password')
 * @returns {Object} Express-validator validation chain
 * @throws {Error} If express-validator is not installed
 *
 * @example
 * // In routes file:
 * const { createPasswordValidator } = require('../utils/passwordValidator');
 *
 * router.post('/register', [
 *   body('email').isEmail(),
 *   createPasswordValidator('password'),
 * ], handler);
 */
const createPasswordValidator = (fieldName = 'password') => {
  if (!body) {
    throw new Error('express-validator is required for createPasswordValidator');
  }

  return body(fieldName)
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .custom(expressValidatorCheck);
};

/**
 * Pre-built express-validator for 'password' field
 * Usage: router.post('/register', [passwordValidator, ...], handler)
 *
 * @example
 * const { passwordValidator } = require('../utils/passwordValidator');
 *
 * router.post('/register', [
 *   body('email').isEmail(),
 *   passwordValidator,
 * ], handler);
 */
const passwordValidator = body ? createPasswordValidator('password') : null;

/**
 * Pre-built express-validator for 'new_password' field (auth routes)
 * Usage: router.put('/change-password', [newPasswordValidator, ...], handler)
 *
 * @example
 * const { newPasswordValidator } = require('../utils/passwordValidator');
 *
 * router.put('/change-password', [
 *   body('current_password').exists(),
 *   newPasswordValidator,
 * ], handler);
 */
const newPasswordValidator = body ? createPasswordValidator('new_password') : null;

/**
 * Pre-built express-validator for 'newPassword' field (settings routes)
 * Usage: router.put('/settings/change-password', [newPasswordCamelValidator, ...], handler)
 *
 * @example
 * const { newPasswordCamelValidator } = require('../utils/passwordValidator');
 *
 * router.put('/settings/change-password', [
 *   body('currentPassword').exists(),
 *   newPasswordCamelValidator,
 * ], handler);
 */
const newPasswordCamelValidator = body ? createPasswordValidator('newPassword') : null;

module.exports = {
  // Constants
  PASSWORD_MIN_LENGTH,
  UPPERCASE_REGEX,
  LOWERCASE_REGEX,
  DIGIT_REGEX,
  SPECIAL_CHAR_REGEX,

  // Individual check functions
  hasMinLength,
  hasUppercase,
  hasLowercase,
  hasDigit,
  hasSpecialChar,

  // Main validation functions
  getPasswordRequirements,
  validatePassword,
  isPasswordValid,
  expressValidatorCheck,

  // Express-validator integration
  createPasswordValidator,
  passwordValidator,
  newPasswordValidator,
  newPasswordCamelValidator
};
