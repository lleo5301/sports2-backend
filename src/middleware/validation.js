const { validationResult } = require('express-validator');

/**
 * Middleware to handle express-validator validation errors.
 *
 * This middleware should be placed after express-validator validation chains
 * and before the route handler. It checks for validation errors using
 * express-validator's validationResult() and returns a standardized 400 error
 * response if any validation errors exist. If no errors are found, it calls
 * next() to continue to the next middleware or route handler.
 *
 * The standardized error response format ensures consistency across all API
 * endpoints that use validation:
 * - success: false (boolean)
 * - message: 'Validation failed' (string)
 * - errors: array of validation error objects from express-validator
 *
 * @param {Object} req - Express request object containing the validation state
 * @param {Object} res - Express response object used to send the error response
 * @param {Function} next - Express next function to pass control to the next middleware
 * @returns {void|Object} Returns 400 JSON response if validation fails, otherwise calls next()
 *
 * @throws {400} Validation failed - Returns JSON with success: false, message, and errors array
 *
 * @example
 * // Basic usage with a single field validation:
 * const { body } = require('express-validator');
 * const { handleValidationErrors } = require('../middleware/validation');
 *
 * router.post('/create-team',
 *   body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
 *   handleValidationErrors,
 *   async (req, res) => {
 *     // This handler only runs if validation passes
 *     const team = await Team.create(req.body);
 *     res.json({ success: true, data: team });
 *   }
 * );
 *
 * @example
 * // Advanced usage with multiple field validations:
 * router.post('/create-user',
 *   [
 *     body('email').isEmail().withMessage('Valid email is required'),
 *     body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
 *     body('role').isIn(['admin', 'user', 'coach']).withMessage('Invalid role')
 *   ],
 *   handleValidationErrors,
 *   protect,  // Authentication middleware
 *   async (req, res) => {
 *     // Route handler logic
 *   }
 * );
 *
 * @example
 * // Example error response when validation fails:
 * // HTTP 400 Bad Request
 * // {
 * //   "success": false,
 * //   "message": "Validation failed",
 * //   "errors": [
 * //     {
 * //       "msg": "Name must be 1-100 characters",
 * //       "param": "name",
 * //       "location": "body"
 * //     }
 * //   ]
 * // }
 *
 * @see {@link https://express-validator.github.io/docs/|express-validator Documentation}
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
