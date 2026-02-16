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
 *
 * @module routes/auth
 * @requires express
 * @requires express-validator
 * @requires jsonwebtoken
 * @requires passport
 * @requires ../models
 * @requires ../middleware/auth
 * @requires ../services/emailService
 */

const express = require('express');
const emailService = require('../services/emailService');
const { body, validationResult } = require('express-validator');
const { passwordValidator, newPasswordValidator, createPasswordValidator } = require('../utils/passwordValidator');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { User, Team } = require('../models');
const { protect } = require('../middleware/auth');
const UserPermission = require('../models/UserPermission'); // Added import for UserPermission
const { generateToken: generateCsrfToken } = require('../middleware/csrf');
const lockoutService = require('../services/lockoutService');
const tokenBlacklistService = require('../services/tokenBlacklistService');
const crypto = require('crypto');

const router = express.Router();

/**
 * @description Generates a secure random password that meets all validation requirements.
 *              Password will contain: uppercase, lowercase, digit, and special character.
 * @returns {string} A random password meeting all requirements
 */
const generateSecurePassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = uppercase + lowercase + digits + special;

  // Ensure at least one of each required character type
  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += special[crypto.randomInt(special.length)];

  // Fill remaining characters randomly (total 12 chars)
  for (let i = 0; i < 8; i++) {
    password += all[crypto.randomInt(all.length)];
  }

  // Shuffle the password to avoid predictable pattern
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
};

/**
 * @description Generates a signed JWT token for user authentication.
 *              The token contains the user's ID and a unique JTI (JWT ID) in its payload
 *              and is signed with the secret from environment variables. Token expiration
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
  // Token payload contains user ID and unique JTI for token revocation support
  const jti = crypto.randomUUID();
  return jwt.sign({ id, jti }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

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
 * @returns {Object} response.data - User data and authentication token
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email address
 * @returns {string} response.data.first_name - User's first name
 * @returns {string} response.data.last_name - User's last name
 * @returns {string} response.data.role - User's role
 * @returns {string} response.data.team_id - Assigned team's UUID
 * @returns {string} [response.data.phone] - User's phone number
 * @returns {string} response.data.token - JWT authentication token
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
  body('phone').optional({ checkFalsy: true }).isLength({ min: 10, max: 15 })
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

    // Response: Return user data with token (password excluded by model)
    // Set JWT token as httpOnly cookie for secure authentication
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    res.status(201).json({
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
        // Token only in httpOnly cookie, not here
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
 *              timestamp, and returns a JWT token with user profile data.
 *
 *              Security measures:
 *              - Generic error message for invalid credentials (prevents user enumeration)
 *              - Account activation check
 *              - Password comparison via secure bcrypt method
 * @access Public
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.email - User's email address (validated, normalized)
 * @param {string} req.body.password - User's password
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - User data and authentication token
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email address
 * @returns {string} response.data.first_name - User's first name
 * @returns {string} response.data.last_name - User's last name
 * @returns {string} response.data.role - User's role
 * @returns {string} response.data.team_id - User's primary team UUID
 * @returns {string} [response.data.phone] - User's phone number
 * @returns {Object} response.data.team - Team details (id, name, program_name, school_logo_url)
 * @returns {string} response.data.token - JWT authentication token
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

    // Security: Check if account is locked before validating password
    const lockoutStatus = lockoutService.checkAccountLockout(user);
    if (lockoutStatus.isLocked) {
      const lockedResponse = lockoutService.generateLockedAccountResponse(lockoutStatus);
      return res.status(lockedResponse.statusCode).json(lockedResponse.body);
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
      // Security: Track failed login attempt and potentially lock account
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      await lockoutService.handleFailedLogin(user, ipAddress);

      // Security: Same error message as user not found to prevent enumeration
      // Return 401 even if account was just locked (423 will be returned on next attempt)
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Security: Reset failed attempts counter on successful login
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    await lockoutService.handleSuccessfulLogin(user, ipAddress);

    // Business logic: Track last login timestamp for analytics/security
    await user.update({ last_login: new Date() });

    // Security: Generate fresh JWT token for this session
    const token = generateToken(user.id);

    // Set JWT token as httpOnly cookie for secure authentication
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    // Response: Return user data with team info (token is now in cookie)
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
        // Token only in httpOnly cookie, not here
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
 *              Email and role changes require separate administrative endpoints.
 *              Password changes use the dedicated /change-password endpoint.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Request body validation
 *
 * @param {string} [req.body.first_name] - New first name (1-50 chars, trimmed)
 * @param {string} [req.body.last_name] - New last name (1-50 chars, trimmed)
 * @param {string} [req.body.phone] - New phone number (10-15 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated user profile data
 * @returns {string} response.data.id - User's UUID
 * @returns {string} response.data.email - User's email (unchanged)
 * @returns {string} response.data.first_name - User's updated first name
 * @returns {string} response.data.last_name - User's updated last name
 * @returns {string} response.data.role - User's role (unchanged)
 * @returns {string} response.data.team_id - User's team UUID (unchanged)
 * @returns {string} [response.data.phone] - User's updated phone number
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {500} Server error while updating profile - Database operation failure
 */
