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
  // Validation: Status field with allowed values
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

    // Database: Find player with team isolation check
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow updates to players within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if player not found (also handles unauthorized team access)
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Business logic: Prepare update data from request body
    const updateData = { ...req.body };

    // Business logic: Handle video file replacement
    if (req.file) {
      // File cleanup: Delete old video file from filesystem if it exists
      if (player.video_url) {
        const oldVideoPath = path.join(__dirname, '../../uploads/videos', path.basename(player.video_url));
        if (fs.existsSync(oldVideoPath)) {
          fs.unlinkSync(oldVideoPath);
        }
      }
      // Store path to new video file
      updateData.video_url = `/uploads/videos/${req.file.filename}`;
    }

    // Database: Apply updates to the player record
    await player.update(updateData);

    // Database: Fetch the updated player with associations for complete response
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
 * @description Permanently deletes a player record from the database.
 *              Only allows deletion of players belonging to the authenticated user's team.
 *              Note: This is a hard delete - associated scouting reports may be cascade deleted
 *              depending on foreign key constraints.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Player UUID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {404} Not found - Player doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id', async (req, res) => {
  try {
    // Database: Find player with team isolation check
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow deletion of players within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if player not found (also handles unauthorized team access)
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Database: Hard delete the player record
    // Note: Associated records (scouting reports, etc.) may be cascade deleted
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

/**
 * @route GET /api/players/stats/summary
 * @description Retrieves aggregated statistics summary for the authenticated user's team.
 *              Calculates total active players, active high school recruits, recent scouting
 *              report count (last 30 days), and team batting average.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Statistics summary
 * @returns {number} response.data.total_players - Count of active players on the team
 * @returns {number} response.data.active_recruits - Count of active high school (HS) players
 * @returns {number} response.data.recent_reports - Count of scouting reports created in last 30 days
 * @returns {string} response.data.team_avg - Team batting average formatted as '.XXX'
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats/summary', async (req, res) => {
  try {
    // Database: Count total active players for the team
    const totalPlayers = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      }
    });

    // Business logic: Active recruits are high school players with active status
    // These are prospects being scouted for recruitment
    const activeRecruits = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active',
        school_type: 'HS'
      }
    });

    // Business logic: Calculate the date 30 days ago for recent activity filtering
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Database: Count scouting reports created in last 30 days for team's players
    const recentReports = await ScoutingReport.count({
      include: [{
        model: Player,
        where: {
          // Permission: Only count reports for team's players
          team_id: req.user.team_id
        },
        attributes: []
      }],
      where: {
        created_at: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    // Database: Calculate team batting average using SQL AVG aggregate
    const teamAvgResult = await Player.findOne({
      where: {
        team_id: req.user.team_id,
        status: 'active',
        // Business logic: Only include players with batting average data
        batting_avg: {
          [Op.not]: null
        }
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('batting_avg')), 'team_avg']
      ]
    });

    // Business logic: Format batting average to 3 decimal places, default to '.000'
    const teamAvg = teamAvgResult ? parseFloat(teamAvgResult.getDataValue('team_avg')).toFixed(3) : '.000';

    res.json({
      success: true,
      data: {
        total_players: totalPlayers,
        active_recruits: activeRecruits,
        recent_reports: recentReports,
        team_avg: teamAvg
      }
    });
  } catch (error) {
    console.error('Get stats summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching statistics'
    });
  }
});

/**
 * @route GET /api/players/byId/:id/stats
 * @description Retrieves detailed batting and pitching statistics for a specific player.
 *              Returns all statistical fields with defaults for null values.
 *              Only returns stats for players belonging to the authenticated user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Player UUID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Player statistics
 * @returns {string} response.data.id - Player UUID
 * @returns {string} response.data.name - Player full name
 * @returns {string} response.data.position - Player position
 * @returns {string} response.data.school_type - School type (HS/COLL)
 * @returns {Object} response.data.batting - Batting statistics (avg, obp, slg, ops, runs, hits, etc.)
 * @returns {Object} response.data.pitching - Pitching statistics (era, wins, losses, saves, etc.)
 *
 * @throws {404} Not found - Player doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id/stats', async (req, res) => {
  try {
    // Database: Fetch player with only statistical attributes for efficiency
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        // Permission: Only return stats for players within user's team
        team_id: req.user.team_id
      },
      // Performance: Select only required attributes to minimize data transfer
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        // Batting statistics
        'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
        'runs', 'hits', 'doubles', 'triples', 'home_runs', 'rbis',
        'walks', 'strikeouts', 'stolen_bases', 'caught_stealing',
        // Pitching statistics
        'era', 'wins', 'losses', 'saves', 'innings_pitched',
        'hits_allowed', 'runs_allowed', 'earned_runs', 'walks_allowed',
        'strikeouts_pitched', 'whip', 'batting_avg_against'
      ]
    });

    // Error: Return 404 if player not found (also handles unauthorized team access)
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Business logic: Format statistics with sensible defaults for null values
    // Separates batting and pitching stats into distinct objects for UI consumption
    const stats = {
      id: player.id,
      name: `${player.first_name} ${player.last_name}`,
      position: player.position,
      school_type: player.school_type,
      // Batting statistics with defaults
      batting: {
        avg: player.batting_avg || '.000',
        obp: player.on_base_pct || '.000',
        slg: player.slugging_pct || '.000',
        ops: player.ops || '.000',
        runs: player.runs || 0,
        hits: player.hits || 0,
        doubles: player.doubles || 0,
        triples: player.triples || 0,
        home_runs: player.home_runs || 0,
        rbis: player.rbis || 0,
        walks: player.walks || 0,
        strikeouts: player.strikeouts || 0,
        stolen_bases: player.stolen_bases || 0,
        caught_stealing: player.caught_stealing || 0
      },
      // Pitching statistics with defaults
      pitching: {
        era: player.era || 0.00,
        wins: player.wins || 0,
        losses: player.losses || 0,
        saves: player.saves || 0,
        innings_pitched: player.innings_pitched || 0,
        hits_allowed: player.hits_allowed || 0,
        runs_allowed: player.runs_allowed || 0,
        earned_runs: player.earned_runs || 0,
        walks_allowed: player.walks_allowed || 0,
        strikeouts_pitched: player.strikeouts_pitched || 0,
        whip: player.whip || 0.00,
        batting_avg_against: player.batting_avg_against || '.000'
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching player statistics'
    });
  }
});

/**
 * @route POST /api/players/bulk-delete
 * @description Permanently deletes multiple player records from the database in a single operation.
 *              Only allows deletion of players belonging to the authenticated user's team.
 *              Validates all IDs before deletion to ensure team isolation.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Request body validation
 *
 * @param {string[]} req.body.ids - Array of player UUIDs to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {number} response.deleted - Count of successfully deleted players
 * @returns {Array<Object>} [response.failures] - Array of failed deletions with ID and reason
 *
 * @throws {400} Validation failed - Empty array or invalid UUIDs provided
 * @throws {500} Server error - Database operation failure
 */
router.post('/bulk-delete', [
  // Validation: IDs must be an array
  body('ids').isArray({ min: 1 }).withMessage('IDs must be a non-empty array'),
  // Validation: Each ID must be a valid UUID
  body('ids.*').isUUID().withMessage('Each ID must be a valid UUID')
], async (req, res) => {
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

    const { ids } = req.body;

    // Database: Find all players matching the IDs with team isolation
    // Permission: Only fetch players belonging to user's team
    const playersToDelete = await Player.findAll({
      where: {
        id: {
          [Op.in]: ids
        },
        team_id: req.user.team_id
      },
      attributes: ['id']
    });

    // Business logic: Track which IDs were found and can be deleted
    const foundIds = playersToDelete.map(p => p.id);
    const notFoundIds = ids.filter(id => !foundIds.includes(id));

    // Database: Delete all found players that belong to user's team
    const deletedCount = await Player.destroy({
      where: {
        id: {
          [Op.in]: foundIds
        },
        // Permission: Double-check team isolation on delete
        team_id: req.user.team_id
      }
    });

    // Business logic: Build response with deletion results
    const response = {
      success: true,
      deleted: deletedCount
    };

    // Business logic: Include failure details if some IDs weren't found or didn't belong to team
    if (notFoundIds.length > 0) {
      response.failures = notFoundIds.map(id => ({
        id,
        reason: 'Player not found or does not belong to your team'
      }));
    }

    res.json(response);
  } catch (error) {
    console.error('Bulk delete players error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting players'
    });
  }
});

