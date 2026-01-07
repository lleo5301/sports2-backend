/**
 * @fileoverview Reports routes for managing custom reports, scouting reports, and data exports.
 * All routes in this file require authentication via the protect middleware.
 * Reports are scoped to teams - users can only access reports belonging to their team.
 *
 * Report Types:
 * This module handles two distinct report systems:
 *
 * 1. Custom Reports (Report model):
 *    - User-created configurable reports with sections and filters
 *    - Types: player-performance, team-statistics, scouting-analysis, recruitment-pipeline, custom
 *    - Status workflow: draft -> published -> archived
 *    - Stored with team_id and created_by for ownership tracking
 *
 * 2. Scouting Reports (ScoutingReport model):
 *    - Player evaluation reports created by scouts/coaches
 *    - Contains skill ratings, overall grades, and narrative evaluations
 *    - Associated with specific players via player_id
 *    - Multi-tenant isolation via Player's team_id
 *
 * Data Export Endpoints:
 * - PDF generation: Converts report data to PDF format (placeholder implementation)
 * - Excel export: Converts report data to Excel format (placeholder implementation)
 *
 * Analytics Endpoints:
 * - Player performance: Aggregated stats across team roster
 * - Team statistics: Win/loss records, batting averages, ERA
 * - Scouting analysis: Aggregated scouting report metrics
 * - Recruitment pipeline: Prospect tracking by priority and status
 *
 * Permission Model:
 * - reports_view: Required to view reports (byId, analysis endpoints)
 * - reports_create: Required to create reports and exports
 * - reports_edit: Required to update reports
 * - reports_delete: Required to delete reports
 *
 * @module routes/reports
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../middleware/permissions
 * @requires ../models
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { handleValidationErrors } = require('../middleware/validation');
const { Report, Player, Team, ScoutingReport, User } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

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

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/reports
 * @description Retrieves all custom reports for the authenticated user's team.
 *              Returns reports sorted by creation date (newest first).
 *              Includes creator information for attribution.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of report objects
 * @returns {number} response.data[].id - Report ID
 * @returns {string} response.data[].title - Report title
 * @returns {string} response.data[].description - Report description
 * @returns {string} response.data[].type - Report type
 * @returns {string} response.data[].status - Report status (draft/published/archived)
 * @returns {Array} response.data[].data_sources - Data source configurations
 * @returns {Array} response.data[].sections - Section configurations
 * @returns {Object} response.data[].filters - Filter criteria
 * @returns {Object} response.data[].created_by_user - Creator information
 * @returns {number} response.data[].created_by_user.id - Creator's user ID
 * @returns {string} response.data[].created_by_user.first_name - Creator's first name
 * @returns {string} response.data[].created_by_user.last_name - Creator's last name
 * @returns {string} response.data[].created_by_user.email - Creator's email
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    // Database: Fetch all reports for user's team with creator info
    const reports = await Report.findAll({
      where: {
        // Permission: Multi-tenant isolation - only show team's reports
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          // Business logic: Include only essential creator fields for attribution
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      // Business logic: Newest reports first for better discoverability
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports'
    });
  }
});

/**
 * @route GET /api/reports/scouting
 * @description Retrieves scouting reports with pagination and optional filtering.
 *              Scouting reports are linked to players and contain evaluation data.
 *              Multi-tenant isolation is enforced via the Player's team_id.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=20] - Number of reports per page
 * @param {string} [req.query.player_id] - Optional filter by specific player
 * @param {string} [req.query.start_date] - Start date for date range filter (ISO 8601)
 * @param {string} [req.query.end_date] - End date for date range filter (ISO 8601)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of scouting report objects
 * @returns {number} response.data[].id - Scouting report ID
 * @returns {string} response.data[].report_date - Date of the scouting report
 * @returns {string} response.data[].overall_grade - Overall grade (A-F scale)
 * @returns {Object} response.data[].Player - Associated player information
 * @returns {number} response.data[].Player.id - Player ID
 * @returns {string} response.data[].Player.first_name - Player's first name
 * @returns {string} response.data[].Player.last_name - Player's last name
 * @returns {string} response.data[].Player.position - Player's position
 * @returns {string} response.data[].Player.school - Player's school
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Items per page
 * @returns {number} response.pagination.total - Total number of reports
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/scouting', async (req, res) => {
  try {
    console.log('Scouting reports request - user team_id:', req.user.team_id);
    console.log('Scouting reports request - query params:', req.query);

    // Pagination: Parse page and limit with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Business logic: Build where clause for optional filters
    const whereClause = {};

    // Filter: Optionally filter by specific player
    if (req.query.player_id) {
      whereClause.player_id = req.query.player_id;
    }

    // Filter: Optionally filter by date range (both dates required for range)
    if (req.query.start_date && req.query.end_date) {
      whereClause.report_date = {
        [Op.between]: [req.query.start_date, req.query.end_date]
      };
    }

    // Database: Fetch scouting reports with pagination
    const { count, rows: reports } = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          // Permission: Multi-tenant isolation enforced via Player's team_id
          where: { team_id: req.user.team_id },
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        }
      ],
      // Business logic: Most recent reports first
      order: [['report_date', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get scouting reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting reports'
    });
  }
});

/**
 * @route GET /api/reports/custom/:id
 * @description Retrieves a specific custom report by ID.
 *              Multi-tenant isolation ensures users can only access their team's reports.
 *              Includes creator information for attribution.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Report ID (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Report object
 * @returns {number} response.data.id - Report ID
 * @returns {string} response.data.title - Report title
 * @returns {string} response.data.description - Report description
 * @returns {string} response.data.type - Report type
 * @returns {string} response.data.status - Report status
 * @returns {Array} response.data.data_sources - Data source configurations
 * @returns {Array} response.data.sections - Section configurations
 * @returns {Object} response.data.filters - Filter criteria
 * @returns {Object} response.data.created_by_user - Creator information
 *
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/custom/:id', async (req, res) => {
  try {
    // Database: Find report with team scoping for security
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        // Permission: Multi-tenant isolation - must belong to user's team
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    // Validation: Report must exist and belong to user's team
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

/**
 * @route GET /api/reports/byId/:id
 * @description Retrieves a specific custom report by ID with permission check.
 *              Alternative endpoint to /custom/:id with explicit permission validation.
 *              Multi-tenant isolation ensures users can only access their team's reports.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} req.params.id - Report ID (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Report object with creator information
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', checkPermission('reports_view'), async (req, res) => {
  try {
    // Database: Find report with team scoping for security
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        // Permission: Multi-tenant isolation - must belong to user's team
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    // Validation: Report must exist and belong to user's team
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

/**
 * @route POST /api/reports
 * @description Creates a new custom report for the authenticated user's team.
 *              Sets the team_id and created_by fields automatically.
 *              Default status is 'draft' if not specified.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Report creation permission required
 *
 * @param {string} req.body.title - Report title (1-200 characters, required)
 * @param {string} req.body.type - Report type (required)
 * @param {string} [req.body.description] - Report description (max 1000 characters)
 * @param {string} [req.body.status='draft'] - Initial status (draft/published/archived)
 * @param {Array} [req.body.data_sources] - Array of data source configurations
 * @param {Array} [req.body.sections] - Array of section configurations
 * @param {Object} [req.body.filters] - Filter criteria object
 * @param {Object} [req.body.schedule] - Scheduling configuration for automated reports
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created report object
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {500} Server error - Database creation failure
 */
