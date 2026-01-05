/**
 * @fileoverview Shared validation middleware for depth chart routes.
 * Provides reusable validation chains for depth charts, positions, and player assignments.
 *
 * @module routes/depthCharts/validators
 * @requires express-validator
 */

const { body, validationResult } = require('express-validator');

/**
 * @description Validation rules for depth chart creation and updates.
 * Validates required name field and optional metadata fields.
 * @type {Array<ValidationChain>}
 */
const validateDepthChart = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required and must be 1-100 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('effective_date').optional().isISO8601().withMessage('effective_date must be a valid date'),
  body('notes').optional().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
];

/**
 * @description Validation rules for position creation and updates.
 * Validates position code, name, and optional visual customization fields.
 * @type {Array<ValidationChain>}
 */
const validatePosition = [
  body('position_code').trim().isLength({ min: 1, max: 10 }).withMessage('Position code is required and must be 1-10 characters'),
  body('position_name').trim().isLength({ min: 1, max: 50 }).withMessage('Position name is required and must be 1-50 characters'),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color'),
  body('icon').optional().isLength({ max: 50 }).withMessage('Icon must be less than 50 characters'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
  body('max_players').optional().isInt({ min: 1 }).withMessage('Max players must be a positive integer'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters')
];

/**
 * @description Validation rules for player assignment to depth chart positions.
 * Validates player ID, depth order (ranking within position), and optional notes.
 * @type {Array<ValidationChain>}
 */
const validatePlayerAssignment = [
  body('player_id').isInt({ min: 1 }).withMessage('Player ID must be a positive integer'),
  body('depth_order').isInt({ min: 1 }).withMessage('Depth order must be a positive integer'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

/**
 * @description Middleware to handle express-validator validation errors.
 * Returns a 400 response with validation error details if any errors exist.
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
  validateDepthChart,
  validatePosition,
  validatePlayerAssignment,
  handleValidationErrors
};
