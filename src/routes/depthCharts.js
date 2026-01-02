/**
 * @fileoverview Depth chart routes for managing team depth charts, positions, and player assignments.
 * Provides comprehensive functionality for creating, organizing, and maintaining team depth charts
 * with support for position management, player recommendations, and chart versioning.
 *
 * All routes require authentication via the protect middleware. Depth charts are scoped to teams -
 * users can only access depth charts belonging to their team. Additional permission middleware
 * (depthChartPermissions) controls create, edit, delete, and player assignment capabilities.
 *
 * Key features:
 * - Depth chart CRUD operations with soft delete support
 * - Position management with customizable colors, icons, and ordering
 * - Player assignment with depth ordering within positions
 * - Intelligent player recommendations using scoring algorithms
 * - Chart duplication for creating variations
 * - Version tracking for change history
 *
 * @module routes/depthCharts
 * @requires express
 * @requires express-validator
 * @requires ../middleware/auth
 * @requires ../middleware/permissions
 * @requires ../models
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { depthChartPermissions } = require('../middleware/permissions');
const { handleValidationErrors } = require('../middleware/validation');
const {
  DepthChart,
  DepthChartPosition,
  DepthChartPlayer,
  Player,
  User,
  Team
} = require('../models');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

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
 * @route GET /api/depth-charts
 * @description Retrieves all active depth charts for the authenticated user's team.
 *              Returns depth charts sorted by default status (default first) then by creation date.
 *              Includes creator information and team details for each chart.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of depth chart objects
 * @returns {number} response.data[].id - Depth chart ID
 * @returns {string} response.data[].name - Depth chart name
 * @returns {string} response.data[].description - Depth chart description
 * @returns {boolean} response.data[].is_default - Whether this is the default chart
 * @returns {Object} response.data[].Creator - User who created the chart
 * @returns {Object} response.data[].Team - Associated team info
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    // Database: Fetch all active depth charts for the team with associations
    const depthCharts = await DepthChart.findAll({
      where: {
        // Permission: Team isolation - only return charts belonging to user's team
        team_id: req.user.team_id,
        // Business logic: Only return active (non-deleted) charts
        is_active: true
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ],
      // Business logic: Default charts appear first, then sorted by newest
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: depthCharts
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Error fetching depth charts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching depth charts'
    });
  }
});

/**
 * @route GET /api/depth-charts/byId/:id
 * @description Retrieves a specific depth chart by ID with full nested structure.
 *              Includes all active positions with their assigned players, sorted appropriately.
 *              Player assignments include player statistics and assignment metadata.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Depth chart object with full nested structure
 * @returns {Object} response.data.Creator - User who created the chart
 * @returns {Object} response.data.Team - Associated team info
 * @returns {Array<Object>} response.data.DepthChartPositions - Positions with player assignments
 * @returns {Array<Object>} response.data.DepthChartPositions[].DepthChartPlayers - Assigned players with stats
 *
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', async (req, res) => {
  try {
    // Database: Find depth chart with complete nested structure for rendering
    const depthChart = await DepthChart.findOne({
      where: {
        id: req.params.id,
        // Permission: Team isolation - only allow access within user's team
        team_id: req.user.team_id,
        is_active: true
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          // Business logic: Include all active positions with their player assignments
          model: DepthChartPosition,
          where: { is_active: true },
          required: false,
          order: [['sort_order', 'ASC']],
          include: [
            {
              // Business logic: Include player assignments within each position
              model: DepthChartPlayer,
              where: { is_active: true },
              required: false,
              order: [['depth_order', 'ASC']],
              include: [
                {
                  // Business logic: Include player stats for display (batting, pitching, status)
                  model: Player,
                  attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'graduation_year', 'batting_avg', 'home_runs', 'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts', 'status', 'has_medical_issues']
                },
                {
                  model: User,
                  as: 'AssignedBy',
                  attributes: ['id', 'first_name', 'last_name']
                }
              ]
            }
          ]
        }
      ]
    });

    // Error: Return 404 if chart not found (also handles unauthorized team access)
    if (!depthChart) {
      return res.status(404).json({
        success: false,
        message: 'Depth chart not found'
      });
    }

    res.json({
      success: true,
      data: depthChart
    });
  } catch (error) {
    console.error('Error fetching depth chart:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching depth chart'
    });
  }
});

/**
 * @route POST /api/depth-charts
 * @description Creates a new depth chart for the authenticated user's team.
 *              Optionally initializes with provided positions or default baseball positions.
 *              If marked as default, automatically unsets any existing default chart.
 * @access Private - Requires authentication and create permission
 * @middleware protect - JWT authentication required
 * @middleware validateDepthChart - Request body validation
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canCreate - Permission check for depth chart creation
 *
 * @param {string} req.body.name - Depth chart name (1-100 chars, required)
 * @param {string} [req.body.description] - Depth chart description (max 1000 chars)
 * @param {boolean} [req.body.is_default] - Whether this should be the default chart
 * @param {string} [req.body.effective_date] - Date when chart becomes effective (ISO8601)
 * @param {string} [req.body.notes] - Additional notes (max 1000 chars)
 * @param {Array<Object>} [req.body.positions] - Array of position objects to create
 * @param {string} req.body.positions[].position_code - Position code (e.g., 'P', 'C', '1B')
 * @param {string} req.body.positions[].position_name - Display name (e.g., 'Pitcher')
 * @param {string} [req.body.positions[].color] - Hex color code for position
 * @param {string} [req.body.positions[].icon] - Icon name for position
 * @param {number} [req.body.positions[].sort_order] - Display order
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created depth chart with positions
 *
 * @throws {400} Validation failed - Request body validation errors
 * @throws {403} Forbidden - User lacks create permission
 * @throws {500} Server error - Database operation failure
 */
