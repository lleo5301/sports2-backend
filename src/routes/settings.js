/**
 * @fileoverview User settings routes for managing user preferences, account information,
 * security settings, privacy options, and notification configurations.
 *
 * This module provides endpoints for comprehensive user settings management including:
 * - **General Settings**: Theme, language, timezone, date/time formats, UI preferences
 * - **Account Settings**: Profile information (name, email, phone, bio, location, website)
 * - **Notification Settings**: Email, push, and in-app notification preferences with type granularity
 * - **Security Settings**: Two-factor authentication, session management, password policies
 * - **Privacy Settings**: Profile visibility, data sharing, analytics, and marketing preferences
 *
 * Settings are stored in a JSON column (user.settings) in the User model, allowing flexible
 * schema-less storage for preferences. Account-related fields (name, email, etc.) are stored
 * in dedicated User model columns.
 *
 * **Settings Storage Pattern**:
 * - Preferences (general, notifications, security, privacy): Stored in `user.settings` JSONB column
 * - Account information (firstName, lastName, email, etc.): Stored in dedicated User columns
 *
 * **Default Values**: All GET endpoints return sensible defaults when settings haven't been explicitly set,
 * ensuring the frontend always receives a complete settings object.
 *
 * All routes in this file require authentication via the protect middleware.
 *
 * @module routes/settings
 * @requires express
 * @requires express-validator
 * @requires bcryptjs
 * @requires sequelize
 * @requires ../services/emailService
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const emailService = require('../services/emailService');
const { body, param, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { User, Team } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const router = express.Router();

/**
 * @description Validation middleware for general settings fields.
 * Validates UI preferences including theme, language, timezone, date/time formats, and display options.
 * All fields are optional - only validates provided fields.
 *
 * @constant {Array} validateGeneralSettings
 * @property {string} [theme] - UI theme (any string, e.g., 'light', 'dark')
 * @property {string} [language] - Language code (must be 'en', 'es', or 'fr')
 * @property {string} [timezone] - Timezone identifier (e.g., 'America/New_York')
 * @property {string} [dateFormat] - Date display format (e.g., 'MM/DD/YYYY')
 * @property {string} [timeFormat] - Time display format ('12h' or '24h')
 * @property {boolean} [autoRefresh] - Enable automatic data refresh
 * @property {boolean} [compactView] - Enable compact UI mode
 * @property {boolean} [showNotifications] - Show in-app notifications
 */
const validateGeneralSettings = [
  body('theme').optional().isString().withMessage('Theme must be a string'),
  body('language').optional().isIn(['en', 'es', 'fr']).withMessage('Invalid language'),
  body('timezone').optional().isString().withMessage('Timezone must be a string'),
  body('dateFormat').optional().isString().withMessage('Date format must be a string'),
  body('timeFormat').optional().isIn(['12h', '24h']).withMessage('Time format must be 12h or 24h'),
  body('autoRefresh').optional().isBoolean().withMessage('Auto refresh must be a boolean'),
  body('compactView').optional().isBoolean().withMessage('Compact view must be a boolean'),
  body('showNotifications').optional().isBoolean().withMessage('Show notifications must be a boolean')
];

/**
 * @description Validation middleware for account settings fields.
 * Validates user profile information with length and format constraints.
 * All fields are optional - only validates provided fields.
 *
 * @constant {Array} validateAccountSettings
 * @property {string} [firstName] - First name (1-50 characters, trimmed)
 * @property {string} [lastName] - Last name (1-50 characters, trimmed)
 * @property {string} [email] - Email address (valid email format)
 * @property {string} [phone] - Phone number (valid mobile phone format)
 * @property {string} [bio] - User biography (max 500 characters)
 * @property {string} [location] - Location/address (max 100 characters)
 * @property {string} [website] - Personal website (valid URL format)
 */
const validateAccountSettings = [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  body('website').optional().isURL().withMessage('Invalid website URL')
];