router.post('/', checkPermission('reports_create'), async (req, res) => {
  try {
    // Database: Create new report with team and creator context
    const report = await Report.create({
      ...req.body,
      // Permission: Automatically associate with user's team
      team_id: req.user.team_id,
      // Business logic: Track creator for attribution
      created_by: req.user.id,
      // Business logic: Default to draft status for new reports
      status: req.body.status || 'draft'
    });

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: report
    });
  } catch (error) {
    // Error: Database creation failure (validation, constraints)
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating report'
    });
  }
});

/**
 * @route PUT /api/reports/byId/:id
 * @description Updates an existing custom report.
 *              Multi-tenant isolation ensures users can only update their team's reports.
 *              Supports partial updates - only provided fields are modified.
 * @access Private - Requires authentication + reports_edit permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_edit') - Report editing permission required
 *
 * @param {string} req.params.id - Report ID (UUID)
 * @param {string} [req.body.title] - Updated title (1-200 characters)
 * @param {string} [req.body.description] - Updated description (max 1000 characters)
 * @param {string} [req.body.status] - Updated status (draft/published/archived)
 * @param {Array} [req.body.data_sources] - Updated data sources
 * @param {Array} [req.body.sections] - Updated sections
 * @param {Object} [req.body.filters] - Updated filters
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated report object
 *
 * @throws {403} Forbidden - User lacks reports_edit permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database update failure
 */
router.put('/byId/:id', checkPermission('reports_edit'), async (req, res) => {
  try {
    // Database: Find report with team scoping for security
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        // Permission: Multi-tenant isolation - must belong to user's team
        team_id: req.user.team_id
      }
    });

    // Validation: Report must exist and belong to user's team
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Database: Apply partial update with provided fields
    await report.update(req.body);

    res.json({
      success: true,
      message: 'Report updated successfully',
      data: report
    });
  } catch (error) {
    // Error: Database update failure (validation, constraints)
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report'
    });
  }
});

/**
 * @route DELETE /api/reports/byId/:id
 * @description Permanently deletes a custom report.
 *              This is a hard delete - the report cannot be recovered.
 *              Multi-tenant isolation ensures users can only delete their team's reports.
 * @access Private - Requires authentication + reports_delete permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_delete') - Report deletion permission required
 *
 * @param {string} req.params.id - Report ID (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {403} Forbidden - User lacks reports_delete permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database deletion failure
 */
