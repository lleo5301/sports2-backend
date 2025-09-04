const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { Report, Player, Team, ScoutingReport, User } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Validation middleware
const validateReportCreate = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('type').isIn(['player-performance', 'team-statistics', 'scouting-analysis', 'recruitment-pipeline', 'custom']).withMessage('Invalid report type'),
  body('data_sources').optional().isArray().withMessage('Data sources must be an array'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('filters').optional().isObject().withMessage('Filters must be an object'),
  body('schedule').optional().isObject().withMessage('Schedule must be an object')
];

const validateReportUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
  body('data_sources').optional().isArray().withMessage('Data sources must be an array'),
  body('sections').optional().isArray().withMessage('Sections must be an array'),
  body('filters').optional().isObject().withMessage('Filters must be an object')
];

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

// Apply authentication middleware to all routes
router.use(protect);

// GET /api/reports - Get all reports
router.get('/', async (req, res) => {
  try {
    const reports = await Report.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports'
    });
  }
});

// GET /api/reports/scouting - Get scouting reports
router.get('/scouting', async (req, res) => {
  try {
    console.log('Scouting reports request - user team_id:', req.user.team_id);
    console.log('Scouting reports request - query params:', req.query);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const whereClause = {};

    if (req.query.player_id) {
      whereClause.player_id = req.query.player_id;
    }

    if (req.query.start_date && req.query.end_date) {
      whereClause.report_date = {
        [Op.between]: [req.query.start_date, req.query.end_date]
      };
    }

    const { count, rows: reports } = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id },
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        }
      ],
      order: [['report_date', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get scouting reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting reports'
    });
  }
});

// GET /api/reports/:id - Get a specific report
router.get('/custom/:id', async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

// GET /api/reports/byId/:id - Get a specific report
router.get('/byId/:id', checkPermission('reports_view'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'created_by_user',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

// POST /api/reports - Create a new report
router.post('/', checkPermission('reports_create'), async (req, res) => {
  try {
    const report = await Report.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id,
      status: req.body.status || 'draft'
    });

    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      data: report
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating report'
    });
  }
});

// PUT /api/reports/:id - Update a report
router.put('/byId/:id', checkPermission('reports_edit'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.update(req.body);

    res.json({
      success: true,
      message: 'Report updated successfully',
      data: report
    });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report'
    });
  }
});

// DELETE /api/reports/:id - Delete a report
router.delete('/byId/:id', checkPermission('reports_delete'), async (req, res) => {
  try {
    const report = await Report.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    await report.destroy();

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report'
    });
  }
});

// GET /api/reports/player-performance - Get player performance data
router.get('/player-performance', async (req, res) => {
  try {
    console.log('Player performance request - user:', req.user);
    console.log('Player performance request - user team_id:', req.user.team_id);
    
    // Check if user has a team_id
    if (!req.user.team_id) {
      console.error('User has no team_id:', req.user.id);
      return res.status(400).json({
        success: false,
        message: 'User is not associated with a team'
      });
    }
    
    const whereClause = {
      team_id: req.user.team_id
    };

    if (req.query.start_date && req.query.end_date) {
      whereClause.created_at = {
        [Op.between]: [req.query.start_date, req.query.end_date]
      };
    }

    if (req.query.position) {
      whereClause.position = req.query.position;
    }

    console.log('Player performance query whereClause:', whereClause);

    // First, let's check if there are any players for this team
    const playerCount = await Player.count({
      where: { team_id: req.user.team_id }
    });
    console.log('Total players for team:', playerCount);

    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'batting_average',
        'home_runs', 'rbi', 'era', 'wins', 'losses', 'saves'
      ],
      order: [['last_name', 'ASC'], ['first_name', 'ASC']]
    });

    console.log('Player performance query result count:', players.length);

    res.json({
      success: true,
      data: {
        players,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get player performance error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching player performance data'
    });
  }
});