/**
 * @description Validation middleware for notification settings fields.
 * Validates nested notification preferences for email, push, and in-app channels.
 * Each channel has an enabled flag and a types object for granular control.
 *
 * @constant {Array} validateNotificationSettings
 * @property {boolean} [email.enabled] - Enable email notifications
 * @property {string} [email.frequency] - Email digest frequency ('immediate', 'hourly', 'daily', 'weekly')
 * @property {Object} [email.types] - Email notification types (playerUpdates, teamUpdates, etc.)
 * @property {boolean} [push.enabled] - Enable push notifications
 * @property {Object} [push.types] - Push notification types
 * @property {boolean} [inApp.enabled] - Enable in-app notifications
 * @property {boolean} [inApp.sound] - Enable notification sounds
 * @property {Object} [inApp.types] - In-app notification types
 */
const validateNotificationSettings = [
  body('email.enabled').optional().isBoolean().withMessage('Email enabled must be a boolean'),
  body('email.frequency').optional().isIn(['immediate', 'hourly', 'daily', 'weekly']).withMessage('Invalid email frequency'),
  body('email.types').optional().isObject().withMessage('Email types must be an object'),
  body('push.enabled').optional().isBoolean().withMessage('Push enabled must be a boolean'),
  body('push.types').optional().isObject().withMessage('Push types must be an object'),
  body('inApp.enabled').optional().isBoolean().withMessage('In-app enabled must be a boolean'),
  body('inApp.sound').optional().isBoolean().withMessage('In-app sound must be a boolean'),
  body('inApp.types').optional().isObject().withMessage('In-app types must be an object')
];

/**
 * @description Validation middleware for security settings fields.
 * Validates security-related preferences including 2FA, session management, and password policies.
 *
 * @constant {Array} validateSecuritySettings
 * @property {boolean} [twoFactorEnabled] - Enable two-factor authentication
 * @property {boolean} [loginNotifications] - Notify on new login
 * @property {number} [sessionTimeout] - Session timeout in minutes (5-1440, i.e., 5 min to 24 hours)
 * @property {number} [passwordExpiry] - Password expiration in days (30-365)
 * @property {boolean} [requirePasswordChange] - Require password change on next login
 */
const validateSecuritySettings = [
  body('twoFactorEnabled').optional().isBoolean().withMessage('Two-factor enabled must be a boolean'),
  body('loginNotifications').optional().isBoolean().withMessage('Login notifications must be a boolean'),
  body('sessionTimeout').optional().isInt({ min: 5, max: 1440 }).withMessage('Session timeout must be 5-1440 minutes'),
  body('passwordExpiry').optional().isInt({ min: 30, max: 365 }).withMessage('Password expiry must be 30-365 days'),
  body('requirePasswordChange').optional().isBoolean().withMessage('Require password change must be a boolean')
];

/**
 * @description Validation middleware for password change request.
 * Requires current password verification and enforces minimum password strength.
 * Includes custom validator for password confirmation matching.
 *
 * @constant {Array} validatePasswordChange
 * @property {string} currentPassword - Current password (min 6 characters)
 * @property {string} newPassword - New password (min 8 characters)
 * @property {string} confirmPassword - Must match newPassword exactly
 */
