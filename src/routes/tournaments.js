const express = require('express');
const { sequelize } = require('../config/database');
const { Tournament, Game } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route GET /api/v1/tournaments
 * @description List tournaments for the authenticated user's team.
 *              Supports filtering by season with pagination.
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const where = { team_id: req.user.team_id };

    if (req.query.season) {
      where.season = req.query.season;
    }

    const { count, rows: tournaments } = await Tournament.findAndCountAll({
      where,
      attributes: {
        include: [
          [sequelize.fn('COUNT', sequelize.col('games.id')), 'game_count']
        ]
      },
      include: [{
        model: Game,
        as: 'games',
        attributes: [],
        required: false
      }],
      group: ['Tournament.id'],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      subQuery: false
    });

    // findAndCountAll with group returns array of counts
    const total = Array.isArray(count) ? count.length : count;

    res.json({
      success: true,
      data: tournaments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching tournaments'
    });
  }
});

/**
 * @route GET /api/v1/tournaments/:id/games
 * @description Get all games in a tournament, ordered by game_date ASC.
 */
router.get('/:id/games', async (req, res) => {
  try {
    const tournament = await Tournament.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    const games = await Game.findAll({
      where: { tournament_id: tournament.id },
      order: [['game_date', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        tournament,
        games
      }
    });
  } catch (error) {
    console.error('Get tournament games error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching tournament games'
    });
  }
});

module.exports = router;