router.post('/',
  validateDepthChart,
  handleValidationErrors,
  depthChartPermissions.canCreate,
  async (req, res) => {
    try {
      const { name, description, is_default, effective_date, notes, positions } = req.body;

      // Business logic: Ensure only one default chart exists per team
      // If this chart is marked as default, unset any existing default
      if (is_default) {
        await DepthChart.update(
          { is_default: false },
          { where: { team_id: req.user.team_id, is_default: true } }
        );
      }

      // Database: Create the depth chart record
      const depthChart = await DepthChart.create({
        name,
        description,
        team_id: req.user.team_id,
        created_by: req.user.id,
        is_default,
        effective_date,
        notes
      });

      // Business logic: Create positions if provided (or use baseball defaults)
      if (positions && Array.isArray(positions)) {
        // Business logic: Standard baseball positions with visual styling
        const defaultPositions = [
          { position_code: 'P', position_name: 'Pitcher', color: '#EF4444', icon: 'Shield', sort_order: 1 },
          { position_code: 'C', position_name: 'Catcher', color: '#3B82F6', icon: 'Shield', sort_order: 2 },
          { position_code: '1B', position_name: 'First Base', color: '#10B981', icon: 'Target', sort_order: 3 },
          { position_code: '2B', position_name: 'Second Base', color: '#F59E0B', icon: 'Target', sort_order: 4 },
          { position_code: '3B', position_name: 'Third Base', color: '#8B5CF6', icon: 'Target', sort_order: 5 },
          { position_code: 'SS', position_name: 'Shortstop', color: '#6366F1', icon: 'Target', sort_order: 6 },
          { position_code: 'LF', position_name: 'Left Field', color: '#EC4899', icon: 'Zap', sort_order: 7 },
          { position_code: 'CF', position_name: 'Center Field', color: '#14B8A6', icon: 'Zap', sort_order: 8 },
          { position_code: 'RF', position_name: 'Right Field', color: '#F97316', icon: 'Zap', sort_order: 9 },
          { position_code: 'DH', position_name: 'Designated Hitter', color: '#06B6D4', icon: 'Heart', sort_order: 10 }
        ];

        // Business logic: Use provided positions or fall back to defaults
        const positionsToCreate = positions.length > 0 ? positions : defaultPositions;

        for (const position of positionsToCreate) {
          await DepthChartPosition.create({
            depth_chart_id: depthChart.id,
            ...position
          });
        }
      }

      // Database: Fetch the created depth chart with positions for complete response
      const createdDepthChart = await DepthChart.findByPk(depthChart.id, {
        include: [
          {
            model: DepthChartPosition,
            where: { is_active: true },
            required: false
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdDepthChart
      });
    } catch (error) {
      console.error('Error creating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating depth chart'
      });
    }
  }
);

/**
 * @route PUT /api/depth-charts/byId/:id
 * @description Updates an existing depth chart's metadata.
 *              Supports updating name, description, default status, effective date, and notes.
 *              Automatically increments version number on each update.
 *              If marked as default, automatically unsets any existing default chart.
 * @access Private - Requires authentication and edit permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware validateDepthChart - Request body validation
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canEdit - Permission check for depth chart editing
 *
 * @param {number} req.params.id - Depth chart ID to update
 * @param {string} [req.body.name] - Updated depth chart name (1-100 chars)
 * @param {string} [req.body.description] - Updated description (max 1000 chars)
 * @param {boolean} [req.body.is_default] - Whether this should be the default chart
 * @param {string} [req.body.effective_date] - Updated effective date (ISO8601)
 * @param {string} [req.body.notes] - Updated notes (max 1000 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated depth chart object
 *
 * @throws {400} Validation failed - Request body or param validation errors
 * @throws {403} Forbidden - User lacks edit permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/byId/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  validateDepthChart,
  handleValidationErrors,
  depthChartPermissions.canEdit,
  async (req, res) => {
    try {
      // Database: Find depth chart with team isolation check
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          // Permission: Only allow updates within user's team
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found (also handles unauthorized team access)
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      const { name, description, is_default, effective_date, notes } = req.body;

      // Business logic: Ensure only one default chart exists per team
      // Only unset others if this chart is becoming default and wasn't already
      if (is_default && !depthChart.is_default) {
        await DepthChart.update(
          { is_default: false },
          { where: { team_id: req.user.team_id, is_default: true } }
        );
      }

      // Database: Apply updates with version increment for change tracking
      await depthChart.update({
        name,
        description,
        is_default,
        effective_date,
        notes,
        // Business logic: Increment version on each update for change tracking
        version: depthChart.version + 1
      });

      res.json({
        success: true,
        data: depthChart
      });
    } catch (error) {
      console.error('Error updating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating depth chart'
      });
    }
  }
);

/**
 * @route DELETE /api/depth-charts/byId/:id
 * @description Soft deletes a depth chart by setting is_active to false.
 *              Chart data is preserved for potential recovery or audit purposes.
 *              Associated positions and player assignments remain linked but are effectively hidden.
 * @access Private - Requires authentication and delete permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canDelete - Permission check for depth chart deletion
 *
 * @param {number} req.params.id - Depth chart ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks delete permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canDelete,
  async (req, res) => {
    try {
      // Database: Find depth chart with team isolation check
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          // Permission: Only allow deletion within user's team
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found (also handles unauthorized team access)
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Business logic: Soft delete preserves data for audit/recovery
      // Setting is_active to false hides the chart from all list queries
      await depthChart.update({ is_active: false });

      res.json({
        success: true,
        message: 'Depth chart deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting depth chart'
      });
    }
  }
);

/**
 * @route POST /api/depth-charts/:id/positions
 * @description Adds a new position to an existing depth chart.
 *              Positions represent slots in the depth chart where players can be assigned.
 *              Supports customization of visual appearance (color, icon) and ordering.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware validatePosition - Request body validation for position fields
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.id - Depth chart ID to add position to
 * @param {string} req.body.position_code - Position code (1-10 chars, e.g., 'P', 'C', '1B')
 * @param {string} req.body.position_name - Display name (1-50 chars, e.g., 'Pitcher')
 * @param {string} [req.body.color] - Hex color code (e.g., '#EF4444')
 * @param {string} [req.body.icon] - Icon name (max 50 chars)
 * @param {number} [req.body.sort_order] - Display order (non-negative integer)
 * @param {number} [req.body.max_players] - Maximum players allowed (positive integer)
 * @param {string} [req.body.description] - Position description (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created position object
 *
 * @throws {400} Validation failed - Invalid depth chart ID or request body
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/:id/positions',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Create new position linked to the depth chart
      const position = await DepthChartPosition.create({
        depth_chart_id: depthChart.id,
        ...req.body
      });

      res.status(201).json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error adding position:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding position'
      });
    }
  }
);

/**
 * @route PUT /api/depth-charts/positions/:positionId
 * @description Updates an existing position's properties.
 *              Supports updating code, name, visual styling, and ordering.
 *              Position must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware validatePosition - Request body validation for position fields
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.positionId - Position ID to update
 * @param {string} [req.body.position_code] - Updated position code (1-10 chars)
 * @param {string} [req.body.position_name] - Updated display name (1-50 chars)
 * @param {string} [req.body.color] - Updated hex color code
 * @param {string} [req.body.icon] - Updated icon name
 * @param {number} [req.body.sort_order] - Updated display order
 * @param {number} [req.body.max_players] - Updated maximum players allowed
 * @param {string} [req.body.description] - Updated position description
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated position object
 *
 * @throws {400} Validation failed - Invalid position ID or request body
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Position doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.put('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      // Database: Find position with team isolation via depth chart join
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            // Permission: Verify position belongs to a chart owned by user's team
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      // Error: Return 404 if position not found or belongs to another team
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Apply updates to the position
      await position.update(req.body);

      res.json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error updating position:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating position'
      });
    }
  }
);

/**
 * @route DELETE /api/depth-charts/positions/:positionId
 * @description Soft deletes a position by setting is_active to false.
 *              Position data and player assignments are preserved but hidden.
 *              Position must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.positionId - Position ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid position ID
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Position doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.delete('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      // Database: Find position with team isolation via depth chart join
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            // Permission: Verify position belongs to a chart owned by user's team
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      // Error: Return 404 if position not found or belongs to another team
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Business logic: Soft delete preserves data and player assignment history
      await position.update({ is_active: false });

      res.json({
        success: true,
        message: 'Position deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting position:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting position'
      });
    }
  }
);

/**
 * @route POST /api/depth-charts/positions/:positionId/players
 * @description Assigns a player to a position on the depth chart.
 *              Players are assigned with a depth order indicating their ranking within the position.
 *              Validates that the player exists, belongs to the team, and isn't already assigned.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware validatePlayerAssignment - Request body validation for assignment
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for player assignment
 *
 * @param {number} req.params.positionId - Position ID to assign player to
 * @param {number} req.body.player_id - ID of player to assign (positive integer)
 * @param {number} req.body.depth_order - Ranking within position (1 = starter, 2 = backup, etc.)
 * @param {string} [req.body.notes] - Assignment notes (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created assignment with player details
 * @returns {Object} response.data.Player - Assigned player info (name, position, etc.)
 *
 * @throws {400} Validation failed - Invalid IDs, player already assigned, or validation errors
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Position or player doesn't exist or belongs to another team
 * @throws {500} Server error - Database operation failure
 */
router.post('/positions/:positionId/players',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePlayerAssignment,
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const { player_id, depth_order, notes } = req.body;

      // Database: Find position with team isolation via depth chart join
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            // Permission: Verify position belongs to a chart owned by user's team
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Validation: Check if player exists and belongs to the team
      const player = await Player.findOne({
        where: {
          id: player_id,
          // Permission: Player must belong to user's team
          team_id: req.user.team_id
        }
      });

      // Error: Return 404 if player not found
      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found'
        });
      }

      // Business logic: Check for duplicate assignment to same position
      // A player can be assigned to multiple positions, but not twice to the same one
      const existingAssignment = await DepthChartPlayer.findOne({
        where: {
          depth_chart_id: position.depth_chart_id,
          position_id: position.id,
          player_id,
          is_active: true
        }
      });

      // Error: Prevent duplicate assignments to same position
      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Player is already assigned to this position'
        });
      }

      // Database: Create the player assignment with tracking metadata
      const assignment = await DepthChartPlayer.create({
        depth_chart_id: position.depth_chart_id,
        position_id: position.id,
        player_id,
        depth_order,
        notes,
        // Business logic: Track who made the assignment
        assigned_by: req.user.id
      });

      // Database: Fetch the assignment with player details for response
      const createdAssignment = await DepthChartPlayer.findByPk(assignment.id, {
        include: [
          {
            model: Player,
            attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'graduation_year']
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdAssignment
      });
    } catch (error) {
      console.error('Error assigning player:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning player'
      });
    }
  }
);