const validatePasswordChange = [
  body('currentPassword').isLength({ min: 6 }).withMessage('Current password must be at least 6 characters'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    // Validation: Ensure password confirmation matches the new password
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
];

/**
 * @description Validation middleware for privacy settings fields.
 * Validates user privacy preferences including profile visibility and data usage consent.
 *
 * @constant {Array} validatePrivacySettings
 * @property {string} [profileVisibility] - Who can see profile ('public', 'team', 'private')
 * @property {boolean} [showEmail] - Display email on profile
 * @property {boolean} [showPhone] - Display phone on profile
 * @property {boolean} [allowDataSharing] - Allow anonymous data sharing for improvements
 * @property {boolean} [allowAnalytics] - Allow usage analytics collection
 * @property {boolean} [allowMarketing] - Allow marketing communications
 */
const validatePrivacySettings = [
  body('profileVisibility').optional().isIn(['public', 'team', 'private']).withMessage('Invalid profile visibility'),
  body('showEmail').optional().isBoolean().withMessage('Show email must be a boolean'),
  body('showPhone').optional().isBoolean().withMessage('Show phone must be a boolean'),
  body('allowDataSharing').optional().isBoolean().withMessage('Allow data sharing must be a boolean'),
  body('allowAnalytics').optional().isBoolean().withMessage('Allow analytics must be a boolean'),
  body('allowMarketing').optional().isBoolean().withMessage('Allow marketing must be a boolean')
];

/**
 * @description Helper function to handle express-validator validation results.
 * Checks for validation errors and returns a 400 response with error details if any are found.
 * If validation passes, calls next() to continue to the route handler.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object|void} Returns 400 response on validation failure, otherwise calls next()
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/settings
 * @description Retrieves all user settings organized by category (general, account, notifications,
 *              security, privacy). Returns default values for any unset preferences, ensuring
 *              the frontend always receives a complete settings object.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Complete settings object
 * @returns {Object} response.data.general - UI preferences (theme, language, timezone, etc.)
 * @returns {Object} response.data.account - Profile information (name, email, phone, etc.)
 * @returns {Object} response.data.notifications - Notification preferences by channel
 * @returns {Object} response.data.security - Security settings (2FA, session timeout, etc.)
 * @returns {Object} response.data.privacy - Privacy preferences (visibility, data sharing, etc.)
 *
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database query failure
 *
 * @example
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "general": { "theme": "light", "language": "en", ... },
 *     "account": { "firstName": "John", "lastName": "Doe", ... },
 *     "notifications": { "email": {...}, "push": {...}, "inApp": {...} },
 *     "security": { "twoFactorEnabled": false, ... },
 *     "privacy": { "profileVisibility": "team", ... }
 *   }
 * }
 */
router.get('/', async (req, res) => {
  try {
    // Database: Fetch user with associated team information
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Business logic: Construct complete settings object with defaults for unset values
    // This ensures the frontend always receives a complete, consistent settings structure
    const settings = {
      // General settings: UI preferences stored in settings JSONB
      general: {
        theme: user.settings?.general?.theme || 'light',
        language: user.settings?.general?.language || 'en',
        timezone: user.settings?.general?.timezone || 'UTC',
        dateFormat: user.settings?.general?.dateFormat || 'MM/DD/YYYY',
        timeFormat: user.settings?.general?.timeFormat || '12h',
        autoRefresh: user.settings?.general?.autoRefresh || false,
        compactView: user.settings?.general?.compactView || false,
        showNotifications: user.settings?.general?.showNotifications || true
      },
      // Account settings: Mix of dedicated columns and settings JSONB
      account: {
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        profilePicture: user.profile_picture || null
      },
      // Notification settings: Deeply nested structure for granular control
      notifications: {
        email: {
          enabled: user.settings?.notifications?.email?.enabled ?? true,
          frequency: user.settings?.notifications?.email?.frequency || 'immediate',
          types: {
            playerUpdates: user.settings?.notifications?.email?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.email?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.email?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.email?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.email?.types?.systemUpdates ?? false,
            marketing: user.settings?.notifications?.email?.types?.marketing ?? false
          }
        },
        push: {
          enabled: user.settings?.notifications?.push?.enabled ?? true,
          types: {
            playerUpdates: user.settings?.notifications?.push?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.push?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.push?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.push?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.push?.types?.systemUpdates ?? false
          }
        },
        inApp: {
          enabled: user.settings?.notifications?.inApp?.enabled ?? true,
          sound: user.settings?.notifications?.inApp?.sound ?? true,
          types: {
            playerUpdates: user.settings?.notifications?.inApp?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.inApp?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.inApp?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.inApp?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.inApp?.types?.systemUpdates ?? true
          }
        }
      },
      // Security settings: Mix of dedicated column (two_factor_enabled) and JSONB
      security: {
        twoFactorEnabled: user.two_factor_enabled || false,
        loginNotifications: user.settings?.security?.loginNotifications ?? true,
        sessionTimeout: user.settings?.security?.sessionTimeout || 30,
        passwordExpiry: user.settings?.security?.passwordExpiry || 90,
        requirePasswordChange: user.settings?.security?.requirePasswordChange || false,
        loginHistory: user.settings?.security?.loginHistory || [],
        activeSessions: user.settings?.security?.activeSessions || []
      },
      // Privacy settings: User control over profile visibility and data usage
      privacy: {
        profileVisibility: user.settings?.privacy?.profileVisibility || 'team',
        showEmail: user.settings?.privacy?.showEmail || false,
        showPhone: user.settings?.privacy?.showPhone || false,
        allowDataSharing: user.settings?.privacy?.allowDataSharing || false,
        allowAnalytics: user.settings?.privacy?.allowAnalytics ?? true,
        allowMarketing: user.settings?.privacy?.allowMarketing || false
      }
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings'
    });
  }
});