router.put('/me', protect, [
  // Validation: Optional fields with length constraints
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('phone').optional({ checkFalsy: true }).isLength({ min: 10, max: 15 })
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

    const { first_name, last_name, phone } = req.body;

    // Database: Fetch and update user with provided values
    // Business logic: Only update fields that are provided, preserve existing values
    const user = await User.findByPk(req.user.id);
    await user.update({
      first_name: first_name || user.first_name,
      last_name: last_name || user.last_name,
      phone: phone || user.phone
    });

    // Response: Return updated user data (excluding sensitive fields)
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
      error: 'Server error while updating profile'
    });
  }
});

/**
 * @route PUT /api/auth/change-password
 * @description Changes the authenticated user's password.
 *              Requires verification of current password before allowing change.
 *              New password is automatically hashed by User model hooks before storage.
 *
 *              Security measures:
 *              - Current password verification prevents unauthorized changes
 *              - Minimum password length enforced
 *              - Password hashing handled by model layer
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.current_password - User's current password for verification
 * @param {string} req.body.new_password - New password (minimum 6 characters)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - New password too short or missing required fields
 * @throws {400} Current password is incorrect - Password verification failed
 * @throws {500} Server error while changing password - Database operation failure
 */
router.put('/change-password', protect, [
  // Validation: Current password must be provided for verification
  body('current_password').exists(),
  newPasswordValidator
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

    const { current_password, new_password } = req.body;

    // Database: Fetch user to verify current password
    const user = await User.findByPk(req.user.id);

    // Security: Verify current password before allowing change
    const isMatch = await user.matchPassword(current_password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Security: Update password (automatically hashed by model beforeUpdate hook)
    user.password = new_password;
    await user.save();

    // Security: Revoke all existing tokens for this user
    await tokenBlacklistService.revokeAllUserTokens(user.id, 'password_change');

    // Security: Generate a new token for the current session
    const token = generateToken(user.id);

    // Set new JWT token as httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    res.json({
      success: true,
      message: 'Password changed successfully. All other sessions have been logged out.',
      data: {
        token
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while changing password'
    });
  }
});

// ============================================================================
// OAuth Routes
// These routes handle social authentication via Google and Apple sign-in.
// OAuth flows redirect users to provider authentication pages, then back to
// callback endpoints where tokens are exchanged and users are created/matched.
// ============================================================================

/**
 * @route GET /api/auth/google
 * @description Initiates Google OAuth 2.0 authentication flow.
 *              Redirects user to Google's consent screen where they can
 *              authorize the application to access their profile and email.
 *              Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.
 *
 *              OAuth Flow:
 *              1. User clicks "Sign in with Google" button
 *              2. This endpoint redirects to Google's OAuth consent screen
 *              3. User approves permissions (profile, email)
 *              4. Google redirects to /google/callback with authorization code
 * @access Public
 *
 * @returns {void} Redirects to Google OAuth consent screen
 *
 * @throws {503} Google OAuth is not configured - Missing environment variables
 */
router.get('/google', (req, res) => {
  // Configuration: Check if Google OAuth credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured'
    });
  }
  // OAuth: Initiate Google authentication with profile and email scopes
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res);
});

