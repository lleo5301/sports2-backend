/**
 * @fileoverview General settings routes for managing UI preferences and display options.
 * Handles updates to user's general/UI preferences including theme, language, timezone, and display formats.
 *
 * General Settings Model:
 * - Stored in user.settings.general JSONB column
 * - Includes theme, language, timezone, date/time formats, and UI display preferences
 * - Supports partial updates - only provided fields are updated
 * - Merges new settings with existing settings to preserve unspecified fields
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * Users can only modify their own settings (enforced via req.user.id).
 *
 * @module routes/settings/general
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 * @requires ./validators
 * @requires ./helpers
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { User } = require('../../models');
const { validateGeneralSettings } = require('./validators');
const { handleValidationErrors } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
 *
 * @example
 * // Request
 * PUT /api/settings/general
 * {
 *   "theme": "dark",
 *   "language": "en",
 *   "timeFormat": "24h"
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "General settings updated successfully",
 *   "data": {
 *     "theme": "dark",
 *     "language": "en",
 *     "timezone": "UTC",
 *     "dateFormat": "MM/DD/YYYY",
 *     "timeFormat": "24h",
 *     "autoRefresh": false,
 *     "compactView": false,
 *     "showNotifications": true
 *   }
 * }
 */
router.put('/',
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

module.exports = router;