/**
 * @route PUT /api/settings/general
 * @description Updates user's general/UI preferences. Supports partial updates - only
 *              provided fields are updated, preserving existing values for unspecified fields.
 *              Settings are stored in the user.settings.general JSONB structure.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateGeneralSettings - Validates field types and allowed values
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} [req.body.theme] - UI theme preference
 * @param {string} [req.body.language] - Language code ('en', 'es', 'fr')
 * @param {string} [req.body.timezone] - Timezone identifier
 * @param {string} [req.body.dateFormat] - Date display format
 * @param {string} [req.body.timeFormat] - Time format ('12h' or '24h')
 * @param {boolean} [req.body.autoRefresh] - Enable auto-refresh
 * @param {boolean} [req.body.compactView] - Enable compact view
 * @param {boolean} [req.body.showNotifications] - Show notifications
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated general settings object
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/general',
  validateGeneralSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Merge new settings with existing, preserving unspecified fields
      // Uses spread operator to layer updates over current values
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        general: {
          ...currentSettings.general,
          ...req.body
        }
      };

      // Database: Persist merged settings
      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'General settings updated successfully',
        data: updatedSettings.general
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Update general settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating general settings'
      });
    }
  }
);

/**
 * @route PUT /api/settings/account
 * @description Updates user's account/profile information. Supports partial updates.
 *              Email changes require uniqueness validation to prevent conflicts.
 *              Account fields are stored in dedicated User model columns (not JSONB).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateAccountSettings - Validates field formats and lengths
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} [req.body.firstName] - First name (1-50 chars)
 * @param {string} [req.body.lastName] - Last name (1-50 chars)
 * @param {string} [req.body.email] - Email address (must be unique)
 * @param {string} [req.body.phone] - Phone number
 * @param {string} [req.body.bio] - Biography (max 500 chars)
 * @param {string} [req.body.location] - Location (max 100 chars)
 * @param {string} [req.body.website] - Website URL
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated account information
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {400} Email in use - Email address is already registered to another user
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/account',
  validateAccountSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Validate email uniqueness if being changed
      // Prevents email conflicts with other registered users
      if (req.body.email && req.body.email !== user.email) {
        const existingUser = await User.findOne({
          where: { email: req.body.email }
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email address is already in use'
          });
        }
      }

      // Business logic: Build update object from provided fields only
      // Maps camelCase request body to snake_case database columns
      const updateData = {};
      if (req.body.firstName) updateData.first_name = req.body.firstName;
      if (req.body.lastName) updateData.last_name = req.body.lastName;
      if (req.body.email) updateData.email = req.body.email;
      if (req.body.phone) updateData.phone = req.body.phone;
      if (req.body.bio) updateData.bio = req.body.bio;
      if (req.body.location) updateData.location = req.body.location;
      if (req.body.website) updateData.website = req.body.website;

      // Database: Persist account changes
      await user.update(updateData);

      res.json({
        success: true,
        message: 'Account settings updated successfully',
        data: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          bio: user.bio,
          location: user.location,
          website: user.website,
          profilePicture: user.profile_picture
        }
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Update account settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating account settings'
      });
    }
  }
);

/**
 * @route PUT /api/settings/notifications
 * @description Updates user's notification preferences. Supports partial updates across
 *              email, push, and in-app notification channels. Each channel has an enabled
 *              flag and a types object for granular control over notification categories.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateNotificationSettings - Validates nested notification structure
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {Object} [req.body.email] - Email notification settings
 * @param {boolean} [req.body.email.enabled] - Enable email notifications
 * @param {string} [req.body.email.frequency] - Digest frequency
 * @param {Object} [req.body.email.types] - Notification type toggles
 * @param {Object} [req.body.push] - Push notification settings
 * @param {Object} [req.body.inApp] - In-app notification settings
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated notification settings
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/notifications',
  validateNotificationSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Merge new notification settings with existing
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        notifications: {
          ...currentSettings.notifications,
          ...req.body
        }
      };

      // Database: Persist merged settings
      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        data: updatedSettings.notifications
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Update notification settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating notification settings'
      });
    }
  }
);

/**
 * @route PUT /api/settings/security
 * @description Updates user's security preferences. Supports partial updates for
 *              session management, login notifications, and password policies.
 *              Note: Two-factor authentication has its own dedicated endpoint.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateSecuritySettings - Validates security preference values
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {boolean} [req.body.twoFactorEnabled] - Enable 2FA (use /two-factor endpoint instead)
 * @param {boolean} [req.body.loginNotifications] - Notify on new logins
 * @param {number} [req.body.sessionTimeout] - Session timeout (5-1440 minutes)
 * @param {number} [req.body.passwordExpiry] - Password expiry (30-365 days)
 * @param {boolean} [req.body.requirePasswordChange] - Force password change
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated security settings
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/security',
  validateSecuritySettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Merge new security settings with existing
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        security: {
          ...currentSettings.security,
          ...req.body
        }
      };

      // Database: Persist merged settings
      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Security settings updated successfully',
        data: updatedSettings.security
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Update security settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating security settings'
      });
    }
  }
);

/**
 * @route PUT /api/settings/change-password
 * @description Changes the user's password. Requires current password verification
 *              for security. New password is hashed with bcrypt (12 rounds) before storage.
 *              Updates password_changed_at timestamp for password policy enforcement.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validatePasswordChange - Validates password requirements and confirmation
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} req.body.currentPassword - Current password (min 6 chars)
 * @param {string} req.body.newPassword - New password (min 8 chars)
 * @param {string} req.body.confirmPassword - Must match newPassword
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {400} Validation failed - Password requirements not met
 * @throws {400} Incorrect password - Current password verification failed
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Password hashing or database failure
 */
