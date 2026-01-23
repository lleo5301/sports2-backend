/**
 * Sorting Utility
 *
 * Provides validation and utility functions for configurable sorting on list endpoints.
 * Validates orderBy columns against allowed lists, validates sort direction,
 * and builds Sequelize order clauses.
 *
 * @module utils/sorting
 */

/**
 * Allowed sort columns for each entity type.
 * Each entity has a defined set of columns that can be used for sorting.
 * These correspond to database column names or Sequelize model attributes.
 *
 * @type {Object.<string, Array<string>>}
 */
const ALLOWED_SORT_COLUMNS = {
  players: [
    'first_name',
    'last_name',
    'position',
    'school_type',
    'graduation_year',
    'created_at',
    'status',
    'batting_avg',
    'era'
  ],
  coaches: [
    'first_name',
    'last_name',
    'school_name',
    'position',
    'last_contact_date',
    'next_contact_date',
    'created_at',
    'status'
  ],
  games: [
    'game_date',
    'opponent',
    'home_away',
    'result',
    'team_score',
    'opponent_score',
    'season',
    'created_at'
  ],
  vendors: [
    'company_name',
    'contact_person',
    'vendor_type',
    'contract_value',
    'contract_start_date',
    'contract_end_date',
    'last_contact_date',
    'next_contact_date',
    'created_at',
    'status'
  ]
};

/**
 * Default sort configurations for each entity type.
 * Specifies the default orderBy column and sortDirection when none are provided.
 *
 * @type {Object.<string, Object>}
 */
const DEFAULT_SORT_CONFIG = {
  players: { orderBy: 'created_at', sortDirection: 'DESC' },
  coaches: { orderBy: 'created_at', sortDirection: 'DESC' },
  games: { orderBy: 'game_date', sortDirection: 'DESC' },
  vendors: { orderBy: 'created_at', sortDirection: 'DESC' }
};

/**
 * Valid sort direction values (case-insensitive)
 * @type {Array<string>}
 */
const VALID_SORT_DIRECTIONS = ['ASC', 'DESC'];

/**
 * Validate if a column is allowed for sorting on a specific entity
 * @param {string} entityType - The entity type (e.g., 'players', 'coaches', 'games', 'vendors')
 * @param {string} column - The column name to validate
 * @returns {boolean} True if column is allowed, false otherwise
 */
const isValidSortColumn = (entityType, column) => {
  if (!column || typeof column !== 'string') {
    return false;
  }

  const allowedColumns = ALLOWED_SORT_COLUMNS[entityType];
  if (!allowedColumns) {
    return false;
  }

  return allowedColumns.includes(column);
};

/**
 * Validate if a sort direction is valid
 * @param {string} direction - The sort direction to validate
 * @returns {boolean} True if direction is valid (ASC or DESC, case-insensitive)
 */
const isValidSortDirection = (direction) => {
  if (!direction || typeof direction !== 'string') {
    return false;
  }

  return VALID_SORT_DIRECTIONS.includes(direction.toUpperCase());
};

/**
 * Normalize sort direction to uppercase
 * @param {string} direction - The sort direction to normalize
 * @returns {string} Uppercase direction ('ASC' or 'DESC')
 */
const normalizeSortDirection = (direction) => {
  if (!direction || typeof direction !== 'string') {
    return 'DESC';
  }

  const normalized = direction.toUpperCase();
  return VALID_SORT_DIRECTIONS.includes(normalized) ? normalized : 'DESC';
};

/**
 * Get allowed sort columns for an entity type
 * @param {string} entityType - The entity type
 * @returns {Array<string>} Array of allowed column names
 */
const getAllowedSortColumns = (entityType) => {
  return ALLOWED_SORT_COLUMNS[entityType] || [];
};

/**
 * Get default sort configuration for an entity type
 * @param {string} entityType - The entity type
 * @returns {Object} Object with orderBy and sortDirection properties
 */
const getDefaultSortConfig = (entityType) => {
  return DEFAULT_SORT_CONFIG[entityType] || { orderBy: 'created_at', sortDirection: 'DESC' };
};

/**
 * Validate sort parameters for an entity
 * @param {string} entityType - The entity type (e.g., 'players', 'coaches')
 * @param {string} orderBy - The column to sort by
 * @param {string} sortDirection - The sort direction ('ASC' or 'DESC')
 * @returns {Object} Validation result with isValid boolean and errors array
 */