/**
 * @route GET /api/auth/google/callback
 * @description Handles Google OAuth callback after user authorization.
 *              Exchanges authorization code for access token, retrieves user profile,
 *              finds or creates user in database, generates JWT, and redirects to frontend.
 *
 *              The passport 'google' strategy (configured elsewhere) handles:
 *              - Token exchange with Google
 *              - Profile retrieval
 *              - User lookup/creation
 *
 *              On success: Redirects to APP_URL/oauth-callback?token=xxx&provider=google
 *              On failure: Redirects to LANDING_URL/login?error=oauth_failed
 * @access Public (callback from Google)
 *
 * @returns {void} Redirects to frontend with token or error
 *
 * @throws {503} Google OAuth is not configured - Missing environment variables
 */
router.get('/google/callback', (req, res, next) => {
  // Configuration: Verify OAuth is configured before processing callback
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured'
    });
  }
  // OAuth: Process callback with session disabled (using JWT instead)
  passport.authenticate('google', { session: false })(req, res, next);
}, (req, res) => {
  try {
    // Security: Generate JWT token for authenticated user
    const token = generateToken(req.user.id);

    // Business logic: Redirect to frontend app with token as query parameter
    // Frontend will extract token and store it for subsequent API calls
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost/app';
    const redirectUrl = `${appUrl}/oauth-callback?token=${token}&provider=google`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Error: Redirect to landing page with error indicator on failure
    console.error('Google OAuth callback error:', error);
    const landingUrl = process.env.LANDING_URL || 'http://localhost';
    const errorUrl = `${landingUrl}/login?error=oauth_failed`;
    res.redirect(errorUrl);
  }
});

/**
 * @route GET /api/auth/apple
 * @description Initiates Apple OAuth authentication flow (Sign in with Apple).
 *              Redirects user to Apple's authentication page where they can
 *              authorize the application to access their email and name.
 *              Requires APPLE_CLIENT_ID, APPLE_TEAM_ID, and APPLE_KEY_ID environment variables.
 *
 *              Apple Sign In Notes:
 *              - Apple only provides user's name on first authorization
 *              - Users can choose to hide their email (relay address provided)
 *              - Uses POST for callback (unlike Google which uses GET)
 * @access Public
 *
 * @returns {void} Redirects to Apple OAuth authentication page
 *
 * @throws {503} Apple OAuth is not configured - Missing environment variables
 */
router.get('/apple', (req, res) => {
  // Configuration: Check if Apple OAuth credentials are configured
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID) {
    return res.status(503).json({
      success: false,
      error: 'Apple OAuth is not configured'
    });
  }
  // OAuth: Initiate Apple authentication with email and name scopes
  passport.authenticate('apple', { scope: ['email', 'name'] })(req, res);
});

/**
 * @route POST /api/auth/apple/callback
 * @description Handles Apple OAuth callback after user authorization.
 *              Apple uses POST for callbacks (unlike Google's GET).
 *              Exchanges authorization code for tokens, processes user data,
 *              finds or creates user, generates JWT, and redirects to frontend.
 *
 *              Apple-specific behavior:
 *              - User info (name) is only provided on first authorization
 *              - Email may be a private relay address if user chose to hide email
 *              - Subsequent logins only provide user identifier
 *
 *              On success: Redirects to APP_URL/oauth-callback?token=xxx&provider=apple
 *              On failure: Redirects to LANDING_URL/login?error=oauth_failed
 * @access Public (callback from Apple)
 *
 * @returns {void} Redirects to frontend with token or error
 *
 * @throws {503} Apple OAuth is not configured - Missing environment variables
 */
router.post('/apple/callback', (req, res, next) => {
  // Configuration: Verify OAuth is configured before processing callback
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID) {
    return res.status(503).json({
      success: false,
      error: 'Apple OAuth is not configured'
    });
  }
  // OAuth: Process callback with session disabled (using JWT instead)
  passport.authenticate('apple', { session: false })(req, res, next);
}, (req, res) => {
  try {
    // Security: Generate JWT token for authenticated user
    const token = generateToken(req.user.id);

    // Business logic: Redirect to frontend app with token as query parameter
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost/app';
    const redirectUrl = `${appUrl}/oauth-callback?token=${token}&provider=apple`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Error: Redirect to landing page with error indicator on failure
    console.error('Apple OAuth callback error:', error);
    const landingUrl = process.env.LANDING_URL || 'http://localhost';
    const errorUrl = `${landingUrl}/login?error=oauth_failed`;
    res.redirect(errorUrl);
  }
});