router.put('/change-password',
  validatePasswordChange,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Database: Fetch current user record with password
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Security: Verify current password before allowing change
      // Prevents unauthorized password changes if session is hijacked
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Security: Hash new password with bcrypt (12 rounds for strong protection)
      // 12 rounds provides good security while maintaining reasonable performance
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Database: Update password and timestamp for policy tracking
      await user.update({
        password: hashedPassword,
        password_changed_at: new Date()
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Error changing password'
      });
    }
  }
);

/**
 * @route PUT /api/settings/two-factor
 * @description Enables or disables two-factor authentication for the user account.
 *              Note: This is a simplified toggle. A full implementation would require
 *              TOTP setup verification before enabling.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware body('enabled') - Validates boolean input
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {boolean} req.body.enabled - Whether to enable or disable 2FA
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status-specific success message
 * @returns {Object} response.data - Updated 2FA status
 * @returns {boolean} response.data.twoFactorEnabled - Current 2FA state
 *
 * @throws {400} Validation failed - enabled must be a boolean
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/two-factor',
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { enabled } = req.body;

      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Database: Update 2FA status in dedicated column
      await user.update({ two_factor_enabled: enabled });

      res.json({
        success: true,
        message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`,
        data: { twoFactorEnabled: enabled }
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Toggle two-factor error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating two-factor authentication'
      });
    }
  }
);

/**
 * @route GET /api/settings/two-factor/qr
 * @description Generates a QR code for setting up two-factor authentication.
 *              Returns a base64-encoded QR code image and the TOTP secret for manual entry.
 *              Note: This is a mock implementation - production should use a real TOTP library.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - 2FA setup data
 * @returns {string} response.data.qrCode - Base64-encoded QR code image (data URI)
 * @returns {string} response.data.secret - TOTP secret for manual authenticator entry
 *
 * @throws {500} Server error - QR code generation failure
 *
 * @todo Implement real TOTP secret generation using speakeasy or otplib
 * @todo Generate actual QR code using qrcode library
 * @todo Store secret temporarily until verification, then persist
 */
router.get('/two-factor/qr', async (req, res) => {
  try {
    // Business logic: Generate 2FA setup data
    // Note: Mock implementation - production should use real TOTP library (speakeasy, otplib)
    // and generate unique secrets per user with proper QR code generation
    res.json({
      success: true,
      data: {
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        secret: 'JBSWY3DPEHPK3PXP'
      }
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get two-factor QR error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating QR code'
    });
  }
});

