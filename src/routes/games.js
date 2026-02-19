/**
 * @fileoverview Games routes for managing team game schedules and results tracking.
 * All routes in this file require authentication via the protect middleware.
 * Games are scoped to teams - users can only access games belonging to their team.
 *
 * Game Structure:
 * - Game: Represents a scheduled or completed game with the following key fields:
 *   - opponent: Name of the opposing team
 *   - game_date: Date and time of the game (ISO 8601 format)
 *   - home_away: Whether the game is at home or away ('home' | 'away')
 *   - team_score: Team's score (null for scheduled games)
 *   - opponent_score: Opponent's score (null for scheduled games)
 *   - result: Game outcome ('W' | 'L' | 'T' | null for scheduled games)
 *   - location: Venue name or address
 *   - season: Season identifier (e.g., "2024", "Fall 2024")
 *   - notes: Additional notes about the game
 *
 * Statistics Calculations:
 * - Win Rate: wins / total games played
 * - Average Runs Scored: sum of team_score / total games
 * - Average Runs Allowed: sum of opponent_score / total games
 *
 * Result Tracking:
 * - Games can be created without results (scheduled future games)
 * - Results are added/updated after games are played
 * - Statistics endpoints aggregate results across all games or by season
 *
 * @module routes/games
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { protect } = require('../middleware/auth');
const { Game, Team, GameStatistic, Player, PlayerSeasonStats, OpponentGameStat } = require('../models');
const prestoSyncService = require('../services/prestoSyncService');
const prestoSportsService = require('../services/prestoSportsService');
const { parseBoxScore } = require('../utils/boxScoreParser');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

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

/**
 * @description Validation rules for game creation and updates.
 *              Applied as middleware to POST and PUT routes.
 *
 * Required Fields:
 * - opponent: Non-empty string (name of opposing team)
 * - game_date: Valid ISO 8601 date string
 * - home_away: Must be 'home' or 'away'
 *
 * Optional Fields:
 * - team_score: Non-negative integer (team's final score)
 * - opponent_score: Non-negative integer (opponent's final score)
 * - result: Must be 'W' (win), 'L' (loss), or 'T' (tie)
 * - notes: String with additional game information
 * - location: String with venue name or address
 * - season: String identifying the season (e.g., "2024", "Fall 2024")
 *
 * @type {Array<ValidationChain>}
 */
