/**
 * @fileoverview Main settings routes module.
 * Provides a consolidated GET endpoint for all user settings and mounts sub-routers for
 * specific settings categories (general, account, notifications, security, privacy).
 *
 * All routes require authentication via the protect middleware. Settings are stored using
 * a hybrid approach: dedicated User model columns for core account fields (email, name, etc.)
 * and a JSONB column (user.settings) for flexible preference storage.
 *
 * Key features:
 * - Consolidated settings retrieval (GET /)
 * - General/UI preferences (via general sub-router)
 * - Account management (via account sub-router)
 * - Notification preferences (via notifications sub-router)
 * - Security settings (via security sub-router)
 * - Privacy controls (via privacy sub-router)
 *
 * @module routes/settings
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { User, Team } = require('../../models');

// Import sub-routers for domain-specific functionality
const generalRouter = require('./general');
const accountRouter = require('./account');
const notificationsRouter = require('./notifications');
const securityRouter = require('./security');
const privacyRouter = require('./privacy');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

// Mount sub-routers for domain-specific settings management
// Each sub-router handles a specific category of user preferences
router.use('/general', generalRouter);
router.use('/account', accountRouter);
router.use('/notifications', notificationsRouter);
router.use('/security', securityRouter);
router.use('/privacy', privacyRouter);

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

module.exports = router;