/**
 * @route DELETE /api/depth-charts/players/:assignmentId
 * @description Removes a player assignment from a depth chart position.
 *              Soft deletes by setting is_active to false, preserving assignment history.
 *              Assignment must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and player unassignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('assignmentId') - Validates assignment ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canUnassignPlayers - Permission check for player removal
 *
 * @param {number} req.params.assignmentId - Player assignment ID to remove
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid assignment ID
 * @throws {403} Forbidden - User lacks player unassignment permission
 * @throws {404} Not found - Assignment doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.delete('/players/:assignmentId',
  param('assignmentId').isInt({ min: 1 }).withMessage('Invalid assignment ID'),
  handleValidationErrors,
  depthChartPermissions.canUnassignPlayers,
  async (req, res) => {
    try {
      // Database: Find assignment with team isolation via position and depth chart joins
      const assignment = await DepthChartPlayer.findOne({
        where: { id: req.params.assignmentId },
        include: [
          {
            model: DepthChartPosition,
            include: [
              {
                // Permission: Verify assignment belongs to a chart owned by user's team
                model: DepthChart,
                where: { team_id: req.user.team_id, is_active: true }
              }
            ]
          }
        ]
      });

      // Error: Return 404 if assignment not found or belongs to another team
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }

      // Business logic: Soft delete preserves assignment history for auditing
      await assignment.update({ is_active: false });

      res.json({
        success: true,
        message: 'Player assignment removed successfully'
      });
    } catch (error) {
      console.error('Error removing player assignment:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing player assignment'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/:id/available-players
 * @description Retrieves a list of players available for assignment to the specified depth chart.
 *              Returns only active players from the team who are not already assigned to this chart.
 *              Includes player stats for informed assignment decisions.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing available players
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of available player objects
 * @returns {number} response.data[].id - Player ID
 * @returns {string} response.data[].first_name - Player first name
 * @returns {string} response.data[].last_name - Player last name
 * @returns {string} response.data[].position - Player's primary position
 * @returns {Object} response.data[].batting/pitching stats - Player statistics
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      // Business logic: Build exclusion list of already-assigned players
      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get available players (active, on team, not assigned to this chart)
      const availablePlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          // Business logic: Exclude players already on this depth chart
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        // Business logic: Include stats for assignment decision-making
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/byId/:id/available-players
 * @description Alternative route to retrieve players available for assignment.
 *              Identical functionality to GET /:id/available-players.
 *              Exists to support consistent /byId/:id path pattern.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing available players
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response - Same as GET /:id/available-players
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      // Business logic: Build exclusion list of already-assigned players
      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get available players (active, on team, not assigned to this chart)
      const availablePlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/:id/recommended-players/:positionId
 * @description Retrieves a ranked list of recommended players for a specific position.
 *              Uses a scoring algorithm that considers position match, performance metrics,
 *              experience (years remaining), and health status. Returns top 10 recommendations.
 *
 *              Scoring Algorithm:
 *              1. Position Match (0-100 points):
 *                 - Exact match: 100 points
 *                 - Same position group (e.g., OF for LF): 80 points
 *                 - Utility player: 60 points
 *                 - Mismatch: 20 points
 *
 *              2. Performance Score (varies by position type):
 *                 Pitchers: ERA, strikeouts, win rate
 *                 Position players: Batting avg, HR, RBI, stolen bases
 *
 *              3. Experience (0-25+ points):
 *                 +5 points per year remaining until graduation
 *
 *              4. Health (-30 to +20 points):
 *                 No medical issues: +20 points
 *                 Has medical issues: -30 points
 *
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing recommendations
 *
 * @param {number} req.params.id - Depth chart ID
 * @param {number} req.params.positionId - Position ID to get recommendations for
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Top 10 recommended players with scores
 * @returns {number} response.data[].score - Composite recommendation score
 * @returns {Array<string>} response.data[].reasons - Top 3 scoring factors
 *
 * @throws {400} Validation failed - Invalid depth chart or position ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart or position doesn't exist
 * @throws {500} Server error - Database query failure
 */
