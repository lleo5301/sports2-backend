/**
 * @fileoverview Main depth chart routes module.
 * Provides core CRUD operations for depth charts and mounts sub-routers for
 * positions, player assignments, and recommendations.
 *
 * All routes require authentication via the protect middleware. Depth charts are scoped to teams -
 * users can only access depth charts belonging to their team. Additional permission middleware
 * (depthChartPermissions) controls create, edit, delete, and player assignment capabilities.
 *
 * Key features:
 * - Depth chart CRUD operations with soft delete support
 * - Chart duplication for creating variations
 * - Version tracking for change history
 * - Position management (via positions sub-router)
 * - Player assignment (via players sub-router)
 * - Intelligent player recommendations (via recommendations sub-router)
 *
 * @module routes/depthCharts
 * @requires express
 * @requires express-validator
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 */

const express = require('express');
const { param } = require('express-validator');
const { protect } = require('../../middleware/auth');
const { depthChartPermissions } = require('../../middleware/permissions');
const {
  DepthChart,
  DepthChartPosition,
  User,
  Team
} = require('../../models');
const {
  validateDepthChart,
  handleValidationErrors
} = require('./validators');

// Import sub-routers for domain-specific functionality
const positionsRouter = require('./positions');
const playersRouter = require('./players');
const recommendationsRouter = require('./recommendations');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

// Mount sub-routers for domain-specific functionality
// These handle position management, player assignments, and recommendations
router.use('/', positionsRouter);
router.use('/', playersRouter);
router.use('/', recommendationsRouter);

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
    // Import required models for nested query
    const { DepthChartPlayer, Player } = require('../../models');

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
          created_at: depthChart.createdAt,
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
