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
  expressValidatorCheck
};
