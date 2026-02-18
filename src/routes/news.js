const express = require('express');
const { Op } = require('sequelize');
const { NewsRelease, Player } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route GET /api/v1/news
 * @description List news releases for the authenticated user's team.
 *              Supports filtering by category, player_id, and ILIKE search.
 *
 * @param {string} [req.query.category] - Filter by category
 * @param {number} [req.query.player_id] - Filter by associated player
 * @param {string} [req.query.search] - ILIKE search on title + summary
 * @param {number} [req.query.page=1] - Page number
 * @param {number} [req.query.limit=20] - Items per page (max 50)
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const where = { team_id: req.user.team_id };

    if (req.query.category) {
      where.category = req.query.category;
    }

    if (req.query.player_id) {
      where.player_id = req.query.player_id;
    }

    if (req.query.search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${req.query.search}%` } },
        { summary: { [Op.iLike]: `%${req.query.search}%` } }
      ];
    }

    const { count, rows: news } = await NewsRelease.findAndCountAll({
      where,
      attributes: { exclude: ['content'] },
      include: [{
        model: Player,
        as: 'player',
        required: false,
        attributes: ['id', 'first_name', 'last_name']
      }],
      order: [['publish_date', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: news,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get news error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching news'
    });
  }
});

/**
 * @route GET /api/v1/news/byId/:id
 * @description Get a single news release with full content.
 *
 * @param {number} req.params.id - NewsRelease ID
 */
router.get('/byId/:id', async (req, res) => {
  try {
    const release = await NewsRelease.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [{
        model: Player,
        as: 'player',
        required: false,
        attributes: ['id', 'first_name', 'last_name']
      }]
    });

    if (!release) {
      return res.status(404).json({
        success: false,
        error: 'News release not found'
      });
    }

    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    console.error('Get news release error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching news release'
    });
  }
});

module.exports = router;
