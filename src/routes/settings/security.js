/**
 * @fileoverview Security settings routes for managing security preferences and authentication.
 * Handles updates to user's security settings including 2FA, password changes, session management, and login history.
 *
 * Security Settings Model:
 * - Security preferences stored in user.settings.security JSONB column
 * - Two-factor authentication status stored in dedicated user.two_factor_enabled column
 * - Password stored in user.password column (bcrypt hashed, 12 rounds)
 * - Password change timestamp in user.password_changed_at column
 * - Supports partial updates - only provided fields are updated
 * - Merges new settings with existing settings to preserve unspecified fields
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * Users can only modify their own security settings (enforced via req.user.id).
 *
 * @module routes/settings/security
 * @requires express
 * @requires bcryptjs
 * @requires ../../middleware/auth
 * @requires ../../models
 * @requires ./validators
 * @requires ./helpers
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { protect } = require('../../middleware/auth');
const { User } = require('../../models');
const {
  validateSecuritySettings,
  validatePasswordChange,
  validateTwoFactor,
  validateTwoFactorVerify
} = require('./validators');
const { handleValidationErrors } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
 *
 * @example
 * // Request
 * PUT /api/settings/security
 * {
 *   "loginNotifications": true,
 *   "sessionTimeout": 60,
 *   "passwordExpiry": 90
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Security settings updated successfully",
 *   "data": {
 *     "loginNotifications": true,
 *     "sessionTimeout": 60,
 *     "passwordExpiry": 90,
 *     "requirePasswordChange": false
 *   }
 * }
 */
router.put('/',
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
 * @route PUT /api/settings/security/change-password
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
 *
 * @example
 * // Request
 * PUT /api/settings/security/change-password
 * {
 *   "currentPassword": "oldPassword123",
 *   "newPassword": "newPassword456!",
 *   "confirmPassword": "newPassword456!"
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Password changed successfully"
 * }
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
 * @route PUT /api/settings/security/two-factor
 * @description Enables or disables two-factor authentication for the user account.
 *              Note: This is a simplified toggle. A full implementation would require
 *              TOTP setup verification before enabling.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateTwoFactor - Validates boolean input
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
 *
 * @example
 * // Request
 * PUT /api/settings/security/two-factor
 * {
 *   "enabled": true
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Two-factor authentication enabled successfully",
 *   "data": {
 *     "twoFactorEnabled": true
 *   }
 * }
 */
router.put('/two-factor',
  validateTwoFactor,
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
 * @route GET /api/settings/security/two-factor/qr
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
 *
 * @example
 * // Request
 * GET /api/settings/security/two-factor/qr
 *
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "qrCode": "data:image/png;base64,iVBORw0KGgo...",
 *     "secret": "JBSWY3DPEHPK3PXP"
 *   }
 * }
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
 * @route POST /api/settings/security/two-factor/verify
 * @description Verifies a TOTP code during two-factor authentication setup.
 *              User must enter the 6-digit code from their authenticator app.
 *              Note: This is a mock implementation - production should validate against stored secret.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateTwoFactorVerify - Validates 6-character code
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
 *
 * @example
 * // Request
 * POST /api/settings/security/two-factor/verify
 * {
 *   "code": "123456"
 * }
 *
 * // Response (Success)
 * {
 *   "success": true,
 *   "message": "Two-factor authentication verified successfully"
 * }
 *
 * // Response (Failure)
 * {
 *   "success": false,
 *   "message": "Invalid verification code"
 * }
 */
router.post('/two-factor/verify',
  validateTwoFactorVerify,
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
 * @route GET /api/settings/security/login-history
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
 *
 * @example
 * // Request
 * GET /api/settings/security/login-history
 *
 * // Response
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": 1,
 *       "timestamp": "2024-01-02T10:30:00.000Z",
 *       "ip": "192.168.1.1",
 *       "location": "New York, NY",
 *       "device": "Chrome on Windows",
 *       "success": true
 *     },
 *     {
 *       "id": 2,
 *       "timestamp": "2024-01-01T15:20:00.000Z",
 *       "ip": "10.0.0.1",
 *       "location": "Los Angeles, CA",
 *       "device": "Safari on iPhone",
 *       "success": false
 *     }
 *   ]
 * }
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
 * @route GET /api/settings/security/sessions
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
 *
 * @example
 * // Request
 * GET /api/settings/security/sessions
 *
 * // Response
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "current-session",
 *       "device": "Web Browser",
 *       "location": "Unknown",
 *       "ip_address": "192.168.1.100",
 *       "last_activity": "2024-01-02T12:00:00.000Z",
 *       "is_current": true
 *     }
 *   ]
 * }
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
