const { doubleCsrf } = require('csrf-csrf');

// Configuration for double-submit cookie CSRF protection
const csrfSecret = process.env.CSRF_SECRET || 'default-csrf-secret-please-change-in-production';

// Warn if using default secret in production
if (!process.env.CSRF_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  WARNING: Using default CSRF_SECRET in production. Please set CSRF_SECRET environment variable.');
}

// Cookie configuration
const cookieOptions = {
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true
};

// Initialize CSRF protection with double-submit cookie pattern
const {
  generateToken, // Used to create a CSRF token
  doubleCsrfProtection, // Middleware to validate CSRF token
  invalidCsrfTokenError, // Error type for invalid tokens
} = doubleCsrf({
  getSecret: () => csrfSecret,
  cookieName: '__Host-psifi.x-csrf-token', // Prefix __Host- for additional security
  cookieOptions,
  size: 64, // Token size in bytes
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Safe methods that don't need CSRF protection
  getTokenFromRequest: (req) => req.headers['x-csrf-token'], // Read token from header
});

// Custom error handler for CSRF token validation
const csrfErrorHandler = (err, req, res, next) => {
  if (err === invalidCsrfTokenError) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing CSRF token'
    });
  }
  next(err);
};

module.exports = {
  generateToken,
  doubleCsrfProtection,
  csrfErrorHandler,
  invalidCsrfTokenError
};