router.delete('/byId/:id', checkPermission('reports_delete'), async (req, res) => {
  try {
    // Database: Find report with team scoping for security
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        // Permission: Multi-tenant isolation - must belong to user's team
        team_id: req.user.team_id
      }
    });

    // Validation: Report must exist and belong to user's team
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Database: Permanently delete the report
    await report.destroy();

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    // Error: Database deletion failure
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report'
    });
  }
});

/**
 * @route GET /api/reports/player-performance
 * @description Retrieves player performance statistics for the team.
 *              Returns batting and pitching statistics for all players with optional filtering.
 *              Validates that the user is associated with a team before proceeding.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} [req.query.start_date] - Filter by creation date start (ISO 8601)
 * @param {string} [req.query.end_date] - Filter by creation date end (ISO 8601)
 * @param {string} [req.query.position] - Filter by player position
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Performance data object
 * @returns {Array<Object>} response.data.players - Array of player statistics
 * @returns {number} response.data.players[].id - Player ID
 * @returns {string} response.data.players[].first_name - Player's first name
 * @returns {string} response.data.players[].last_name - Player's last name
 * @returns {string} response.data.players[].position - Player's position
 * @returns {number|null} response.data.players[].batting_avg - Batting average
 * @returns {number|null} response.data.players[].home_runs - Home run count
 * @returns {number|null} response.data.players[].rbi - Runs batted in
 * @returns {number|null} response.data.players[].era - Earned run average
 * @returns {number|null} response.data.players[].wins - Pitching wins
 * @returns {number|null} response.data.players[].losses - Pitching losses
 * @returns {number|null} response.data.players[].strikeouts - Strikeout count
 * @returns {Object} response.data.filters - Applied filters
 * @returns {string} response.data.generated_at - Report generation timestamp
 *
 * @throws {400} Bad request - User not associated with a team
 * @throws {500} Server error - Database query failure
 */
router.get('/player-performance', async (req, res) => {
  try {
    console.log('Player performance request - user:', req.user);
    console.log('Player performance request - user team_id:', req.user.team_id);

    // Validation: User must be associated with a team
    if (!req.user.team_id) {
      console.error('User has no team_id:', req.user.id);
      return res.status(400).json({
        success: false,
        message: 'User is not associated with a team'
      });
    }

    // Business logic: Build where clause for player query
    const whereClause = {
      // Permission: Multi-tenant isolation - only show team's players
      team_id: req.user.team_id
    };

    // Filter: Optionally filter by date range (based on player creation date)
    if (req.query.start_date && req.query.end_date) {
      whereClause.created_at = {
        [Op.between]: [req.query.start_date, req.query.end_date]
      };
    }

    // Filter: Optionally filter by position
    if (req.query.position) {
      whereClause.position = req.query.position;
    }

    console.log('Player performance query whereClause:', whereClause);

    // Business logic: Check if team has any players (for debugging)
    const playerCount = await Player.count({
      where: { team_id: req.user.team_id }
    });
    console.log('Total players for team:', playerCount);

    // Database: Fetch players with performance statistics
    const players = await Player.findAll({
      where: whereClause,
      // Business logic: Select only relevant performance fields
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'batting_avg',
        'home_runs', 'rbi', 'era', 'wins', 'losses', 'strikeouts'
      ],
      // Business logic: Sort alphabetically by name
      order: [['last_name', 'ASC'], ['first_name', 'ASC']]
    });

    console.log('Player performance query result count:', players.length);

    res.json({
      success: true,
      data: {
        players,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get player performance error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching player performance data'
    });
  }
});

/**
 * @route GET /api/reports/team-statistics
 * @description Retrieves aggregated team statistics including batting average, ERA, and win record.
 *              Calculates averages across all players with valid statistics.
 *              Win percentage is calculated from pitcher wins/losses.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics object
 * @returns {string} response.data.team_name - Name of the team
 * @returns {number} response.data.total_players - Total player count
 * @returns {string|null} response.data.team_batting_avg - Team batting average (3 decimal places)
 * @returns {string|null} response.data.team_era - Team ERA (2 decimal places)
 * @returns {number} response.data.wins - Total pitcher wins
 * @returns {number} response.data.losses - Total pitcher losses
 * @returns {string|null} response.data.win_percentage - Win percentage (1 decimal place)
 * @returns {Object} response.data.filters - Applied filters (from query params)
 * @returns {string} response.data.generated_at - Report generation timestamp
 *
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database query failure
 */
