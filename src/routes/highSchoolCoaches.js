const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { HighSchoolCoach, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/high-school-coaches
// @desc    Get all high school coaches for the user's team
// @access  Private
router.get('/', [
  query('search').optional().isString(),
  query('state').optional().isString(),
  query('position').optional().isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  query('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  query('status').optional().isIn(['active', 'inactive']),
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
      state,
      position,
      relationship_type,
      status = 'active',
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

    if (state) {
      whereClause.state = state;
    }

    if (position) {
      whereClause.position = position;
    }

    if (relationship_type) {
      whereClause.relationship_type = relationship_type;
    }

    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { school_district: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: coaches } = await HighSchoolCoach.findAndCountAll({
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
    console.error('Get high school coaches error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching high school coaches' 
    });
  }
});

// @route   GET /api/high-school-coaches/:id
// @desc    Get a specific high school coach
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const coach = await HighSchoolCoach.findOne({
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
        error: 'High school coach not found' 
      });
    }

    res.json({
      success: true,
      data: coach
    });
  } catch (error) {
    console.error('Get high school coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching high school coach' 
    });
  }
});

// @route   POST /api/high-school-coaches
// @desc    Create a new high school coach
// @access  Private
router.post('/', [
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('school_name').trim().isLength({ min: 1, max: 200 }),
  body('school_district').optional().trim().isLength({ max: 200 }),
  body('position').isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('city').optional().isLength({ max: 100 }),
  body('state').optional().isLength({ max: 50 }),
  body('region').optional().isLength({ max: 100 }),
  body('years_coaching').optional().isInt({ min: 0, max: 50 }),
  body('conference').optional().isLength({ max: 100 }),
  body('school_classification').optional().isIn(['1A', '2A', '3A', '4A', '5A', '6A', 'Private']),
  body('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('players_sent_count').optional().isInt({ min: 0 })
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

    const coach = await HighSchoolCoach.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdCoach = await HighSchoolCoach.findByPk(coach.id, {
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
    console.error('Create high school coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating high school coach' 
    });
  }
});

// @route   PUT /api/high-school-coaches/:id
// @desc    Update a high school coach
// @access  Private
router.put('/:id', [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('school_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('school_district').optional().trim().isLength({ max: 200 }),
  body('position').optional().isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('city').optional().isLength({ max: 100 }),
  body('state').optional().isLength({ max: 50 }),
  body('region').optional().isLength({ max: 100 }),
  body('years_coaching').optional().isInt({ min: 0, max: 50 }),
  body('conference').optional().isLength({ max: 100 }),
  body('school_classification').optional().isIn(['1A', '2A', '3A', '4A', '5A', '6A', 'Private']),
  body('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('players_sent_count').optional().isInt({ min: 0 }),
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

    const coach = await HighSchoolCoach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!coach) {
      return res.status(404).json({ 
        success: false, 
        error: 'High school coach not found' 
      });
    }

    await coach.update(req.body);

    const updatedCoach = await HighSchoolCoach.findByPk(coach.id, {
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
    console.error('Update high school coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating high school coach' 
    });
  }
});

// @route   DELETE /api/high-school-coaches/:id
// @desc    Delete a high school coach
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const coach = await HighSchoolCoach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!coach) {
      return res.status(404).json({ 
        success: false, 
        error: 'High school coach not found' 
      });
    }

    await coach.destroy();

    res.json({
      success: true,
      message: 'High school coach deleted successfully'
    });
  } catch (error) {
    console.error('Delete high school coach error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting high school coach' 
    });
  }
});

module.exports = router;