router.get('/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Verify position exists and belongs to this depth chart
      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get all team players eligible for recommendation
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Business logic: Score each player based on position fit and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Scoring component 1: Position match
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Scoring component 2: Performance metrics
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Scoring component 3: Experience (years remaining)
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            // Business logic: Prefer players with more eligibility remaining
            score += yearsRemaining * 5;
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Scoring component 4: Health status
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          // Business logic: Significant penalty for injury-prone players
          score -= 30;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          // Business logic: Limit reasons to top 3 for cleaner UI
          reasons: reasons.slice(0, 3)
        };
      });

      // Business logic: Sort by score (highest first) and return top 10
      const recommendedPlayers = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendedPlayers
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

/**
 * @description Calculates a position match score based on how well a player's position
 *              fits the target position on the depth chart.
 *
 *              Position groups are defined for related positions that share skillsets:
 *              - Pitchers: P, SP, RP, CP
 *              - Infielders: 1B, 2B, 3B, SS (with IF, MI, CI variants)
 *              - Outfielders: LF, CF, RF (with OF variant)
 *              - Utility: DH, UTIL
 *
 * @param {string} playerPosition - Player's primary position code
 * @param {string} targetPositionCode - Target position code on depth chart
 * @returns {Object} result - Scoring result
 * @returns {number} result.score - Position match score (20-100)
 * @returns {Array<string>} result.reasons - Explanation of the match quality
 */
