/**
 * @fileoverview Privacy settings routes for managing user privacy preferences.
 * Handles updates to user's privacy settings including profile visibility and data sharing options.
 *
 * Privacy Settings Model:
 * - Stored in user.settings.privacy JSONB column
 * - Includes profile visibility, email/phone display, and data sharing consent options
 * - Supports partial updates - only provided fields are updated
 * - Merges new settings with existing settings to preserve unspecified fields
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * Users can only modify their own settings (enforced via req.user.id).
 *
 * @module routes/settings/privacy
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 * @requires ./validators
 * @requires ./helpers
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { User } = require('../../models');
const { validatePrivacySettings } = require('./validators');
const { handleValidationErrors } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
 *
 * @example
 * // Request
 * GET /api/settings/privacy
 *
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "profileVisibility": "team",
 *     "showEmail": false,
 *     "showPhone": false,
 *     "allowDataSharing": false,
 *     "allowAnalytics": true,
 *     "allowMarketing": false
 *   }
 * }
 */
router.get('/', async (req, res) => {
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
 *
 * @example
 * // Request
 * PUT /api/settings/privacy
 * {
 *   "profileVisibility": "private",
 *   "showEmail": false,
 *   "allowAnalytics": false
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Privacy settings updated successfully",
 *   "data": {
 *     "profileVisibility": "private",
 *     "showEmail": false,
 *     "showPhone": false,
 *     "allowDataSharing": false,
 *     "allowAnalytics": false,
 *     "allowMarketing": false
 *   }
 * }
 */
router.put('/',
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

module.exports = router;