/**
 * @route POST /api/auth/oauth/token
 * @description Endpoint for mobile apps to exchange OAuth provider tokens.
 *              Mobile apps handle OAuth differently - they receive tokens directly
 *              from the provider SDK and need to exchange them for app-specific JWT tokens.
 *
 *              Implementation Note: This is a placeholder endpoint. Production
 *              implementation should verify the access_token with the specified
 *              provider's API before creating/returning a user JWT.
 *
 *              Typical mobile OAuth flow:
 *              1. Mobile app uses provider SDK for authentication
 *              2. SDK returns provider access token
 *              3. App sends token to this endpoint
 *              4. Backend verifies token with provider
 *              5. Backend finds/creates user and returns app JWT
 * @access Public
 *
 * @param {string} req.body.provider - OAuth provider name ('google' or 'apple')
 * @param {string} req.body.access_token - Access token from OAuth provider
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message
 *
 * @throws {400} Provider and access token are required - Missing required parameters
 * @throws {500} Server error during OAuth token processing - Token verification or database failure
 */
router.post('/oauth/token', (req, res) => {
  try {
    const { provider, access_token } = req.body;

    // Validation: Both provider and token are required for token exchange
    if (!provider || !access_token) {
      return res.status(400).json({
        success: false,
        error: 'Provider and access token are required'
      });
    }

    // TODO: Production implementation should:
    // 1. Verify access_token with provider API (Google/Apple)
    // 2. Extract user info from verified token
    // 3. Find or create user in database
    // 4. Generate and return app JWT
    // This placeholder exists for mobile app integration development

    res.json({
      success: true,
      message: 'OAuth token endpoint - implement based on your mobile app needs'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('OAuth token error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during OAuth token processing'
    });
  }
});

/**
 * @route GET /api/auth/permissions
 * @description Retrieves the list of granted permissions for the authenticated user
 *              within their current team context. Permissions control access to
 *              specific features and operations within the application.
 *
 *              Permission types include:
 *              - team_settings: Modify team configuration
 *              - user_management: Manage team users and roles
 *              - roster_management: Add/edit/remove players
 *              - schedule_management: Create/modify schedules
 *              - depth_chart_management: Manage depth charts
 *              - report_management: Create/edit reports
 *
 *              Permission model:
 *              - Permissions are granted per user per team
 *              - Only granted permissions (is_granted=true) are returned
 *              - Super admins may have implicit permissions not stored in database
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<string>} response.data - Array of granted permission type strings
 *
 * @example
 * // Response for a user with roster and schedule permissions:
 * {
 *   "success": true,
 *   "data": ["roster_management", "schedule_management"]
 * }
 *
 * @throws {500} Error fetching user permissions - Database query failure
 */
router.get('/permissions', protect, async (req, res) => {
  try {
    // Database: Fetch all granted permissions for user within their team
    const permissions = await UserPermission.findAll({
      where: {
        user_id: req.user.id,
        // Permission: Scope to user's current team (multi-tenant isolation)
        team_id: req.user.team_id,
        // Permission: Only include explicitly granted permissions
        is_granted: true
      },
      // Performance: Only select the permission type column
      attributes: ['permission_type'],
      // Business logic: Sort alphabetically for consistent ordering
      order: [['permission_type', 'ASC']]
    });

    // Business logic: Extract permission types into simple string array
    const permissionTypes = permissions.map(p => p.permission_type);

    res.json({
      success: true,
      data: permissionTypes
    });
  } catch (error) {
    // Error: Log and return error message
    console.error('Error fetching user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user permissions'
    });
  }
});

/**
 * @route GET /api/auth/csrf-token
 * @description Generates and returns a CSRF token for use in state-changing requests.
 *              The token must be included in the X-CSRF-Token header for POST, PUT,
 *              PATCH, and DELETE requests. A corresponding cookie is also set.
 * @access Public
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.token - The CSRF token to use in request headers
 */
router.get('/csrf-token', (req, res) => {
  try {
    const token = generateCsrfToken(req, res);
    res.json({
      success: true,
      token
    });
  } catch (error) {
    console.error('Error generating CSRF token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSRF token'
    });
  }
});

