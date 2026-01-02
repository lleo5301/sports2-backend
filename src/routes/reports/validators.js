/**
 * @fileoverview Shared validation middleware for report routes.
 * Provides reusable validation chains for custom reports and scouting reports.
 *
 * @module routes/reports/validators
 * @requires express-validator
 */

const { body, validationResult } = require('express-validator');

/**
 * @description Validation rules for creating a new custom report.
 *              Applied as middleware to POST /api/reports route.
 *
 * Required Fields:
 * - title: Report title (1-200 characters)
 * - type: Report type (player-performance, team-statistics, scouting-analysis, recruitment-pipeline, custom)
 *
 * Optional Fields:
 * - description: Report description (max 1000 characters)
 * - data_sources: Array of data source identifiers for the report
 * - sections: Array of section configurations defining report structure
 * - filters: Object containing filter criteria for report data
 * - schedule: Object containing scheduling configuration for automated reports
 *
 * @type {Array<ValidationChain>}
 */
const validateReportCreate = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('type').isIn(['player-performance', 'team-statistics', 'scouting-analysis', 'recruitment-pipeline', 'custom']).withMessage('Invalid report type'),
  body('data_sources').optional().isArray().withMessage('Data sources must be an array'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('filters').optional().isObject().withMessage('Filters must be an object'),
  body('schedule').optional().isObject().withMessage('Schedule must be an object')
];

/**
 * @description Validation rules for updating an existing custom report.
 *              Applied as middleware to PUT /api/reports/byId/:id route.
 *              All fields are optional to support partial updates.
 *
 * Optional Fields:
 * - title: Report title (1-200 characters)
 * - description: Report description (max 1000 characters)
 * - status: Report status (draft, published, archived)
 * - data_sources: Array of data source identifiers
 * - sections: Array of section configurations
 * - filters: Object containing filter criteria
 *
 * @type {Array<ValidationChain>}
 */
const validateReportUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
  body('data_sources').optional().isArray().withMessage('Data sources must be an array'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('filters').optional().isObject().withMessage('Filters must be an object')
];

/**
 * @description Middleware to check for validation errors from express-validator.
 *              Returns a 400 error response if validation fails, otherwise continues.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void|Object} Calls next() on success, or returns 400 JSON response on validation failure
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
  validateReportCreate,
  validateReportUpdate,
  handleValidationErrors
};
