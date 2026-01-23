/**
 * @fileoverview Notification settings routes for managing notification preferences and testing.
 * Handles updates to user's notification preferences across email, push, and in-app channels.
 *
 * Notification Settings Model:
 * - Stored in user.settings.notifications JSONB column
 * - Includes email, push, and in-app channel configurations
 * - Each channel has an enabled flag and types object for granular control
 * - Supports partial updates - only provided fields are updated
 * - Merges new settings with existing settings to preserve unspecified fields
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * Users can only modify their own settings (enforced via req.user.id).
 *
 * @module routes/settings/notifications
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 * @requires ../../services/emailService
 * @requires ./validators
 * @requires ./helpers
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { User } = require('../../models');
const emailService = require('../../services/emailService');
const { validateNotificationSettings } = require('./validators');
const { handleValidationErrors } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
 * @param {string} [req.body.email.frequency] - Digest frequency ('immediate', 'hourly', 'daily', 'weekly')
 * @param {Object} [req.body.email.types] - Notification type toggles
 * @param {Object} [req.body.push] - Push notification settings
 * @param {boolean} [req.body.push.enabled] - Enable push notifications
 * @param {Object} [req.body.push.types] - Push notification type toggles
 * @param {Object} [req.body.inApp] - In-app notification settings
 * @param {boolean} [req.body.inApp.enabled] - Enable in-app notifications
 * @param {boolean} [req.body.inApp.sound] - Enable notification sounds
 * @param {Object} [req.body.inApp.types] - In-app notification type toggles
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated notification settings
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - User account no longer exists
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request
 * PUT /api/settings/notifications
 * {
 *   "email": {
 *     "enabled": true,
 *     "frequency": "daily",
 *     "types": {
 *       "playerUpdates": true,
 *       "teamUpdates": true
 *     }
 *   },
 *   "push": {
 *     "enabled": false
 *   }
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Notification settings updated successfully",
 *   "data": {
 *     "email": {
 *       "enabled": true,
 *       "frequency": "daily",
 *       "types": {...}
 *     },
 *     "push": {
 *       "enabled": false,
 *       "types": {...}
 *     },
 *     "inApp": {...}
 *   }
 * }
 */
router.put('/',
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
 * @returns {boolean} response.data.email.enabled - Email notifications enabled
 * @returns {string} response.data.email.frequency - Email digest frequency
 * @returns {Object} response.data.email.types - Email notification types
 * @returns {Object} response.data.push - Push notification settings
 * @returns {boolean} response.data.push.enabled - Push notifications enabled
 * @returns {Object} response.data.push.types - Push notification types
 * @returns {Object} response.data.inApp - In-app notification settings
 * @returns {boolean} response.data.inApp.enabled - In-app notifications enabled
 * @returns {boolean} response.data.inApp.sound - Notification sound enabled
 * @returns {Object} response.data.inApp.types - In-app notification types
 *
 * @throws {500} Server error - Database query failure
 *
 * @example
 * // Request
 * GET /api/settings/notifications/preferences
 *
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "email": {
 *       "enabled": true,
 *       "frequency": "daily",
 *       "types": {
 *         "reports": true,
 *         "schedules": true,
 *         "games": true,
 *         "players": true
 *       }
 *     },
 *     "push": {
 *       "enabled": false,
 *       "types": {
 *         "reports": true,
 *         "schedules": true,
 *         "games": true,
 *         "players": true
 *       }
 *     },
 *     "inApp": {
 *       "enabled": true,
 *       "sound": true,
 *       "types": {
 *         "reports": true,
 *         "schedules": true,
 *         "games": true,
 *         "players": true
 *       }
 *     }
 *   }
 * }
 */
router.get('/preferences', async (req, res) => {
  try {
    // Database: Fetch user for personalized preferences
    // Note: Currently returns defaults, should read from user.settings.notifications
    const _user = await User.findByPk(req.user.id);

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
 *
 * @example
 * // Request
 * PUT /api/settings/notifications/preferences
 * {
 *   "email": {
 *     "enabled": true,
 *     "frequency": "weekly",
 *     "types": {
 *       "reports": true,
 *       "schedules": false,
 *       "games": true,
 *       "players": true
 *     }
 *   }
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Notification preferences updated successfully",
 *   "data": {
 *     "email": {
 *       "enabled": true,
 *       "frequency": "weekly",
 *       "types": {...}
 *     }
 *   }
 * }
 */
router.put('/preferences', validateNotificationSettings, handleValidationErrors, async (req, res) => {
  try {
    // Database: Fetch user (not currently used but available for implementation)
    const _user = await User.findByPk(req.user.id);

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
 *
 * @example
 * // Request
 * POST /api/settings/notifications/test-email
 *
 * // Response (Success)
 * {
 *   "success": true,
 *   "message": "Test email sent successfully"
 * }
 *
 * // Response (Failure)
 * {
 *   "success": false,
 *   "message": "Failed to send test email: SMTP connection failed"
 * }
 */
router.post('/test-email', async (req, res) => {
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

module.exports = router;