const validateGame = [
  body('opponent').notEmpty().withMessage('Opponent is required'),
  body('game_date').isISO8601().withMessage('Game date must be a valid date'),
  body('home_away').isIn(['home', 'away']).withMessage('Home/away must be home or away'),
  body('team_score').optional().isInt({ min: 0 }).withMessage('Team score must be a non-negative integer'),
  body('opponent_score').optional().isInt({ min: 0 }).withMessage('Opponent score must be a non-negative integer'),
  body('result').optional().isIn(['W', 'L', 'T']).withMessage('Result must be W, L, or T'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('season').optional().isString().withMessage('Season must be a string')
];

/**
 * @route GET /api/games
 * @description Retrieves all games for the authenticated user's team with pagination.
 *              Supports filtering by season and result. Games are sorted by date descending
 *              (most recent first).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=20] - Number of games per page (default 20)
 * @param {string} [req.query.season] - Optional filter by season (e.g., "2024")
 * @param {string} [req.query.result] - Optional filter by result ('W', 'L', or 'T')
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of game objects
 * @returns {number} response.data[].id - Game ID
 * @returns {string} response.data[].opponent - Opponent team name
 * @returns {string} response.data[].game_date - Game date (ISO 8601)
 * @returns {string} response.data[].home_away - 'home' or 'away'
 * @returns {number|null} response.data[].team_score - Team's score
 * @returns {number|null} response.data[].opponent_score - Opponent's score
 * @returns {string|null} response.data[].result - 'W', 'L', 'T', or null
 * @returns {string|null} response.data[].location - Game location
 * @returns {string|null} response.data[].season - Season identifier
 * @returns {string|null} response.data[].notes - Game notes
 * @returns {Object} response.data[].team - Associated team (id, name)
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Items per page
 * @returns {number} response.pagination.total - Total number of games
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    // Pagination: Parse page and limit from query params with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Permission: Filter games to user's team only (multi-tenant isolation)
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional season filter
    if (req.query.season) {
      whereClause.season = req.query.season;
    }

    // Business logic: Apply optional result filter (W/L/T)
    if (req.query.result) {
      whereClause.result = req.query.result;
    }

    // Database: Fetch games with team association and pagination
    const games = await Game.findAndCountAll({
      where: whereClause,
      // Business logic: Sort by game date descending (most recent first)
      order: [['game_date', 'DESC']],
      limit,
      offset,
      include: [
        {
          // Business logic: Include team info for display purposes
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    res.json({
      success: true,
      data: games.rows,
      pagination: {
        page,
        limit,
        total: games.count,
        pages: Math.ceil(games.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

/**
 * @route GET /api/games/byId/:id
 * @description Retrieves a single game by ID.
 *              Only returns games belonging to the user's team.
 *              Note: Uses /byId/:id path pattern for consistency with other routes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Game ID to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Complete game object
 * @returns {number} response.data.id - Game ID
 * @returns {string} response.data.opponent - Opponent team name
 * @returns {string} response.data.game_date - Game date (ISO 8601)
 * @returns {string} response.data.home_away - 'home' or 'away'
 * @returns {number|null} response.data.team_score - Team's score
 * @returns {number|null} response.data.opponent_score - Opponent's score
 * @returns {string|null} response.data.result - 'W', 'L', 'T', or null
 * @returns {string|null} response.data.location - Game location
 * @returns {string|null} response.data.season - Season identifier
 * @returns {string|null} response.data.notes - Game notes
 * @returns {Object} response.data.team - Associated team (id, name)
 *
 * @throws {404} Not found - Game doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', async (req, res) => {
  try {
    // Database: Fetch game with team isolation
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        // Permission: Only return games within user's team
        team_id: req.user.team_id
      },
      include: [
        {
          // Business logic: Include team info for display purposes
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    // Error: Return 404 if game not found (includes team access check)
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ success: true, data: game });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

/**
 * @route POST /api/games
 * @description Creates a new game for the authenticated user's team.
 *              Games can be created with or without results (for scheduled future games).
 *              Results can be added later via the update endpoint.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateGame - Field validation middleware
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {string} req.body.opponent - Opponent team name (required)
 * @param {string} req.body.game_date - Game date in ISO 8601 format (required)
 * @param {string} req.body.home_away - 'home' or 'away' (required)
 * @param {number} [req.body.team_score] - Team's score (optional, for completed games)
 * @param {number} [req.body.opponent_score] - Opponent's score (optional)
 * @param {string} [req.body.result] - 'W', 'L', or 'T' (optional)
 * @param {string} [req.body.notes] - Additional notes (optional)
 * @param {string} [req.body.location] - Venue name or address (optional)
 * @param {string} [req.body.season] - Season identifier (optional)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 * @returns {Object} response.data - Created game with associations
 * @returns {number} response.data.id - New game ID
 * @returns {string} response.data.opponent - Opponent team name
 * @returns {string} response.data.game_date - Game date
 * @returns {string} response.data.home_away - 'home' or 'away'
 * @returns {Object} response.data.team - Associated team (id, name)
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {500} Server error - Database operation failure
 */
router.post('/', validateGame, handleValidationErrors, async (req, res) => {
  try {
    // Database: Create the new game
    // Associates with user's team and tracks the creator
    const game = await Game.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created game with associations for complete response
    const createdGame = await Game.findOne({
      where: { id: game.id },
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Game created successfully',
      data: createdGame
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

/**
 * @route PUT /api/games/byId/:id
 * @description Updates an existing game.
 *              Commonly used to add results after a game is played.
 *              All fields can be updated (opponent, date, scores, result, etc.).
 *              Note: Uses /byId/:id path pattern for consistency with other routes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateGame - Field validation middleware
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {number} req.params.id - Game ID to update
 * @param {string} req.body.opponent - Updated opponent team name
 * @param {string} req.body.game_date - Updated game date (ISO 8601)
 * @param {string} req.body.home_away - Updated 'home' or 'away'
 * @param {number} [req.body.team_score] - Updated team's score
 * @param {number} [req.body.opponent_score] - Updated opponent's score
 * @param {string} [req.body.result] - Updated result ('W', 'L', or 'T')
 * @param {string} [req.body.notes] - Updated notes
 * @param {string} [req.body.location] - Updated location
 * @param {string} [req.body.season] - Updated season identifier
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 * @returns {Object} response.data - Updated game with associations
 * @returns {number} response.data.id - Game ID
 * @returns {string} response.data.opponent - Updated opponent name
 * @returns {string} response.data.game_date - Updated game date
 * @returns {Object} response.data.team - Associated team (id, name)
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {404} Not found - Game doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/byId/:id', [
  // Validation: Ensure ID is a valid integer
  param('id').isInt().withMessage('Game ID must be an integer'),
  ...validateGame
], handleValidationErrors, async (req, res) => {
  try {
    // Database: Find game with team isolation
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow updates to games within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if game not found (includes team access check)
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Database: Update the game with provided fields
    await game.update(req.body);

    // Database: Fetch the updated game with associations for complete response
    const updatedGame = await Game.findOne({
      where: { id: game.id },
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Game updated successfully',
      data: updatedGame
    });
  } catch (error) {
    console.error('Error updating game:', error);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

/**
 * @route DELETE /api/games/byId/:id
 * @description Permanently deletes a game from the database.
 *              This is a hard delete - the game record cannot be recovered.
 *              Note: Uses /byId/:id path pattern for consistency with other routes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {number} req.params.id - Game ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid game ID format
 * @throws {404} Not found - Game doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id', [
  // Validation: Ensure ID is a valid integer
  param('id').isInt().withMessage('Game ID must be an integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Database: Find game with team isolation
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow deletion of games within user's team
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if game not found (includes team access check)
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Database: Hard delete the game record
    // Note: Unlike some entities, games use hard delete (permanent removal)
    await game.destroy();

    res.json({ success: true, message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

/**
 * @route GET /api/games/log
 * @description Retrieves a recent game log (most recent games).
 *              Similar to GET /api/games but without pagination overhead.
 *              Useful for dashboard widgets and quick game history views.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {number} [req.query.limit=10] - Number of games to return (1-50, default 10)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of recent game objects
 * @returns {number} response.data[].id - Game ID
 * @returns {string} response.data[].opponent - Opponent team name
 * @returns {string} response.data[].game_date - Game date (ISO 8601)
 * @returns {string} response.data[].home_away - 'home' or 'away'
 * @returns {number|null} response.data[].team_score - Team's score
 * @returns {number|null} response.data[].opponent_score - Opponent's score
 * @returns {string|null} response.data[].result - 'W', 'L', 'T', or null
 * @returns {Object} response.data[].team - Associated team (id, name)
 *
 * @throws {400} Validation failed - Limit out of range (1-50)
 * @throws {500} Server error - Database query failure
 */
router.get('/log', [
  // Validation: Limit must be between 1 and 50 if provided
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Business logic: Default to 10 recent games if not specified
    const limit = parseInt(req.query.limit) || 10;

    // Database: Fetch recent games for the team
    const games = await Game.findAll({
      where: {
        // Permission: Filter to user's team only
        team_id: req.user.team_id
      },
      // Business logic: Sort by date descending (most recent first)
      order: [['game_date', 'DESC']],
      limit,
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    res.json({ success: true, data: games });
  } catch (error) {
    console.error('Error fetching game log:', error);
    res.status(500).json({ error: 'Failed to fetch game log' });
  }
});

/**
 * @route GET /api/games/team-stats
 * @description Retrieves aggregated game statistics for the authenticated user's team.
 *              Calculates win/loss/tie counts, win rate, and scoring averages
 *              across all games in the database.
 *
 *              Statistics Calculated:
 *              - gamesPlayed: Total number of games
 *              - wins: Count of games with result 'W'
 *              - losses: Count of games with result 'L'
 *              - ties: Count of games with result 'T'
 *              - winRate: wins / gamesPlayed (0-1 decimal)
 *              - totalRunsScored: Sum of all team_score values
 *              - totalRunsAllowed: Sum of all opponent_score values
 *              - avgRunsScored: totalRunsScored / gamesPlayed
 *              - avgRunsAllowed: totalRunsAllowed / gamesPlayed
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics object
 * @returns {number} response.data.gamesPlayed - Total games played
 * @returns {number} response.data.wins - Number of wins
 * @returns {number} response.data.losses - Number of losses
 * @returns {number} response.data.ties - Number of ties
 * @returns {number} response.data.winRate - Win rate (0-1 decimal)
 * @returns {number} response.data.totalRunsScored - Total runs scored
 * @returns {number} response.data.totalRunsAllowed - Total runs allowed
 * @returns {number} response.data.avgRunsScored - Average runs scored per game
 * @returns {number} response.data.avgRunsAllowed - Average runs allowed per game
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/team-stats', async (req, res) => {
  try {
    // Database: Fetch all games for the team with only necessary fields
    // Only need result, team_score, and opponent_score for statistics
    const games = await Game.findAll({
      where: {
        // Permission: Filter to user's team only
        team_id: req.user.team_id
      },
      attributes: ['result', 'team_score', 'opponent_score']
    });

    // Business logic: Calculate aggregated statistics from game data
    const stats = {
      // Total games played
      gamesPlayed: games.length,
      // Count games by result type
      wins: games.filter(g => g.result === 'W').length,
      losses: games.filter(g => g.result === 'L').length,
      ties: games.filter(g => g.result === 'T').length,
      // Calculate win rate (avoid division by zero)
      winRate: games.length > 0 ? games.filter(g => g.result === 'W').length / games.length : 0,
      // Calculate total runs (handle null scores with default 0)
      totalRunsScored: games.reduce((sum, g) => sum + (g.team_score || 0), 0),
      totalRunsAllowed: games.reduce((sum, g) => sum + (g.opponent_score || 0), 0),
      // Calculate averages (avoid division by zero)
      avgRunsScored: games.length > 0 ? games.reduce((sum, g) => sum + (g.team_score || 0), 0) / games.length : 0,
      avgRunsAllowed: games.length > 0 ? games.reduce((sum, g) => sum + (g.opponent_score || 0), 0) / games.length : 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching team game stats:', error);
    res.status(500).json({ error: 'Failed to fetch team game stats' });
  }
});

/**
 * @route GET /api/games/upcoming
 * @description Retrieves upcoming (future) games for the authenticated user's team.
 *              Only returns games with game_date >= today.
 *              Games are sorted by date ascending (nearest game first).
 *              Useful for dashboard widgets and scheduling views.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {number} [req.query.limit=5] - Number of games to return (1-20, default 5)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of upcoming game objects
 * @returns {number} response.data[].id - Game ID
 * @returns {string} response.data[].opponent - Opponent team name
 * @returns {string} response.data[].game_date - Game date (ISO 8601)
 * @returns {string} response.data[].home_away - 'home' or 'away'
 * @returns {string|null} response.data[].location - Game location
 * @returns {Object} response.data[].team - Associated team (id, name)
 *
 * @throws {400} Validation failed - Limit out of range (1-20)
 * @throws {500} Server error - Database query failure
 */
router.get('/upcoming', [
  // Validation: Limit must be between 1 and 20 if provided
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Business logic: Default to 5 upcoming games if not specified
    const limit = parseInt(req.query.limit) || 5;
    // Business logic: Get current date for comparison
    const today = new Date();

    // Database: Fetch upcoming games (game_date >= today)
    const games = await Game.findAll({
      where: {
        // Permission: Filter to user's team only
        team_id: req.user.team_id,
        // Business logic: Only include future games
        game_date: {
          [Op.gte]: today
        }
      },
      // Business logic: Sort by date ascending (nearest game first)
      order: [['game_date', 'ASC']],
      limit,
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    res.json({ success: true, data: games });
  } catch (error) {
    console.error('Error fetching upcoming games:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming games' });
  }
});

/**
 * @route GET /api/games/season-stats
 * @description Retrieves game statistics broken down by season.
 *              Returns an array of statistics objects, one per season.
 *              If season query parameter is provided, returns stats for only that season.
 *
 *              Statistics Per Season:
 *              - season: Season identifier (or 'Unknown' if not set)
 *              - gamesPlayed: Total games in that season
 *              - wins/losses/ties: Counts by result type
 *              - winRate: wins / gamesPlayed
 *              - totalRunsScored/totalRunsAllowed: Sum totals
 *              - avgRunsScored/avgRunsAllowed: Per-game averages
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {string} [req.query.season] - Optional filter for specific season
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of season statistics objects
 * @returns {string} response.data[].season - Season identifier
 * @returns {number} response.data[].gamesPlayed - Total games in season
 * @returns {number} response.data[].wins - Number of wins
 * @returns {number} response.data[].losses - Number of losses
 * @returns {number} response.data[].ties - Number of ties
 * @returns {number} response.data[].winRate - Win rate (0-1 decimal)
 * @returns {number} response.data[].totalRunsScored - Total runs scored in season
 * @returns {number} response.data[].totalRunsAllowed - Total runs allowed in season
 * @returns {number} response.data[].avgRunsScored - Average runs scored per game
 * @returns {number} response.data[].avgRunsAllowed - Average runs allowed per game
 *
 * @throws {400} Validation failed - Invalid season parameter
 * @throws {500} Server error - Database query failure
 */
router.get('/season-stats', [
  // Validation: Season must be a string if provided
  query('season').optional().isString().withMessage('Season must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    // Permission: Filter games to user's team only
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional season filter
    if (req.query.season) {
      whereClause.season = req.query.season;
    }

    // Database: Fetch games with fields needed for statistics
    const games = await Game.findAll({
      where: whereClause,
      attributes: ['result', 'team_score', 'opponent_score', 'season', 'season_name']
    });

    // Business logic: Aggregate statistics by season using reduce
    // Creates an object keyed by season with accumulated stats
    const seasonStats = games.reduce((acc, game) => {
      // Handle games without a season set
      const season = game.season || 'Unknown';

      // Initialize season entry if not exists
      if (!acc[season]) {
        acc[season] = {
          season,
          season_name: game.season_name || null,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          totalRunsScored: 0,
          totalRunsAllowed: 0
        };
      }

      // Increment game count
      acc[season].gamesPlayed++;

      // Count by result type
      if (game.result === 'W') {
        acc[season].wins++;
      } else if (game.result === 'L') {
        acc[season].losses++;
      } else if (game.result === 'T') {
        acc[season].ties++;
      }

      // Accumulate scores (handle null with default 0)
      acc[season].totalRunsScored += game.team_score || 0;
      acc[season].totalRunsAllowed += game.opponent_score || 0;

      return acc;
    }, {});

    // Business logic: Calculate derived statistics (rates and averages)
    Object.values(seasonStats).forEach(season => {
      // Calculate win rate (avoid division by zero)
      season.winRate = season.gamesPlayed > 0 ? season.wins / season.gamesPlayed : 0;
      // Calculate per-game averages (avoid division by zero)
      season.avgRunsScored = season.gamesPlayed > 0 ? season.totalRunsScored / season.gamesPlayed : 0;
      season.avgRunsAllowed = season.gamesPlayed > 0 ? season.totalRunsAllowed / season.gamesPlayed : 0;
    });

    // Return as array of season stats objects
    res.json({ success: true, data: Object.values(seasonStats) });
  } catch (error) {
    console.error('Error fetching season stats:', error);
    res.status(500).json({ error: 'Failed to fetch season stats' });
  }
});

/**
 * @route GET /api/games/player-stats/:playerId
 * @description Retrieves game participation data for a specific player.
 *              Returns all team games with a summary of the player's participation.
 *
 *              Note: This is a simplified implementation that returns all team games
 *              and basic participation statistics. A full implementation would include
 *              a GamePlayerStats model with per-player, per-game statistics (at-bats,
 *              hits, RBIs, innings pitched, etc.).
 *
 *              Current Statistics:
 *              - total_games: Number of team games
 *              - games: Array of game details
 *              - summary: Win/loss/tie counts, home/away game breakdown
 *
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.playerId - Player ID to get statistics for
 * @param {string} [req.query.season] - Optional filter by season
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Player game statistics
 * @returns {number} response.data.player_id - Player ID
 * @returns {number} response.data.total_games - Total number of games
 * @returns {Array<Object>} response.data.games - Array of game details
 * @returns {number} response.data.games[].id - Game ID
 * @returns {string} response.data.games[].opponent - Opponent name
 * @returns {string} response.data.games[].game_date - Game date
 * @returns {string} response.data.games[].home_away - 'home' or 'away'
 * @returns {string|null} response.data.games[].result - 'W', 'L', 'T', or null
 * @returns {number|null} response.data.games[].team_score - Team's score
 * @returns {number|null} response.data.games[].opponent_score - Opponent's score
 * @returns {string|null} response.data.games[].location - Game location
 * @returns {Object} response.data.summary - Summary statistics
 * @returns {number} response.data.summary.wins - Number of wins
 * @returns {number} response.data.summary.losses - Number of losses
 * @returns {number} response.data.summary.ties - Number of ties
 * @returns {number} response.data.summary.home_games - Number of home games
 * @returns {number} response.data.summary.away_games - Number of away games
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/player-stats/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { season } = req.query;

    // Permission: Verify player belongs to user's team
    const player = await Player.findOne({
      where: {
        id: playerId,
        team_id: req.user.team_id
      },
      attributes: ['id', 'first_name', 'last_name', 'jersey_number', 'position']
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found or does not belong to your team'
      });
    }

    // Build game filter for season if provided
    const gameWhereClause = { team_id: req.user.team_id };
    if (season) {
      gameWhereClause.season = season;
    }

    // Database: Fetch actual game statistics for this player
    const gameStats = await GameStatistic.findAll({
      where: {
        player_id: playerId,
        team_id: req.user.team_id
      },
      include: [
        {
          model: Game,
          as: 'game',
          where: gameWhereClause,
          attributes: [
            'id', 'opponent', 'game_date', 'home_away', 'result',
            'team_score', 'opponent_score', 'location', 'season', 'season_name', 'game_status'
          ]
        }
      ],
      order: [[{ model: Game, as: 'game' }, 'game_date', 'DESC']]
    });

    // Format per-game statistics with full stat breakdown
    const gamesWithStats = gameStats.map(stat => ({
      game: {
        id: stat.game.id,
        opponent: stat.game.opponent,
        game_date: stat.game.game_date,
        home_away: stat.game.home_away,
        result: stat.game.result,
        team_score: stat.game.team_score,
        opponent_score: stat.game.opponent_score,
        location: stat.game.location,
        season: stat.game.season,
        season_name: stat.game.season_name,
        game_status: stat.game.game_status
      },
      position_played: stat.position_played,
      batting: {
        at_bats: stat.at_bats,
        runs: stat.runs,
        hits: stat.hits,
        doubles: stat.doubles,
        triples: stat.triples,
        home_runs: stat.home_runs,
        rbi: stat.rbi,
        walks: stat.walks,
        strikeouts: stat.strikeouts_batting,
        stolen_bases: stat.stolen_bases,
        caught_stealing: stat.caught_stealing,
        hit_by_pitch: stat.hit_by_pitch,
        sacrifice_flies: stat.sacrifice_flies,
        sacrifice_bunts: stat.sacrifice_bunts
      },
      pitching: {
        innings_pitched: stat.innings_pitched,
        hits_allowed: stat.hits_allowed,
        runs_allowed: stat.runs_allowed,
        earned_runs: stat.earned_runs,
        walks_allowed: stat.walks_allowed,
        strikeouts: stat.strikeouts_pitching,
        home_runs_allowed: stat.home_runs_allowed,
        batters_faced: stat.batters_faced,
        pitches_thrown: stat.pitches_thrown,
        strikes_thrown: stat.strikes_thrown,
        win: stat.win,
        loss: stat.loss,
        save: stat.getDataValue('save'),
        hold: stat.hold
      },
      fielding: {
        putouts: stat.putouts,
        assists: stat.assists,
        errors: stat.errors
      }
    }));

    // Calculate aggregated totals across all games
    const totals = {
      batting: {
        games: gameStats.length,
        at_bats: gameStats.reduce((sum, s) => sum + (s.at_bats || 0), 0),
        runs: gameStats.reduce((sum, s) => sum + (s.runs || 0), 0),
        hits: gameStats.reduce((sum, s) => sum + (s.hits || 0), 0),
        doubles: gameStats.reduce((sum, s) => sum + (s.doubles || 0), 0),
        triples: gameStats.reduce((sum, s) => sum + (s.triples || 0), 0),
        home_runs: gameStats.reduce((sum, s) => sum + (s.home_runs || 0), 0),
        rbi: gameStats.reduce((sum, s) => sum + (s.rbi || 0), 0),
        walks: gameStats.reduce((sum, s) => sum + (s.walks || 0), 0),
        strikeouts: gameStats.reduce((sum, s) => sum + (s.strikeouts_batting || 0), 0),
        stolen_bases: gameStats.reduce((sum, s) => sum + (s.stolen_bases || 0), 0),
        caught_stealing: gameStats.reduce((sum, s) => sum + (s.caught_stealing || 0), 0),
        hit_by_pitch: gameStats.reduce((sum, s) => sum + (s.hit_by_pitch || 0), 0),
        sacrifice_flies: gameStats.reduce((sum, s) => sum + (s.sacrifice_flies || 0), 0),
        sacrifice_bunts: gameStats.reduce((sum, s) => sum + (s.sacrifice_bunts || 0), 0)
      },
      pitching: {
        games_pitched: gameStats.filter(s => parseFloat(s.innings_pitched) > 0).length,
        innings_pitched: gameStats.reduce((sum, s) => sum + parseFloat(s.innings_pitched || 0), 0),
        hits_allowed: gameStats.reduce((sum, s) => sum + (s.hits_allowed || 0), 0),
        runs_allowed: gameStats.reduce((sum, s) => sum + (s.runs_allowed || 0), 0),
        earned_runs: gameStats.reduce((sum, s) => sum + (s.earned_runs || 0), 0),
        walks_allowed: gameStats.reduce((sum, s) => sum + (s.walks_allowed || 0), 0),
        strikeouts: gameStats.reduce((sum, s) => sum + (s.strikeouts_pitching || 0), 0),
        home_runs_allowed: gameStats.reduce((sum, s) => sum + (s.home_runs_allowed || 0), 0),
        wins: gameStats.filter(s => s.win === true).length,
        losses: gameStats.filter(s => s.loss === true).length,
        saves: gameStats.filter(s => s.getDataValue('save') === true).length,
        holds: gameStats.filter(s => s.hold === true).length
      },
      fielding: {
        putouts: gameStats.reduce((sum, s) => sum + (s.putouts || 0), 0),
        assists: gameStats.reduce((sum, s) => sum + (s.assists || 0), 0),
        errors: gameStats.reduce((sum, s) => sum + (s.errors || 0), 0)
      }
    };

    // Calculate derived statistics (batting average, ERA, fielding percentage)
    const battingAvg = totals.batting.at_bats > 0
      ? (totals.batting.hits / totals.batting.at_bats).toFixed(3)
      : '.000';
    const era = totals.pitching.innings_pitched > 0
      ? ((totals.pitching.earned_runs * 9) / totals.pitching.innings_pitched).toFixed(2)
      : '0.00';
    const fieldingPct = (totals.fielding.putouts + totals.fielding.assists + totals.fielding.errors) > 0
      ? ((totals.fielding.putouts + totals.fielding.assists) /
         (totals.fielding.putouts + totals.fielding.assists + totals.fielding.errors)).toFixed(3)
      : '1.000';

    const playerGameStatsResponse = {
      player: {
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jersey_number: player.jersey_number,
        position: player.position
      },
      total_games: gamesWithStats.length,
      games: gamesWithStats,
      totals,
      calculated: {
        batting_average: battingAvg,
        era,
        fielding_percentage: fieldingPct,
        slugging_percentage: totals.batting.at_bats > 0
          ? ((totals.batting.hits - totals.batting.doubles - totals.batting.triples - totals.batting.home_runs +
              totals.batting.doubles * 2 + totals.batting.triples * 3 + totals.batting.home_runs * 4) /
             totals.batting.at_bats).toFixed(3)
          : '.000',
        on_base_percentage: (totals.batting.at_bats + totals.batting.walks +
                             totals.batting.hit_by_pitch + totals.batting.sacrifice_flies) > 0
          ? ((totals.batting.hits + totals.batting.walks + totals.batting.hit_by_pitch) /
             (totals.batting.at_bats + totals.batting.walks + totals.batting.hit_by_pitch +
              totals.batting.sacrifice_flies)).toFixed(3)
          : '.000'
      }
    };

    res.json({
      success: true,
      data: playerGameStatsResponse
    });
  } catch (error) {
    console.error('Error fetching player game statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player game statistics'
    });
  }
});

// ─── Leaderboard Stats Whitelist ──────────────────────────────────
const LEADERBOARD_STATS = {
  batting_average:      { qualifier: 'at_bats', defaultMin: 10, order: 'DESC' },
  on_base_percentage:   { qualifier: 'at_bats', defaultMin: 10, order: 'DESC' },
  slugging_percentage:  { qualifier: 'at_bats', defaultMin: 10, order: 'DESC' },
  ops:                  { qualifier: 'at_bats', defaultMin: 10, order: 'DESC' },
  home_runs:            { qualifier: null, defaultMin: 0, order: 'DESC' },
  rbi:                  { qualifier: null, defaultMin: 0, order: 'DESC' },
  hits:                 { qualifier: null, defaultMin: 0, order: 'DESC' },
  runs:                 { qualifier: null, defaultMin: 0, order: 'DESC' },
  stolen_bases:         { qualifier: null, defaultMin: 0, order: 'DESC' },
  walks:                { qualifier: null, defaultMin: 0, order: 'DESC' },
  doubles:              { qualifier: null, defaultMin: 0, order: 'DESC' },
  triples:              { qualifier: null, defaultMin: 0, order: 'DESC' },
  era:                  { qualifier: 'innings_pitched', defaultMin: 5, order: 'ASC' },
  whip:                 { qualifier: 'innings_pitched', defaultMin: 5, order: 'ASC' },
  k_per_9:              { qualifier: 'innings_pitched', defaultMin: 5, order: 'DESC' },
  bb_per_9:             { qualifier: 'innings_pitched', defaultMin: 5, order: 'ASC' },
  strikeouts_pitching:  { qualifier: null, defaultMin: 0, order: 'DESC' },
  pitching_wins:        { qualifier: null, defaultMin: 0, order: 'DESC' },
  saves:                { qualifier: null, defaultMin: 0, order: 'DESC' },
  innings_pitched:      { qualifier: null, defaultMin: 0, order: 'DESC' },
  fielding_percentage:  { qualifier: 'fielding_games', defaultMin: 3, order: 'DESC' }
};

/**
 * @route GET /api/games/leaderboard
 * @description Returns ranked player leaders for a given stat from PlayerSeasonStats.
 * @access Private - Requires authentication
 *
 * @param {string} req.query.stat - Stat column to rank by (must be in LEADERBOARD_STATS)
 * @param {string} [req.query.season] - Season filter (defaults to most recent)
 * @param {number} [req.query.limit=10] - Number of leaders (max 50)
 * @param {number} [req.query.min_qualifier] - Override minimum qualifying value
 *
 * @throws {400} Missing or invalid stat param
 * @throws {500} Server error
 */
router.get('/leaderboard', [
  query('stat').isIn(Object.keys(LEADERBOARD_STATS)).withMessage('Invalid or missing stat parameter'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('min_qualifier').optional().isInt({ min: 0 }).withMessage('min_qualifier must be a non-negative integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { stat } = req.query;
    const config = LEADERBOARD_STATS[stat];
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const minQualifier = req.query.min_qualifier !== undefined
      ? parseInt(req.query.min_qualifier)
      : config.defaultMin;

    // Determine season: use query param or find most recent for this team
    let season = req.query.season;
    let seasonName = null;
    if (!season) {
      const latest = await PlayerSeasonStats.findOne({
        where: { team_id: req.user.team_id },
        order: [['season', 'DESC']],
        attributes: ['season', 'season_name']
      });
      season = latest ? latest.season : null;
      seasonName = latest ? latest.season_name : null;
    } else {
      const match = await PlayerSeasonStats.findOne({
        where: { team_id: req.user.team_id, season },
        attributes: ['season_name']
      });
      seasonName = match ? match.season_name : null;
    }

    if (!season) {
      return res.json({
        success: true,
        data: { stat, season: null, season_name: null, leaders: [] }
      });
    }

    // Build WHERE clause with qualifier filter
    const where = {
      team_id: req.user.team_id,
      season,
      [stat]: { [Op.not]: null }
    };

    if (config.qualifier && minQualifier > 0) {
      where[config.qualifier] = { [Op.gte]: minQualifier };
    }

    const rows = await PlayerSeasonStats.findAll({
      where,
      order: [[stat, config.order]],
      limit,
      include: [{
        model: Player,
        as: 'player',
        attributes: ['id', 'first_name', 'last_name', 'position', 'jersey_number', 'photo_url']
      }]
    });

    const leaders = rows.map((row, idx) => ({
      rank: idx + 1,
      player: row.player,
      value: row[stat],
      qualifier_value: config.qualifier ? row[config.qualifier] : null
    }));

    res.json({
      success: true,
      data: { stat, season, season_name: seasonName, leaders }
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching leaderboard'
    });
  }
});

/**
 * GET /api/v1/games/opponent-stats
 *
 * Aggregated opponent stats across all games. Group by opponent team.
 * Optional filters: ?opponent=, ?season=
 * Returns per-opponent batting/pitching totals with derived stats (AVG, ERA, etc.)
 */
router.get('/opponent-stats', async (req, res) => {
  try {
    const { opponent, season } = req.query;

    const where = { team_id: req.user.team_id };
    if (opponent) where.opponent_name = { [Op.iLike]: `%${opponent}%` };

    // If season filter, join through game
    const include = [];
    if (season) {
      include.push({
        model: Game,
        as: 'game',
        attributes: [],
        where: { season },
        required: true
      });
    }

    const stats = await OpponentGameStat.findAll({
      where,
      include,
      attributes: [
        'opponent_name',
        'opponent_presto_team_id',
        [OpponentGameStat.sequelize.fn('COUNT', OpponentGameStat.sequelize.literal('DISTINCT "OpponentGameStat"."game_id"')), 'games_played'],
        [OpponentGameStat.sequelize.fn('COUNT', OpponentGameStat.sequelize.col('id')), 'total_players'],
        // Batting aggregates
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('at_bats')), 'ab'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('runs')), 'r'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('hits')), 'h'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('doubles')), 'doubles'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('triples')), 'triples'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('home_runs')), 'hr'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('rbi')), 'rbi'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('walks')), 'bb'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('strikeouts_batting')), 'so'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('stolen_bases')), 'sb'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('hit_by_pitch')), 'hbp'],
        // Pitching aggregates
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('innings_pitched')), 'ip'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('hits_allowed')), 'ha'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('earned_runs')), 'er'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('walks_allowed')), 'bba'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('strikeouts_pitching')), 'kp'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('home_runs_allowed')), 'hra'],
        // Fielding aggregates
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('errors')), 'errors'],
      ],
      group: ['opponent_name', 'opponent_presto_team_id'],
      order: [[OpponentGameStat.sequelize.literal('"games_played"'), 'DESC']],
      raw: true
    });

    // Compute derived stats
    const data = stats.map(row => {
      const ab = parseInt(row.ab) || 0;
      const h = parseInt(row.h) || 0;
      const ip = parseFloat(row.ip) || 0;
      const er = parseInt(row.er) || 0;

      return {
        opponent_name: row.opponent_name,
        opponent_presto_team_id: row.opponent_presto_team_id,
        games_played: parseInt(row.games_played),
        batting: {
          ab, r: parseInt(row.r) || 0, h, doubles: parseInt(row.doubles) || 0,
          triples: parseInt(row.triples) || 0, hr: parseInt(row.hr) || 0,
          rbi: parseInt(row.rbi) || 0, bb: parseInt(row.bb) || 0,
          so: parseInt(row.so) || 0, sb: parseInt(row.sb) || 0,
          hbp: parseInt(row.hbp) || 0,
          avg: ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.000'
        },
        pitching: {
          ip, ha: parseInt(row.ha) || 0, er, bb: parseInt(row.bba) || 0,
          so: parseInt(row.kp) || 0, hr: parseInt(row.hra) || 0,
          era: ip > 0 ? ((er * 9) / ip).toFixed(2) : '0.00'
        },
        fielding: { errors: parseInt(row.errors) || 0 }
      };
    });

    res.json({ success: true, data, count: data.length });
  } catch (error) {
    console.error('Error fetching opponent stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opponent stats' });
  }
});

