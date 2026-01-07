/**
 * @fileoverview Authentication routes for user registration, login, profile management,
 * and OAuth integration. This module handles all authentication-related functionality
 * including JWT token generation, password management, and social authentication flows.
 *
 * Security features:
 * - Password hashing via bcrypt (handled in User model hooks)
 * - JWT tokens for stateless authentication with configurable expiration
 * - OAuth support for Google and Apple sign-in
 * - Input validation and sanitization via express-validator
 * - CSRF protection via double-submit cookie pattern
 * - Rate limiting on sensitive endpoints
 * - httpOnly cookies for token storage (XSS protection)
 *
 * @module routes/auth
 * @requires express
 * @requires express-validator
 * @requires jsonwebtoken
 * @requires passport
 * @requires express-rate-limit
 * @requires ../models
 * @requires ../middleware/auth
 * @requires ../middleware/csrf
 * @requires ../services/emailService
 */

const express = require('express');
const emailService = require('../services/emailService');
const { body, validationResult } = require('express-validator');
const { passwordValidator, newPasswordValidator } = require('../utils/passwordValidator');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const { User, Team, UserTeam } = require('../models');
const { protect } = require('../middleware/auth');
const UserPermission = require('../models/UserPermission'); // Added import for UserPermission
const { generateToken: generateCsrfToken } = require('../middleware/csrf');

const router = express.Router();

/**
 * @description Generates a signed JWT token for user authentication.
 *              The token contains the user's ID in its payload and is signed
 *              with the secret from environment variables. Token expiration
 *              defaults to 7 days if not configured.
 *
 * @param {string|number} id - The user's unique identifier to encode in the token
 * @returns {string} Signed JWT token string
 *
 * @example
 * const token = generateToken(user.id);
 * // Returns: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */
const generateToken = (id) => {
  // Security: Sign token with secret key and set expiration
  // Token payload contains only user ID to minimize exposure if token is compromised
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * @description Calculates cookie maxAge in milliseconds from JWT expiration string.
 *              Supports common time formats: '7d' (days), '24h' (hours), '60m' (minutes).
 *              Falls back to 7 days if format is not recognized.
 *
 * @param {string} expiresIn - JWT expiration string (e.g., '7d', '24h', '60m')
 * @returns {number} Cookie maxAge in milliseconds
 *
 * @example
 * getJwtCookieMaxAge('7d');  // Returns: 604800000 (7 days in ms)
 * getJwtCookieMaxAge('24h'); // Returns: 86400000 (24 hours in ms)
 */
const getJwtCookieMaxAge = (expiresIn = process.env.JWT_EXPIRES_IN || '7d') => {
  // Parse common time format strings used in JWT expiration
  const match = expiresIn.match(/^(\d+)([dhm])$/);

  if (!match) {
    // Fallback: Default to 7 days if format not recognized
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // Convert to milliseconds based on unit
  switch (unit) {
    case 'd': // days
      return value * 24 * 60 * 60 * 1000;
    case 'h': // hours
      return value * 60 * 60 * 1000;
    case 'm': // minutes
      return value * 60 * 1000;
    default:
      // Fallback: Default to 7 days
      return 7 * 24 * 60 * 60 * 1000;
  }
};

/**
 * @description Rate limiter for CSRF token endpoint to prevent abuse.
 *              Allows 60 requests per 15 minutes per IP address.
 */
const csrfTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 requests per windowMs
  message: 'Too many CSRF token requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * @route GET /api/auth/csrf-token
 * @description Generates and returns a CSRF token for the client.
 *              This endpoint must be called before making state-changing requests
 *              (POST, PUT, PATCH, DELETE) to obtain a valid CSRF token.
 *              The token is returned in the response body and a corresponding
 *              CSRF cookie is automatically set by the CSRF middleware.
 *
 *              The frontend should:
 *              1. Call this endpoint to get a CSRF token
 *              2. Include the token in the 'x-csrf-token' header for state-changing requests
 *              3. The browser automatically sends the CSRF cookie with requests
 *
 * @access Public
 * @middleware csrfTokenLimiter - Rate limiting to prevent abuse (60 requests per 15 min)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.token - CSRF token to include in subsequent requests
 *
 * @example
 * // Client-side usage:
 * const response = await fetch('/api/auth/csrf-token');
 * const { token } = await response.json();
 * // Use token in subsequent requests:
 * await fetch('/api/auth/login', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'x-csrf-token': token
 *   },
 *   body: JSON.stringify({ email, password })
 * });
 */