/**
 * @route POST /api/settings/two-factor/verify
 * @description Verifies a TOTP code during two-factor authentication setup.
 *              User must enter the 6-digit code from their authenticator app.
 *              Note: This is a mock implementation - production should validate against stored secret.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware body('code') - Validates 6-character code
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} req.body.code - 6-digit TOTP verification code
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Verification result message
 *
 * @throws {400} Validation failed - Code must be exactly 6 characters
 * @throws {400} Invalid code - TOTP verification failed
 * @throws {500} Server error - Verification process failure
 *
 * @todo Implement real TOTP verification using speakeasy or otplib
 * @todo Verify against user's stored secret, not hardcoded value
 */
router.post('/two-factor/verify',
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.body;

      // Business logic: Verify TOTP code
      // Note: Mock implementation - production should use real TOTP verification
      // with user's stored secret and time-based validation window
      if (code === '123456') {
        res.json({
          success: true,
          message: 'Two-factor authentication verified successfully'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
      }
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Verify two-factor error:', error);
      res.status(500).json({
        success: false,
        message: 'Error verifying two-factor code'
      });
    }
  }
);

/**
 * @route GET /api/settings/login-history
 * @description Retrieves the user's recent login history including timestamps, locations,
 *              devices, and success/failure status. Useful for security auditing.
 *              Note: This is a mock implementation - production should track actual logins.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of login history entries
 * @returns {number} response.data[].id - Login entry ID
 * @returns {string} response.data[].timestamp - ISO 8601 timestamp
 * @returns {string} response.data[].ip - Client IP address
 * @returns {string} response.data[].location - Geolocation (city, state)
 * @returns {string} response.data[].device - Browser and OS information
 * @returns {boolean} response.data[].success - Whether login was successful
 *
 * @throws {500} Server error - Database query failure
 *
 * @todo Implement real login tracking with IP geolocation
 * @todo Store login attempts in dedicated LoginHistory model
 * @todo Add pagination for long history
 */
router.get('/login-history', async (req, res) => {
  try {
    // Business logic: Fetch login history
    // Note: Mock implementation - production should query LoginHistory table
    // with user_id filter and include IP geolocation data
    const loginHistory = [
      {
        id: 1,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        ip: '192.168.1.1',
        location: 'New York, NY',
        device: 'Chrome on Windows',
        success: true
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        ip: '192.168.1.1',
        location: 'New York, NY',
        device: 'Chrome on Windows',
        success: true
      },
      {
        id: 3,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        ip: '10.0.0.1',
        location: 'Los Angeles, CA',
        device: 'Safari on iPhone',
        success: false
      }
    ];

    res.json({
      success: true,
      data: loginHistory
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching login history'
    });
  }
});

/**
 * @route GET /api/settings/export-data
 * @description Exports all user data in JSON format for GDPR/privacy compliance.
 *              Includes profile information, team association, and all settings.
 *              Returns as downloadable file attachment.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response - JSON file download
 * @returns {Object} response.user - User profile data
 * @returns {Object} response.team - Associated team data (if any)
 * @returns {Object} response.settings - Complete settings object
 * @returns {string} response.exportDate - ISO 8601 export timestamp
 *
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Data export generation failure
 *
 * @header Content-Type: application/json
 * @header Content-Disposition: attachment; filename="user-data-{userId}-{timestamp}.json"
 *
 * @todo Include additional user-generated content (reports, notes, etc.)
 * @todo Add option for different export formats (CSV, XML)
 */
router.get('/export-data', async (req, res) => {
  try {
    // Database: Fetch user with team association
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Business logic: Compile comprehensive data export
    // Excludes sensitive data (password hash, internal IDs where appropriate)
    const userData = {
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: user.location,
        website: user.website,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      team: user.Team ? {
        id: user.Team.id,
        name: user.Team.name,
        programName: user.Team.program_name
      } : null,
      settings: user.settings,
      exportDate: new Date().toISOString()
    };

    // Business logic: Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${user.id}-${Date.now()}.json"`);
    res.json(userData);
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting user data'
    });
  }
});

/**
 * @route DELETE /api/settings/account
 * @description Permanently deletes the user's account. Requires explicit confirmation
 *              by passing "DELETE" as the confirmation value. This is a destructive
 *              operation that cannot be undone.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware body('confirmation') - Requires exactly "DELETE" as value
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} req.body.confirmation - Must be exactly "DELETE" to confirm
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {400} Validation failed - Confirmation must be exactly "DELETE"
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Account deletion failure
 *
 * @todo Consider soft-delete for data retention policies
 * @todo Send confirmation email before deletion
 * @todo Add audit logging for compliance
 * @todo Handle cascading deletion of user-owned resources
 */
