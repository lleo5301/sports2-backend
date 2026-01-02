/**
 * @fileoverview Schedule Templates routes for managing reusable schedule configurations.
 * All routes in this file require authentication via the protect middleware.
 * Templates are scoped to teams - users can only access templates belonging to their team.
 *
 * Template Structure:
 * - ScheduleTemplate: Contains reusable schedule configuration stored in template_data JSON
 *   - name: Human-readable template name (e.g., "Game Day Schedule", "Practice Template")
 *   - description: Optional detailed description of the template purpose
 *   - template_data: JSON object containing the complete schedule structure
 *   - is_default: Flag indicating if this is the team's default template
 *   - is_active: Soft delete flag (false = deleted)
 *
 * Default Template Behavior:
 * Each team can have ONE default template. When a template is set as default:
 * - All other templates for that team are automatically unset as default
 * - This ensures only one default exists at any time
 *
 * Deletion Behavior:
 * - ScheduleTemplate: Soft delete (is_active = false) - preserves data for audit/recovery
 * - Deleted templates are excluded from all list queries
 *
 * @module routes/scheduleTemplates
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { ScheduleTemplate, Team, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/schedule-templates
 * @description Retrieves all active schedule templates for the authenticated user's team.
 *              Supports optional filtering by search text and default status.
 *              Results are sorted with default template first, then by creation date.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} [req.query.search] - Optional search string to filter templates by name or description (case-insensitive)
 * @param {boolean} [req.query.is_default] - Optional filter for default templates only ('true'/'false')
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of schedule template objects
 * @returns {number} response.data[].id - Template ID
 * @returns {string} response.data[].name - Template name
 * @returns {string} response.data[].description - Template description
 * @returns {Object} response.data[].template_data - JSON object with schedule structure
 * @returns {boolean} response.data[].is_default - Whether this is the team's default template
 * @returns {Object} response.data[].Creator - User who created the template (id, first_name, last_name)
 * @returns {string} response.data[].created_at - Creation timestamp
 * @returns {string} response.data[].updated_at - Last update timestamp
 *
 * @throws {400} Validation failed - Query parameter validation failed
 * @throws {500} Server error - Database query failure
 */
