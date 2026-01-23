/**
 * @fileoverview Account settings routes for managing profile information and account operations.
 * Handles updates to user's account information, profile picture, account deletion, and data export.
 *
 * Account Settings Model:
 * - Account fields (firstName, lastName, email, phone, bio, location, website) are stored in dedicated User model columns
 * - Profile picture URL is stored in user.profile_picture column
 * - Email changes require uniqueness validation to prevent conflicts
 * - Account deletion is permanent and requires explicit "DELETE" confirmation
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * Users can only modify their own account (enforced via req.user.id).
 *
 * @module routes/settings/account
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 * @requires ./validators
 * @requires ./helpers
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { User, Team } = require('../../models');
const { validateAccountSettings, validateAccountDeletion } = require('./validators');
const { handleValidationErrors } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
 *
 * @example
 * // Request
 * PUT /api/settings/account
 * {
 *   "firstName": "John",
 *   "lastName": "Doe",
 *   "bio": "Head coach with 10 years experience"
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Account settings updated successfully",
 *   "data": {
 *     "firstName": "John",
 *     "lastName": "Doe",
 *     "email": "john@example.com",
 *     "phone": "555-1234",
 *     "bio": "Head coach with 10 years experience",
 *     "location": "New York",
 *     "website": "https://example.com",
 *     "profilePicture": "/uploads/profile-pictures/123-456.jpg"
 *   }
 * }
 */
router.put('/',
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
      if (req.body.firstName) {
        updateData.first_name = req.body.firstName;
      }
      if (req.body.lastName) {
        updateData.last_name = req.body.lastName;
      }
      if (req.body.email) {
        updateData.email = req.body.email;
      }
      if (req.body.phone) {
        updateData.phone = req.body.phone;
      }
      if (req.body.bio) {
        updateData.bio = req.body.bio;
      }
      if (req.body.location) {
        updateData.location = req.body.location;
      }
      if (req.body.website) {
        updateData.website = req.body.website;
      }

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
 * @route PUT /api/settings/account/profile-picture
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
 *
 * @example
 * // Request
 * PUT /api/settings/account/profile-picture
 * Content-Type: multipart/form-data
 * file: [binary data]
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Profile picture updated successfully",
 *   "data": {
 *     "profilePicture": "/uploads/profile-pictures/123-1672531200000.jpg"
 *   }
 * }
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
 * @route DELETE /api/settings/account
 * @description Permanently deletes the user's account. Requires explicit confirmation
 *              by passing "DELETE" as the confirmation value. This is a destructive
 *              operation that cannot be undone.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateAccountDeletion - Requires exactly "DELETE" as value
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
 *
 * @example
 * // Request
 * DELETE /api/settings/account
 * {
 *   "confirmation": "DELETE"
 * }
 *
 * // Response
 * {
 *   "success": true,
 *   "message": "Account deleted successfully"
 * }
 */
router.delete('/',
  validateAccountDeletion,
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
 * @route GET /api/settings/account/export-data
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
 *
 * @example
 * // Request
 * GET /api/settings/account/export-data
 *
 * // Response (with download headers)
 * {
 *   "user": {
 *     "id": 123,
 *     "firstName": "John",
 *     "lastName": "Doe",
 *     "email": "john@example.com",
 *     ...
 *   },
 *   "team": {
 *     "id": 456,
 *     "name": "Eagles",
 *     "programName": "Eagles Baseball"
 *   },
 *   "settings": {...},
 *   "exportDate": "2026-01-02T21:15:00.000Z"
 * }
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

module.exports = router;
