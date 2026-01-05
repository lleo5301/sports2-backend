/**
 * @fileoverview Authentication and authorization middleware for protecting routes
 * and enforcing access control. This module provides JWT token validation,
 * role-based access control (RBAC), and team-based authorization middleware
 * used throughout the application to secure protected endpoints.
 *
 * Security features:
 * - JWT token verification with Bearer scheme
 * - User authentication state attachment to request object
 * - Role-based access control for head coach privileges
 * - Team-based authorization for multi-tenant data isolation
 * - Secure error handling that doesn't expose system internals
 *
 * @module middleware/auth
 * @requires jsonwebtoken
 * @requires ../models
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * @description Authentication middleware that protects routes by verifying JWT tokens.
 *              Validates the Bearer token from the Authorization header, decodes the user ID,
 *              attaches the authenticated user object to the request, and passes control to
 *              the next middleware. This is the primary authentication gate for all protected
 *              routes in the application.
 *
 *              Security features:
 *              - Validates JWT token signature and expiration
 *              - Ensures user still exists in database (handles deleted users)
 *              - Excludes password from attached user object
 *              - Uses secure Bearer token scheme
 *              - Provides specific error messages for debugging while maintaining security
 *
 *              Token flow:
 *              1. Extract token from "Authorization: Bearer <token>" header
 *              2. Verify token signature using JWT_SECRET environment variable
 *              3. Decode user ID from token payload
 *              4. Fetch user from database (excluding password)
 *              5. Attach user object to req.user for downstream middleware/routes
 *              6. Call next() to continue request processing
 *
 * @async
 * @function protect
 * @param {express.Request} req - Express request object with Authorization header
 * @param {express.Response} res - Express response object for sending error responses
 * @param {express.NextFunction} next - Express next middleware function
 *
 * @returns {void} Calls next() on successful authentication, or sends 401 JSON response on failure.
 *                 On success, attaches req.user with authenticated user object (password excluded).
 *
 * @throws {401} Not authorized, no token - No Authorization header or doesn't start with "Bearer"
 * @throws {401} Not authorized - Token signature invalid, token expired, or JWT verification failed
 * @throws {401} User not found - Token is valid but user no longer exists in database
 *
 * @example
 * // Usage in route definition - protect ensures only authenticated users can access
 * const { protect } = require('../middleware/auth');
 * router.get('/api/auth/me', protect, async (req, res) => {
 *   // req.user is available here with authenticated user data
 *   res.json({ success: true, data: req.user });
 * });
 *
 * @example
 * // Chaining with other middleware for role-based access control
 * const { protect, isHeadCoach } = require('../middleware/auth');
 * router.post('/api/teams/:teamId/settings', protect, isHeadCoach, updateTeamSettings);
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });

      if (!req.user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }
  } else {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
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
