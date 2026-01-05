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
const { Game, Team } = require('../models');
const { createSortValidators, buildOrderClause } = require('../utils/sorting');

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
 *              Supports filtering by season and result, and free-text search.
 *              Search performs case-insensitive matching across opponent, location, season, and notes.
 *              Supports configurable sorting via orderBy and sortDirection query parameters.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Query parameter validation for sorting and search
 *
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=20] - Number of games per page (default 20)
 * @param {string} [req.query.season] - Optional filter by season (e.g., "2024")
 * @param {string} [req.query.result] - Optional filter by result ('W', 'L', or 'T')
 * @param {string} [req.query.search] - Free-text search across opponent, location, season, and notes fields
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
router.get('/', [
  // Validation: Search must be a string if provided
  query('search').optional().isString().withMessage('Search must be a string'),
  ...createSortValidators('games')
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

    // Pagination: Parse page and limit from query params with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const {
      season,
      result,
      search,
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

    // Business logic: Free-text search using case-insensitive ILIKE across multiple fields
    if (search) {
      whereClause[Op.or] = [
        { opponent: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } },
        { season: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } }
      ];
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
router.put('/byId/:id', validateGame, handleValidationErrors, async (req, res) => {
  try {
    // Permission: Verify game belongs to user's team before updating
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if game not found or doesn't belong to user
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
 * @description Deletes a game from the authenticated user's team.
 *              Note: Uses /byId/:id path pattern for consistency with other routes.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Game ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {404} Not found - Game doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id', async (req, res) => {
  try {
    // Permission: Verify game belongs to user's team before deleting
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if game not found or doesn't belong to user
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Database: Delete the game
    await game.destroy();

    res.json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

/**
 * @route GET /api/games/stats
 * @description Retrieves aggregate statistics for games.
 *              Calculates win rate, average runs scored, and average runs allowed.
 *              Can be filtered by season.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} [req.query.season] - Optional season filter to scope statistics
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Statistics object
 * @returns {number} response.data.totalGames - Total number of games (played)
 * @returns {number} response.data.wins - Total number of wins
 * @returns {number} response.data.losses - Total number of losses
 * @returns {number} response.data.ties - Total number of ties
 * @returns {number} response.data.winRate - Win rate percentage (0-100)
 * @returns {number} response.data.avgRunsScored - Average runs scored per game
 * @returns {number} response.data.avgRunsAllowed - Average runs allowed per game
 * @returns {string} [response.data.season] - Season filter applied (if provided)
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats', async (req, res) => {
  try {
    // Permission: Filter games to user's team only
    const whereClause = {
      team_id: req.user.team_id,
      // Business logic: Only count games with results (not scheduled future games)
      result: { [Op.not]: null }
    };

    // Business logic: Apply optional season filter
    if (req.query.season) {
      whereClause.season = req.query.season;
    }

    // Database: Fetch all completed games for statistics calculation
    const games = await Game.findAll({
      where: whereClause,
      attributes: ['team_score', 'opponent_score', 'result']
    });

    // Business logic: Calculate statistics
    const stats = {
      totalGames: games.length,
      wins: games.filter(g => g.result === 'W').length,
      losses: games.filter(g => g.result === 'L').length,
      ties: games.filter(g => g.result === 'T').length,
      avgRunsScored: games.length > 0 
        ? (games.reduce((sum, g) => sum + (g.team_score || 0), 0) / games.length).toFixed(2)
        : 0,
      avgRunsAllowed: games.length > 0
        ? (games.reduce((sum, g) => sum + (g.opponent_score || 0), 0) / games.length).toFixed(2)
        : 0
    };

    // Business logic: Calculate win rate (wins / total games played)
    stats.winRate = stats.totalGames > 0
      ? ((stats.wins / stats.totalGames) * 100).toFixed(2)
      : 0;

    // Response: Include season filter if applied
    if (req.query.season) {
      stats.season = req.query.season;
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching game statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;