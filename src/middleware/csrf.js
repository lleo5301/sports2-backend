const { doubleCsrf } = require('csrf-csrf');

// Configuration for double-submit cookie CSRF protection
const csrfSecret = process.env.CSRF_SECRET || 'default-csrf-secret-please-change-in-production';

// Warn if using default secret in production
if (!process.env.CSRF_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  WARNING: Using default CSRF_SECRET in production. Please set CSRF_SECRET environment variable.');
}

// Cookie configuration
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/',
  secure: isProduction,
  httpOnly: true
};

// Use __Host- prefix only in production (requires HTTPS)
// In development, use a regular cookie name for HTTP compatibility
const cookieName = isProduction ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token';

// Initialize CSRF protection with double-submit cookie pattern
const {
  generateToken, // Used to create a CSRF token
  doubleCsrfProtection, // Middleware to validate CSRF token
  invalidCsrfTokenError, // Error type for invalid tokens
} = doubleCsrf({
  getSecret: () => csrfSecret,
  cookieName,
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