const validateSortParams = (entityType, orderBy, sortDirection) => {
  const errors = [];

  // Validate entity type
  if (!ALLOWED_SORT_COLUMNS[entityType]) {
    errors.push(`Invalid entity type: ${entityType}`);
    return { isValid: false, errors };
  }

  // Validate orderBy if provided
  if (orderBy && !isValidSortColumn(entityType, orderBy)) {
    const allowedColumns = getAllowedSortColumns(entityType);
    errors.push(`Invalid orderBy column '${orderBy}'. Allowed columns: ${allowedColumns.join(', ')}`);
  }

  // Validate sortDirection if provided
  if (sortDirection && !isValidSortDirection(sortDirection)) {
    errors.push(`Invalid sortDirection '${sortDirection}'. Must be 'ASC' or 'DESC'`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Build Sequelize order clause from sort parameters
 * @param {string} entityType - The entity type
 * @param {string} [orderBy] - The column to sort by (uses default if not provided)
 * @param {string} [sortDirection] - The sort direction (uses default if not provided)
 * @returns {Array<Array<string>>} Sequelize order clause (e.g., [['created_at', 'DESC']])
 * @throws {Error} If validation fails
 */
const buildOrderClause = (entityType, orderBy, sortDirection) => {
  // Get defaults
  const defaults = getDefaultSortConfig(entityType);
  const column = orderBy || defaults.orderBy;
  const direction = sortDirection ? normalizeSortDirection(sortDirection) : defaults.sortDirection;

  // Validate parameters
  const validation = validateSortParams(entityType, column, direction);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('. '));
  }

  // Return Sequelize order clause format: [[column, direction]]
  return [[column, direction]];
};

/**
 * Custom validator function for express-validator
 * Validates orderBy parameter against allowed columns for an entity
 * @param {string} entityType - The entity type to validate against
 * @returns {Function} Validator function that can be used with .custom()
 *
 * @example
 * // In routes file:
 * const { createOrderByValidator } = require('../utils/sorting');
 *
 * router.get('/', [
 *   query('orderBy').optional().custom(createOrderByValidator('players')),
 *   query('sortDirection').optional().isIn(['ASC', 'DESC']),
 * ], handler);
 */
const createOrderByValidator = (entityType) => {
  return (value) => {
    if (!value) {
      return true; // Optional field, allow empty
    }

    if (!isValidSortColumn(entityType, value)) {
      const allowedColumns = getAllowedSortColumns(entityType);
      throw new Error(`Invalid orderBy column '${value}'. Allowed columns: ${allowedColumns.join(', ')}`);
    }

    return true;
  };
};

/**
 * Import express-validator query function for creating validators
 * Using lazy loading to avoid issues when module is used without express-validator
 */
let query;
try {
  query = require('express-validator').query;
} catch {
  query = null;
}

/**
 * Create express-validator chains for orderBy and sortDirection parameters
 * @param {string} entityType - The entity type (e.g., 'players', 'coaches')
 * @returns {Array} Array of validation chains for orderBy and sortDirection
 * @throws {Error} If express-validator is not installed
 *
 * @example
 * // In routes file:
 * const { createSortValidators } = require('../utils/sorting');
 *
 * router.get('/', [
 *   ...createSortValidators('players'),
 *   // other validators...
 * ], handler);
 */
const createSortValidators = (entityType) => {
  if (!query) {
    throw new Error('express-validator is required for createSortValidators');
  }

  // Validate entityType by checking allowed columns exist
  getAllowedSortColumns(entityType);

  return [
    query('orderBy')
      .optional()
      .isString()
      .withMessage('orderBy must be a string')
      .custom(createOrderByValidator(entityType)),
    query('sortDirection')
      .optional()
      .isString()
      .withMessage('sortDirection must be a string')
      .isIn(['ASC', 'DESC', 'asc', 'desc'])
      .withMessage("sortDirection must be 'ASC' or 'DESC'")
  ];
};

module.exports = {
  // Constants
  ALLOWED_SORT_COLUMNS,
  DEFAULT_SORT_CONFIG,
  VALID_SORT_DIRECTIONS,

  // Validation functions
  isValidSortColumn,
  isValidSortDirection,
  validateSortParams,

  // Utility functions
  normalizeSortDirection,
  getAllowedSortColumns,
  getDefaultSortConfig,
  buildOrderClause,

  // Express-validator integration
  createOrderByValidator,
  createSortValidators
};
