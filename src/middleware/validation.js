const { validationResult } = require('express-validator');

/**
 * Middleware to handle express-validator validation errors.
 * Returns a 400 response with validation error details if any errors exist.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 *
 * @example
 * // Usage in routes:
 * router.post('/endpoint',
 *   body('field').notEmpty().withMessage('Field is required'),
 *   handleValidationErrors,
 *   async (req, res) => {
 *     // Your route handler
 *   }
 * );
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