/**
 * @route POST /api/auth/admin/unlock/:userId
 * @description Admin endpoint to manually unlock a locked user account.
 *              Resets failed login attempts counter and clears lockout timestamp.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to unlock
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Unlock details
 * @returns {boolean} response.data.wasLocked - Whether account was locked
 * @returns {number} response.data.previousFailedAttempts - Failed attempts before unlock
 *
 * @throws {401} Unauthorized - Not authenticated
 * @throws {403} Only admins can unlock accounts - Non-admin attempted unlock
 * @throws {404} User not found - User ID doesn't exist
 */
router.post('/admin/unlock/:userId', protect, async (req, res) => {
  try {
    // Permission: Only super_admin can unlock accounts
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can unlock accounts'
      });
    }

    const { userId } = req.params;
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Store previous state for response
    const wasLocked = user.isLocked();
    const previousFailedAttempts = user.failed_login_attempts;

    // Reset lockout state
    await user.resetFailedAttempts();

    res.json({
      success: true,
      message: `Account ${user.email} has been unlocked`,
      data: {
        wasLocked,
        previousFailedAttempts
      }
    });
  } catch (error) {
    console.error('Admin unlock error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while unlocking account'
    });
  }
});

/**
 * @route GET /api/auth/admin/lockout-status/:userId
 * @description Admin endpoint to check the lockout status of a user account.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to check
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Lockout status details
 * @returns {boolean} response.data.isLocked - Whether account is currently locked
 * @returns {number} response.data.failedLoginAttempts - Current failed attempts count
 * @returns {Date|null} response.data.lockedUntil - When lock expires
 * @returns {Date|null} response.data.lastFailedLogin - Last failed login timestamp
 * @returns {number} response.data.remainingLockoutMinutes - Minutes until unlock
 *
 * @throws {401} Unauthorized - Not authenticated
 * @throws {403} Only admins can view lockout status - Non-admin attempted access
 * @throws {404} User not found - User ID doesn't exist
 */
router.get('/admin/lockout-status/:userId', protect, async (req, res) => {
  try {
    // Permission: Only super_admin can view lockout status
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can view lockout status'
      });
    }

    const { userId } = req.params;
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const lockoutStatus = lockoutService.checkAccountLockout(user);

    res.json({
      success: true,
      data: {
        isLocked: lockoutStatus.isLocked,
        failedLoginAttempts: user.failed_login_attempts,
        lockedUntil: user.locked_until,
        lastFailedLogin: user.last_failed_login,
        remainingLockoutMinutes: lockoutStatus.remainingMinutes
      }
    });
  } catch (error) {
    console.error('Admin lockout status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching lockout status'
    });
  }
});

// ============================================================================
// Admin User Management Routes
// These routes allow super_admin users to manage all users in their team.
// ============================================================================

/**
 * @route GET /api/auth/admin/users
 * @description List all users in the admin's team with pagination and optional search.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=20] - Number of users per page
 * @param {string} [req.query.search] - Search term for email, first_name, or last_name
 * @param {string} [req.query.role] - Filter by role
 * @param {boolean} [req.query.is_active] - Filter by active status
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of user objects
 * @returns {Object} response.pagination - Pagination info
 *
 * @throws {403} Only admins can list users - Non-admin attempted access
 */
router.get('/admin/users', protect, async (req, res) => {
  try {
    // Permission: Only super_admin can list users
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can list users'
      });
    }

    const { Op } = require('sequelize');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const { search, role, is_active } = req.query;

    // Build where clause
    const where = {
      team_id: req.user.team_id // Multi-tenant: Only show users in admin's team
    };

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (role) {
      where.role = role;
    }

    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      include: [{
        model: Team,
        attributes: ['id', 'name']
      }],
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while listing users'
    });
  }
});

/**
 * @route GET /api/auth/admin/users/:userId
 * @description Get a single user's details by ID.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - User object with team info
 *
 * @throws {403} Only admins can view user details - Non-admin attempted access
 * @throws {404} User not found - User doesn't exist or not in admin's team
 */
router.get('/admin/users/:userId', protect, async (req, res) => {
  try {
    // Permission: Only super_admin can view user details
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can view user details'
      });
    }

    const { userId } = req.params;
    const user = await User.findOne({
      where: {
        id: userId,
        team_id: req.user.team_id // Multi-tenant: Only allow viewing users in admin's team
      },
      include: [{
        model: Team,
        attributes: ['id', 'name', 'program_name']
      }],
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching user'
    });
  }
});

