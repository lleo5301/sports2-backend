/**
 * @fileoverview Main reports routes module.
 * Provides core CRUD operations for custom reports and mounts sub-routers for
 * scouting reports, analytics, and data exports.
 *
 * All routes require authentication via the protect middleware. Reports are scoped to teams -
 * users can only access reports belonging to their team.
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
 *    - Managed by scouting sub-router
 *
 * Key features:
 * - Custom report CRUD operations
 * - Report status management (draft, published, archived)
 * - Scouting reports (via scouting sub-router)
 * - Analytics and aggregated data (via analytics sub-router)
 * - PDF and Excel exports (via exports sub-router)
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
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permissions');
const { Report, User } = require('../../models');
const {
  validateReportCreate,
  validateReportUpdate,
  handleValidationErrors
} = require('./validators');

// Import sub-routers for domain-specific functionality
const scoutingRouter = require('./scouting');
const analyticsRouter = require('./analytics');
const exportsRouter = require('./exports');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

// Mount sub-routers for domain-specific functionality
// These handle scouting reports, analytics, and data exports
router.use('/scouting', scoutingRouter);
router.use('/', analyticsRouter);
router.use('/', exportsRouter);

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
 * @middleware validateReportCreate - Request body validation
 * @middleware handleValidationErrors - Validation error handler
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
 * @throws {400} Bad request - Validation errors
 * @throws {403} Forbidden - User lacks reports_create permission
 * @throws {500} Server error - Database creation failure
 */
router.post('/', validateReportCreate, handleValidationErrors, checkPermission('reports_create'), async (req, res) => {
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
 * @middleware validateReportUpdate - Request body validation
 * @middleware handleValidationErrors - Validation error handler
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
 * @throws {400} Bad request - Validation errors
 * @throws {403} Forbidden - User lacks reports_edit permission
 * @throws {404} Not found - Report not found or belongs to different team
 * @throws {500} Server error - Database update failure
 */
router.put('/byId/:id', validateReportUpdate, handleValidationErrors, checkPermission('reports_edit'), async (req, res) => {
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

module.exports = router;