// GET /api/reports/team-statistics - Get team statistics
router.get('/team-statistics', async (req, res) => {
  try {
    const team = await Team.findByPk(req.user.team_id);
    
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Get player count
    const playerCount = await Player.count({
      where: { team_id: req.user.team_id }
    });

    // Calculate team batting average
    const players = await Player.findAll({
      where: { team_id: req.user.team_id },
      attributes: ['batting_average', 'era', 'wins', 'losses']
    });

    const validBattingAverages = players
      .map(p => p.batting_average)
      .filter(avg => avg !== null && avg !== undefined);

    const teamBattingAverage = validBattingAverages.length > 0
      ? (validBattingAverages.reduce((sum, avg) => sum + avg, 0) / validBattingAverages.length).toFixed(3)
      : null;

    // Calculate team ERA
    const validERAs = players
      .map(p => p.era)
      .filter(era => era !== null && era !== undefined);

    const teamERA = validERAs.length > 0
      ? (validERAs.reduce((sum, era) => sum + era, 0) / validERAs.length).toFixed(2)
      : null;

    // Calculate wins and losses
    const totalWins = players.reduce((sum, p) => sum + (p.wins || 0), 0);
    const totalLosses = players.reduce((sum, p) => sum + (p.losses || 0), 0);
    const winPercentage = (totalWins + totalLosses) > 0
      ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
      : null;

    res.json({
      success: true,
      data: {
        team_name: team.name,
        total_players: playerCount,
        team_batting_average: teamBattingAverage,
        team_era: teamERA,
        wins: totalWins,
        losses: totalLosses,
        win_percentage: winPercentage,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get team statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});


// GET /api/reports/recruitment-pipeline - Get recruitment pipeline data
router.get('/recruitment-pipeline', async (req, res) => {
  try {
    // Mock recruitment pipeline data
    const pipelineData = [
      {
        stage_name: 'Prospects',
        player_count: 45,
        avg_grade: 78.5,
        next_action: 'Schedule evaluation'
      },
      {
        stage_name: 'Evaluated',
        player_count: 23,
        avg_grade: 82.3,
        next_action: 'Make offer decision'
      },
      {
        stage_name: 'Offered',
        player_count: 12,
        avg_grade: 85.7,
        next_action: 'Follow up on offer'
      },
      {
        stage_name: 'Committed',
        player_count: 8,
        avg_grade: 87.2,
        next_action: 'Prepare enrollment'
      },
      {
        stage_name: 'Enrolled',
        player_count: 5,
        avg_grade: 89.1,
        next_action: 'Begin training'
      }
    ];

    res.json({
      success: true,
      data: {
        pipeline: pipelineData,
        filters: req.query,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get recruitment pipeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline data'
    });
  }
});

// POST /api/reports/generate-pdf - Generate PDF report
router.post('/generate-pdf', async (req, res) => {
  try {
    // In a real implementation, you would generate the PDF here
    // For now, we'll return a success response
    res.json({
      success: true,
      message: 'PDF generation endpoint - implementation would generate actual PDF',
      data: {
        type: req.body.type,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF'
    });
  }
});

// POST /api/reports/export-excel - Export report to Excel
router.post('/export-excel', async (req, res) => {
  try {
    // In a real implementation, you would generate the Excel file here
    // For now, we'll return a success response
    res.json({
      success: true,
      message: 'Excel export endpoint - implementation would generate actual Excel file',
      data: {
        type: req.body.type,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting to Excel'
    });
  }
});

// GET /api/reports/player-performance - Get player performance reports
router.get('/player-performance', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Player } = require('../models');
    const { start_date, end_date, position, school_type } = req.query;

    const whereClause = {
      team_id: req.user.team_id,
      status: 'active'
    };

    if (position) whereClause.position = position;
    if (school_type) whereClause.school_type = school_type;

    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
        'runs', 'hits', 'rbis', 'walks', 'strikeouts',
        'era', 'wins', 'losses', 'saves', 'innings_pitched'
      ],
      order: [['batting_avg', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        players,
        filters: { start_date, end_date, position, school_type },
        summary: {
          total_players: players.length,
          avg_batting_avg: players.reduce((sum, p) => sum + (parseFloat(p.batting_avg) || 0), 0) / players.length || 0,
          avg_era: players.reduce((sum, p) => sum + (parseFloat(p.era) || 0), 0) / players.length || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching player performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching player performance report'
    });
  }
});

// GET /api/reports/team-statistics - Get team statistics reports
router.get('/team-statistics', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Game, Player } = require('../models');
    const { season } = req.query;

    const whereClause = { team_id: req.user.team_id };
    if (season) whereClause.season = season;

    // Get team games
    const games = await Game.findAll({ where: whereClause });
    
    // Get team players
    const players = await Player.findAll({
      where: { team_id: req.user.team_id, status: 'active' }
    });

    const stats = {
      games: {
        total: games.length,
        wins: games.filter(g => g.result === 'W').length,
        losses: games.filter(g => g.result === 'L').length,
        ties: games.filter(g => g.result === 'T').length,
        win_percentage: games.length > 0 ? (games.filter(g => g.result === 'W').length / games.length * 100).toFixed(1) : 0
      },
      players: {
        total: players.length,
        pitchers: players.filter(p => p.position === 'P').length,
        position_players: players.filter(p => p.position !== 'P').length,
        high_school: players.filter(p => p.school_type === 'HS').length,
        college: players.filter(p => p.school_type === 'COLL').length
      },
      season: season || 'All'
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching team statistics report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics report'
    });
  }
});