router.get('/team-statistics', async (req, res) => {
  try {
    // Database: Fetch team for team name
    const team = await Team.findByPk(req.user.team_id);

    // Validation: Team must exist
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Database: Get total player count
    const playerCount = await Player.count({
      where: { team_id: req.user.team_id }
    });

    // Database: Fetch players with statistics for calculations
    const players = await Player.findAll({
      where: { team_id: req.user.team_id },
      attributes: ['batting_avg', 'era', 'wins', 'losses']
    });

    // Business logic: Calculate team batting average from valid values only
    // Filters out null/undefined values before averaging
    const validBattingAverages = players
      .map(p => p.batting_avg)
      .filter(avg => avg !== null && avg !== undefined);

    const teamBattingAverage = validBattingAverages.length > 0
      ? (validBattingAverages.reduce((sum, avg) => sum + avg, 0) / validBattingAverages.length).toFixed(3)
      : null;

    // Business logic: Calculate team ERA from valid values only
    // Filters out null/undefined values before averaging
    const validERAs = players
      .map(p => p.era)
      .filter(era => era !== null && era !== undefined);

    const teamERA = validERAs.length > 0
      ? (validERAs.reduce((sum, era) => sum + era, 0) / validERAs.length).toFixed(2)
      : null;

    // Business logic: Calculate win/loss record from pitcher statistics
    // Uses 0 as default for null values
    const totalWins = players.reduce((sum, p) => sum + (p.wins || 0), 0);
    const totalLosses = players.reduce((sum, p) => sum + (p.losses || 0), 0);

    // Business logic: Calculate win percentage (avoid division by zero)
    const winPercentage = (totalWins + totalLosses) > 0
      ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
      : null;

    res.json({
      success: true,
      data: {
        team_name: team.name,
        total_players: playerCount,
        team_batting_avg: teamBattingAverage,
        team_era: teamERA,
        wins: totalWins,
        losses: totalLosses,
        win_percentage: winPercentage,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    // Error: Database query failure or connection issues
    console.error('Get team statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});


/**
 * @route GET /api/reports/recruitment-pipeline
 * @description Retrieves recruitment pipeline data with prospect stages.
 *              Returns mock data representing the recruitment funnel.
 *              Note: This endpoint returns static mock data for demonstration purposes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Pipeline data object
 * @returns {Array<Object>} response.data.pipeline - Array of pipeline stages
 * @returns {string} response.data.pipeline[].stage_name - Name of the pipeline stage
 * @returns {number} response.data.pipeline[].player_count - Number of players in stage
 * @returns {number} response.data.pipeline[].avg_grade - Average grade of players in stage
 * @returns {string} response.data.pipeline[].next_action - Suggested next action for stage
 * @returns {Object} response.data.filters - Applied filters (from query params)
 * @returns {string} response.data.generated_at - Report generation timestamp
 *
 * @throws {500} Server error - Unexpected error
 */
router.get('/recruitment-pipeline', async (req, res) => {
  try {
    // Business logic: Mock recruitment pipeline data
    // TODO: Replace with actual database queries when recruitment system is implemented
    const pipelineData = [
      {
        stage_name: 'Prospects',
        player_count: 45,
        avg_grade: 78.5,
        next_action: 'Schedule evaluation'
      },
      {
        stage_name: 'Evaluated',
        player_count: 23,
        avg_grade: 82.3,
        next_action: 'Make offer decision'
      },
      {
        stage_name: 'Offered',
        player_count: 12,
        avg_grade: 85.7,
        next_action: 'Follow up on offer'
      },
      {
        stage_name: 'Committed',
        player_count: 8,
        avg_grade: 87.2,
        next_action: 'Prepare enrollment'
      },
      {
        stage_name: 'Enrolled',
        player_count: 5,
        avg_grade: 89.1,
        next_action: 'Begin training'
      }
    ];

    res.json({
      success: true,
      data: {
        pipeline: pipelineData,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    // Error: Unexpected error in mock data generation
    console.error('Get recruitment pipeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline data'
    });
  }
});

/**
 * @route POST /api/reports/generate-pdf
 * @description Generates a PDF version of a report.
 *              Note: This is a placeholder implementation - actual PDF generation not yet implemented.
 *              Returns success response with metadata about what would be generated.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.body.type - Type of report to generate
 * @param {Object} [req.body.data] - Report data to include in PDF
 * @param {Object} [req.body.options] - PDF generation options
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message (indicates placeholder implementation)
 * @returns {Object} response.data - Generation metadata
 * @returns {string} response.data.type - Report type that would be generated
 * @returns {string} response.data.generated_at - Timestamp of request
 *
 * @throws {500} Server error - Unexpected error
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    // Business logic: Placeholder implementation
    // TODO: Implement actual PDF generation using a library like pdfmake or puppeteer
    res.json({
      success: true,
      message: 'PDF generation endpoint - implementation would generate actual PDF',
      data: {
        type: req.body.type,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    // Error: Unexpected error
    console.error('Generate PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF'
    });
  }
});

/**
 * @route POST /api/reports/export-excel
 * @description Exports report data to Excel format.
 *              Note: This is a placeholder implementation - actual Excel export not yet implemented.
 *              Returns success response with metadata about what would be generated.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.body.type - Type of report to export
 * @param {Object} [req.body.data] - Report data to include in Excel
 * @param {Object} [req.body.options] - Export options
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message (indicates placeholder implementation)
 * @returns {Object} response.data - Export metadata
 * @returns {string} response.data.type - Report type that would be exported
 * @returns {string} response.data.generated_at - Timestamp of request
 *
 * @throws {500} Server error - Unexpected error
 */
router.post('/export-excel', async (req, res) => {
  try {
    // Business logic: Placeholder implementation
    // TODO: Implement actual Excel export using a library like exceljs or xlsx
    res.json({
      success: true,
      message: 'Excel export endpoint - implementation would generate actual Excel file',
      data: {
        type: req.body.type,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    // Error: Unexpected error
    console.error('Export Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting to Excel'
    });
  }
});

/**
 * @route GET /api/reports/player-performance (with permission check)
 * @description Retrieves detailed player performance statistics with permission validation.
 *              Returns batting and pitching statistics for active players with optional filtering.
 *              Includes summary statistics (averages) in the response.
 *              Note: Due to Express routing, this handler is unreachable because an earlier
 *              route handler for the same path exists above. Consider refactoring to consolidate.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Filter by date range start (currently unused)
 * @param {string} [req.query.end_date] - Filter by date range end (currently unused)
 * @param {string} [req.query.position] - Filter by player position
 * @param {string} [req.query.school_type] - Filter by school type (HS, COLL)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Performance data
 * @returns {Array<Object>} response.data.players - Player statistics array
 * @returns {Object} response.data.filters - Applied filter values
 * @returns {Object} response.data.summary - Aggregated statistics
 * @returns {number} response.data.summary.total_players - Total player count
 * @returns {number} response.data.summary.avg_batting_avg - Average batting average
 * @returns {number} response.data.summary.avg_era - Average ERA
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 * @deprecated This route handler is unreachable - consolidate with the earlier handler
 */
router.get('/player-performance', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Player } = require('../models');
    const { start_date, end_date, position, school_type } = req.query;

    // Business logic: Build where clause for active players with filters
    const whereClause = {
      team_id: req.user.team_id,
      status: 'active'
    };

    // Filter: Optionally filter by position
    if (position) whereClause.position = position;
    // Filter: Optionally filter by school type
    if (school_type) whereClause.school_type = school_type;

    // Database: Fetch players with comprehensive performance stats
    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
        'runs', 'hits', 'rbis', 'walks', 'strikeouts',
        'era', 'wins', 'losses', 'saves', 'innings_pitched'
      ],
      // Business logic: Sort by batting average descending (best performers first)
      order: [['batting_avg', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        players,
        filters: { start_date, end_date, position, school_type },
        // Business logic: Calculate summary statistics for the team
        summary: {
          total_players: players.length,
          avg_batting_avg: players.reduce((sum, p) => sum + (parseFloat(p.batting_avg) || 0), 0) / players.length || 0,
          avg_era: players.reduce((sum, p) => sum + (parseFloat(p.era) || 0), 0) / players.length || 0
        }
      }
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching player performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching player performance report'
    });
  }
});

/**
 * @route GET /api/reports/team-statistics (with permission check)
 * @description Retrieves comprehensive team statistics including game records and roster breakdown.
 *              Calculates win/loss/tie records and categorizes players by position and school type.
 *              Note: Due to Express routing, this handler is unreachable because an earlier
 *              route handler for the same path exists above. Consider refactoring to consolidate.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.season] - Optional filter by season
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics
 * @returns {Object} response.data.games - Game statistics
 * @returns {number} response.data.games.total - Total games played
 * @returns {number} response.data.games.wins - Total wins
 * @returns {number} response.data.games.losses - Total losses
 * @returns {number} response.data.games.ties - Total ties
 * @returns {string} response.data.games.win_percentage - Win percentage
 * @returns {Object} response.data.players - Player breakdown
 * @returns {number} response.data.players.total - Total active players
 * @returns {number} response.data.players.pitchers - Number of pitchers
 * @returns {number} response.data.players.position_players - Number of position players
 * @returns {number} response.data.players.high_school - High school players
 * @returns {number} response.data.players.college - College players
 * @returns {string} response.data.season - Season filter applied (or 'All')
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 * @deprecated This route handler is unreachable - consolidate with the earlier handler
 */
router.get('/team-statistics', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Game, Player } = require('../models');
    const { season } = req.query;

    // Business logic: Build where clause for games
    const whereClause = { team_id: req.user.team_id };
    // Filter: Optionally filter by season
    if (season) whereClause.season = season;

    // Database: Fetch team games for win/loss record
    const games = await Game.findAll({ where: whereClause });

    // Database: Fetch active players for roster breakdown
    const players = await Player.findAll({
      where: { team_id: req.user.team_id, status: 'active' }
    });

    // Business logic: Calculate game statistics and player breakdown
    const stats = {
      games: {
        total: games.length,
        wins: games.filter(g => g.result === 'W').length,
        losses: games.filter(g => g.result === 'L').length,
        ties: games.filter(g => g.result === 'T').length,
        win_percentage: games.length > 0 ? (games.filter(g => g.result === 'W').length / games.length * 100).toFixed(1) : 0
      },
      players: {
        total: players.length,
        pitchers: players.filter(p => p.position === 'P').length,
        position_players: players.filter(p => p.position !== 'P').length,
        high_school: players.filter(p => p.school_type === 'HS').length,
        college: players.filter(p => p.school_type === 'COLL').length
      },
      season: season || 'All'
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching team statistics report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics report'
    });
  }
});

/**
 * @route GET /api/reports/scouting-analysis
 * @description Retrieves scouting analysis with aggregated metrics across scouting reports.
 *              Calculates average grades, groups reports by position, and returns recent reports.
 *              Uses a grade-to-numeric conversion for averaging letter grades (A+ = 97, A = 93, etc.).
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Start date for date range filter (ISO 8601)
 * @param {string} [req.query.end_date] - End date for date range filter (ISO 8601)
 * @param {string} [req.query.position] - Position filter (currently unused in query)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Analysis data
 * @returns {number} response.data.total_reports - Total scouting reports found
 * @returns {string} response.data.average_grade - Average numeric grade (0-100 scale)
 * @returns {Object} response.data.reports_by_position - Count of reports grouped by position
 * @returns {Array<Object>} response.data.recent_reports - Last 10 scouting reports
 * @returns {Object} response.data.date_range - Applied date range filter
 * @returns {string} response.data.generated_at - Report generation timestamp
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/scouting-analysis', checkPermission('reports_view'), async (req, res) => {
  try {
    const { start_date, end_date, position } = req.query;

    console.log('Scouting analysis request - user team_id:', req.user.team_id);
    console.log('Scouting analysis request - query params:', req.query);

    // Business logic: Build where clause for date filtering
    const whereClause = {};
    if (start_date && end_date) {
      whereClause.report_date = { [Op.between]: [start_date, end_date] };
    }

    // Database: Fetch scouting reports with player info
    const reports = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [{
        model: Player,
        // Permission: Multi-tenant isolation via Player's team_id
        where: { team_id: req.user.team_id },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school_type']
      }],
      order: [['report_date', 'DESC']]
    });

    console.log('Scouting analysis query result count:', reports.count);

    /**
     * @description Converts letter grades to numeric values for statistical calculations.
     *              Grade scale: A+ = 97, A = 93, A- = 90, B+ = 87, B = 83, B- = 80,
     *              C+ = 77, C = 73, C- = 70, D+ = 67, D = 63, D- = 60, F = 50
     * @param {string} grade - Letter grade (e.g., 'A+', 'B-', 'F')
     * @returns {number} Numeric value (0-100 scale, 0 if grade not recognized)
     */
    const gradeToNumeric = (grade) => {
      const gradeMap = {
        'A+': 97, 'A': 93, 'A-': 90,
        'B+': 87, 'B': 83, 'B-': 80,
        'C+': 77, 'C': 73, 'C-': 70,
        'D+': 67, 'D': 63, 'D-': 60,
        'F': 50
      };
      return gradeMap[grade] || 0;
    };

    // Business logic: Calculate average grade from valid grades
    const totalReports = reports.count;
    const validGrades = reports.rows.filter(r => r.overall_grade).map(r => gradeToNumeric(r.overall_grade));
    const avgGrade = validGrades.length > 0
      ? (validGrades.reduce((sum, grade) => sum + grade, 0) / validGrades.length).toFixed(1)
      : 0;

    // Business logic: Build analysis response
    const analysis = {
      total_reports: totalReports,
      average_grade: avgGrade,
      reports_by_position: {},
      recent_reports: reports.rows.slice(0, 10),
      date_range: { start_date, end_date },
      generated_at: new Date().toISOString()
    };

    // Business logic: Group reports by player position
    reports.rows.forEach(report => {
      const position = report.Player.position;
      if (!analysis.reports_by_position[position]) {
        analysis.reports_by_position[position] = 0;
      }
      analysis.reports_by_position[position]++;
    });

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching scouting analysis report:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting analysis report'
    });
  }
});

