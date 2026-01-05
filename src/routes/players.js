/**
 * @fileoverview Player routes for managing player data, statistics, and video uploads.
 * All routes in this file require authentication via the protect middleware.
 * Players are scoped to teams - users can only access players belonging to their team.
 *
 * @module routes/players
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../models
 * @requires ../middleware/auth
 * @requires ../middleware/upload
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Player, Team, User, ScoutingReport } = require('../models');
const { protect } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const { uploadVideo, handleUploadError } = require('../middleware/upload');
const notificationService = require('../services/notificationService');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/players
 * @description Retrieves a paginated list of players belonging to the authenticated user's team.
 *              Supports filtering by school type, position, status, and free-text search.
 *              Search performs case-insensitive matching across first_name, last_name, school, city, and state.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} [req.query.school_type] - Filter by school type ('HS' for high school, 'COLL' for college)
 * @param {string} [req.query.position] - Filter by position ('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH')
 * @param {string} [req.query.status] - Filter by player status ('active', 'inactive', 'graduated', 'transferred')
 * @param {string} [req.query.search] - Free-text search across name, school, city, and state fields
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=20] - Number of records per page
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of player objects with Team and Creator associations
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Records per page
 * @returns {number} response.pagination.total - Total number of matching records
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    const {
      school_type,
      position,
      status,
      search,
      page = 1,
      limit = 20
    } = req.query;

    // Business logic: Calculate offset for pagination (0-indexed)
    const offset = (page - 1) * limit;

    // Permission: Team isolation - only return players belonging to user's team
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional filters when provided
    if (school_type) {
      whereClause.school_type = school_type;
    }

    if (position) {
      whereClause.position = position;
    }

    if (status) {
      whereClause.status = status;
    }

    // Business logic: Free-text search using case-insensitive ILIKE across multiple fields
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Fetch players with count for pagination, ordered by newest first
    const { count, rows: players } = await Player.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: players,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get players error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching players'
    });
  }
});

/**
 * @route GET /api/players/stats/summary
 * @description Retrieves aggregated player statistics for the authenticated user's team.
 *              Returns total players, active high school recruits, recent scouting reports (last 30 days),
 *              and team batting average in a single optimized database query.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Aggregated statistics object
 * @returns {number} response.data.total_players - Total number of players in the team
 * @returns {number} response.data.active_recruits - Number of active high school recruits
 * @returns {number} response.data.recent_reports - Number of scouting reports created in last 30 days
 * @returns {number} response.data.team_avg - Team batting average (0 if no data)
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats/summary', async (req, res) => {
  try {
    // Database: Execute optimized single query to fetch all 4 stats in one round-trip
    // Uses PostgreSQL subqueries for parallel execution and minimal latency
    const [results] = await sequelize.query(
      `SELECT
        (SELECT COUNT(*) FROM players WHERE team_id = :team_id) AS total_players,
        (SELECT COUNT(*) FROM players WHERE team_id = :team_id AND school_type = 'HS' AND status = 'active') AS active_recruits,
        (SELECT COUNT(*) FROM scouting_reports sr INNER JOIN players p ON sr.player_id = p.id WHERE p.team_id = :team_id AND sr.created_at >= NOW() - INTERVAL '30 days') AS recent_reports,
        (SELECT COALESCE(AVG(batting_avg), 0) FROM players WHERE team_id = :team_id AND batting_avg IS NOT NULL) AS team_avg`,
      {
        // Permission: Team isolation via parameterized query
        replacements: { team_id: req.user.team_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Business logic: Parse database results to ensure correct data types
    res.json({
      success: true,
      data: {
        total_players: parseInt(results[0].total_players),
        active_recruits: parseInt(results[0].active_recruits),
        recent_reports: parseInt(results[0].recent_reports),
        team_avg: parseFloat(results[0].team_avg)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error to avoid exposing internal details
    console.error('Get player stats summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching player statistics'
    });
  }
});

/**
 * @route GET /api/players/byId/:id
 * @description Retrieves a single player by ID with associated team, creator, and recent scouting reports.
 *              Only returns the player if they belong to the authenticated user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Player UUID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Player object with associations
 * @returns {Object} response.data.Team - Associated team info (id, name, program_name)
 * @returns {Object} response.data.Creator - User who created the player record
 * @returns {Array<Object>} response.data.ScoutingReports - 5 most recent scouting reports with author info
 *
 * @throws {404} Not found - Player doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', async (req, res) => {
  try {
    // Database: Find player with team isolation and eager-load associations
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow access to players within user's team
        team_id: req.user.team_id
      },
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          // Business logic: Include only the 5 most recent scouting reports
          model: ScoutingReport,
          order: [['created_at', 'DESC']],
          limit: 5,
          include: [{
            model: User,
            attributes: ['id', 'first_name', 'last_name']
          }]
        }
      ]
    });

    // Error: Return 404 if player not found (also handles unauthorized team access)
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    res.json({
      success: true,
      data: player
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching player'
    });
  }
});

/**
 * @route POST /api/players
 * @description Creates a new player record for the authenticated user's team.
 *              Supports optional video file upload using multipart/form-data.
 *              Video files are stored in /uploads/videos/ directory.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware uploadVideo - Multer middleware for video file upload (optional)
 * @middleware handleUploadError - Handles file upload errors gracefully
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.body.first_name - Player first name (1-50 chars, required)
 * @param {string} req.body.last_name - Player last name (1-50 chars, required)
 * @param {string} req.body.school_type - School type ('HS' or 'COLL', required)
 * @param {string} req.body.position - Player position ('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', required)
 * @param {string} [req.body.height] - Player height (1-10 chars, e.g., "6'2\"")
 * @param {number} [req.body.weight] - Player weight in pounds (100-300)
 * @param {string} [req.body.birth_date] - Birth date in ISO8601 format
 * @param {number} [req.body.graduation_year] - Graduation year (2020-2030)
 * @param {string} [req.body.school] - School name (1-100 chars)
 * @param {string} [req.body.city] - City (1-100 chars)
 * @param {string} [req.body.state] - State abbreviation (2 chars)
 * @param {string} [req.body.phone] - Phone number (10-15 chars)
 * @param {string} [req.body.email] - Email address
 * @param {boolean} [req.body.has_medical_issues] - Whether player has medical issues
 * @param {string} [req.body.injury_details] - Details about injuries/medical issues
 * @param {boolean} [req.body.has_comparison] - Whether player has a pro comparison
 * @param {string} [req.body.comparison_player] - Name of comparable pro player (1-100 chars)
 * @param {File} [req.file] - Optional video file upload
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created player object with Team and Creator associations
 *
 * @throws {400} Validation failed - Request body validation errors
 * @throws {500} Server error - Database or file upload failure
 */