function getPositionMatchScore(playerPosition, targetPositionCode) {
  let score = 0;
  const reasons = [];

  // Best case: Exact position match
  if (playerPosition === targetPositionCode) {
    score += 100;
    reasons.push('Exact position match');
    return { score, reasons };
  }

  // Business logic: Define position groups for related positions
  // Players in the same group have transferable skills
  const positionGroups = {
    'P': ['P', 'SP', 'RP', 'CP'],      // All pitching roles
    'C': ['C'],                         // Catcher is specialized
    '1B': ['1B', 'IF'],                 // Corner infield
    '2B': ['2B', 'IF', 'MI'],           // Middle infield
    '3B': ['3B', 'IF', 'CI'],           // Corner infield
    'SS': ['SS', 'IF', 'MI'],           // Middle infield
    'LF': ['LF', 'OF'],                 // Outfield
    'CF': ['CF', 'OF'],                 // Outfield (requires more range)
    'RF': ['RF', 'OF'],                 // Outfield (often strongest arm)
    'DH': ['DH', 'UTIL']                // Designated hitter
  };

  const targetGroup = positionGroups[targetPositionCode] || [];

  // Good case: Same position group
  if (targetGroup.includes(playerPosition)) {
    score += 80;
    reasons.push('Position group match');
  } else if (playerPosition === 'UTIL' || playerPosition === 'IF' || playerPosition === 'OF') {
    // Acceptable case: Utility/general position
    score += 60;
    reasons.push('Utility player');
  } else {
    // Fallback: Position mismatch but player can still fill spot
    score += 20;
    reasons.push('Position mismatch');
  }

  return { score, reasons };
}