/**
 * @route POST /api/auth/admin/users
 * @description Create a new user with any role. Super admins can create users
 *              with any role including other super_admins.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.body.email - User's email address
 * @param {string} req.body.password - User's password (min 6 chars)
 * @param {string} req.body.first_name - User's first name
 * @param {string} req.body.last_name - User's last name
 * @param {string} req.body.role - User's role (super_admin, head_coach, assistant_coach)
 * @param {string} [req.body.phone] - User's phone number
 * @param {boolean} [req.body.is_active=true] - Whether account is active
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created user object
 *
 * @throws {400} Validation failed - Invalid input data
 * @throws {400} User with this email already exists - Duplicate email
 * @throws {403} Only admins can create users - Non-admin attempted creation
 */
router.post('/admin/users', protect, [
  body('email').isEmail().normalizeEmail(),
  passwordValidator,
  body('first_name').trim().isLength({ min: 1, max: 50 }),
  body('last_name').trim().isLength({ min: 1, max: 50 }),
  body('role').isIn(['super_admin', 'head_coach', 'assistant_coach']),
  body('phone').optional({ checkFalsy: true }).isLength({ min: 10, max: 15 }),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    // Permission: Only super_admin can create users
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can create users'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, first_name, last_name, role, phone, is_active = true } = req.body;

    // Check for duplicate email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create user in admin's team
    const user = await User.create({
      email,
      password,
      first_name,
      last_name,
      role,
      phone: phone || null, // Convert empty string to null for model validation
      is_active,
      team_id: req.user.team_id
    });

    // Fetch created user with team info (password excluded by findByPk with attributes)
    const createdUser = await User.findByPk(user.id, {
      include: [{
        model: Team,
        attributes: ['id', 'name']
      }],
      attributes: { exclude: ['password'] }
    });

    res.status(201).json({
      success: true,
      data: createdUser
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating user'
    });
  }
});

/**
 * @route PUT /api/auth/admin/users/:userId
 * @description Update an existing user's information. Can update role, status,
 *              and profile information but not password (user must change their own).
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to update
 * @param {string} [req.body.email] - New email address
 * @param {string} [req.body.first_name] - New first name
 * @param {string} [req.body.last_name] - New last name
 * @param {string} [req.body.role] - New role
 * @param {string} [req.body.phone] - New phone number
 * @param {boolean} [req.body.is_active] - New active status
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated user object
 *
 * @throws {400} Validation failed - Invalid input data
 * @throws {400} Email already in use - Duplicate email
 * @throws {403} Only admins can update users - Non-admin attempted update
 * @throws {404} User not found - User doesn't exist or not in admin's team
 */
router.put('/admin/users/:userId', protect, [
  body('email').optional().isEmail().normalizeEmail(),
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('role').optional().isIn(['super_admin', 'head_coach', 'assistant_coach']),
  body('phone').optional({ checkFalsy: true }).isLength({ min: 10, max: 15 }),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    // Permission: Only super_admin can update users
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can update users'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId } = req.params;
    const user = await User.findOne({
      where: {
        id: userId,
        team_id: req.user.team_id // Multi-tenant: Only allow updating users in admin's team
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { email, first_name, last_name, role, phone, is_active } = req.body;

    // If changing email, check for duplicates
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email already in use'
        });
      }
    }

    // Update user fields (convert empty phone to null for model validation)
    await user.update({
      email: email !== undefined ? email : user.email,
      first_name: first_name !== undefined ? first_name : user.first_name,
      last_name: last_name !== undefined ? last_name : user.last_name,
      role: role !== undefined ? role : user.role,
      phone: phone !== undefined ? (phone || null) : user.phone,
      is_active: is_active !== undefined ? is_active : user.is_active
    });

    // Fetch updated user with team info
    const updatedUser = await User.findByPk(user.id, {
      include: [{
        model: Team,
        attributes: ['id', 'name']
      }],
      attributes: { exclude: ['password'] }
    });

    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating user'
    });
  }
});

