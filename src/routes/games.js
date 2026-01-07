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
const { body, param, query } = require('express-validator');
const { Op } = require('sequelize');
const { protect } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { Game, Team, Player } = require('../models');
const { createSortValidators, buildOrderClause } = require('../utils/sorting');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

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
 *              Supports filtering by season and result. Supports configurable sorting
 *              via orderBy and sortDirection query parameters.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Query parameter validation for sorting
 *
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=20] - Number of games per page (default 20)
 * @param {string} [req.query.season] - Optional filter by season (e.g., "2024")
 * @param {string} [req.query.result] - Optional filter by result ('W', 'L', or 'T')
 * @param {string} [req.query.orderBy=game_date] - Column to sort by (game_date, opponent, home_away, result, team_score, opponent_score, season, created_at)
 * @param {string} [req.query.sortDirection=DESC] - Sort direction ('ASC' or 'DESC', case-insensitive)
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
 * @throws {400} Validation error - Invalid orderBy column or sortDirection value
 * @throws {500} Server error - Database query failure
 */
router.get('/', createSortValidators('games'), async (req, res) => {
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

    // Pagination: Parse page and limit from query params with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const {
      season,
      result,
      orderBy,
      sortDirection
    } = req.query;

    // Permission: Filter games to user's team only (multi-tenant isolation)
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional season filter
    if (season) {
      whereClause.season = season;
    }

    // Business logic: Apply optional result filter (W/L/T)
    if (result) {
      whereClause.result = result;
    }

    // Business logic: Build dynamic order clause from query parameters (defaults to game_date DESC)
    const orderClause = buildOrderClause('games', orderBy, sortDirection);

    // Database: Fetch games with team association and pagination
    const games = await Game.findAndCountAll({
      where: whereClause,
      order: orderClause,
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
      attributes: ['result', 'team_score', 'opponent_score', 'season']
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
      if (game.result === 'W') acc[season].wins++;
      else if (game.result === 'L') acc[season].losses++;
      else if (game.result === 'T') acc[season].ties++;

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

    // Permission: Filter games to user's team only
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional season filter
    if (season) {
      whereClause.season = season;
    }

    // Database: Fetch all team games
    // Note: In a full implementation, this would join with a GamePlayerStats table
    // to get per-player statistics for each game
    const games = await Game.findAll({
      where: whereClause,
      include: [
        {
          model: Team,
          as: 'team',
          attributes: ['id', 'name']
        }
      ],
      order: [['game_date', 'DESC']]
    });

    // Business logic: Format response with player context
    // Note: This returns basic game data; actual player stats would require
    // a GamePlayerStats model with per-game player statistics
    const playerGameStats = {
      player_id: parseInt(playerId),
      total_games: games.length,
      // Map games to simplified objects with key fields
      games: games.map(game => ({
        id: game.id,
        opponent: game.opponent,
        game_date: game.game_date,
        home_away: game.home_away,
        result: game.result,
        team_score: game.team_score,
        opponent_score: game.opponent_score,
        location: game.location
      })),
      // Calculate summary statistics for quick reference
      summary: {
        wins: games.filter(g => g.result === 'W').length,
        losses: games.filter(g => g.result === 'L').length,
        ties: games.filter(g => g.result === 'T').length,
        home_games: games.filter(g => g.home_away === 'home').length,
        away_games: games.filter(g => g.home_away === 'away').length
      }
    };

    res.json({
      success: true,
      data: playerGameStats
    });
  } catch (error) {
    console.error('Error fetching player game statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player game statistics'
    });
  }
});

module.exports = router;