/**
 * @route GET /api/players/performance
 * @description Retrieves player performance rankings with calculated statistics and team averages.
 *              Calculates derived stats like win percentage, K/9, and a composite performance score.
 *              Performance score formula:
 *              - Pitchers: (1/ERA * 50) + (wins * 10) + (strikeouts * 2)
 *              - Position players: (batting_avg * 100) + (home_runs * 5) + (rbi * 2) + (stolen_bases * 3)
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Query parameter validation
 *
 * @param {string} [req.query.position] - Filter by player position
 * @param {string} [req.query.school_type] - Filter by school type ('HS' or 'COLL')
 * @param {string} [req.query.status='active'] - Filter by player status
 * @param {string} [req.query.sort_by='batting_avg'] - Field to sort by
 * @param {string} [req.query.order='DESC'] - Sort order ('ASC' or 'DESC')
 * @param {number} [req.query.limit=50] - Maximum number of players to return (1-100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of players with rankings and calculated stats
 * @returns {number} response.data[].rank - Player rank based on sort order
 * @returns {Object} response.data[].calculated_stats - Derived statistics (win_pct, k9, performance_score)
 * @returns {Object} response.data[].display_stats - Formatted stats for display (batting_avg, era, win_pct, k9)
 * @returns {Object} response.summary - Summary statistics
 * @returns {number} response.summary.total_players - Count of players returned
 * @returns {number} response.summary.team_batting_avg - Team average batting average
 * @returns {number} response.summary.team_era - Team average ERA
 * @returns {Object} response.summary.filters - Applied filter values
 *
 * @throws {400} Validation error - Invalid query parameters
 * @throws {500} Server error - Database query failure
 */