/**
 * @route GET /api/reports/recruitment-pipeline (with permission check)
 * @description Retrieves recruitment pipeline with actual database data.
 *              Returns high school recruits grouped by priority, status, and position.
 *              Uses PreferenceList association for tracking recruitment status.
 *              Note: Due to Express routing, this handler is unreachable because an earlier
 *              route handler for the same path exists above. Consider refactoring to consolidate.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Pipeline data
 * @returns {number} response.data.total_recruits - Total high school recruits
 * @returns {Object} response.data.by_priority - Counts grouped by priority (high/medium/low/unassigned)
 * @returns {Object} response.data.by_status - Counts grouped by status (active/committed/declined/pending)
 * @returns {Object} response.data.by_position - Counts grouped by position
 * @returns {Array<Object>} response.data.recent_additions - Last 10 added recruits
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 * @deprecated This route handler is unreachable - consolidate with the earlier handler
 */
router.get('/recruitment-pipeline', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Player, PreferenceList } = require('../models');

    // Database: Fetch high school recruits with preference list data
    const recruits = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        // Business logic: Only high school players for recruitment pipeline
        school_type: 'HS',
        status: 'active'
      },
      include: [{
        model: PreferenceList,
        where: { team_id: req.user.team_id },
        // Business logic: Left join - include players without preference list entries
        required: false,
        attributes: ['list_type', 'priority', 'status', 'interest_level']
      }],
      // Business logic: Newest recruits first
      order: [['created_at', 'DESC']]
    });

    // Business logic: Build pipeline statistics
    const pipeline = {
      total_recruits: recruits.length,
      by_priority: {
        high: recruits.filter(r => r.PreferenceList?.priority === 'high').length,
        medium: recruits.filter(r => r.PreferenceList?.priority === 'medium').length,
        low: recruits.filter(r => r.PreferenceList?.priority === 'low').length,
        unassigned: recruits.filter(r => !r.PreferenceList?.priority).length
      },
      by_status: {
        active: recruits.filter(r => r.PreferenceList?.status === 'active').length,
        committed: recruits.filter(r => r.PreferenceList?.status === 'committed').length,
        declined: recruits.filter(r => r.PreferenceList?.status === 'declined').length,
        pending: recruits.filter(r => !r.PreferenceList?.status || r.PreferenceList?.status === 'pending').length
      },
      by_position: {},
      recent_additions: recruits.slice(0, 10)
    };

    // Business logic: Group by position
    recruits.forEach(recruit => {
      const position = recruit.position;
      if (!pipeline.by_position[position]) {
        pipeline.by_position[position] = 0;
      }
      pipeline.by_position[position]++;
    });

    res.json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching recruitment pipeline report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline report'
    });
  }
});