router.get('/csrf-token', csrfTokenLimiter, (req, res) => {
  try {
    // Generate CSRF token using the double-submit cookie pattern
    // This function automatically sets the CSRF cookie in the response
    const csrfToken = generateCsrfToken(req, res);

    // Return the token in the response body
    // The client should include this token in the 'x-csrf-token' header
    // for all state-changing requests (POST, PUT, PATCH, DELETE)
    res.status(200).json({
      success: true,
      token: csrfToken
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('CSRF token generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error generating CSRF token'
    });
  }
});

/**
 * @route POST /api/auth/register
 * @description Registers a new user account with email/password authentication.
 *              Creates the user record, assigns them to a team, generates a JWT token,
 *              and sends a welcome email. The team assignment is determined by:
 *              1. DEFAULT_TEAM_ID environment variable (if set)
 *              2. First team in the database (fallback for development)
 *
 *              Password is automatically hashed before storage via User model hooks.
 * @access Public
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.email - User's email address (validated, normalized)
 * @param {string} req.body.password - User's password (minimum 6 characters)
 * @param {string} req.body.first_name - User's first name (1-50 chars, trimmed)
 * @param {string} req.body.last_name - User's last name (1-50 chars, trimmed)
 * @param {string} req.body.role - User's role ('head_coach' or 'assistant_coach')
 * @param {string} [req.body.phone] - User's phone number (10-15 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - User data
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email address
 * @returns {string} response.data.first_name - User's first name
 * @returns {string} response.data.last_name - User's last name
 * @returns {string} response.data.role - User's role
 * @returns {string} response.data.team_id - Assigned team's UUID
 * @returns {string} [response.data.phone] - User's phone number
 *
 * @cookie {string} token - JWT authentication token (httpOnly, expires with JWT)
 *
 * @throws {400} Validation failed - Email format invalid, password too short, missing required fields
 * @throws {400} User with this email already exists - Duplicate email registration attempt
 * @throws {500} No team configured for registration - No team available for user assignment
 * @throws {500} Server error during registration - Database operation failure
 */
router.post('/register', [
  // Validation: Email must be valid format and normalized (lowercase, trimmed)
  body('email').isEmail().normalizeEmail(),
  passwordValidator,
  // Validation: Names are required and have reasonable length limits
  body('first_name').trim().isLength({ min: 1, max: 50 }),
  body('last_name').trim().isLength({ min: 1, max: 50 }),
  // Validation: Role must be one of the allowed values
  body('role').isIn(['head_coach', 'assistant_coach']),
  // Validation: Phone is optional but must be valid length if provided
  body('phone').optional().isLength({ min: 10, max: 15 })
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, first_name, last_name, role, phone } = req.body;

    // Business logic: Prevent duplicate registrations with same email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Business logic: Determine team assignment for the new user
    // In production, this would typically be determined by domain/subdomain routing
    // or an invitation link containing team information
    let team;
    if (process.env.DEFAULT_TEAM_ID) {
      // Configuration: Use explicitly configured default team
      team = await Team.findByPk(process.env.DEFAULT_TEAM_ID);
    } else {
      // Fallback: Use first team in database (primarily for development)
      team = await Team.findOne({ order: [['id', 'ASC']] });
    }

    // Error: Cannot register without a team to assign the user to
    if (!team) {
      return res.status(500).json({
        success: false,
        error: 'No team configured for registration'
      });
    }

    // Database: Create user record with provided data and team assignment
    // Note: Password is automatically hashed by User model beforeCreate hook
    const user = await User.create({
      email,
      password,
      first_name,
      last_name,
      role,
      team_id: team.id,
      phone
    });

    // Security: Generate JWT token for immediate authentication after registration
    const token = generateToken(user.id);

    // Security: Set JWT token as httpOnly cookie to prevent XSS attacks
    // The httpOnly flag prevents JavaScript access, protecting against token theft
    // Cookie configuration matches login flow and CSRF cookie settings for consistency
    res.cookie('token', token, {
      httpOnly: true, // Prevents JavaScript access to cookie (XSS protection)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // CSRF protection
      maxAge: getJwtCookieMaxAge(), // Cookie expiration matches JWT expiration
      path: '/' // Cookie available for all routes
    });

    // Response: Return user data (token now in httpOnly cookie, password excluded by model)
    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        team_id: user.team_id,
        phone: user.phone
      }
    });

    // Business logic: Send welcome email asynchronously
    // Email failure should not prevent successful registration
    try {
      await emailService.sendWelcomeEmail(
        user.email,
        user.first_name,
        team.name || 'Sports2'
      );
    } catch (emailError) {
      // Error: Log email failure but don't fail the registration
      console.error('Failed to send welcome email:', emailError);
    }
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during registration'
    });
  }
});

