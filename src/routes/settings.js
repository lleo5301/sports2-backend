/**
 * @fileoverview Settings routes - Re-export from modular structure.
 * This file maintains backward compatibility with existing imports while
 * the actual implementation is now split into domain-specific modules
 * in the settings/ directory.
 *
 * The settings functionality is now organized as follows:
 * - settings/index.js - Main settings retrieval (consolidated GET / endpoint)
 * - settings/general.js - General/UI settings (theme, language, timezone, date/time formats)
 * - settings/account.js - Account management (profile info, profile picture, account deletion, data export)
 * - settings/notifications.js - Notification preferences (email, push, in-app notifications)
 * - settings/security.js - Security settings (password change, 2FA, sessions, login history)
 * - settings/privacy.js - Privacy controls (profile visibility, data sharing, analytics, marketing)
 * - settings/validators.js - Shared validation rules
 * - settings/helpers.js - Shared helper functions (validation error handling)
 *
 * @module routes/settings
 */

module.exports = require('./settings/index');