router.post('/', uploadVideo, [
  // Validation: Required fields with length constraints
  body('first_name').trim().isLength({ min: 1, max: 50 }),
  body('last_name').trim().isLength({ min: 1, max: 50 }),
  // Validation: Enum values for school type and position
  body('school_type').isIn(['HS', 'COLL']),
  body('position').isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']),
  // Validation: Optional fields with appropriate constraints
  body('height').optional().isLength({ min: 1, max: 10 }),
  body('weight').optional().isInt({ min: 100, max: 300 }),
  body('birth_date').optional().isISO8601(),
  body('graduation_year').optional().isInt({ min: 2020, max: 2030 }),
  body('school').optional().isLength({ min: 1, max: 100 }),
  body('city').optional().isLength({ min: 1, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 2 }),
  body('phone').optional().isLength({ min: 10, max: 15 }),
  body('email').optional().isEmail(),
  body('has_medical_issues').optional().isBoolean(),
  body('injury_details').optional().isString(),
  body('has_comparison').optional().isBoolean(),
  body('comparison_player').optional().isLength({ min: 1, max: 100 })
], handleUploadError, async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Business logic: Assign player to authenticated user's team and track creator
    const playerData = {
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    };

    // Business logic: Store video file path if file was uploaded via multipart/form-data
    if (req.file) {
      playerData.video_url = `/uploads/videos/${req.file.filename}`;
    }

    // Database: Create the player record
    const player = await Player.create(playerData);

    // Database: Fetch the created player with associations for complete response
    const createdPlayer = await Player.findByPk(player.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Notification: Fire-and-forget notification to team members
    // This does not block the response - errors are handled gracefully in the service
    notificationService.sendPlayerAddedNotification(
      createdPlayer,
      req.user.team_id,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: createdPlayer
    });
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating player'
    });
  }
});