/**
 * @route POST /api/reports/generate-pdf (with permission check)
 * @description Generates a PDF report with permission validation.
 *              Note: This is a placeholder implementation - actual PDF generation not yet implemented.
 *              Note: Due to Express routing, this handler is unreachable because an earlier
 *              route handler for the same path exists above. Consider refactoring to consolidate.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Report creation permission required
 *
 * @param {string} req.body.type - Type of report to generate
 * @param {Object} [req.body.data] - Report data to include in PDF
 * @param {Object} [req.body.options] - PDF generation options
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message
 * @returns {Object} response.data - Generation metadata
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {500} Server error - Unexpected error
 * @deprecated This route handler is unreachable - consolidate with the earlier handler
 */
router.post('/generate-pdf', checkPermission('reports_create'), async (req, res) => {
  try {
    const { type, data, options } = req.body;

    // Business logic: Placeholder implementation
    // TODO: Implement actual PDF generation using a library like pdfmake or puppeteer
    res.json({
      success: true,
      message: 'PDF generation endpoint - implement PDF generation logic',
      data: { type, options }
    });
  } catch (error) {
    // Error: Unexpected error
    console.error('Error generating PDF report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report'
    });
  }
});

/**
 * @route POST /api/reports/export-excel (with permission check)
 * @description Exports report data to Excel format with permission validation.
 *              Note: This is a placeholder implementation - actual Excel export not yet implemented.
 *              Note: Due to Express routing, this handler is unreachable because an earlier
 *              route handler for the same path exists above. Consider refactoring to consolidate.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Report creation permission required
 *
 * @param {string} req.body.type - Type of report to export
 * @param {Object} [req.body.data] - Report data to include in Excel
 * @param {Object} [req.body.options] - Export options
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Status message
 * @returns {Object} response.data - Export metadata
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {500} Server error - Unexpected error
 * @deprecated This route handler is unreachable - consolidate with the earlier handler
 */
