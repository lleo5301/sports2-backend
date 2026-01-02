/**
 * @fileoverview Branding management routes for teams.
 * Handles logo upload/deletion and brand color management.
 * All routes enforce team isolation - users can only modify their own team's branding.
 *
 * Key permission requirements:
 * - Logo upload/delete: Restricted to super_admin and head_coach roles
 * - Brand color updates: Restricted to super_admin and head_coach roles
 * - Branding retrieval: All authenticated users
 *
 * @module routes/teams/branding
 * @requires express
 * @requires express-validator
 * @requires path
 * @requires fs
 * @requires ../../middleware/auth
 * @requires ../../middleware/upload
 * @requires ../../models
 */

const express = require('express');
const { body } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { protect } = require('../../middleware/auth');
const { uploadLogo, handleUploadError, logosDir } = require('../../middleware/upload');
const { Team } = require('../../models');
const { canModifyBranding } = require('./helpers');
const { handleValidationErrors } = require('./validators');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route POST /api/teams/logo
 * @description Uploads a new team logo image. Restricted to super_admin and head_coach roles.
 *              Accepts image files via multipart/form-data. If a logo already exists,
 *              the old file is deleted before saving the new one.
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 * @middleware canModifyBranding - Role check (inline)
 * @middleware uploadLogo - Multer middleware for image upload
 * @middleware handleUploadError - Upload error handler
 *
 * @param {File} req.file - Logo image file (via multipart/form-data)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Logo URL data
 * @returns {string} response.data.logo_url - Path to the uploaded logo
 *
 * @throws {400} Bad request - No logo file provided
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - File or database operation failure
 */
router.post('/logo',
  // Permission: Only super_admin and head_coach can modify team branding
  (req, res, next) => {
    if (!canModifyBranding(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admins and head coaches can update team branding'
      });
    }
    next();
  },
  uploadLogo,
  handleUploadError,
  async (req, res) => {
    try {
      // Validation: Ensure a file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No logo file provided'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // File cleanup: Delete old logo file if it exists
      if (team.school_logo_url) {
        const oldLogoPath = path.join(logosDir, path.basename(team.school_logo_url));
        try {
          if (fs.existsSync(oldLogoPath)) {
            fs.unlinkSync(oldLogoPath);
          }
        } catch (err) {
          console.warn('Could not delete old logo:', err.message);
        }
      }

      // Database: Update team with new logo URL path
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      await team.update({ school_logo_url: logoUrl });

      res.json({
        success: true,
        message: 'Logo uploaded successfully',
        data: {
          logo_url: logoUrl
        }
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading logo'
      });
    }
  }
);

/**
 * @route DELETE /api/teams/logo
 * @description Removes the team logo. Restricted to super_admin and head_coach roles.
 *              Deletes the logo file from the filesystem and clears the URL from the database.
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - File or database operation failure
 */
router.delete('/logo',
  async (req, res) => {
    try {
      // Permission: Only super_admin and head_coach can modify team branding
      if (!canModifyBranding(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins and head coaches can update team branding'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // File cleanup: Delete logo file from filesystem if it exists
      if (team.school_logo_url) {
        const logoPath = path.join(logosDir, path.basename(team.school_logo_url));
        try {
          if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
          }
        } catch (err) {
          console.warn('Could not delete logo file:', err.message);
        }
      }

      // Database: Clear logo URL from team record
      await team.update({ school_logo_url: null });

      res.json({
        success: true,
        message: 'Logo removed successfully'
      });
    } catch (error) {
      console.error('Error removing logo:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing logo'
      });
    }
  }
);

/**
 * @route PUT /api/teams/branding
 * @description Updates team brand colors. Restricted to super_admin and head_coach roles.
 *              Accepts primary and secondary colors in hex format (#XXXXXX).
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Color format validation
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {string} [req.body.primary_color] - Primary brand color (hex format: #XXXXXX)
 * @param {string} [req.body.secondary_color] - Secondary brand color (hex format: #XXXXXX)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated branding data
 * @returns {string} response.data.primary_color - Current primary color
 * @returns {string} response.data.secondary_color - Current secondary color
 *
 * @throws {400} Validation failed - Invalid hex color format
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database operation failure
 */
router.put('/branding',
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color'),
  handleValidationErrors,
  async (req, res) => {
    try {
      // Permission: Only super_admin and head_coach can modify team branding
      if (!canModifyBranding(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins and head coaches can update team branding'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Business logic: Build update object with only provided colors
      const { primary_color, secondary_color } = req.body;
      const updateData = {};

      if (primary_color) updateData.primary_color = primary_color;
      if (secondary_color) updateData.secondary_color = secondary_color;

      // Database: Apply color updates
      await team.update(updateData);

      res.json({
        success: true,
        message: 'Team branding updated successfully',
        data: {
          primary_color: team.primary_color,
          secondary_color: team.secondary_color
        }
      });
    } catch (error) {
      console.error('Error updating branding:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating team branding'
      });
    }
  }
);

/**
 * @route GET /api/teams/branding
 * @description Retrieves the team's branding information including name, logo, and colors.
 *              Returns default colors (#3B82F6, #EF4444) if none are set.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Branding information
 * @returns {string} response.data.name - Team name
 * @returns {string} response.data.program_name - Program/school name
 * @returns {string|null} response.data.logo_url - Logo URL path or null
 * @returns {string} response.data.primary_color - Primary color (default: #3B82F6)
 * @returns {string} response.data.secondary_color - Secondary color (default: #EF4444)
 *
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database query failure
 */
router.get('/branding', async (req, res) => {
  try {
    // Database: Fetch team with only branding-related attributes
    const team = await Team.findByPk(req.user.team_id, {
      attributes: ['id', 'name', 'program_name', 'school_logo_url', 'primary_color', 'secondary_color']
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Business logic: Return branding data with default colors if not set
    res.json({
      success: true,
      data: {
        name: team.name,
        program_name: team.program_name,
        logo_url: team.school_logo_url,
        primary_color: team.primary_color || '#3B82F6',
        secondary_color: team.secondary_color || '#EF4444'
      }
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team branding'
    });
  }
});

module.exports = router;
