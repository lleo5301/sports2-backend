const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Player, PreferenceList, Team, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/recruits
// @desc    Get recruiting board players (non-pitchers, card format)
// @access  Private
router.get('/', [
  query('school_type').optional().isIn(['HS', 'COLL']),
  query('position').optional().isIn(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF']),
  query('search').optional().isString(),
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
      school_type, 
      position, 
      search, 
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause - exclude pitchers
    const whereClause = {
      team_id: req.user.team_id,
      position: {
        [Op.notIn]: ['P', 'DH'] // Exclude pitchers and DH from recruiting board
      }
    };

    if (school_type) {
      whereClause.school_type = school_type;
    }

    if (position) {
      whereClause.position = position;
    }

    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: players } = await Player.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: PreferenceList,
          where: { team_id: req.user.team_id },
          required: false,
          attributes: ['list_type', 'priority', 'status', 'interest_level']
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
    console.error('Get recruits error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching recruits' 
    });
  }
});

// @route   GET /api/recruits/preference-lists
// @desc    Get preference lists (New Players, Overall Pref List, HS Pref List)
// @access  Private
router.get('/preference-lists', [
  query('list_type').optional().isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers']),
  query('status').optional().isIn(['active', 'inactive', 'committed', 'signed', 'lost']),
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
      list_type, 
      status, 
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;

    const whereClause = {
      team_id: req.user.team_id
    };

    if (list_type) {
      whereClause.list_type = list_type;
    }

    if (status) {
      whereClause.status = status;
    }

    const { count, rows: preferenceLists } = await PreferenceList.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state', 'graduation_year']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['priority', 'ASC'], ['added_date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: preferenceLists,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get preference lists error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching preference lists' 
    });
  }
});

// @route   POST /api/recruits/preference-lists
// @desc    Add player to preference list
// @access  Private
router.post('/preference-lists', [
  body('player_id').isInt({ min: 1 }),
  body('list_type').isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers']),
  body('priority').optional().isInt({ min: 1, max: 999 }),
  body('notes').optional().isString(),
  body('interest_level').optional().isIn(['High', 'Medium', 'Low', 'Unknown']),
  body('visit_scheduled').optional().isBoolean(),
  body('visit_date').optional().isISO8601(),
  body('scholarship_offered').optional().isBoolean(),
  body('scholarship_amount').optional().isFloat({ min: 0 })
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

    const { player_id, list_type, ...preferenceData } = req.body;

    // Verify player belongs to user's team
    const player = await Player.findOne({
      where: {
        id: player_id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found' 
      });
    }

    // Check if player is already in this list type
    const existingPreference = await PreferenceList.findOne({
      where: {
        player_id,
        team_id: req.user.team_id,
        list_type
      }
    });

    if (existingPreference) {
      return res.status(400).json({ 
        success: false, 
        error: 'Player is already in this preference list' 
      });
    }

    const preference = await PreferenceList.create({
      ...preferenceData,
      player_id,
      list_type,
      team_id: req.user.team_id,
      added_by: req.user.id
    });

    const createdPreference = await PreferenceList.findByPk(preference.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdPreference
    });
  } catch (error) {
    console.error('Add to preference list error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while adding to preference list' 
    });
  }
});

// @route   PUT /api/recruits/preference-lists/:id
// @desc    Update preference list entry
// @access  Private
router.put('/preference-lists/:id', [
  body('priority').optional().isInt({ min: 1, max: 999 }),
  body('notes').optional().isString(),
  body('status').optional().isIn(['active', 'inactive', 'committed', 'signed', 'lost']),
  body('interest_level').optional().isIn(['High', 'Medium', 'Low', 'Unknown']),
  body('visit_scheduled').optional().isBoolean(),
  body('visit_date').optional().isISO8601(),
  body('scholarship_offered').optional().isBoolean(),
  body('scholarship_amount').optional().isFloat({ min: 0 }),
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

    const preference = await PreferenceList.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!preference) {
      return res.status(404).json({ 
        success: false, 
        error: 'Preference list entry not found' 
      });
    }

    await preference.update(req.body);

    const updatedPreference = await PreferenceList.findByPk(preference.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedPreference
    });
  } catch (error) {
    console.error('Update preference list error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating preference list' 
    });
  }
});

// @route   DELETE /api/recruits/preference-lists/:id
// @desc    Remove player from preference list
// @access  Private
router.delete('/preference-lists/:id', async (req, res) => {
  try {
    const preference = await PreferenceList.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!preference) {
      return res.status(404).json({ 
        success: false, 
        error: 'Preference list entry not found' 
      });
    }

    await preference.destroy();

    res.json({
      success: true,
      message: 'Player removed from preference list successfully'
    });
  } catch (error) {
    console.error('Remove from preference list error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while removing from preference list' 
    });
  }
});

module.exports = router; 