/**
 * @route PUT /api/players/byId/:id
 * @description Updates an existing player record. All fields are optional for partial updates.
 *              Supports video file upload - when a new video is uploaded, the old video file is deleted.
 *              Only allows updates to players belonging to the authenticated user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware uploadVideo - Multer middleware for video file upload (optional)
 * @middleware handleUploadError - Handles file upload errors gracefully
 * @middleware express-validator - Request body validation
 *
 * @param {string} req.params.id - Player UUID to update
 * @param {string} [req.body.first_name] - Player first name (1-50 chars)
 * @param {string} [req.body.last_name] - Player last name (1-50 chars)
 * @param {string} [req.body.school_type] - School type ('HS' or 'COLL')
 * @param {string} [req.body.position] - Player position ('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH')
 * @param {string} [req.body.height] - Player height (1-10 chars)
 * @param {number} [req.body.weight] - Player weight in pounds (100-300)
 * @param {string} [req.body.birth_date] - Birth date in ISO8601 format
 * @param {number} [req.body.graduation_year] - Graduation year (2020-2030)
 * @param {string} [req.body.school] - School name (1-100 chars)
 * @param {string} [req.body.city] - City (1-100 chars)
 * @param {string} [req.body.state] - State abbreviation (2 chars)
 * @param {string} [req.body.phone] - Phone number (10-15 chars)
 * @param {string} [req.body.email] - Email address
 * @param {boolean} [req.body.has_medical_issues] - Whether player has medical issues
 * @param {string} [req.body.injury_details] - Details about injuries/medical issues
 * @param {boolean} [req.body.has_comparison] - Whether player has a pro comparison
 * @param {string} [req.body.comparison_player] - Name of comparable pro player (1-100 chars)
 * @param {string} [req.body.status] - Player status ('active', 'inactive', 'graduated', 'transferred')
 * @param {File} [req.file] - Optional video file upload (replaces existing video)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated player object with Team and Creator associations
 *
 * @throws {400} Validation failed - Request body validation errors
 * @throws {404} Not found - Player doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database or file operation failure
 */
router.put('/byId/:id', uploadVideo, [
  // Validation: All fields optional for partial updates
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('school_type').optional().isIn(['HS', 'COLL']),
  body('position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']),
  body('height').optional().isLength({ min: 1, max: 10 }),
  body('weight').optional().isInt({ min: 100, max: 300 }),
  body('birth_date').optional().isISO8601(),
  body('graduation_year').optional().isInt({ min: 2020, max: 2030 }),
  body('school').optional().isLength({ min: 1, max: 100 }),
  body('city').optional().isLength({ min: 1, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 2 }),
  body('phone').optional().isLength({ min: 10, max: 15 }),
  body('email').optional().isEmail(),
  body('has_medical_issues').optional().isBoolean(),
  body('injury_details').optional().isString(),
  body('has_comparison').optional().isBoolean(),
  body('comparison_player').optional().isLength({ min: 1, max: 100 }),
  body('status').optional().isIn(['active', 'inactive', 'graduated', 'transferred'])
], handleUploadError, async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Permission: Fetch player with team isolation check
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if player not found or doesn't belong to user's team
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Business logic: Handle video file replacement - delete old file if new one provided
    if (req.file && player.video_url) {
      try {
        // Extract filename from path (e.g., '/uploads/videos/file.mp4' -> 'file.mp4')
        const oldFileName = path.basename(player.video_url);
        const oldFilePath = path.join(__dirname, '../uploads/videos', oldFileName);
        // Delete old file if it exists
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {
        // Log error but don't fail the update - file deletion is non-critical
        console.error('Error deleting old video file:', err);
      }
    }

    // Business logic: Prepare update data - only update provided fields
    const updateData = {};
    const allowedFields = [
      'first_name', 'last_name', 'school_type', 'position', 'height', 'weight',
      'birth_date', 'graduation_year', 'school', 'city', 'state', 'phone',
      'email', 'has_medical_issues', 'injury_details', 'has_comparison',
      'comparison_player', 'status'
    ];

    allowedFields.forEach(field => {
      if (field in req.body) {
        updateData[field] = req.body[field];
      }
    });

    // Business logic: Store new video path if new file was uploaded
    if (req.file) {
      updateData.video_url = `/uploads/videos/${req.file.filename}`;
    }

    // Database: Update the player record
    await player.update(updateData);

    // Database: Fetch updated player with associations for complete response
    const updatedPlayer = await Player.findByPk(player.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedPlayer
    });
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating player'
    });
  }
});

/**
 * @route DELETE /api/players/byId/:id
 * @description Deletes a player record and associated video file from storage.
 *              Only allows deletion of players belonging to the authenticated user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Player UUID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Confirmation message
 *
 * @throws {404} Not found - Player doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database or file operation failure
 */
router.delete('/byId/:id', async (req, res) => {
  try {
    // Permission: Fetch player with team isolation check
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if player not found or doesn't belong to user's team
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Business logic: Delete associated video file from storage if it exists
    if (player.video_url) {
      try {
        // Extract filename from path (e.g., '/uploads/videos/file.mp4' -> 'file.mp4')
        const fileName = path.basename(player.video_url);
        const filePath = path.join(__dirname, '../uploads/videos', fileName);
        // Delete file if it exists
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // Log error but don't fail the delete - file deletion is non-critical
        console.error('Error deleting video file:', err);
      }
    }

    // Database: Delete the player record
    await player.destroy();

    res.json({
      success: true,
      message: 'Player deleted successfully'
    });
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting player'
    });
  }
});

module.exports = router;