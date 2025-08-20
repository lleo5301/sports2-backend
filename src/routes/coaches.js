const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Coach, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/coaches
// @desc    Get all coaches for the user's team
// @access  Private
router.get('/', [
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive']),
  query('position').optional().isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { 
      search, 
      status = 'active',
      position,
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {
      team_id: req.user.team_id
    };

    if (status) {
      whereClause.status = status;
    }

    if (position) {
      whereClause.position = position;
    }

    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: coaches } = await Coach.findAndCountAll({
      where: whereClause,
      include: [
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
      data: coaches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get coaches error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching coaches' 
    });
  }
});

// @route   GET /api/coaches/:id
// @desc    Get a specific coach
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const coach = await Coach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    if (!coach) {
      return res.status(404).json({ 
        success: false, 
        error: 'Coach not found' 
      });
    }

    res.json({
      success: true,
      data: coach
    });
  } catch (error) {
    console.error('Get coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching coach' 
    });
  }
});

// @route   POST /api/coaches
// @desc    Create a new coach
// @access  Private
router.post('/', [
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('school_name').trim().isLength({ min: 1, max: 200 }),
  body('position').isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const coach = await Coach.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdCoach = await Coach.findByPk(coach.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdCoach
    });
  } catch (error) {
    console.error('Create coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating coach' 
    });
  }
});

// @route   PUT /api/coaches/:id
// @desc    Update a coach
// @access  Private
router.put('/:id', [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('school_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('position').optional().isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const coach = await Coach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!coach) {
      return res.status(404).json({ 
        success: false, 
        error: 'Coach not found' 
      });
    }

    await coach.update(req.body);

    const updatedCoach = await Coach.findByPk(coach.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedCoach
    });
  } catch (error) {
    console.error('Update coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating coach' 
    });
  }
});

// @route   DELETE /api/coaches/:id
// @desc    Delete a coach
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const coach = await Coach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!coach) {
      return res.status(404).json({ 
        success: false, 
        error: 'Coach not found' 
      });
    }

    await coach.destroy();

    res.json({
      success: true,
      message: 'Coach deleted successfully'
    });
  } catch (error) {
    console.error('Delete coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting coach' 
    });
  }
});

module.exports = router;