/**
 * @route POST /api/auth/login
 * @description Authenticates a user with email and password credentials.
 *              Validates credentials, checks account status, updates last login
 *              timestamp, and sets a JWT token as an httpOnly cookie.
 *
 *              Security measures:
 *              - Generic error message for invalid credentials (prevents user enumeration)
 *              - Account activation check
 *              - Password comparison via secure bcrypt method
 *              - JWT token stored in httpOnly cookie (XSS protection)
 *              - Secure cookie flags (httpOnly, secure, sameSite)
 * @access Public
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.email - User's email address (validated, normalized)
 * @param {string} req.body.password - User's password
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - User profile data
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email address
 * @returns {string} response.data.first_name - User's first name
 * @returns {string} response.data.last_name - User's last name
 * @returns {string} response.data.role - User's role
 * @returns {string} response.data.team_id - User's primary team UUID
 * @returns {string} [response.data.phone] - User's phone number
 * @returns {Object} response.data.team - Team details (id, name, program_name, school_logo_url)
 *
 * @cookie {string} token - JWT authentication token (httpOnly, expires with JWT)
 *
 * @throws {400} Validation failed - Invalid email format or missing password
 * @throws {401} Invalid credentials - Email not found or password mismatch
 * @throws {401} Account is deactivated - User account has been disabled
 * @throws {500} Server error during login - Database operation failure
 */
