const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { protect } = require('../middleware/auth');
const { Game, Team, Player } = require('../models');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Helper function to handle validation errors
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

// Validation rules
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

// GET /api/games - Get all games for the user's team
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const whereClause = {
      team_id: req.user.team_id
    };

    if (req.query.season) {
      whereClause.season = req.query.season;
    }

    if (req.query.result) {
      whereClause.result = req.query.result;
    }

    const games = await Game.findAndCountAll({
      where: whereClause,
      order: [['game_date', 'DESC']],
      limit,
      offset,
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

// GET /api/games/:id - Get a specific game
router.get('/byId/:id', async (req, res) => {
  try {
    const game = await Game.findOne({
      where: {
        id: req.params.id,
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
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ success: true, data: game });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// POST /api/games - Create a new game
router.post('/', validateGame, handleValidationErrors, async (req, res) => {
  try {
    const game = await Game.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

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

// PUT /api/games/:id - Update a game
router.put('/byId/:id', [
  param('id').isInt().withMessage('Game ID must be an integer'),
  ...validateGame
], handleValidationErrors, async (req, res) => {
  try {
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await game.update(req.body);

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

// DELETE /api/games/:id - Delete a game
router.delete('/byId/:id', [
  param('id').isInt().withMessage('Game ID must be an integer'),
  handleValidationErrors
], async (req, res) => {
  try {
    const game = await Game.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await game.destroy();

    res.json({ success: true, message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// GET /api/games/log - Get game log (recent games)
router.get('/log', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  handleValidationErrors
], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const games = await Game.findAll({
      where: {
        team_id: req.user.team_id
      },
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

// GET /api/games/team-stats - Get team game statistics
router.get('/team-stats', async (req, res) => {
  try {
    const games = await Game.findAll({
      where: {
        team_id: req.user.team_id
      },
      attributes: ['result', 'team_score', 'opponent_score']
    });

    const stats = {
      gamesPlayed: games.length,
      wins: games.filter(g => g.result === 'W').length,
      losses: games.filter(g => g.result === 'L').length,
      ties: games.filter(g => g.result === 'T').length,
      winRate: games.length > 0 ? games.filter(g => g.result === 'W').length / games.length : 0,
      totalRunsScored: games.reduce((sum, g) => sum + (g.team_score || 0), 0),
      totalRunsAllowed: games.reduce((sum, g) => sum + (g.opponent_score || 0), 0),
      avgRunsScored: games.length > 0 ? games.reduce((sum, g) => sum + (g.team_score || 0), 0) / games.length : 0,
      avgRunsAllowed: games.length > 0 ? games.reduce((sum, g) => sum + (g.opponent_score || 0), 0) / games.length : 0
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching team game stats:', error);
    res.status(500).json({ error: 'Failed to fetch team game stats' });
  }
});

// GET /api/games/upcoming - Get upcoming games
router.get('/upcoming', [
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be between 1 and 20'),
  handleValidationErrors
], async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    const games = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_date: {
          [Op.gte]: today
        }
      },
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

// GET /api/games/season-stats - Get season statistics
router.get('/season-stats', [
  query('season').optional().isString().withMessage('Season must be a string'),
  handleValidationErrors
], async (req, res) => {
  try {
    const whereClause = {
      team_id: req.user.team_id
    };

    if (req.query.season) {
      whereClause.season = req.query.season;
    }

    const games = await Game.findAll({
      where: whereClause,
      attributes: ['result', 'team_score', 'opponent_score', 'season']
    });

    const seasonStats = games.reduce((acc, game) => {
      const season = game.season || 'Unknown';
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

      acc[season].gamesPlayed++;
      if (game.result === 'W') acc[season].wins++;
      else if (game.result === 'L') acc[season].losses++;
      else if (game.result === 'T') acc[season].ties++;

      acc[season].totalRunsScored += game.team_score || 0;
      acc[season].totalRunsAllowed += game.opponent_score || 0;

      return acc;
    }, {});

    // Calculate additional stats
    Object.values(seasonStats).forEach(season => {
      season.winRate = season.gamesPlayed > 0 ? season.wins / season.gamesPlayed : 0;
      season.avgRunsScored = season.gamesPlayed > 0 ? season.totalRunsScored / season.gamesPlayed : 0;
      season.avgRunsAllowed = season.gamesPlayed > 0 ? season.totalRunsAllowed / season.gamesPlayed : 0;
    });

    res.json({ success: true, data: Object.values(seasonStats) });
  } catch (error) {
    console.error('Error fetching season stats:', error);
    res.status(500).json({ error: 'Failed to fetch season stats' });
  }
});

// GET /api/games/player-stats/:playerId - Get player game statistics
router.get('/player-stats/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { season } = req.query;

    const whereClause = {
      team_id: req.user.team_id
    };

    if (season) {
      whereClause.season = season;
    }

    // Get games where the player participated
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

    // For now, return basic game participation data
    // In a real implementation, you'd have a GamePlayerStats model
    const playerGameStats = {
      player_id: parseInt(playerId),
      total_games: games.length,
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