router.delete('/account',
  body('confirmation').equals('DELETE').withMessage('Confirmation must be exactly "DELETE"'),
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch user record to delete
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Permanently delete user account
      // Note: Consider implementing these improvements:
      // 1. Archive the user data instead of deleting for audit trails
      // 2. Send a confirmation email before/after deletion
      // 3. Log the deletion for compliance auditing
      // 4. Handle cascading deletion of user-created content
      await user.destroy();

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting account'
      });
    }
  }
);

/**
 * @route PUT /api/settings/profile-picture
 * @description Updates the user's profile picture. Currently a stub implementation
 *              that generates a mock URL. Production implementation should handle
 *              actual file upload with proper processing and cloud storage.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {File} req.file - Profile picture file (multipart/form-data)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated profile picture data
 * @returns {string} response.data.profilePicture - URL of uploaded picture
 *
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Upload or processing failure
 *
 * @todo Implement file upload handling with multer middleware
 * @todo Add image processing (resize, crop, optimize)
 * @todo Integrate cloud storage (S3, Cloudinary, etc.)
 * @todo Validate file type and size limits
 * @todo Delete old profile picture when updating
 */
router.put('/profile-picture', async (req, res) => {
  try {
    // Note: Production implementation should:
    // 1. Handle file upload using multer or similar middleware
    // 2. Validate file type (JPEG, PNG, GIF, WebP)
    // 3. Enforce file size limits (e.g., 5MB max)
    // 4. Process and resize the image to standard dimensions
    // 5. Store in cloud storage (S3, Cloudinary, etc.)
    // 6. Delete old profile picture to free storage

    // Database: Fetch current user record
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Business logic: Generate mock profile picture URL
    // Production should return actual uploaded file URL from cloud storage
    const profilePictureUrl = `/uploads/profile-pictures/${user.id}-${Date.now()}.jpg`;

    // Database: Update user's profile picture URL
    await user.update({ profile_picture: profilePictureUrl });

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: { profilePicture: profilePictureUrl }
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading profile picture'
    });
  }
});

/**
 * @route GET /api/settings/privacy
 * @description Retrieves user's current privacy settings. Returns defaults for any
 *              unset preferences. Separate from main settings GET for focused access.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Privacy settings
 * @returns {string} response.data.profileVisibility - 'public', 'team', or 'private'
 * @returns {boolean} response.data.showEmail - Display email publicly
 * @returns {boolean} response.data.showPhone - Display phone publicly
 * @returns {boolean} response.data.allowDataSharing - Allow anonymous data sharing
 * @returns {boolean} response.data.allowAnalytics - Allow usage analytics
 * @returns {boolean} response.data.allowMarketing - Allow marketing communications
 *
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database query failure
 */
router.get('/privacy', async (req, res) => {
  try {
    // Database: Fetch current user record
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Business logic: Return privacy settings with sensible defaults
    // Default visibility is 'team' for balanced privacy
    const privacySettings = user.settings?.privacy || {
      profileVisibility: 'team',
      showEmail: false,
      showPhone: false,
      allowDataSharing: false,
      allowAnalytics: true,
      allowMarketing: false
    };

    res.json({
      success: true,
      data: privacySettings
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching privacy settings'
    });
  }
});

/**
 * @route PUT /api/settings/privacy
 * @description Updates user's privacy settings. Supports partial updates - only
 *              provided fields are updated, preserving existing values.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validatePrivacySettings - Validates privacy field values
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {string} [req.body.profileVisibility] - 'public', 'team', or 'private'
 * @param {boolean} [req.body.showEmail] - Display email on profile
 * @param {boolean} [req.body.showPhone] - Display phone on profile
 * @param {boolean} [req.body.allowDataSharing] - Allow anonymous data sharing
 * @param {boolean} [req.body.allowAnalytics] - Allow usage analytics
 * @param {boolean} [req.body.allowMarketing] - Allow marketing emails
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated privacy settings
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 */
router.put('/privacy',
  validatePrivacySettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Database: Fetch current user record
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Business logic: Merge new privacy settings with existing
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        privacy: {
          ...currentSettings.privacy,
          ...req.body
        }
      };

      // Database: Persist merged settings
      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Privacy settings updated successfully',
        data: updatedSettings.privacy
      });
    } catch (error) {
      // Error: Log and return generic server error to avoid exposing internal details
      console.error('Update privacy settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating privacy settings'
      });
    }
  }
);

