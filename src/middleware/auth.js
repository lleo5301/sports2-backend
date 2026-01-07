const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * @description Authentication middleware that protects routes by verifying JWT tokens.
 *              Supports both httpOnly cookie-based authentication (preferred for web clients)
 *              and Authorization header authentication (for mobile apps and backward compatibility).
 *
 *              Token retrieval order:
 *              1. Check for JWT token in httpOnly cookie (preferred, XSS-resistant)
 *              2. Fall back to Authorization header with Bearer token (mobile/legacy support)
 *
 *              Security features:
 *              - JWT signature verification using secret key
 *              - User account validation against database
 *              - Password field automatically excluded from user object
 *              - Supports migration from localStorage to httpOnly cookies
 *
 * @param {Object} req - Express request object with cookies and headers
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 *
 * @throws {401} Not authorized, no token - No JWT found in cookie or header
 * @throws {401} Not authorized - Invalid/expired JWT or verification failure
 * @throws {401} User not found - JWT valid but user no longer exists in database
 */
const protect = async (req, res, next) => {
  let token;

  // Security: Check for JWT in httpOnly cookie first (preferred method)
  // HttpOnly cookies are not accessible to JavaScript, providing XSS protection
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // Security: Fall back to Authorization header for backward compatibility
  // This supports mobile apps and existing clients during migration period
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Security: Reject request if no token found in either location
  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }

  try {
    // Security: Verify token signature and expiration using JWT_SECRET
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Database: Fetch user by ID from token payload
    // Security: Exclude password from user object for safety
    req.user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    // Security: Reject if user no longer exists (account deleted/disabled)
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Success: Attach user to request and proceed to next middleware
    next();
  } catch (error) {
    // Error: Token invalid, expired, or malformed
    console.error('Token verification error:', error);
    return res.status(401).json({ success: false, error: 'Not authorized' });
  }
};

// Middleware to check if user is head coach
const isHeadCoach = (req, res, next) => {
  if (req.user && req.user.role === 'head_coach') {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Head coach privileges required.' });
  }
};

// Middleware to check if user belongs to the same team
const isSameTeam = (req, res, next) => {
  if (req.user && req.user.team_id === req.params.teamId) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Team membership required.' });
  }
};

module.exports = { protect, isHeadCoach, isSameTeam };