// GET /api/reports/scouting-analysis - Get scouting analysis reports
router.get('/scouting-analysis', checkPermission('reports_view'), async (req, res) => {
  try {
    const { start_date, end_date, position } = req.query;

    console.log('Scouting analysis request - user team_id:', req.user.team_id);
    console.log('Scouting analysis request - query params:', req.query);

    const whereClause = {};
    if (start_date && end_date) {
      whereClause.report_date = { [Op.between]: [start_date, end_date] };
    }

    const reports = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [{
        model: Player,
        where: { team_id: req.user.team_id },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school_type']
      }],
      order: [['report_date', 'DESC']]
    });

    console.log('Scouting analysis query result count:', reports.count);

    // Helper function to convert grade to numeric value for calculations
    const gradeToNumeric = (grade) => {
      const gradeMap = {
        'A+': 97, 'A': 93, 'A-': 90,
        'B+': 87, 'B': 83, 'B-': 80,
        'C+': 77, 'C': 73, 'C-': 70,
        'D+': 67, 'D': 63, 'D-': 60,
        'F': 50
      };
      return gradeMap[grade] || 0;
    };

    // Calculate analysis metrics
    const totalReports = reports.count;
    const validGrades = reports.rows.filter(r => r.overall_grade).map(r => gradeToNumeric(r.overall_grade));
    const avgGrade = validGrades.length > 0
      ? (validGrades.reduce((sum, grade) => sum + grade, 0) / validGrades.length).toFixed(1)
      : 0;

    const analysis = {
      total_reports: totalReports,
      average_grade: avgGrade,
      reports_by_position: {},
      recent_reports: reports.rows.slice(0, 10),
      date_range: { start_date, end_date },
      generated_at: new Date().toISOString()
    };

    // Group reports by position
    reports.rows.forEach(report => {
      const position = report.Player.position;
      if (!analysis.reports_by_position[position]) {
        analysis.reports_by_position[position] = 0;
      }
      analysis.reports_by_position[position]++;
    });

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error fetching scouting analysis report:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting analysis report'
    });
  }
});

