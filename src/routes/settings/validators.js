/**
 * @fileoverview Shared validation middleware for settings routes.
 * Provides reusable validation chains for general, account, notification, security, and privacy settings.
 *
 * @module routes/settings/validators
 * @requires express-validator
 * @requires ../../utils/passwordValidator
 */

const { body } = require('express-validator');
const { newPasswordCamelValidator } = require('../../utils/passwordValidator');

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
  newPasswordCamelValidator,
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
 * @description Validation middleware for two-factor authentication toggle.
 * Validates that the enabled field is a boolean value.
 *
 * @constant {Array} validateTwoFactor
 * @property {boolean} enabled - Whether to enable or disable 2FA
 */
const validateTwoFactor = [
  body('enabled').isBoolean().withMessage('Enabled must be a boolean')
];

/**
 * @description Validation middleware for two-factor authentication verification code.
 * Validates that the code is exactly 6 characters long.
 *
 * @constant {Array} validateTwoFactorVerify
 * @property {string} code - 6-digit TOTP verification code
 */
const validateTwoFactorVerify = [
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 characters')
];

/**
 * @description Validation middleware for account deletion confirmation.
 * Requires the user to type exactly "DELETE" to confirm permanent account deletion.
 *
 * @constant {Array} validateAccountDeletion
 * @property {string} confirmation - Must be exactly "DELETE" to confirm
 */
const validateAccountDeletion = [
  body('confirmation').equals('DELETE').withMessage('Confirmation must be exactly "DELETE"')
];

module.exports = {
  validateGeneralSettings,
  validateAccountSettings,
  validateNotificationSettings,
  validateSecuritySettings,
  validatePasswordChange,
  validatePrivacySettings,
  validateTwoFactor,
  validateTwoFactorVerify,
  validateAccountDeletion
};