/**
 * @route GET /api/settings/notifications/preferences
 * @description Retrieves notification preferences organized by channel (email, push, in-app).
 *              Returns default preferences structure. This endpoint provides a simpler view
 *              compared to the full notifications settings in the main settings object.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Notification preferences
 * @returns {Object} response.data.email - Email channel settings
 * @returns {Object} response.data.push - Push notification settings
 * @returns {Object} response.data.inApp - In-app notification settings
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/notifications/preferences', async (req, res) => {
  try {
    // Database: Fetch user for personalized preferences
    // Note: Currently returns defaults, should read from user.settings.notifications
    const user = await User.findByPk(req.user.id);

    // Business logic: Return notification preferences structure
    // Simplified view with reports, schedules, games, players categories
    const preferences = {
      email: {
        enabled: true,
        frequency: 'daily',
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      },
      push: {
        enabled: false,
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      },
      inApp: {
        enabled: true,
        sound: true,
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      }
    };

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification preferences'
    });
  }
});

/**
 * @route PUT /api/settings/notifications/preferences
 * @description Updates notification preferences. Currently a stub that returns success
 *              without persisting. Production should save to user.settings.notifications.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateNotificationSettings - Validates notification structure
 * @middleware handleValidationErrors - Returns 400 on validation failure
 *
 * @param {Object} req.body - Notification preferences (see validateNotificationSettings)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Submitted preferences (echoed back)
 *
 * @throws {400} Validation failed - Invalid notification settings structure
 * @throws {500} Server error - Database update failure
 *
 * @todo Persist preferences to user.settings.notifications
 */
router.put('/notifications/preferences', validateNotificationSettings, handleValidationErrors, async (req, res) => {
  try {
    // Database: Fetch user (not currently used but available for implementation)
    const user = await User.findByPk(req.user.id);

    // Note: Production should persist these preferences to user.settings.notifications
    // Currently just returns success without saving
    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: req.body
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification preferences'
    });
  }
});

/**
 * @route POST /api/settings/notifications/test-email
 * @description Sends a test email to the authenticated user's email address to verify
 *              email notification delivery is working correctly. Uses the emailService
 *              for consistent email formatting and delivery.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Result message
 *
 * @throws {500} Server error - Email service failure with error details
 */
router.post('/notifications/test-email', async (req, res) => {
  try {
    // Database: Get user's email address
    const user = await User.findByPk(req.user.id);

    // Business logic: Send test email via email service
    const result = await emailService.testEmail(user.email);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } else {
      // Error: Email service returned failure
      res.status(500).json({
        success: false,
        message: 'Failed to send test email: ' + result.error
      });
    }
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending test email'
    });
  }
});

/**
 * @route GET /api/settings/sessions
 * @description Retrieves list of active sessions for the authenticated user. Shows
 *              current session and any other devices where user is logged in.
 *              Note: Mock implementation - production should track actual sessions.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of active sessions
 * @returns {string} response.data[].id - Session identifier
 * @returns {string} response.data[].device - Device/browser description
 * @returns {string} response.data[].location - Session location
 * @returns {string} response.data[].ip_address - Client IP address
 * @returns {string} response.data[].last_activity - ISO 8601 timestamp
 * @returns {boolean} response.data[].is_current - Whether this is the current session
 *
 * @throws {500} Server error - Session retrieval failure
 *
 * @todo Implement real session tracking with JWT blacklist
 * @todo Store sessions in Redis or database
 * @todo Add endpoint to revoke individual sessions
 * @todo Include device fingerprinting for better identification
 */
router.get('/sessions', async (req, res) => {
  try {
    // Business logic: Return active sessions
    // Note: Mock implementation - production should:
    // 1. Track sessions in Redis or database with JWT IDs
    // 2. Use device fingerprinting for identification
    // 3. Store IP geolocation data
    // 4. Support session revocation
    const sessions = [
      {
        id: 'current-session',
        device: 'Web Browser',
        location: 'Unknown',
        ip_address: req.ip,
        last_activity: new Date().toISOString(),
        is_current: true
      }
    ];

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active sessions'
    });
  }
});

module.exports = router;
