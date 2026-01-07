/**
 * Account Lockout Service
 *
 * Encapsulates business logic for account lockout functionality.
 * Handles checking lockout status, tracking failed attempts, locking accounts,
 * and generating appropriate error responses with lockout information.
 *
 * @module services/lockoutService
 */

const lockoutConfig = require('../config/lockout');

/**
 * Calculate remaining lockout time in minutes
 * @param {Date} lockedUntil - The locked_until timestamp
 * @returns {number} Minutes remaining (rounded up), or 0 if lock expired
 */
function calculateRemainingLockoutMinutes(lockedUntil) {
  if (!lockedUntil) {
    return 0;
  }

  const now = new Date();
  const lockEnd = new Date(lockedUntil);
  const remainingMs = lockEnd - now;

  if (remainingMs <= 0) {
    return 0;
  }

  // Round up to nearest minute for user-friendly display
  return Math.ceil(remainingMs / (1000 * 60));
}

/**
 * Check if an account is currently locked
 * @param {Object} user - User model instance
 * @returns {Object} Lockout status information
 * @returns {boolean} return.isLocked - Whether account is currently locked
 * @returns {number} return.remainingMinutes - Minutes remaining in lockout (0 if not locked)
 * @returns {Date|null} return.lockedUntil - When the lock expires (null if not locked)
 */
function checkAccountLockout(user) {
  // Handle edge case: null or undefined user
  if (!user) {
    return {
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null
    };
  }

  // Check if lockout functionality is disabled globally
  if (!lockoutConfig.LOCKOUT_ENABLED) {
    return {
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null
    };
  }

  // Use the User model's isLocked() instance method
  const isLocked = user.isLocked();

  if (!isLocked) {
    return {
      isLocked: false,
      remainingMinutes: 0,
      lockedUntil: null
    };
  }

  const remainingMinutes = calculateRemainingLockoutMinutes(user.locked_until);

  return {
    isLocked: true,
    remainingMinutes,
    lockedUntil: user.locked_until
  };
}

/**
 * Handle a failed login attempt
 * Increments the failed attempts counter and locks the account if threshold is reached
 * @param {Object} user - User model instance
 * @param {string} [ipAddress] - Optional IP address for security logging
 * @returns {Promise<Object>} Updated lockout status
 * @returns {boolean} return.accountLocked - Whether account was locked during this call
 * @returns {number} return.failedAttempts - Current count of failed attempts
 * @returns {number} return.attemptsRemaining - Attempts remaining before lockout
 * @returns {Date|null} return.lockedUntil - When lock expires (null if not locked)
 */
async function handleFailedLogin(user, ipAddress = 'unknown') {
  // Handle edge case: null or undefined user
  if (!user) {
    throw new Error('User object is required for handleFailedLogin');
  }

  // If lockout is disabled, just return status without modifying user
  if (!lockoutConfig.LOCKOUT_ENABLED) {
    return {
      accountLocked: false,
      failedAttempts: user.failed_login_attempts || 0,
      attemptsRemaining: lockoutConfig.MAX_FAILED_ATTEMPTS,
      lockedUntil: null
    };
  }

  // Increment failed login attempts
  await user.incrementFailedAttempts();

  const failedAttempts = user.failed_login_attempts;
  const maxAttempts = lockoutConfig.MAX_FAILED_ATTEMPTS;

  // Check if threshold reached and lock account
  if (failedAttempts >= maxAttempts) {
    await user.lockAccount(lockoutConfig.LOCKOUT_DURATION_MINUTES);

    // Security: Log account lockout event for monitoring and incident response
    console.error('SECURITY: Account locked due to failed login attempts', {
      email: user.email,
      userId: user.id,
      failedAttempts,
      lockedUntil: user.locked_until,
      ipAddress,
      timestamp: new Date().toISOString()
    });

    return {
      accountLocked: true,
      failedAttempts,
      attemptsRemaining: 0,
      lockedUntil: user.locked_until
    };
  }

  // Return status without locking
  return {
    accountLocked: false,
    failedAttempts,
    attemptsRemaining: maxAttempts - failedAttempts,
    lockedUntil: null
  };
}

/**
 * Handle a successful login
 * Resets failed attempts counter if configured to do so
 * @param {Object} user - User model instance
 * @param {string} [ipAddress] - Optional IP address for security logging
 * @returns {Promise<void>}
 */
async function handleSuccessfulLogin(user, ipAddress = 'unknown') {
  // Handle edge case: null or undefined user
  if (!user) {
    throw new Error('User object is required for handleSuccessfulLogin');
  }

  // If lockout is disabled or reset is disabled, do nothing
  if (!lockoutConfig.LOCKOUT_ENABLED || !lockoutConfig.RESET_FAILED_ATTEMPTS_ON_SUCCESS) {
    return;
  }

  // Only reset if there are failed attempts to reset
  // This avoids unnecessary database writes
  if (user.failed_login_attempts > 0 || user.locked_until) {
    const hadFailedAttempts = user.failed_login_attempts;
    const wasLocked = user.locked_until !== null;

    await user.resetFailedAttempts();

    // Security: Log successful login after failed attempts for monitoring
    // This helps detect successful brute force attacks or compromised accounts
    if (hadFailedAttempts > 0) {
      console.error('SECURITY: Successful login after failed attempts', {
        email: user.email,
        userId: user.id,
        previousFailedAttempts: hadFailedAttempts,
        wasLocked,
        ipAddress,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Generate an appropriate error response for a locked account
 * @param {Object} lockoutStatus - Result from checkAccountLockout()
 * @returns {Object} Error response object
 * @returns {number} return.statusCode - HTTP status code (423 Locked)
 * @returns {Object} return.body - Response body
 */
function generateLockedAccountResponse(lockoutStatus) {
  const { remainingMinutes } = lockoutStatus;

  return {
    statusCode: 423, // HTTP 423 Locked (RFC 4918)
    body: {
      success: false,
      error: 'Account is temporarily locked due to too many failed login attempts',
      locked: true,
      remainingMinutes,
      message: `Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
    }
  };
}

module.exports = {
  checkAccountLockout,
  handleFailedLogin,
  handleSuccessfulLogin,
  generateLockedAccountResponse,
  // Export for testing purposes
  calculateRemainingLockoutMinutes
};