/**
 * GET /api/v1/games/opponent-stats/:opponent/players
 *
 * Per-player breakdown for a specific opponent across all games.
 * Returns individual player stats aggregated across all meetings.
 */
router.get('/opponent-stats/:opponent/players', async (req, res) => {
  try {
    const opponentName = decodeURIComponent(req.params.opponent);
    const { season } = req.query;

    const where = {
      team_id: req.user.team_id,
      opponent_name: opponentName
    };

    const include = [];
    if (season) {
      include.push({
        model: Game,
        as: 'game',
        attributes: [],
        where: { season },
        required: true
      });
    }

    const stats = await OpponentGameStat.findAll({
      where,
      include,
      attributes: [
        'player_name',
        'jersey_number',
        [OpponentGameStat.sequelize.fn('COUNT', OpponentGameStat.sequelize.literal('DISTINCT "OpponentGameStat"."game_id"')), 'games'],
        [OpponentGameStat.sequelize.fn('MAX', OpponentGameStat.sequelize.col('position_played')), 'position'],
        // Batting
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('at_bats')), 'ab'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('runs')), 'r'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('hits')), 'h'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('doubles')), 'doubles'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('triples')), 'triples'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('home_runs')), 'hr'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('rbi')), 'rbi'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('walks')), 'bb'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('strikeouts_batting')), 'so'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('stolen_bases')), 'sb'],
        // Pitching
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('innings_pitched')), 'ip'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('hits_allowed')), 'ha'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('earned_runs')), 'er'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('walks_allowed')), 'bba'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('strikeouts_pitching')), 'kp'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('pitches_thrown')), 'pitches'],
        // Fielding
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('putouts')), 'po'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('assists')), 'a'],
        [OpponentGameStat.sequelize.fn('SUM', OpponentGameStat.sequelize.col('errors')), 'e'],
      ],
      group: ['player_name', 'jersey_number'],
      order: [[OpponentGameStat.sequelize.literal('"ab"'), 'DESC']],
      raw: true
    });

    const players = stats.map(row => {
      const ab = parseInt(row.ab) || 0;
      const h = parseInt(row.h) || 0;
      const ip = parseFloat(row.ip) || 0;
      const er = parseInt(row.er) || 0;
      const isPitcher = ip > 0;

      const result = {
        player_name: row.player_name,
        jersey_number: row.jersey_number,
        position: row.position,
        games: parseInt(row.games),
        batting: {
          ab, r: parseInt(row.r) || 0, h, doubles: parseInt(row.doubles) || 0,
          triples: parseInt(row.triples) || 0, hr: parseInt(row.hr) || 0,
          rbi: parseInt(row.rbi) || 0, bb: parseInt(row.bb) || 0,
          so: parseInt(row.so) || 0, sb: parseInt(row.sb) || 0,
          avg: ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.000'
        },
        fielding: {
          po: parseInt(row.po) || 0, a: parseInt(row.a) || 0, e: parseInt(row.e) || 0
        }
      };

      if (isPitcher) {
        result.pitching = {
          ip, h: parseInt(row.ha) || 0, er, bb: parseInt(row.bba) || 0,
          so: parseInt(row.kp) || 0, pitches: parseInt(row.pitches) || 0,
          era: ip > 0 ? ((er * 9) / ip).toFixed(2) : '0.00'
        };
      }

      return result;
    });

    res.json({
      success: true,
      data: { opponent: opponentName, players },
      count: players.length
    });
  } catch (error) {
    console.error('Error fetching opponent player stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch opponent player stats' });
  }
});

