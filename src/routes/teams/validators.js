/**
 * @fileoverview Shared validation middleware for team routes.
 * Provides reusable validation chains for team operations, branding, and permissions.
 *
 * @module routes/teams/validators
 * @requires express-validator
 */

const { body, validationResult } = require('express-validator');

/**
 * @description Validation middleware for team creation.
 *              Validates team name (required), program name, conference, division,
 *              location, and brand colors.
 * @type {Array<ValidationChain>}
 */
const validateTeamCreate = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

/**
 * @description Validation middleware for team updates.
 *              All fields are optional for partial updates.
 * @type {Array<ValidationChain>}
 */
const validateTeamUpdate = [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

/**
 * @description Validation middleware for user permission operations.
 *              Validates user ID, permission type, optional grant status,
 *              expiration date, and notes.
 * @type {Array<ValidationChain>}
 */
const validatePermission = [
  body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  body('permission_type').isIn([
    'depth_chart_view', 'depth_chart_create', 'depth_chart_edit', 'depth_chart_delete', 'depth_chart_manage_positions',
    'player_assign', 'player_unassign', 'schedule_view', 'schedule_create', 'schedule_edit', 'schedule_delete',
    'reports_view', 'reports_create', 'reports_edit', 'reports_delete', 'team_settings', 'user_management'
  ]).withMessage('Invalid permission type'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

/**
 * @description Helper middleware to handle express-validator validation errors.
 *              Returns 400 status with error details if validation fails.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

module.exports = {
  validateTeamCreate,
  validateTeamUpdate,
  validatePermission,
  handleValidationErrors
};