/**
 * @description Calculates a performance score based on player statistics relevant
 *              to the target position. Uses different metrics for pitchers vs position players.
 *
 *              Pitcher scoring (target positions: P, SP, RP, CP):
 *              - ERA < 3.00: +50 points (excellent)
 *              - ERA < 4.00: +30 points (good)
 *              - Strikeouts > 50: +20 points
 *              - Win rate > 60%: +25 points
 *
 *              Position player scoring (all other positions):
 *              - Batting avg > .300: +40 points (excellent)
 *              - Batting avg > .250: +20 points (good)
 *              - Home runs > 5: +15 points
 *              - RBI > 20: +15 points
 *              - Stolen bases > 10: +15 points
 *
 * @param {Object} player - Player object with statistics
 * @param {string} positionCode - Target position code on depth chart
 * @returns {Object} result - Scoring result
 * @returns {number} result.score - Performance score (0-100+)
 * @returns {Array<string>} result.reasons - Explanation of scoring factors
 */
function getPerformanceScore(player, positionCode) {
  let score = 0;
  const reasons = [];

  // Business logic: Use pitching metrics for pitcher positions
  if (['P', 'SP', 'RP', 'CP'].includes(positionCode)) {
    // ERA is the most important pitching metric
    if (player.era !== null && player.era < 3.00) {
      score += 50;
      reasons.push(`Excellent ERA: ${player.era}`);
    } else if (player.era !== null && player.era < 4.00) {
      score += 30;
      reasons.push(`Good ERA: ${player.era}`);
    }

    // Strikeout ability shows dominance
    if (player.strikeouts !== null && player.strikeouts > 50) {
      score += 20;
      reasons.push(`High strikeouts: ${player.strikeouts}`);
    }

    // Win-loss record indicates game performance
    if (player.wins !== null && player.losses !== null) {
      const winRate = player.wins / (player.wins + player.losses);
      if (winRate > 0.6) {
        score += 25;
        reasons.push(`Good win rate: ${(winRate * 100).toFixed(0)}%`);
      }
    }
  }
  // Business logic: Use batting metrics for position players
  else {
    // Batting average is primary hitting metric
    if (player.batting_avg !== null && player.batting_avg > 0.300) {
      score += 40;
      reasons.push(`High average: ${player.batting_avg}`);
    } else if (player.batting_avg !== null && player.batting_avg > 0.250) {
      score += 20;
      reasons.push(`Good average: ${player.batting_avg}`);
    }

    // Power hitting
    if (player.home_runs !== null && player.home_runs > 5) {
      score += 15;
      reasons.push(`Power hitter: ${player.home_runs} HR`);
    }

    // Run production
    if (player.rbi !== null && player.rbi > 20) {
      score += 15;
      reasons.push(`RBI producer: ${player.rbi} RBI`);
    }

    // Speed on the basepaths
    if (player.stolen_bases !== null && player.stolen_bases > 10) {
      score += 15;
      reasons.push(`Speed: ${player.stolen_bases} SB`);
    }
  }

  return { score, reasons };
}

