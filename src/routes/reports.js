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
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { Report, Player, Team, ScoutingReport, User } = require('../models');
const { Op } = require('sequelize');
const notificationService = require('../services/notificationService');

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
 * @returns {Object} response.data - Report object with full details
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', checkPermission('reports_view'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
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
    console.error('Get report by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

/**
 * @route POST /api/reports
 * @description Creates a new custom report for the authenticated user's team.
 *              Reports are created in draft status by default.
 *              Creator is automatically set to the authenticated user.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Report creation permission required
 * @middleware validateReportCreate - Request body validation
 * @middleware handleValidationErrors - Validation error handling
 *
 * @param {string} req.body.title - Report title (required, 1-200 characters)
 * @param {string} req.body.description - Report description (optional, max 1000 characters)
 * @param {string} req.body.type - Report type (required)
 * @param {Array} req.body.data_sources - Data source configurations (optional)
 * @param {Array} req.body.sections - Section configurations (optional)
 * @param {Object} req.body.filters - Filter criteria (optional)
 * @param {Object} req.body.schedule - Scheduling configuration (optional)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created report object
 * @returns {number} response.data.id - Report ID
 * @returns {string} response.data.status - Report status (always 'draft' on creation)
 *
 * @throws {400} Bad request - Validation failed
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {500} Server error - Database operation failure
 */
router.post('/', checkPermission('reports_create'), validateReportCreate, handleValidationErrors, async (req, res) => {
  try {
    const report = await Report.create({
      title: req.body.title,
      description: req.body.description || '',
      type: req.body.type,
      status: 'draft',
      data_sources: req.body.data_sources || [],
      sections: req.body.sections || [],
      filters: req.body.filters || {},
      schedule: req.body.schedule,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Notification: Notify team members of new report creation
    await notificationService.notifyReportCreated(report);

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: report
    });
  } catch (error) {
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
 *              Only reports belonging to the user's team can be updated.
 *              Supports partial updates - only provided fields are updated.
 * @access Private - Requires authentication + reports_edit permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_edit') - Report editing permission required
 * @middleware validateReportUpdate - Request body validation
 * @middleware handleValidationErrors - Validation error handling
 *
 * @param {string} req.params.id - Report ID (UUID)
 * @param {string} req.body.title - Report title (optional, 1-200 characters)
 * @param {string} req.body.description - Report description (optional, max 1000 characters)
 * @param {string} req.body.status - Report status (optional, draft/published/archived)
 * @param {Array} req.body.data_sources - Data source configurations (optional)
 * @param {Array} req.body.sections - Section configurations (optional)
 * @param {Object} req.body.filters - Filter criteria (optional)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated report object
 *
 * @throws {400} Bad request - Validation failed
 * @throws {403} Forbidden - User lacks reports_edit permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database operation failure
 */
router.put('/byId/:id', checkPermission('reports_edit'), validateReportUpdate, handleValidationErrors, async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Update only provided fields
    if (req.body.title !== undefined) report.title = req.body.title;
    if (req.body.description !== undefined) report.description = req.body.description;
    if (req.body.status !== undefined) report.status = req.body.status;
    if (req.body.data_sources !== undefined) report.data_sources = req.body.data_sources;
    if (req.body.sections !== undefined) report.sections = req.body.sections;
    if (req.body.filters !== undefined) report.filters = req.body.filters;

    await report.save();

    // Notification: Notify team members of report update
    await notificationService.notifyReportUpdated(report);

    res.json({
      success: true,
      message: 'Report updated successfully',
      data: report
    });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report'
    });
  }
});

/**
 * @route DELETE /api/reports/byId/:id
 * @description Deletes a custom report by ID.
 *              Only reports belonging to the user's team can be deleted.
 *              Soft delete implementation is recommended for audit trails.
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
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id', checkPermission('reports_delete'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.destroy();

    // Notification: Notify team members of report deletion
    await notificationService.notifyReportDeleted(report);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report'
    });
  }
});

/**
 * @route POST /api/reports/scouting
 * @description Creates a new scouting report for a specific player.
 *              Scouting reports contain evaluation data including skill ratings and overall grade.
 *              Multi-tenant isolation enforced via Player's team_id.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Report creation permission required
 *
 * @param {number} req.body.player_id - Player ID (required)
 * @param {string} req.body.report_date - Report date (required, ISO 8601)
 * @param {string} req.body.overall_grade - Overall grade A-F (required)
 * @param {Object} req.body.skill_ratings - Skill rating data (optional)
 * @param {string} req.body.narrative - Narrative evaluation text (optional)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created scouting report
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {404} Not found - Player not found or belongs to different team
 * @throws {500} Server error - Database operation failure
 */