router.post('/login', [
  // Validation: Email must be valid format and normalized
  body('email').isEmail().normalizeEmail(),
  // Validation: Password must be present (any length accepted for login)
  body('password').exists()
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Database: Find user by email with team details for response
    const user = await User.findOne({
      where: { email },
      include: [{
        model: Team,
        attributes: ['id', 'name', 'program_name', 'school_logo_url']
      }]
    });

    // Security: Use generic error message to prevent user enumeration attacks
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Security: Check if account is active before allowing login
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    // Security: Verify password using bcrypt comparison (timing-safe)
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      // Security: Same error message as user not found to prevent enumeration
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Business logic: Track last login timestamp for analytics/security
    await user.update({ last_login: new Date() });

    // Security: Generate fresh JWT token for this session
    const token = generateToken(user.id);

    // Security: Set JWT token as httpOnly cookie to prevent XSS attacks
    // The httpOnly flag prevents JavaScript access, protecting against token theft
    res.cookie('token', token, {
      httpOnly: true, // Prevents JavaScript access to cookie (XSS protection)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // CSRF protection
      maxAge: getJwtCookieMaxAge(), // Cookie expiration matches JWT expiration
      path: '/' // Cookie available for all routes
    });

    // Response: Return user data with team info and token in cookie
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        team_id: user.team_id,
        phone: user.phone,
        team: user.Team
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during login'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @description Retrieves the authenticated user's full profile including team associations.
 *              Returns both the primary team (backwards compatible) and all teams the user
 *              belongs to via the junction table (for multi-team support).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - User profile data (password excluded)
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email address
 * @returns {string} response.data.first_name - User's first name
 * @returns {string} response.data.last_name - User's last name
 * @returns {string} response.data.role - User's role
 * @returns {string} response.data.team_id - User's primary team UUID
 * @returns {Object} response.data.Team - Primary team details (backwards compatible)
 * @returns {Array<Object>} response.data.Teams - All teams user belongs to (multi-team support)
 * @returns {string} response.data.Teams[].UserTeam.role - User's role within that team
 * @returns {boolean} response.data.Teams[].UserTeam.is_active - Whether membership is active
 *
 * @throws {500} Server error while fetching profile - Database operation failure
 */
router.get('/me', protect, async (req, res) => {
  try {
    // Database: Fetch user with all team associations
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          // Business logic: Primary team (backwards compatible with original single-team design)
          model: Team,
          attributes: ['id', 'name', 'program_name', 'school_logo_url', 'conference', 'division']
        },
        {
          // Business logic: All teams from junction table (for multi-team support)
          // Users can belong to multiple teams with different roles
          model: Team,
          as: 'Teams',
          attributes: ['id', 'name', 'program_name', 'school_logo_url', 'conference', 'division'],
          through: {
            // Include role and status from junction table
            attributes: ['role', 'is_active'],
            // Permission: Only include active team memberships
            where: { is_active: true }
          }
        }
      ],
      // Security: Exclude password from response
      attributes: { exclude: ['password'] }
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching profile'
    });
  }
});

/**
 * @route PUT /api/auth/me
 * @description Updates the authenticated user's profile information.
 *              Only allows modification of safe fields (name, phone).
 *              Email and role changes require separate administrative processes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Request body validation
 *
 * @param {string} [req.body.first_name] - Updated first name (1-50 chars)
 * @param {string} [req.body.last_name] - Updated last name (1-50 chars)
 * @param {string} [req.body.phone] - Updated phone number (10-15 chars, optional)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated user profile data
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {500} Server error during update - Database operation failure
 */
router.put('/me', protect, [
  // Validation: Names are optional but must meet requirements if provided
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  // Validation: Phone is optional but must be valid length if provided
  body('phone').optional().isLength({ min: 10, max: 15 })
], async (req, res) => {
  try {
    // Validation: Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Extract only allowed fields for update
    const { first_name, last_name, phone } = req.body;
    const updateData = {};

    // Business logic: Only include fields that were provided
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (phone !== undefined) updateData.phone = phone;

    // Database: Update user record with allowed fields only
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await user.update(updateData);

    // Response: Return updated user data (password excluded)
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        team_id: user.team_id,
        phone: user.phone
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during profile update'
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @description Changes the authenticated user's password.
 *              Requires both current password verification and new password validation.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.currentPassword - User's current password for verification
 * @param {string} req.body.newPassword - New password (minimum 6 characters, validated)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {400} Validation failed - New password doesn't meet requirements
 * @throws {401} Current password is incorrect - Password verification failed
 * @throws {500} Server error during password change - Database operation failure
 */
router.post('/change-password', protect, [
  // Validation: Current password must be provided
  body('currentPassword').exists().withMessage('Current password is required'),
  // Validation: New password must meet security requirements
  newPasswordValidator
], async (req, res) => {
  try {
    // Validation: Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Database: Fetch user by ID
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Security: Verify current password using bcrypt comparison
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Business logic: Prevent using the same password as current
    const isSamePassword = await user.matchPassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password'
      });
    }

    // Database: Update password (will be hashed by User model beforeUpdate hook)
    await user.update({ password: newPassword });

    // Response: Return success message
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during password change'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @description Logs out the authenticated user by clearing the JWT token cookie.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Logout confirmation message
 */
router.post('/logout', protect, (req, res) => {
  try {
    // Security: Clear JWT token cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });

    // Response: Return success message
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during logout'
    });
  }
});

module.exports = router;