// GET /api/reports/recruitment-pipeline - Get recruitment pipeline reports
router.get('/recruitment-pipeline', checkPermission('reports_view'), async (req, res) => {
  try {
    const { Player, PreferenceList } = require('../models');

    const recruits = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        school_type: 'HS',
        status: 'active'
      },
      include: [{
        model: PreferenceList,
        where: { team_id: req.user.team_id },
        required: false,
        attributes: ['list_type', 'priority', 'status', 'interest_level']
      }],
      order: [['created_at', 'DESC']]
    });

    const pipeline = {
      total_recruits: recruits.length,
      by_priority: {
        high: recruits.filter(r => r.PreferenceList?.priority === 'high').length,
        medium: recruits.filter(r => r.PreferenceList?.priority === 'medium').length,
        low: recruits.filter(r => r.PreferenceList?.priority === 'low').length,
        unassigned: recruits.filter(r => !r.PreferenceList?.priority).length
      },
      by_status: {
        active: recruits.filter(r => r.PreferenceList?.status === 'active').length,
        committed: recruits.filter(r => r.PreferenceList?.status === 'committed').length,
        declined: recruits.filter(r => r.PreferenceList?.status === 'declined').length,
        pending: recruits.filter(r => !r.PreferenceList?.status || r.PreferenceList?.status === 'pending').length
      },
      by_position: {},
      recent_additions: recruits.slice(0, 10)
    };

    // Group by position
    recruits.forEach(recruit => {
      const position = recruit.position;
      if (!pipeline.by_position[position]) {
        pipeline.by_position[position] = 0;
      }
      pipeline.by_position[position]++;
    });

    res.json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    console.error('Error fetching recruitment pipeline report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline report'
    });
  }
});

// POST /api/reports/generate-pdf - Generate PDF report
router.post('/generate-pdf', checkPermission('reports_create'), async (req, res) => {
  try {
    const { type, data, options } = req.body;
    
    // This is a placeholder - in a real implementation, you'd generate a PDF
    // For now, return a success response
    res.json({
      success: true,
      message: 'PDF generation endpoint - implement PDF generation logic',
      data: { type, options }
    });
  } catch (error) {
    console.error('Error generating PDF report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF report'
    });
  }
});

// POST /api/reports/export-excel - Export Excel report
router.post('/export-excel', checkPermission('reports_create'), async (req, res) => {
  try {
    const { type, data, options } = req.body;
    
    // This is a placeholder - in a real implementation, you'd generate an Excel file
    // For now, return a success response
    res.json({
      success: true,
      message: 'Excel export endpoint - implement Excel generation logic',
      data: { type, options }
    });
  } catch (error) {
    console.error('Error exporting Excel report:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting Excel report'
    });
  }
});

// POST /api/reports/scouting - Create a scouting report
router.post('/scouting', async (req, res) => {
  try {
    console.log('Create scouting report request:', req.body);
    console.log('User team_id:', req.user.team_id);

    // Validate that player belongs to user's team
    const player = await Player.findOne({
      where: {
        id: req.body.player_id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({
        success: false,
        message: 'Player not found or does not belong to your team'
      });
    }

    const scoutingReport = await ScoutingReport.create({
      ...req.body,
      created_by: req.user.id
    });

    // Fetch the created report with includes
    const createdReport = await ScoutingReport.findByPk(scoutingReport.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Scouting report created successfully',
      data: createdReport
    });
  } catch (error) {
    console.error('Create scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating scouting report'
    });
  }
});

// GET /api/reports/scouting/:id - Get a specific scouting report
router.get('/scouting/:id', async (req, res) => {
  try {
    const report = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id },
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found'
      });
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting report'
    });
  }
});

// PUT /api/reports/scouting/:id - Update a scouting report
router.put('/scouting/:id', async (req, res) => {
  try {
    console.log('Update scouting report request:', req.params.id, req.body);

    // Find the existing report and verify it belongs to user's team
    const existingReport = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: [{
        model: Player,
        where: { team_id: req.user.team_id },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school']
      }]
    });

    if (!existingReport) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found or does not belong to your team'
      });
    }

    // If player_id is being changed, validate the new player belongs to user's team
    if (req.body.player_id && req.body.player_id !== existingReport.player_id) {
      const player = await Player.findOne({
        where: {
          id: req.body.player_id,
          team_id: req.user.team_id
        }
      });

      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found or does not belong to your team'
        });
      }
    }

    // Update the report
    await existingReport.update(req.body);

    // Fetch the updated report with includes
    const updatedReport = await ScoutingReport.findByPk(existingReport.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school']
        },
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Scouting report updated successfully',
      data: updatedReport
    });
  } catch (error) {
    console.error('Update scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating scouting report'
    });
  }
});

module.exports = router; 