/**
 * @route GET /api/depth-charts/byId/:id/recommended-players/:positionId
 * @description Alternative route to retrieve recommended players for a position.
 *              Identical functionality to GET /:id/recommended-players/:positionId.
 *              Exists to support consistent /byId/:id path pattern.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing recommendations
 *
 * @param {number} req.params.id - Depth chart ID
 * @param {number} req.params.positionId - Position ID to get recommendations for
 *
 * @returns {Object} response - Same as GET /:id/recommended-players/:positionId
 *
 * @throws {400} Validation failed - Invalid depth chart or position ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart or position doesn't exist
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Verify position exists and belongs to this depth chart
      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get all team players eligible for recommendation
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Business logic: Score each player based on position fit and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Scoring component 1: Position match
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Scoring component 2: Performance metrics
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Scoring component 3: Experience (years remaining)
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            score += yearsRemaining * 5;
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Scoring component 4: Health status
        // Note: Slightly different penalty (-10 vs -30) in this route variant
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          score -= 10;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          reasons
        };
      });

      // Business logic: Sort by score (highest first) and return top 10
      const recommendations = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

/**
 * @route POST /api/depth-charts/:id/duplicate
 * @description Creates a copy of an existing depth chart with all its positions.
 *              The duplicated chart is created with a "(Copy)" suffix on the name.
 *              Player assignments are NOT copied - only the chart structure.
 *              Useful for creating game-specific or situational lineup variants.
 * @access Private - Requires authentication and create permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canCreate - Permission check for depth chart creation
 *
 * @param {number} req.params.id - Source depth chart ID to duplicate
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 * @returns {Object} response.data - Minimal data about created chart
 * @returns {number} response.data.id - ID of the newly created depth chart
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks create permission
 * @throws {404} Not found - Source depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/:id/duplicate',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canCreate,
  async (req, res) => {
    try {
      // Database: Find original depth chart with positions
      const originalChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        },
        include: [
          {
            model: DepthChartPosition,
            where: { is_active: true },
            required: false
          }
        ]
      });

      // Error: Return 404 if source chart not found
      if (!originalChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Create new depth chart as a copy
      const newChart = await DepthChart.create({
        // Business logic: Append "(Copy)" to distinguish from original
        name: `${originalChart.name} (Copy)`,
        description: originalChart.description,
        team_id: req.user.team_id,
        created_by: req.user.id,
        is_active: true,
        // Business logic: Duplicates are never default
        is_default: false,
        // Business logic: Reset version and dates for new chart
        version: 1,
        effective_date: null,
        notes: `Duplicated from ${originalChart.name}`
      });

      // Business logic: Copy positions but NOT player assignments
      // This allows the user to start fresh with player placement
      if (originalChart.DepthChartPositions) {
        for (const position of originalChart.DepthChartPositions) {
          await DepthChartPosition.create({
            depth_chart_id: newChart.id,
            position_code: position.position_code,
            position_name: position.position_name,
            color: position.color,
            icon: position.icon,
            sort_order: position.sort_order,
            is_active: true,
            max_players: position.max_players,
            description: position.description
          });
        }
      }

      res.json({
        success: true,
        message: 'Depth chart duplicated successfully',
        data: { id: newChart.id }
      });
    } catch (error) {
      console.error('Error duplicating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error duplicating depth chart'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/:id/history
 * @description Retrieves the change history for a depth chart.
 *              Currently returns basic creation history.
 *              Note: A full audit trail would require a separate history/audit table.
 * @access Private - Requires authentication and view permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canView - Permission check for depth chart viewing
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of history entries
 * @returns {number} response.data[].id - History entry ID
 * @returns {string} response.data[].action - Action type (Created, Updated, etc.)
 * @returns {string} response.data[].description - Human-readable description
 * @returns {string} response.data[].created_at - Timestamp of the action
 * @returns {Object} response.data[].User - User who performed the action
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks view permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id/history',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canView,
  async (req, res) => {
    try {
      // Database: Find depth chart (including soft-deleted for history purposes)
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          // Permission: Team isolation
          team_id: req.user.team_id
          // Note: Not filtering by is_active to allow viewing history of deleted charts
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Business logic: Return basic history from chart metadata
      // TODO: For full audit trail, implement a separate DepthChartHistory table
      const history = [
        {
          id: 1,
          action: 'Created',
          description: `Depth chart "${depthChart.name}" was created`,
          created_at: depthChart.created_at,
          User: {
            id: depthChart.created_by,
            first_name: 'System',
            last_name: 'User'
          }
        }
      ];

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching depth chart history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching depth chart history'
      });
    }
  }
);

module.exports = router;
