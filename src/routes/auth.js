const express = require('express');
const emailService = require('../services/emailService');
const { body, validationResult } = require('express-validator');
const { passwordValidator } = require('../utils/passwordValidator');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { User, Team, UserTeam } = require('../models');
const { protect } = require('../middleware/auth');
const UserPermission = require('../models/UserPermission'); // Added import for UserPermission

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  passwordValidator,
  body('first_name').trim().isLength({ min: 1, max: 50 }),
  body('last_name').trim().isLength({ min: 1, max: 50 }),
  body('role').isIn(['head_coach', 'assistant_coach']),
  body('phone').optional().isLength({ min: 10, max: 15 })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email, password, first_name, last_name, role, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'User with this email already exists' 
      });
    }

    // Get team from environment or default to first team
    // In production, this would be determined by domain/subdomain
    let team;
    if (process.env.DEFAULT_TEAM_ID) {
      team = await Team.findByPk(process.env.DEFAULT_TEAM_ID);
    } else {
      team = await Team.findOne({ order: [['id', 'ASC']] });
    }
    
    if (!team) {
      return res.status(500).json({ 
        success: false, 
        error: 'No team configured for registration' 
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      first_name,
      last_name,
      role,
      team_id: team.id,
      phone
    });

    // Generate token
    const token = generateToken(user.id);

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
        token
      }
    });

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(
        user.email,
        user.first_name,
        team.name || 'Sports2'
      );
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during registration' 
    });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { email, password } = req.body;

    // Check for user
    const user = await User.findOne({ 
      where: { email },
      include: [{
        model: Team,
        attributes: ['id', 'name', 'program_name', 'school_logo_url']
      }]
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account is deactivated' 
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }

    // Update last login
    await user.update({ last_login: new Date() });

    // Generate token
    const token = generateToken(user.id);

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
        team: user.Team,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error during login' 
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          // Primary team (backwards compatible)
          model: Team,
          attributes: ['id', 'name', 'program_name', 'school_logo_url', 'conference', 'division']
        },
        {
          // All teams from junction table (for multi-team support)
          model: Team,
          as: 'Teams',
          attributes: ['id', 'name', 'program_name', 'school_logo_url', 'conference', 'division'],
          through: {
            attributes: ['role', 'is_active'],
            where: { is_active: true }
          }
        }
      ],
      attributes: { exclude: ['password'] }
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching profile'
    });
  }
});

// @route   PUT /api/auth/me
// @desc    Update current user profile
// @access  Private
router.put('/me', protect, [
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('phone').optional().isLength({ min: 10, max: 15 })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { first_name, last_name, phone } = req.body;

    // Update user
    const user = await User.findByPk(req.user.id);
    await user.update({
      first_name: first_name || user.first_name,
      last_name: last_name || user.last_name,
      phone: phone || user.phone
    });

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
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating profile' 
    });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', protect, [
  body('current_password').exists(),
  body('new_password').isLength({ min: 6 })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { current_password, new_password } = req.body;

    // Get user with password
    const user = await User.findByPk(req.user.id);

    // Check current password
    const isMatch = await user.matchPassword(current_password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = new_password;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while changing password' 
    });
  }
});

// OAuth Routes

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth
// @access  Public
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured'
    });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res);
});

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured'
    });
  }
  passport.authenticate('google', { session: false })(req, res, next);
}, (req, res) => {
  try {
    const token = generateToken(req.user.id);
    
    // Redirect to frontend app with token
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost/app';
    const redirectUrl = `${appUrl}/oauth-callback?token=${token}&provider=google`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const landingUrl = process.env.LANDING_URL || 'http://localhost';
    const errorUrl = `${landingUrl}/login?error=oauth_failed`;
    res.redirect(errorUrl);
  }
});

// @route   GET /api/auth/apple
// @desc    Initiate Apple OAuth
// @access  Public
router.get('/apple', (req, res) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID) {
    return res.status(503).json({
      success: false,
      error: 'Apple OAuth is not configured'
    });
  }
  passport.authenticate('apple', { scope: ['email', 'name'] })(req, res);
});

// @route   POST /api/auth/apple/callback
// @desc    Apple OAuth callback
// @access  Public
router.post('/apple/callback', (req, res, next) => {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID) {
    return res.status(503).json({
      success: false,
      error: 'Apple OAuth is not configured'
    });
  }
  passport.authenticate('apple', { session: false })(req, res, next);
}, (req, res) => {
  try {
    const token = generateToken(req.user.id);
    
    // Redirect to frontend app with token
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost/app';
    const redirectUrl = `${appUrl}/oauth-callback?token=${token}&provider=apple`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Apple OAuth callback error:', error);
    const landingUrl = process.env.LANDING_URL || 'http://localhost';
    const errorUrl = `${landingUrl}/login?error=oauth_failed`;
    res.redirect(errorUrl);
  }
});

// @route   POST /api/auth/oauth/token
// @desc    Get OAuth token for mobile apps
// @access  Public
router.post('/oauth/token', async (req, res) => {
  try {
    const { provider, access_token } = req.body;

    if (!provider || !access_token) {
      return res.status(400).json({
        success: false,
        error: 'Provider and access token are required'
      });
    }

    // For mobile apps, you would verify the access token with the provider
    // and then find or create the user accordingly
    // This is a simplified version - in production you'd want to verify the token
    
    res.json({
      success: true,
      message: 'OAuth token endpoint - implement based on your mobile app needs'
    });
  } catch (error) {
    console.error('OAuth token error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during OAuth token processing'
    });
  }
});

// @route   GET /api/auth/permissions
// @desc    Get current user's permissions
// @access  Private
router.get('/permissions', protect, async (req, res) => {
  try {
    const permissions = await UserPermission.findAll({
      where: {
        user_id: req.user.id,
        team_id: req.user.team_id,
        is_granted: true
      },
      attributes: ['permission_type'],
      order: [['permission_type', 'ASC']]
    });

    const permissionTypes = permissions.map(p => p.permission_type);

    res.json({
      success: true,
      data: permissionTypes
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user permissions'
    });
  }
});

module.exports = router; 