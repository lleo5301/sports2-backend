/**
 * @fileoverview Permission management routes for teams.
 * Handles user permission CRUD operations within teams.
 * All routes enforce team isolation - users can only manage permissions within their own team.
 *
 * Key permission requirements:
 * - Permission creation: Requires user_management permission
 * - Permission updates: Requires user_management permission
 * - Permission deletion: Requires user_management permission
 * - Permission listing: All authenticated users
 *
 * Includes legacy /byid/:id/permissions routes for backward compatibility.
 *
 * @module routes/teams/permissions
 * @requires express
 * @requires express-validator
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 */

const express = require('express');
const { body, param } = require('express-validator');
const { protect } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permissions');
const { User, UserPermission } = require('../../models');
const { validatePermission, handleValidationErrors } = require('./validators');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route GET /api/teams/permissions
 * @description Retrieves all user permissions for the authenticated user's team.
 *              Includes user details for each permission record.
 *              Multi-tenant isolation: Only returns permissions from the requesting user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of permission objects
 * @returns {number} response.data[].id - Permission ID
 * @returns {number} response.data[].user_id - User ID
 * @returns {number} response.data[].team_id - Team ID
 * @returns {string} response.data[].permission_type - Permission type code
 * @returns {boolean} response.data[].is_granted - Whether permission is granted
 * @returns {string|null} response.data[].expires_at - Expiration timestamp
 * @returns {string|null} response.data[].notes - Permission notes
 * @returns {Object} response.data[].User - Associated user info
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/permissions', async (req, res) => {
  try {
    // Database: Fetch all permissions for the team with user details
    // Permission: Multi-tenant isolation via team_id filter
    const permissions = await UserPermission.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching team permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team permissions'
    });
  }
});

/**
 * @route POST /api/teams/permissions
 * @description Grants a new permission to a user on the team.
 *              Requires user_management permission. Validates that the target user
 *              belongs to the same team and doesn't already have the permission.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware validatePermission - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {number} req.body.user_id - Target user ID (must be positive integer)
 * @param {string} req.body.permission_type - Permission type (see validatePermission for valid values)
 * @param {boolean} [req.body.is_granted=true] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created permission object
 *
 * @throws {400} Validation failed - Invalid request body
 * @throws {400} Permission already exists - Duplicate permission
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - User not found in team
 * @throws {500} Server error - Database operation failure
 */
router.post('/permissions',
  validatePermission,
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Validation: Ensure target user exists and belongs to the same team
      // This enforces multi-tenant isolation for permission grants
      const user = await User.findOne({
        where: {
          id: req.body.user_id,
          team_id: req.user.team_id
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in team'
        });
      }

      // Business logic: Check for existing permission to prevent duplicates
      const existingPermission = await UserPermission.findOne({
        where: {
          user_id: req.body.user_id,
          team_id: req.user.team_id,
          permission_type: req.body.permission_type
        }
      });

      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: 'Permission already exists for this user'
        });
      }

      // Database: Create the new permission record
      // Track who granted the permission for audit purposes
      const permission = await UserPermission.create({
        user_id: req.body.user_id,
        team_id: req.user.team_id,
        permission_type: req.body.permission_type,
        granted_by: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Permission added successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding permission'
      });
    }
  }
);

/**
 * @route PUT /api/teams/permissions/:id
 * @description Updates an existing permission. Requires user_management permission.
 *              Multi-tenant isolation: Can only update permissions within user's team.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Permission ID to update
 * @param {boolean} [req.body.is_granted] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated permission object
 *
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 */
router.put('/permissions/:id',
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          // Permission: Multi-tenant isolation - only allow updating team's permissions
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Apply updates from request body
      await permission.update(req.body);

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating permission'
      });
    }
  }
);