/**
 * @route GET /api/games/:gameId/stats
 * @description Retrieves box score statistics for a specific game - all player stats for that game.
 * @access Private - Requires authentication, game must belong to user's team
 *
 * @param {string} req.params.gameId - The game ID to get statistics for
 *
 * @returns {Object} response - JSON response
 * @returns {boolean} response.success - Whether the request succeeded
 * @returns {Object} response.data - Box score data
 * @returns {Object} response.data.game - Game details (opponent, date, score, result)
 * @returns {Array} response.data.batting - Array of batting statistics by player
 * @returns {Array} response.data.pitching - Array of pitching statistics by player
 * @returns {Array} response.data.fielding - Array of fielding statistics by player
 * @returns {Object} response.data.team_totals - Aggregated team totals
 */
router.get('/:gameId/stats', async (req, res) => {
  try {
    const { gameId } = req.params;

    // Permission: Verify game belongs to user's team
    const game = await Game.findOne({
      where: {
        id: gameId,
        team_id: req.user.team_id
      },
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found or does not belong to your team'
      });
    }

    // Database: Fetch all player statistics for this game
    const gameStats = await GameStatistic.findAll({
      where: {
        game_id: gameId,
        team_id: req.user.team_id
      },
      include: [
        {
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'jersey_number', 'position']
        }
      ],
      order: [[{ model: Player, as: 'player' }, 'last_name', 'ASC']]
    });

    // Format batting statistics (players with at-bats or plate appearances)
    const battingStats = gameStats
      .filter(s => s.at_bats > 0 || s.walks > 0 || s.hit_by_pitch > 0 ||
                   s.sacrifice_flies > 0 || s.sacrifice_bunts > 0)
      .map(stat => ({
        player: {
          id: stat.player.id,
          name: `${stat.player.first_name} ${stat.player.last_name}`,
          jersey_number: stat.player.jersey_number,
          position: stat.position_played || stat.player.position
        },
        ab: stat.at_bats || 0,
        r: stat.runs || 0,
        h: stat.hits || 0,
        '2b': stat.doubles || 0,
        '3b': stat.triples || 0,
        hr: stat.home_runs || 0,
        rbi: stat.rbi || 0,
        bb: stat.walks || 0,
        so: stat.strikeouts_batting || 0,
        sb: stat.stolen_bases || 0,
        cs: stat.caught_stealing || 0,
        hbp: stat.hit_by_pitch || 0,
        sf: stat.sacrifice_flies || 0,
        sh: stat.sacrifice_bunts || 0,
        avg: stat.at_bats > 0
          ? (stat.hits / stat.at_bats).toFixed(3).replace(/^0/, '')
          : '.000'
      }));

    // Format pitching statistics (players who pitched)
    const pitchingStats = gameStats
      .filter(s => parseFloat(s.innings_pitched) > 0)
      .map(stat => ({
        player: {
          id: stat.player.id,
          name: `${stat.player.first_name} ${stat.player.last_name}`,
          jersey_number: stat.player.jersey_number
        },
        ip: stat.innings_pitched,
        h: stat.hits_allowed || 0,
        r: stat.runs_allowed || 0,
        er: stat.earned_runs || 0,
        bb: stat.walks_allowed || 0,
        so: stat.strikeouts_pitching || 0,
        hr: stat.home_runs_allowed || 0,
        bf: stat.batters_faced || 0,
        pitches: stat.pitches_thrown || 0,
        strikes: stat.strikes_thrown || 0,
        decision: stat.win ? 'W' : stat.loss ? 'L' : stat.getDataValue('save') ? 'SV' : stat.hold ? 'H' : null,
        era: parseFloat(stat.innings_pitched) > 0
          ? ((stat.earned_runs * 9) / parseFloat(stat.innings_pitched)).toFixed(2)
          : '0.00'
      }));

    // Format fielding statistics
    const fieldingStats = gameStats
      .filter(s => s.putouts > 0 || s.assists > 0 || s.errors > 0)
      .map(stat => ({
        player: {
          id: stat.player.id,
          name: `${stat.player.first_name} ${stat.player.last_name}`,
          jersey_number: stat.player.jersey_number,
          position: stat.position_played || stat.player.position
        },
        po: stat.putouts || 0,
        a: stat.assists || 0,
        e: stat.errors || 0,
        fpct: (stat.putouts + stat.assists + stat.errors) > 0
          ? ((stat.putouts + stat.assists) / (stat.putouts + stat.assists + stat.errors)).toFixed(3)
          : '1.000'
      }));

    // Calculate team totals
    const teamTotals = {
      batting: {
        ab: gameStats.reduce((sum, s) => sum + (s.at_bats || 0), 0),
        r: gameStats.reduce((sum, s) => sum + (s.runs || 0), 0),
        h: gameStats.reduce((sum, s) => sum + (s.hits || 0), 0),
        '2b': gameStats.reduce((sum, s) => sum + (s.doubles || 0), 0),
        '3b': gameStats.reduce((sum, s) => sum + (s.triples || 0), 0),
        hr: gameStats.reduce((sum, s) => sum + (s.home_runs || 0), 0),
        rbi: gameStats.reduce((sum, s) => sum + (s.rbi || 0), 0),
        bb: gameStats.reduce((sum, s) => sum + (s.walks || 0), 0),
        so: gameStats.reduce((sum, s) => sum + (s.strikeouts_batting || 0), 0),
        sb: gameStats.reduce((sum, s) => sum + (s.stolen_bases || 0), 0),
        lob: 0 // Left on base - would need additional tracking
      },
      pitching: {
        ip: gameStats.reduce((sum, s) => sum + parseFloat(s.innings_pitched || 0), 0),
        h: gameStats.reduce((sum, s) => sum + (s.hits_allowed || 0), 0),
        r: gameStats.reduce((sum, s) => sum + (s.runs_allowed || 0), 0),
        er: gameStats.reduce((sum, s) => sum + (s.earned_runs || 0), 0),
        bb: gameStats.reduce((sum, s) => sum + (s.walks_allowed || 0), 0),
        so: gameStats.reduce((sum, s) => sum + (s.strikeouts_pitching || 0), 0),
        hr: gameStats.reduce((sum, s) => sum + (s.home_runs_allowed || 0), 0)
      },
      fielding: {
        po: gameStats.reduce((sum, s) => sum + (s.putouts || 0), 0),
        a: gameStats.reduce((sum, s) => sum + (s.assists || 0), 0),
        e: gameStats.reduce((sum, s) => sum + (s.errors || 0), 0)
      }
    };

    // Calculate team batting average
    teamTotals.batting.avg = teamTotals.batting.ab > 0
      ? (teamTotals.batting.h / teamTotals.batting.ab).toFixed(3).replace(/^0/, '')
      : '.000';

    // Calculate team ERA
    teamTotals.pitching.era = teamTotals.pitching.ip > 0
      ? ((teamTotals.pitching.er * 9) / teamTotals.pitching.ip).toFixed(2)
      : '0.00';

    res.json({
      success: true,
      data: {
        game: {
          id: game.id,
          opponent: game.opponent,
          game_date: game.game_date,
          game_time: game.game_time,
          home_away: game.home_away,
          location: game.location,
          team_score: game.team_score,
          opponent_score: game.opponent_score,
          result: game.result,
          game_status: game.game_status,
          attendance: game.attendance,
          weather: game.weather,
          duration: game.game_duration,
          team: game.team
        },
        batting: battingStats,
        pitching: pitchingStats,
        fielding: fieldingStats,
        team_totals: teamTotals,
        player_count: gameStats.length
      }
    });
  } catch (error) {
    console.error('Error fetching game box score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game statistics'
    });
  }
});