router.post('/export-excel', checkPermission('reports_create'), async (req, res) => {
  try {
    const { type, data, options } = req.body;

    // Business logic: Placeholder implementation
    // TODO: Implement actual Excel export using a library like exceljs or xlsx
    res.json({
      success: true,
      message: 'Excel export endpoint - implement Excel generation logic',
      data: { type, options }
    });
  } catch (error) {
    // Error: Unexpected error
    console.error('Error exporting Excel report:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting Excel report'
    });
  }
});

/**
 * @route POST /api/reports/scouting
 * @description Creates a new scouting report for a player.
 *              Validates that the player belongs to the user's team before creation.
 *              Returns the created report with player and creator information.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.body.player_id - ID of the player being evaluated (required)
 * @param {string} req.body.report_date - Date of the scouting evaluation
 * @param {string} [req.body.overall_grade] - Overall grade (A+, A, A-, B+, etc.)
 * @param {string} [req.body.hitting_grade] - Hitting ability grade
 * @param {string} [req.body.power_grade] - Power hitting grade
 * @param {string} [req.body.speed_grade] - Speed/running grade
 * @param {string} [req.body.arm_grade] - Arm strength grade
 * @param {string} [req.body.fielding_grade] - Fielding ability grade
 * @param {string} [req.body.notes] - Narrative evaluation notes
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created scouting report with associations
 * @returns {Object} response.data.Player - Player information
 * @returns {Object} response.data.User - Creator information
 *
 * @throws {404} Not found - Player not found or belongs to different team
 * @throws {500} Server error - Database creation failure
 */
