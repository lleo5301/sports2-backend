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
const tokenBlacklistService = require('../services/tokenBlacklistService');

/**
 * @description Authentication middleware that protects routes by verifying JWT tokens.
<<<<<<< HEAD
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
=======
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
>>>>>>> auto-claude/015-add-jsdoc-documentation-to-authentication-middlewa
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

<<<<<<< HEAD
  // Security: Reject request if no token found in either location
  if (!token) {
=======
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token is blacklisted
      if (decoded.jti) {
        // Convert iat (issued at) timestamp to Date object for blacklist check
        const tokenIssuedAt = decoded.iat ? new Date(decoded.iat * 1000) : null;
        const isBlacklisted = await tokenBlacklistService.isBlacklisted(
          decoded.jti,
          decoded.id,
          tokenIssuedAt
        );

        if (isBlacklisted) {
          return res.status(401).json({ success: false, error: 'Token has been revoked' });
        }
      }

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
>>>>>>> auto-claude/020-add-jwt-token-revocation-blacklist-capability
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

/**
 * @description Role-based access control (RBAC) middleware that restricts access to head coach users only.
 *              Verifies that the authenticated user has the 'head_coach' role before allowing access
 *              to the requested resource. This middleware must be chained after the protect middleware
 *              which attaches the authenticated user object to the request.
 *
 *              Authorization flow:
 *              1. Check if req.user exists (attached by protect middleware)
 *              2. Verify user.role equals 'head_coach'
 *              3. Call next() to continue if authorized, or return 403 if not
 *
 *              Security notes:
 *              - Always chain after protect middleware to ensure req.user is present
 *              - Returns 403 Forbidden (not 401 Unauthorized) since user is authenticated but lacks permissions
 *              - Generic error message prevents information disclosure about authorization logic
 *
 * @function isHeadCoach
 * @param {express.Request} req - Express request object with req.user attached by protect middleware
 * @param {express.Response} res - Express response object for sending error responses
 * @param {express.NextFunction} next - Express next middleware function
 *
 * @returns {void} Calls next() if user has head_coach role, or sends 403 JSON response if not authorized.
 *
 * @throws {403} Access denied. Head coach privileges required - User is authenticated but does not have head_coach role
 *
 * @example
 * // Typical usage: Chain with protect middleware for head-coach-only endpoints
 * const { protect, isHeadCoach } = require('../middleware/auth');
 * router.post('/api/teams/:teamId/settings', protect, isHeadCoach, updateTeamSettings);
 * router.delete('/api/teams/:teamId/players/:playerId', protect, isHeadCoach, deletePlayer);
 *
 * @example
 * // Triple middleware chain for team-specific head coach actions
 * const { protect, isHeadCoach, isSameTeam } = require('../middleware/auth');
 * router.put('/api/teams/:teamId/roster', protect, isHeadCoach, isSameTeam, updateRoster);
 */
const isHeadCoach = (req, res, next) => {
  if (req.user && req.user.role === 'head_coach') {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Head coach privileges required.' });
  }
};

/**
 * @description Team-based authorization middleware that verifies the authenticated user belongs
 *              to the team specified in the route parameter. Enforces multi-tenant data isolation
 *              by ensuring users can only access resources from their own team. This middleware
 *              must be chained after the protect middleware which attaches the authenticated user
 *              object to the request.
 *
 *              Authorization flow:
 *              1. Check if req.user exists (attached by protect middleware)
 *              2. Compare user.team_id with route parameter req.params.teamId
 *              3. Call next() to continue if user belongs to the team, or return 403 if not
 *
 *              Security notes:
 *              - Always chain after protect middleware to ensure req.user is present
 *              - Returns 403 Forbidden (not 401 Unauthorized) since user is authenticated but lacks team access
 *              - Prevents cross-team data access and enforces team-level data isolation
 *              - Typically used with isHeadCoach for team-specific administrative actions
 *
 * @function isSameTeam
 * @param {express.Request} req - Express request object with req.user (from protect) and req.params.teamId
 * @param {express.Response} res - Express response object for sending error responses
 * @param {express.NextFunction} next - Express next middleware function
 *
 * @returns {void} Calls next() if user belongs to the team, or sends 403 JSON response if not authorized.
 *
 * @throws {403} Access denied. Team membership required - User is authenticated but does not belong to the specified team
 *
 * @example
 * // Typical usage: Chain with protect middleware for team-specific endpoints
 * const { protect, isSameTeam } = require('../middleware/auth');
 * router.get('/api/teams/:teamId/players', protect, isSameTeam, getTeamPlayers);
 * router.get('/api/teams/:teamId/stats', protect, isSameTeam, getTeamStats);
 *
 * @example
 * // Triple middleware chain for team-specific head coach actions
 * const { protect, isHeadCoach, isSameTeam } = require('../middleware/auth');
 * router.put('/api/teams/:teamId/roster', protect, isHeadCoach, isSameTeam, updateRoster);
 * router.post('/api/teams/:teamId/plays', protect, isHeadCoach, isSameTeam, createPlay);
 */
const isSameTeam = (req, res, next) => {
  if (req.user && req.user.team_id === req.params.teamId) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Access denied. Team membership required.' });
  }
};

module.exports = { protect, isHeadCoach, isSameTeam };