router.get('/performance', [
  // Validation: Limit must be between 1-100 when provided
  query('limit').if(query('limit').notEmpty()).isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }

    // Business logic: Extract query parameters with defaults
    const {
      position,
      school_type,
      status = 'active',
      sort_by = 'batting_avg',
      order = 'DESC',
      limit = 50
    } = req.query;

    // Permission: Team isolation - only return players belonging to user's team
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional filters when provided
    if (position) {
      whereClause.position = position;
    }

    if (school_type) {
      whereClause.school_type = school_type;
    }

    if (status) {
      whereClause.status = status;
    }

    // Database: Fetch players with stats, sorted by specified field
    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type', 'status',
        'height', 'weight', 'graduation_year', 'school', 'city', 'state',
        // Batting stats
        'batting_avg', 'home_runs', 'rbi', 'stolen_bases',
        // Pitching stats
        'era', 'wins', 'losses', 'strikeouts', 'innings_pitched',
        // Timestamps
        'created_at', 'updated_at'
      ],
      // Business logic: Multi-level sort - primary by requested field, then alphabetically by name
      order: [
        [sort_by, order],
        ['last_name', 'ASC'],
        ['first_name', 'ASC']
      ],
      limit: parseInt(limit),
      raw: false
    });

    // Business logic: Calculate derived statistics and rankings for each player
    const playersWithStats = players.map((player, index) => {
      const playerData = player.toJSON();

      // Parse raw statistics with defaults for null values
      const battingAvg = parseFloat(playerData.batting_avg) || 0;
      const homeRuns = parseInt(playerData.home_runs) || 0;
      const rbi = parseInt(playerData.rbi) || 0;
      const stolenBases = parseInt(playerData.stolen_bases) || 0;
      const era = parseFloat(playerData.era) || 0;
      const wins = parseInt(playerData.wins) || 0;
      const losses = parseInt(playerData.losses) || 0;
      const strikeouts = parseInt(playerData.strikeouts) || 0;
      const inningsPitched = parseFloat(playerData.innings_pitched) || 0;

      // Calculated stat: Win percentage for pitchers
      const totalGames = wins + losses;
      const winPct = totalGames > 0 ? (wins / totalGames) : 0;

      // Calculated stat: K/9 (strikeouts per 9 innings) - standard pitching metric
      const k9 = inningsPitched > 0 ? (strikeouts * 9) / inningsPitched : 0;

      // Business logic: Calculate composite performance score based on position
      // This provides a single comparable metric across different player types
      let performanceScore = 0;
      if (playerData.position === 'P') {
        // Pitcher scoring: Rewards low ERA (inverse relationship), wins, and strikeouts
        performanceScore = (era > 0 ? (1 / era) * 50 : 0) + (wins * 10) + (strikeouts * 2);
      } else {
        // Position player scoring: Weighted combination of offensive stats
        performanceScore = (battingAvg * 100) + (homeRuns * 5) + (rbi * 2) + (stolenBases * 3);
      }

      return {
        ...playerData,
        // Business logic: Rank is 1-indexed based on sort order
        rank: index + 1,
        // Calculated statistics for data analysis
        calculated_stats: {
          win_pct: winPct,
          k9: k9,
          performance_score: Math.round(performanceScore * 10) / 10
        },
        // Formatted statistics for display in UI
        display_stats: {
          batting_avg: battingAvg.toFixed(3),
          era: era.toFixed(2),
          win_pct: winPct.toFixed(3),
          k9: k9.toFixed(1)
        }
      };
    });

    // Database: Calculate team-wide aggregates for comparison context
    const teamStats = await Player.aggregate('batting_avg', 'AVG', {
      where: {
        team_id: req.user.team_id,
        status: 'active',
        batting_avg: { [Op.not]: null }
      }
    });

    const teamERA = await Player.aggregate('era', 'AVG', {
      where: {
        team_id: req.user.team_id,
        status: 'active',
        era: { [Op.not]: null }
      }
    });

    // Business logic: Build summary with team stats and applied filters
    const summary = {
      total_players: playersWithStats.length,
      team_batting_avg: parseFloat(teamStats) || 0,
      team_era: parseFloat(teamERA) || 0,
      filters: {
        position,
        school_type,
        status,
        sort_by,
        order
      }
    };

    res.json({
      success: true,
      data: playersWithStats,
      summary
    });

  } catch (error) {
    console.error('Get player performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching player performance data'
    });
  }
});

module.exports = router; 