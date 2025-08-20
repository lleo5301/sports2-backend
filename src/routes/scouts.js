const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Scout, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/scouts
// @desc    Get all scouts for the user's team
// @access  Private
router.get('/', [
  query('search').optional().isString(),
  query('status').optional().isIn(['active', 'inactive']),
  query('position').optional().isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
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
        { organization_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { coverage_area: { [Op.iLike]: `%${search}%` } },
        { specialization: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: scouts } = await Scout.findAndCountAll({
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
      data: scouts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get scouts error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching scouts' 
    });
  }
});

// @route   GET /api/scouts/:id
// @desc    Get a specific scout
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const scout = await Scout.findOne({
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

    if (!scout) {
      return res.status(404).json({ 
        success: false, 
        error: 'Scout not found' 
      });
    }

    res.json({
      success: true,
      data: scout
    });
  } catch (error) {
    console.error('Get scout error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching scout' 
    });
  }
});

// @route   POST /api/scouts
// @desc    Create a new scout
// @access  Private
router.post('/', [
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('organization_name').trim().isLength({ min: 1, max: 200 }),
  body('position').isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('coverage_area').optional().isLength({ max: 500 }),
  body('specialization').optional().isLength({ max: 200 })
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

    const scout = await Scout.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdScout = await Scout.findByPk(scout.id, {
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
      data: createdScout
    });
  } catch (error) {
    console.error('Create scout error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating scout' 
    });
  }
});

// @route   PUT /api/scouts/:id
// @desc    Update a scout
// @access  Private
router.put('/:id', [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('organization_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('position').optional().isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('status').optional().isIn(['active', 'inactive']),
  body('coverage_area').optional().isLength({ max: 500 }),
  body('specialization').optional().isLength({ max: 200 })
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

    const scout = await Scout.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!scout) {
      return res.status(404).json({ 
        success: false, 
        error: 'Scout not found' 
      });
    }

    await scout.update(req.body);

    const updatedScout = await Scout.findByPk(scout.id, {
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
      data: updatedScout
    });
  } catch (error) {
    console.error('Update scout error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating scout' 
    });
  }
});

// @route   DELETE /api/scouts/:id
// @desc    Delete a scout
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const scout = await Scout.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!scout) {
      return res.status(404).json({ 
        success: false, 
        error: 'Scout not found' 
      });
    }

    await scout.destroy();

    res.json({
      success: true,
      message: 'Scout deleted successfully'
    });
  } catch (error) {
    console.error('Delete scout error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting scout' 
    });
  }
});

module.exports = router;