router.post('/scouting', async (req, res) => {
  try {
    console.log('Create scouting report request:', req.body);
    console.log('User team_id:', req.user.team_id);

    // Validation: Ensure player exists and belongs to user's team
    // This enforces multi-tenant isolation for scouting reports
    const player = await Player.findOne({
      where: {
        id: req.body.player_id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found or does not belong to your team'
      });
    }

    // Database: Create the scouting report
    const scoutingReport = await ScoutingReport.create({
      ...req.body,
      // Business logic: Track who created the report
      created_by: req.user.id
    });

    // Database: Fetch the created report with associations for response
    const createdReport = await ScoutingReport.findByPk(scoutingReport.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Scouting report created successfully',
      data: createdReport
    });
  } catch (error) {
    // Error: Database creation failure or validation error
    console.error('Create scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating scouting report'
    });
  }
});

/**
 * @route GET /api/reports/scouting/:id
 * @description Retrieves a specific scouting report by ID.
 *              Multi-tenant isolation is enforced via the Player's team_id.
 *              Returns the report with player and creator information.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Scouting report ID (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Scouting report object
 * @returns {number} response.data.id - Report ID
 * @returns {string} response.data.report_date - Date of evaluation
 * @returns {string} response.data.overall_grade - Overall grade
 * @returns {Object} response.data.Player - Associated player
 * @returns {number} response.data.Player.id - Player ID
 * @returns {string} response.data.Player.first_name - Player's first name
 * @returns {string} response.data.Player.last_name - Player's last name
 * @returns {string} response.data.Player.position - Player's position
 * @returns {string} response.data.Player.school - Player's school
 * @returns {Object} response.data.User - Report creator
 * @returns {number} response.data.User.id - Creator's user ID
 * @returns {string} response.data.User.first_name - Creator's first name
 * @returns {string} response.data.User.last_name - Creator's last name
 *
 * @throws {404} Not found - Report not found or player belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/scouting/:id', async (req, res) => {
  try {
    // Database: Find report with team scoping via Player association
    const report = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: Player,
          // Permission: Multi-tenant isolation via Player's team_id
          where: { team_id: req.user.team_id },
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Validation: Report must exist and player must belong to user's team
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Get scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting report'
    });
  }
});

/**
 * @route PUT /api/reports/scouting/:id
 * @description Updates an existing scouting report.
 *              Multi-tenant isolation is enforced via the Player's team_id.
 *              If changing the player_id, validates the new player belongs to user's team.
 *              Supports partial updates - only provided fields are modified.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Scouting report ID (UUID)
 * @param {string} [req.body.player_id] - New player ID (must belong to user's team)
 * @param {string} [req.body.report_date] - Updated evaluation date
 * @param {string} [req.body.overall_grade] - Updated overall grade
 * @param {string} [req.body.hitting_grade] - Updated hitting grade
 * @param {string} [req.body.power_grade] - Updated power grade
 * @param {string} [req.body.speed_grade] - Updated speed grade
 * @param {string} [req.body.arm_grade] - Updated arm grade
 * @param {string} [req.body.fielding_grade] - Updated fielding grade
 * @param {string} [req.body.notes] - Updated evaluation notes
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated scouting report with associations
 *
 * @throws {404} Not found - Report not found, player belongs to different team, or new player not found
 * @throws {500} Server error - Database update failure
 */
router.put('/scouting/:id', async (req, res) => {
  try {
    console.log('Update scouting report request:', req.params.id, req.body);

    // Database: Find existing report with team validation via Player
    const existingReport = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: [{
        model: Player,
        // Permission: Multi-tenant isolation via Player's team_id
        where: { team_id: req.user.team_id },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school']
      }]
    });

    // Validation: Report must exist and belong to user's team
    if (!existingReport) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found or does not belong to your team'
      });
    }

    // Validation: If changing player_id, verify new player belongs to user's team
    // This prevents reassigning reports to players from other teams
    if (req.body.player_id && req.body.player_id !== existingReport.player_id) {
      const player = await Player.findOne({
        where: {
          id: req.body.player_id,
          team_id: req.user.team_id
        }
      });

      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found or does not belong to your team'
        });
      }
    }

    // Database: Apply partial update with provided fields
    await existingReport.update(req.body);

    // Database: Fetch updated report with associations for response
    const updatedReport = await ScoutingReport.findByPk(existingReport.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Scouting report updated successfully',
      data: updatedReport
    });
  } catch (error) {
    // Error: Database update failure
    console.error('Update scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating scouting report'
    });
  }
});

module.exports = router;
