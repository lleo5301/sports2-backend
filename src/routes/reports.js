const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { ScoutingReport, DailyReport, Player, User, Team } = require('../models');
const { protect, isHeadCoach } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// ==================== SCOUTING REPORTS ====================

// @route   GET /api/reports/scouting
// @desc    Get all scouting reports for the team
// @access  Private
router.get('/scouting', [
  query('player_id').optional().isInt({ min: 1 }),
  query('created_by').optional().isInt({ min: 1 }),
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

    const { player_id, created_by, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};

    if (player_id) {
      whereClause.player_id = player_id;
    }

    if (created_by) {
      whereClause.created_by = created_by;
    }

    const { count, rows: reports } = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id },
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get scouting reports error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching scouting reports' 
    });
  }
});

// @route   POST /api/reports/scouting
// @desc    Create a new scouting report
// @access  Private
router.post('/scouting', [
  body('player_id').isInt({ min: 1 }),
  body('report_date').optional().isISO8601(),
  body('game_date').optional().isISO8601(),
  body('opponent').optional().isLength({ min: 1, max: 100 }),
  body('overall_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('overall_notes').optional().isString(),
  body('hitting_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('hitting_notes').optional().isString(),
  body('pitching_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('pitching_notes').optional().isString(),
  body('fielding_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('fielding_notes').optional().isString(),
  body('speed_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('speed_notes').optional().isString(),
  body('intangibles_grade').optional().isIn(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']),
  body('intangibles_notes').optional().isString(),
  body('projection').optional().isIn(['MLB', 'AAA', 'AA', 'A+', 'A', 'A-', 'College', 'High School']),
  body('projection_notes').optional().isString()
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

    const { player_id, ...reportData } = req.body;

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

    const report = await ScoutingReport.create({
      ...reportData,
      player_id,
      created_by: req.user.id
    });

    const createdReport = await ScoutingReport.findByPk(report.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdReport
    });
  } catch (error) {
    console.error('Create scouting report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating scouting report' 
    });
  }
});

// ==================== DAILY REPORTS ====================

// @route   GET /api/reports/daily
// @desc    Get all daily reports for the team
// @access  Private
router.get('/daily', [
  query('report_type').optional().isIn(['practice', 'game', 'scrimmage', 'workout']),
  query('created_by').optional().isInt({ min: 1 }),
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

    const { report_type, created_by, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      team_id: req.user.team_id
    };

    if (report_type) {
      whereClause.report_type = report_type;
    }

    if (created_by) {
      whereClause.created_by = created_by;
    }

    const { count, rows: reports } = await DailyReport.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['report_date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get daily reports error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching daily reports' 
    });
  }
});

// @route   POST /api/reports/daily
// @desc    Create a new daily report
// @access  Private
router.post('/daily', [
  body('report_date').optional().isISO8601(),
  body('report_type').isIn(['practice', 'game', 'scrimmage', 'workout']),
  body('title').isLength({ min: 1, max: 200 }),
  body('weather').optional().isLength({ min: 1, max: 100 }),
  body('temperature').optional().isInt({ min: -50, max: 120 }),
  body('opponent').optional().isLength({ min: 1, max: 100 }),
  body('location').optional().isLength({ min: 1, max: 200 }),
  body('start_time').optional().isString(),
  body('end_time').optional().isString(),
  body('duration_minutes').optional().isInt({ min: 0, max: 480 }),
  body('home_score').optional().isInt({ min: 0 }),
  body('away_score').optional().isInt({ min: 0 }),
  body('innings').optional().isInt({ min: 1, max: 20 }),
  body('activities').optional().isString(),
  body('highlights').optional().isString(),
  body('concerns').optional().isString(),
  body('next_steps').optional().isString(),
  body('players_present').optional().isInt({ min: 0 }),
  body('players_absent').optional().isInt({ min: 0 }),
  body('equipment_notes').optional().isString(),
  body('facility_notes').optional().isString()
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

    const report = await DailyReport.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdReport = await DailyReport.findByPk(report.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdReport
    });
  } catch (error) {
    console.error('Create daily report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating daily report' 
    });
  }
});

// @route   GET /api/reports/daily/:id
// @desc    Get single daily report by ID
// @access  Private
router.get('/daily/:id', async (req, res) => {
  try {
    const report = await DailyReport.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: 'Daily report not found' 
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get daily report error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching daily report' 
    });
  }
});

module.exports = router; 