/**
 * @route DELETE /api/auth/admin/users/:userId
 * @description Delete a user from the system. Prevents self-deletion.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Deletion confirmation
 *
 * @throws {400} Cannot delete your own account - Self-deletion attempted
 * @throws {403} Only admins can delete users - Non-admin attempted deletion
 * @throws {404} User not found - User doesn't exist or not in admin's team
 */
router.delete('/admin/users/:userId', protect, async (req, res) => {
  try {
    // Permission: Only super_admin can delete users
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can delete users'
      });
    }

    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const user = await User.findOne({
      where: {
        id: userId,
        team_id: req.user.team_id // Multi-tenant: Only allow deleting users in admin's team
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userEmail = user.email;
    await user.destroy();

    res.json({
      success: true,
      message: `User ${userEmail} has been deleted`
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting user'
    });
  }
});

/**
 * @route PUT /api/auth/admin/users/:userId/reset-password
 * @description Admin endpoint to reset a user's password. Generates a temporary
 *              password and revokes all existing sessions for the user.
 * @access Private - Requires authentication and super_admin role
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.userId - The user ID to reset password for
 * @param {string} [req.body.new_password] - Optional custom password (otherwise auto-generated)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Reset confirmation
 * @returns {Object} response.data - Contains temporary password if auto-generated
 *
 * @throws {403} Only admins can reset passwords - Non-admin attempted reset
 * @throws {404} User not found - User doesn't exist or not in admin's team
 */
router.put('/admin/users/:userId/reset-password', protect, [
  createPasswordValidator('new_password').optional()
], async (req, res) => {
  try {
    // Permission: Only super_admin can reset passwords
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can reset passwords'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId } = req.params;
    const user = await User.findOne({
      where: {
        id: userId,
        team_id: req.user.team_id
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate or use provided password (auto-generated meets all requirements)
    const newPassword = req.body.new_password || generateSecurePassword();

    // Update password (hashed by model hook)
    user.password = newPassword;
    await user.save();

    // Revoke all existing sessions
    await tokenBlacklistService.revokeAllUserTokens(user.id, 'admin_password_reset');

    // Reset any lockout state
    await user.resetFailedAttempts();

    res.json({
      success: true,
      message: `Password reset for ${user.email}`,
      data: {
        temporaryPassword: req.body.new_password ? undefined : newPassword
      }
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while resetting password'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @description Logs out the current user by clearing the JWT cookie.
 *              This endpoint invalidates the user's session by removing
 *              the httpOnly JWT cookie from the client.
 * @access Public (but typically called by authenticated users)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Logout confirmation message
 */
router.post('/logout', protect, async (req, res) => {
  try {
    // Blacklist the current token
    const token = req.headers.authorization?.split(' ')[1] || req.cookies?.jwt;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.jti) {
        const expiresAt = new Date(decoded.exp * 1000);
        await tokenBlacklistService.addToBlacklist(
          decoded.jti,
          decoded.id,
          expiresAt,
          'logout'
        );
      }
    }

    // Clear cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      expires: new Date(0),
      path: '/'
    });

    res.cookie('csrf-token', '', {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      expires: new Date(0),
      path: '/'
    });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout'
    });
  }
});

/**
 * @route POST /api/auth/revoke-all-sessions
 * @description Revokes all active sessions for the authenticated user.
 *              Optionally keeps the current session active by issuing a new token.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {boolean} [req.body.keepCurrent=false] - Whether to keep current session active
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message
 * @returns {Object} [response.data] - New token if keepCurrent is true
 * @returns {string} [response.data.token] - New JWT token for current session
 *
 * @throws {500} Server error while revoking sessions
 */
router.post('/revoke-all-sessions', protect, async (req, res) => {
  try {
    const { keepCurrent = false } = req.body;

    await tokenBlacklistService.revokeAllUserTokens(req.user.id, 'user_initiated');

    if (keepCurrent) {
      const newToken = generateToken(req.user.id);
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('jwt', newToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      return res.json({
        success: true,
        message: 'All other sessions have been revoked',
        data: { token: newToken }
      });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      expires: new Date(0),
      path: '/'
    });

    res.json({
      success: true,
      message: 'All sessions have been revoked'
    });
  } catch (error) {
    console.error('Error revoking sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while revoking sessions'
    });
  }
});

module.exports = router;