router.get('/', [
  // Validation: Search string must be a string if provided
  query('search').optional().isString(),
  // Validation: is_default must be a boolean string if provided
  query('is_default').optional().isBoolean()
], async (req, res) => {
  try {
    // Validation: Check for query parameter validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { search, is_default } = req.query;

    // Permission: Filter templates to user's team only (multi-tenant isolation)
    // Business logic: Only return active templates (is_active = true)
    const whereClause = {
      team_id: req.user.team_id,
      is_active: true
    };

    // Business logic: Apply optional is_default filter
    // Convert string 'true'/'false' to actual boolean for query
    if (is_default !== undefined) {
      whereClause.is_default = is_default === 'true';
    }

    // Business logic: Apply case-insensitive search across name and description
    // Uses PostgreSQL iLike for case-insensitive pattern matching
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Fetch templates with creator information
    const templates = await ScheduleTemplate.findAll({
      where: whereClause,
      include: [
        {
          // Business logic: Include creator info for audit/display purposes
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      // Business logic: Sort default template first, then by creation date (newest first)
      // This ensures the default template is prominently positioned
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get schedule templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching schedule templates'
    });
  }
});

/**
 * @route GET /api/schedule-templates/:id
 * @description Retrieves a single schedule template by ID.
 *              Only returns active templates belonging to the user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Schedule template ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Complete schedule template object
 * @returns {number} response.data.id - Template ID
 * @returns {string} response.data.name - Template name
 * @returns {string} response.data.description - Template description
 * @returns {Object} response.data.template_data - JSON object with schedule structure
 * @returns {boolean} response.data.is_default - Whether this is the team's default template
 * @returns {boolean} response.data.is_active - Active status (always true in responses)
 * @returns {Object} response.data.Creator - User who created the template
 * @returns {string} response.data.created_at - Creation timestamp
 * @returns {string} response.data.updated_at - Last update timestamp
 *
 * @throws {404} Not found - Template doesn't exist, is deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id', async (req, res) => {
  try {
    // Database: Fetch template with team isolation and active check
    const template = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        // Permission: Only return templates within user's team
        team_id: req.user.team_id,
        // Business logic: Only return active (non-deleted) templates
        is_active: true
      },
      include: [
        {
          // Business logic: Include creator info for audit/display purposes
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Error: Return 404 if template not found (includes team access and active checks)
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching schedule template'
    });
  }
});

/**
 * @route POST /api/schedule-templates
 * @description Creates a new schedule template for the authenticated user's team.
 *              If is_default is true, all other templates for the team are unset as default
 *              to maintain the one-default-per-team invariant.
 *
 *              Template Data Structure:
 *              The template_data field is a flexible JSON object that can contain:
 *              - sections: Array of schedule sections with activities
 *              - timing: Default timing configurations
 *              - settings: Template-specific settings
 *              The exact structure depends on the frontend implementation.
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.body.name - Template name (1-100 characters, required)
 * @param {string} [req.body.description] - Optional template description
 * @param {Object} req.body.template_data - JSON object containing schedule structure (required)
 * @param {boolean} [req.body.is_default=false] - Whether to set as team's default template
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created template with associations
 * @returns {number} response.data.id - New template ID
 * @returns {string} response.data.name - Template name
 * @returns {string} response.data.description - Template description
 * @returns {Object} response.data.template_data - Schedule structure
 * @returns {boolean} response.data.is_default - Default status
 * @returns {Object} response.data.Creator - User who created the template
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {500} Server error - Database operation failure
 */
router.post('/', [
  // Validation: Name is required and must be 1-100 characters
  body('name').trim().isLength({ min: 1, max: 100 }),
  // Validation: Description is optional string
  body('description').optional().isString(),
  // Validation: template_data is required and must be an object
  body('template_data').isObject(),
  // Validation: is_default is optional boolean
  body('is_default').optional().isBoolean()
], async (req, res) => {
  try {
    // Validation: Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Business logic: Enforce one-default-per-team invariant
    // If this template is being set as default, unset all other defaults for this team
    if (req.body.is_default) {
      await ScheduleTemplate.update(
        { is_default: false },
        {
          where: {
            team_id: req.user.team_id,
            is_default: true
          }
        }
      );
    }

    // Database: Create the new template
    // Associates with user's team and tracks the creator
    const template = await ScheduleTemplate.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created template with associations for complete response
    const createdTemplate = await ScheduleTemplate.findByPk(template.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdTemplate
    });
  } catch (error) {
    console.error('Create schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating schedule template'
    });
  }
});