/**
 * GET /api/v1/games/:gameId/box-score
 *
 * Fetch a full box score from PrestoSports for a game that has a presto_event_id.
 * Returns both teams' data: linescore, batting, pitching, fielding for all players.
 * Opponent players may have empty names but will have jersey numbers and full stats.
 *
 * @returns {Object} { visitor: {...}, home: {...}, gameInfo: {...} }
 */
router.get('/:gameId/box-score', async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findOne({
      where: { id: gameId, team_id: req.user.team_id }
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found or does not belong to your team'
      });
    }

    if (!game.presto_event_id && !game.external_id) {
      return res.status(400).json({
        success: false,
        error: 'This game has no PrestoSports event linked. Box score is only available for Presto-synced games.'
      });
    }

    const eventId = game.presto_event_id || game.external_id;

    // Authenticate and fetch live box score XML from Presto
    const token = await prestoSyncService.getToken(req.user.team_id);
    const statsResponse = await prestoSportsService.getEventStats(token, eventId);

    const xml = statsResponse?.data?.xml || statsResponse?.xml ||
                (typeof statsResponse?.data === 'string' ? statsResponse.data : null) ||
                (typeof statsResponse === 'string' ? statsResponse : null);

    if (!xml) {
      // Fall back to JSON if no XML (some events return structured JSON)
      return res.json({
        success: true,
        data: {
          game: {
            id: game.id,
            opponent: game.opponent,
            game_date: game.game_date,
            home_away: game.home_away,
            result: game.result,
            team_score: game.team_score,
            opponent_score: game.opponent_score
          },
          box_score: statsResponse?.data || statsResponse || null,
          format: 'raw'
        }
      });
    }

    const boxScore = parseBoxScore(xml);

    if (!boxScore) {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse box score XML'
      });
    }

    res.json({
      success: true,
      data: {
        game: {
          id: game.id,
          opponent: game.opponent,
          game_date: game.game_date,
          game_time: game.game_time,
          home_away: game.home_away,
          location: game.location,
          result: game.result,
          team_score: game.team_score,
          opponent_score: game.opponent_score,
          season: game.season,
          season_name: game.season_name
        },
        box_score: boxScore,
        format: 'parsed'
      }
    });
  } catch (error) {
    console.error('Error fetching Presto box score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch box score from PrestoSports'
    });
  }
});

module.exports = router;