router.post('/scouting', checkPermission('reports_create'), async (req, res) => {
  try {
    // Validation: Ensure player exists and belongs to user's team
    const player = await Player.findOne({
      where: {
        id: req.body.player_id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found'
      });
    }

    const scoutingReport = await ScoutingReport.create({
      player_id: req.body.player_id,
      report_date: req.body.report_date,
      overall_grade: req.body.overall_grade,
      skill_ratings: req.body.skill_ratings || {},
      narrative: req.body.narrative || '',
      scout_id: req.user.id
    });

    // Notification: Notify relevant team members of new scouting report
    await notificationService.notifyScoutingReportCreated(scoutingReport);

    res.status(201).json({
      success: true,
      message: 'Scouting report created successfully',
      data: scoutingReport
    });
  } catch (error) {
    console.error('Create scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating scouting report'
    });
  }
});

/**
 * @route GET /api/reports/analytics/player-performance
 * @description Retrieves aggregated player performance analytics for the team.
 *              Provides statistics across the entire roster.
 *              Results are scoped to the authenticated user's team.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Start date for filtering (ISO 8601)
 * @param {string} [req.query.end_date] - End date for filtering (ISO 8601)
 * @param {string} [req.query.position] - Optional filter by player position
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Aggregated performance analytics
 * @returns {Array} response.data.players - Player performance data
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/analytics/player-performance', checkPermission('reports_view'), async (req, res) => {
  try {
    // Analytics: Aggregate player performance data for team roster
    const players = await Player.findAll({
      where: { team_id: req.user.team_id }
    });

    // Placeholder: Actual aggregation logic would compute detailed statistics
    res.json({
      success: true,
      data: {
        players: players
      }
    });
  } catch (error) {
    console.error('Get player performance analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics'
    });
  }
});

/**
 * @route GET /api/reports/analytics/team-statistics
 * @description Retrieves team-level statistics and aggregate metrics.
 *              Includes win/loss records, batting averages, ERA, etc.
 *              Results are scoped to the authenticated user's team.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team-level statistics
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/analytics/team-statistics', checkPermission('reports_view'), async (req, res) => {
  try {
    // Analytics: Compute team-level aggregate statistics
    const team = await Team.findOne({
      where: { id: req.user.team_id }
    });

    // Placeholder: Actual logic would aggregate team statistics
    res.json({
      success: true,
      data: {
        team: team,
        stats: {}
      }
    });
  } catch (error) {
    console.error('Get team statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});

/**
 * @route GET /api/reports/analytics/scouting-analysis
 * @description Retrieves aggregated metrics from scouting reports.
 *              Computes grade distributions, skill rating averages, and trends.
 *              Results are scoped to the authenticated user's team.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Start date for filtering
 * @param {string} [req.query.end_date] - End date for filtering
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Scouting analysis metrics
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/analytics/scouting-analysis', checkPermission('reports_view'), async (req, res) => {
  try {
    // Analytics: Aggregate scouting report metrics
    const scoutingReports = await ScoutingReport.findAll({
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id }
        }
      ]
    });

    // Placeholder: Actual analysis logic would compute distributions and trends
    res.json({
      success: true,
      data: {
        reports: scoutingReports
      }
    });
  } catch (error) {
    console.error('Get scouting analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting analysis'
    });
  }
});

/**
 * @route GET /api/reports/analytics/recruitment-pipeline
 * @description Retrieves recruitment pipeline data including prospect tracking.
 *              Organizes prospects by priority and status.
 *              Results are scoped to the authenticated user's team.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Recruitment pipeline data
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/analytics/recruitment-pipeline', checkPermission('reports_view'), async (req, res) => {
  try {
    // Analytics: Build recruitment pipeline from scouting reports and player data
    const players = await Player.findAll({
      where: { team_id: req.user.team_id }
    });

    // Placeholder: Actual pipeline logic would organize by priority/status
    res.json({
      success: true,
      data: {
        pipeline: players
      }
    });
  } catch (error) {
    console.error('Get recruitment pipeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline'
    });
  }
});

/**
 * @route POST /api/reports/export/pdf
 * @description Exports a report to PDF format.
 *              Converts report data to PDF and returns downloadable file.
 *              Multi-tenant isolation ensures only team's reports can be exported.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Export permission required
 *
 * @param {number} req.body.report_id - Report ID to export
 *
 * @returns {Buffer} PDF file content
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - PDF generation failure
 */
router.post('/export/pdf', checkPermission('reports_create'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.body.report_id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Placeholder: Actual PDF generation would use a library like pdfkit
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.id}.pdf"`);
    res.send('PDF content placeholder');
  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting to PDF'
    });
  }
});

/**
 * @route POST /api/reports/export/excel
 * @description Exports a report to Excel format.
 *              Converts report data to Excel spreadsheet and returns downloadable file.
 *              Multi-tenant isolation ensures only team's reports can be exported.
 * @access Private - Requires authentication + reports_create permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_create') - Export permission required
 *
 * @param {number} req.body.report_id - Report ID to export
 *
 * @returns {Buffer} Excel file content
 *
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Excel generation failure
 */
router.post('/export/excel', checkPermission('reports_create'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.body.report_id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Placeholder: Actual Excel generation would use a library like xlsx
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.id}.xlsx"`);
    res.send('Excel content placeholder');
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting to Excel'
    });
  }
});

module.exports = router;