/**
 * @route PUT /api/schedule-templates/:id
 * @description Updates an existing schedule template.
 *              Supports partial updates - only provided fields are changed.
 *              If is_default is set to true, all other templates for the team
 *              are unset as default (excludes the current template being updated).
 *
 *              Update Strategy:
 *              - Partial update: Only fields provided in request body are modified
 *              - template_data replacement: If provided, completely replaces existing data
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Schedule template ID to update
 * @param {string} [req.body.name] - Updated template name (1-100 characters)
 * @param {string} [req.body.description] - Updated template description
 * @param {Object} [req.body.template_data] - Updated schedule structure (full replacement)
 * @param {boolean} [req.body.is_default] - Updated default status
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated template with associations
 * @returns {number} response.data.id - Template ID
 * @returns {string} response.data.name - Updated template name
 * @returns {string} response.data.description - Updated description
 * @returns {Object} response.data.template_data - Updated schedule structure
 * @returns {boolean} response.data.is_default - Updated default status
 * @returns {Object} response.data.Creator - User who created the template
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - Template doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/:id', [
  // Validation: Name is optional but if provided must be 1-100 characters
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  // Validation: Description is optional string
  body('description').optional().isString(),
  // Validation: template_data is optional object (full replacement if provided)
  body('template_data').optional().isObject(),
  // Validation: is_default is optional boolean
  body('is_default').optional().isBoolean()
], async (req, res) => {
  try {
    // Validation: Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Database: Find template with team isolation
    // Note: Unlike GET, update allows modifying inactive templates (no is_active check)
    const template = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow updates to templates within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if template not found (includes team access check)
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    // Business logic: Enforce one-default-per-team invariant
    // If this template is being set as default, unset all other defaults
    // Excludes the current template (id != req.params.id) to avoid race condition
    if (req.body.is_default) {
      await ScheduleTemplate.update(
        { is_default: false },
        {
          where: {
            team_id: req.user.team_id,
            is_default: true,
            id: { [Op.ne]: req.params.id }
          }
        }
      );
    }

    // Database: Update the template with provided fields
    await template.update(req.body);

    // Database: Fetch the updated template with associations for complete response
    const updatedTemplate = await ScheduleTemplate.findByPk(template.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Update schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating schedule template'
    });
  }
});

/**
 * @route DELETE /api/schedule-templates/:id
 * @description Soft deletes a schedule template by setting is_active to false.
 *              The template data is preserved in the database for audit and recovery purposes.
 *              Soft-deleted templates are excluded from all list and single-get queries.
 *
 *              Soft Delete Strategy:
 *              - Sets is_active = false instead of removing the record
 *              - Template remains in database but is hidden from normal queries
 *              - Allows potential recovery of accidentally deleted templates
 *              - Preserves referential integrity with any associated records
 *
 *              Note: If the deleted template was the default, no other template is
 *              automatically set as default. The team will have no default template
 *              until one is explicitly set.
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Schedule template ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {404} Not found - Template doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/:id', async (req, res) => {
  try {
    // Database: Find template with team isolation
    const template = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow deletion of templates within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if template not found (includes team access check)
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    // Database: Soft delete by setting is_active to false
    // This preserves the record for audit/recovery while hiding it from queries
    await template.update({ is_active: false });

    res.json({
      success: true,
      message: 'Schedule template deleted successfully'
    });
  } catch (error) {
    console.error('Delete schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting schedule template'
    });
  }
});

/**
 * @route POST /api/schedule-templates/:id/duplicate
 * @description Creates a copy of an existing schedule template with a new name.
 *              The new template inherits the original's template_data but:
 *              - Gets a new name (required) and optional new description
 *              - Is never set as default (is_default = false)
 *              - Has fresh created_at/updated_at timestamps
 *              - Is associated with the current user as creator
 *
 *              Use Cases:
 *              - Create variations of existing templates (e.g., "Game Day - Home" from "Game Day")
 *              - Allow users to customize shared templates without modifying originals
 *              - Quick template creation based on proven configurations
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Source template ID to duplicate
 * @param {string} req.body.name - Name for the new template (1-100 characters, required)
 * @param {string} [req.body.description] - Description for the new template (uses original's if not provided)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Newly created template with associations
 * @returns {number} response.data.id - New template ID
 * @returns {string} response.data.name - New template name
 * @returns {string} response.data.description - Template description
 * @returns {Object} response.data.template_data - Copied schedule structure from original
 * @returns {boolean} response.data.is_default - Always false for duplicated templates
 * @returns {Object} response.data.Creator - User who created the duplicate (current user)
 *
 * @throws {400} Validation failed - Missing or invalid name
 * @throws {404} Not found - Source template doesn't exist, is deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/:id/duplicate', [
  // Validation: New name is required (must differ from original for identification)
  body('name').trim().isLength({ min: 1, max: 100 }),
  // Validation: Description is optional - falls back to original's description
  body('description').optional().isString()
], async (req, res) => {
  try {
    // Validation: Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Database: Find the source template with team isolation and active check
    // Only active templates can be duplicated
    const originalTemplate = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow duplication of templates within user's team
        team_id: req.user.team_id,
        // Business logic: Only allow duplication of active (non-deleted) templates
        is_active: true
      }
    });

    // Error: Return 404 if source template not found
    if (!originalTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    // Database: Create the duplicated template
    // Copies template_data from original, uses provided name, and sets current user as creator
    const duplicatedTemplate = await ScheduleTemplate.create({
      name: req.body.name,
      // Business logic: Use provided description or fall back to original's description
      description: req.body.description || originalTemplate.description,
      // Business logic: Copy the entire template_data structure from original
      template_data: originalTemplate.template_data,
      team_id: req.user.team_id,
      created_by: req.user.id,
      // Business logic: Duplicated templates are never set as default
      // User must explicitly set default if desired
      is_default: false
    });

    // Database: Fetch the created template with associations for complete response
    const createdTemplate = await ScheduleTemplate.findByPk(duplicatedTemplate.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdTemplate
    });
  } catch (error) {
    console.error('Duplicate schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while duplicating schedule template'
    });
  }
});

module.exports = router;
