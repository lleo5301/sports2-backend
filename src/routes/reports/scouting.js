/**
 * @fileoverview Scouting report routes for player evaluations.
 * Handles CRUD operations for scouting reports with skill ratings and evaluations.
 * All routes enforce team isolation - users can only access reports for their team's players.
 *
 * Scouting Report Model:
 * - Player evaluation reports created by scouts/coaches
 * - Contains skill ratings (hitting, power, speed, arm, fielding), overall grades, and narrative evaluations
 * - Associated with specific players via player_id
 * - Multi-tenant isolation enforced via Player's team_id
 *
 * Permission Model:
 * All routes require authentication via the protect middleware.
 * No explicit permission checks are enforced, but team isolation via player associations is mandatory.
 *
 * @module routes/reports/scouting
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { ScoutingReport, Player, User } = require('../../models');
const { Op } = require('sequelize');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

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
router.get('/', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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
router.put('/:id', async (req, res) => {
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