/**
 * @route DELETE /api/teams/permissions/:id
 * @description Deletes/revokes a permission from a user.
 *              Requires user_management permission.
 *              Multi-tenant isolation: Can only delete permissions within user's team.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware param validation - Permission ID validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Permission ID to delete (must be positive integer)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {400} Validation failed - Invalid permission ID
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          // Permission: Multi-tenant isolation
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Hard delete the permission record
      await permission.destroy();

      res.json({
        success: true,
        message: 'Permission removed successfully'
      });
    } catch (error) {
      console.error('Error removing permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing permission'
      });
    }
  }
);

// ============================================================================
// Legacy Routes - Maintained for backward compatibility
// ============================================================================

/**
 * @route GET /api/teams/byid/:id/permissions
 * @description Legacy endpoint - Retrieves all permissions for the authenticated user's team.
 *              Note: The :id parameter is ignored; uses authenticated user's team_id.
 *              Maintained for backwards compatibility.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Team ID (ignored - uses authenticated user's team)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of permission objects with User details
 *
 * @throws {500} Server error - Database query failure
 * @deprecated Use GET /api/teams/permissions instead
 */
router.get('/byid/:id/permissions', async (req, res) => {
  try {
    // Note: The :id param is ignored; always uses authenticated user's team
    const permissions = await UserPermission.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching team permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team permissions'
    });
  }
});

/**
 * @route POST /api/teams/byid/:id/permissions
 * @description Legacy endpoint - Grants a new permission to a team user.
 *              Note: The :id parameter is ignored; uses authenticated user's team_id.
 *              Requires user_management permission. Maintained for backwards compatibility.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware validatePermission - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Team ID (ignored - uses authenticated user's team)
 * @param {number} req.body.user_id - Target user ID
 * @param {string} req.body.permission_type - Permission type code
 * @param {boolean} [req.body.is_granted=true] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date
 * @param {string} [req.body.notes] - Notes about the permission
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created permission object
 *
 * @throws {400} Validation failed - Invalid request body
 * @throws {400} Permission already exists - Duplicate permission
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - User not found in team
 * @throws {500} Server error - Database operation failure
 * @deprecated Use POST /api/teams/permissions instead
 */
router.post('/byid/:id/permissions',
  validatePermission,
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Validation: Ensure target user exists and belongs to the same team
      const user = await User.findOne({
        where: {
          id: req.body.user_id,
          team_id: req.user.team_id
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in team'
        });
      }

      // Business logic: Check for existing permission to prevent duplicates
      const existingPermission = await UserPermission.findOne({
        where: {
          user_id: req.body.user_id,
          team_id: req.user.team_id,
          permission_type: req.body.permission_type
        }
      });

      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: 'Permission already exists for this user'
        });
      }

      // Database: Create permission with all optional fields
      const permission = await UserPermission.create({
        user_id: req.body.user_id,
        team_id: req.user.team_id,
        permission_type: req.body.permission_type,
        is_granted: req.body.is_granted !== false, // Default to true
        expires_at: req.body.expires_at || null,
        notes: req.body.notes || null,
        granted_by: req.user.id
      });

      res.json({
        success: true,
        message: 'Permission added successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding permission'
      });
    }
  }
);

/**
 * @route PUT /api/teams/byid/:team_id/permissions/:id
 * @description Legacy endpoint - Updates an existing permission.
 *              Note: The :team_id parameter is ignored; uses authenticated user's team_id.
 *              Requires user_management permission. Maintained for backwards compatibility.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware param validation - Permission ID validation
 * @middleware express-validator - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.team_id - Team ID (ignored - uses authenticated user's team)
 * @param {string} req.params.id - Permission ID to update (must be positive integer)
 * @param {boolean} [req.body.is_granted] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated permission object
 *
 * @throws {400} Validation failed - Invalid parameters
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 * @deprecated Use PUT /api/teams/permissions/:id instead
 */
router.put('/byid/:team_id/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      // Note: Uses authenticated user's team_id, not the :team_id param
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Apply updates, preserving existing values for undefined fields
      await permission.update({
        is_granted: req.body.is_granted !== undefined ? req.body.is_granted : permission.is_granted,
        expires_at: req.body.expires_at !== undefined ? req.body.expires_at : permission.expires_at,
        notes: req.body.notes !== undefined ? req.body.notes : permission.notes
      });

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating permission'
      });
    }
  }
);

module.exports = router;
