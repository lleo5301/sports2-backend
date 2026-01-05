/**
 * @fileoverview Helper functions for settings operations.
 * Provides utility middleware for validation error handling.
 *
 * @module routes/settings/helpers
 * @requires express-validator
 */

const { validationResult } = require('express-validator');

/**
 * @description Helper function to handle express-validator validation results.
 * Checks for validation errors and returns a 400 response with error details if any are found.
 * If validation passes, calls next() to continue to the route handler.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object|void} Returns 400 response on validation failure, otherwise calls next()
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
  handleValidationErrors
};
