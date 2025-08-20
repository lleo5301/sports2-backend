const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Player, Team, User, ScoutingReport } = require('../models');
const { protect } = require('../middleware/auth');
const { sequelize } = require('../config/database'); // Add this import
const { uploadVideo, handleUploadError } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/players
// @desc    Get all players for the user's team
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { 
      school_type, 
      position, 
      status, 
      search, 
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {
      team_id: req.user.team_id
    };

    if (school_type) {
      whereClause.school_type = school_type;
    }

    if (position) {
      whereClause.position = position;
    }

    if (status) {
      whereClause.status = status;
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

    // Get players with pagination
    const { count, rows: players } = await Player.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
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
      data: players,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get players error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching players' 
    });
  }
});

// @route   GET /api/players/byId/:id
// @desc    Get single player by ID
// @access  Private
router.get('/byId/:id', async (req, res) => {
  try {
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: ScoutingReport,
          order: [['created_at', 'DESC']],
          limit: 5,
          include: [{
            model: User,
            attributes: ['id', 'first_name', 'last_name']
          }]
        }
      ]
    });

    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found' 
      });
    }

    res.json({
      success: true,
      data: player
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching player' 
    });
  }
});

// @route   POST /api/players
// @desc    Create a new player
// @access  Private
router.post('/', uploadVideo, [
  body('first_name').trim().isLength({ min: 1, max: 50 }),
  body('last_name').trim().isLength({ min: 1, max: 50 }),
  body('school_type').isIn(['HS', 'COLL']),
  body('position').isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']),
  body('height').optional().isLength({ min: 1, max: 10 }),
  body('weight').optional().isInt({ min: 100, max: 300 }),
  body('birth_date').optional().isISO8601(),
  body('graduation_year').optional().isInt({ min: 2020, max: 2030 }),
  body('school').optional().isLength({ min: 1, max: 100 }),
  body('city').optional().isLength({ min: 1, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 2 }),
  body('phone').optional().isLength({ min: 10, max: 15 }),
  body('email').optional().isEmail(),
  body('has_medical_issues').optional().isBoolean(),
  body('injury_details').optional().isString(),
  body('has_comparison').optional().isBoolean(),
  body('comparison_player').optional().isLength({ min: 1, max: 100 })
], handleUploadError, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const playerData = {
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    };

    // Add video URL if file was uploaded
    if (req.file) {
      playerData.video_url = `/uploads/videos/${req.file.filename}`;
    }

    const player = await Player.create(playerData);

    // Get the created player with associations
    const createdPlayer = await Player.findByPk(player.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdPlayer
    });
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating player' 
    });
  }
});

// @route   PUT /api/players/byId/:id
// @desc    Update a player
// @access  Private
router.put('/byId/:id', uploadVideo, [
  body('first_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 50 }),
  body('school_type').optional().isIn(['HS', 'COLL']),
  body('position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH']),
  body('height').optional().isLength({ min: 1, max: 10 }),
  body('weight').optional().isInt({ min: 100, max: 300 }),
  body('birth_date').optional().isISO8601(),
  body('graduation_year').optional().isInt({ min: 2020, max: 2030 }),
  body('school').optional().isLength({ min: 1, max: 100 }),
  body('city').optional().isLength({ min: 1, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 2 }),
  body('phone').optional().isLength({ min: 10, max: 15 }),
  body('email').optional().isEmail(),
  body('has_medical_issues').optional().isBoolean(),
  body('injury_details').optional().isString(),
  body('has_comparison').optional().isBoolean(),
  body('comparison_player').optional().isLength({ min: 1, max: 100 }),
  body('status').optional().isIn(['active', 'inactive', 'graduated', 'transferred'])
], handleUploadError, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found' 
      });
    }

    // Prepare update data
    const updateData = { ...req.body };

    // Handle video upload for update
    if (req.file) {
      // Delete old video file if it exists
      if (player.video_url) {
        const oldVideoPath = path.join(__dirname, '../../uploads/videos', path.basename(player.video_url));
        if (fs.existsSync(oldVideoPath)) {
          fs.unlinkSync(oldVideoPath);
        }
      }
      updateData.video_url = `/uploads/videos/${req.file.filename}`;
    }

    await player.update(updateData);

    // Get the updated player with associations
    const updatedPlayer = await Player.findByPk(player.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedPlayer
    });
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating player' 
    });
  }
});

// @route   DELETE /api/players/byId/:id
// @desc    Delete a player
// @access  Private
router.delete('/byId/:id', async (req, res) => {
  try {
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found' 
      });
    }

    await player.destroy();

    res.json({
      success: true,
      message: 'Player deleted successfully'
    });
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting player' 
    });
  }
});

// @route   GET /api/players/stats/summary
// @desc    Get player statistics summary for the team
// @access  Private
router.get('/stats/summary', async (req, res) => {
  try {
    // Get total players
    const totalPlayers = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      }
    });

    // Get active recruits (HS players)
    const activeRecruits = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active',
        school_type: 'HS'
      }
    });

    // Get recent reports (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentReports = await ScoutingReport.count({
      include: [{
        model: Player,
        where: {
          team_id: req.user.team_id
        },
        attributes: []
      }],
      where: {
        created_at: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    // Get team batting average
    const teamAvgResult = await Player.findOne({
      where: {
        team_id: req.user.team_id,
        status: 'active',
        batting_avg: {
          [Op.not]: null
        }
      },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('batting_avg')), 'team_avg']
      ]
    });

    const teamAvg = teamAvgResult ? parseFloat(teamAvgResult.getDataValue('team_avg')).toFixed(3) : '.000';

    res.json({
      success: true,
      data: {
        total_players: totalPlayers,
        active_recruits: activeRecruits,
        recent_reports: recentReports,
        team_avg: teamAvg
      }
    });
  } catch (error) {
    console.error('Get stats summary error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching statistics' 
    });
  }
});

// @route   GET /api/players/byId/:id/stats
// @desc    Get player statistics by ID
// @access  Private
router.get('/byId/:id/stats', async (req, res) => {
  try {
    const player = await Player.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
        'runs', 'hits', 'doubles', 'triples', 'home_runs', 'rbis',
        'walks', 'strikeouts', 'stolen_bases', 'caught_stealing',
        'era', 'wins', 'losses', 'saves', 'innings_pitched',
        'hits_allowed', 'runs_allowed', 'earned_runs', 'walks_allowed',
        'strikeouts_pitched', 'whip', 'batting_avg_against'
      ]
    });

    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found' 
      });
    }

    // Calculate additional stats
    const stats = {
      id: player.id,
      name: `${player.first_name} ${player.last_name}`,
      position: player.position,
      school_type: player.school_type,
      batting: {
        avg: player.batting_avg || '.000',
        obp: player.on_base_pct || '.000',
        slg: player.slugging_pct || '.000',
        ops: player.ops || '.000',
        runs: player.runs || 0,
        hits: player.hits || 0,
        doubles: player.doubles || 0,
        triples: player.triples || 0,
        home_runs: player.home_runs || 0,
        rbis: player.rbis || 0,
        walks: player.walks || 0,
        strikeouts: player.strikeouts || 0,
        stolen_bases: player.stolen_bases || 0,
        caught_stealing: player.caught_stealing || 0
      },
      pitching: {
        era: player.era || 0.00,
        wins: player.wins || 0,
        losses: player.losses || 0,
        saves: player.saves || 0,
        innings_pitched: player.innings_pitched || 0,
        hits_allowed: player.hits_allowed || 0,
        runs_allowed: player.runs_allowed || 0,
        earned_runs: player.earned_runs || 0,
        walks_allowed: player.walks_allowed || 0,
        strikeouts_pitched: player.strikeouts_pitched || 0,
        whip: player.whip || 0.00,
        batting_avg_against: player.batting_avg_against || '.000'
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching player statistics' 
    });
  }
});

// @route   GET /api/players/performance
// @desc    Get player performance rankings with statistics
// @access  Private
router.get('/performance', [
  // Validate limit only when provided and not empty
  query('limit').if(query('limit').notEmpty()).isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }

    const {
      position,
      school_type,
      status = 'active',
      sort_by = 'batting_avg',
      order = 'DESC',
      limit = 50
    } = req.query;

    // Build where clause
    const whereClause = {
      team_id: req.user.team_id
    };

    if (position) {
      whereClause.position = position;
    }

    if (school_type) {
      whereClause.school_type = school_type;
    }

    if (status) {
      whereClause.status = status;
    }

    // Get players with all statistics
    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type', 'status',
        'height', 'weight', 'graduation_year', 'school', 'city', 'state',
        // Batting stats
        'batting_avg', 'home_runs', 'rbi', 'stolen_bases',
        // Pitching stats  
        'era', 'wins', 'losses', 'strikeouts', 'innings_pitched',
        // Additional calculated fields that might exist
        'created_at', 'updated_at'
      ],
      order: [
        [sort_by, order],
        ['last_name', 'ASC'],
        ['first_name', 'ASC']
      ],
      limit: parseInt(limit),
      raw: false
    });

    // Calculate additional statistics and rankings
    const playersWithStats = players.map((player, index) => {
      const playerData = player.toJSON();
      
      // Calculate some basic derived stats
      const battingAvg = parseFloat(playerData.batting_avg) || 0;
      const homeRuns = parseInt(playerData.home_runs) || 0;
      const rbi = parseInt(playerData.rbi) || 0;
      const stolenBases = parseInt(playerData.stolen_bases) || 0;
      const era = parseFloat(playerData.era) || 0;
      const wins = parseInt(playerData.wins) || 0;
      const losses = parseInt(playerData.losses) || 0;
      const strikeouts = parseInt(playerData.strikeouts) || 0;
      const inningsPitched = parseFloat(playerData.innings_pitched) || 0;

      // Calculate win percentage for pitchers
      const totalGames = wins + losses;
      const winPct = totalGames > 0 ? (wins / totalGames) : 0;
      
      // Calculate K/9 (strikeouts per 9 innings) for pitchers
      const k9 = inningsPitched > 0 ? (strikeouts * 9) / inningsPitched : 0;

      // Calculate simple performance score based on position
      let performanceScore = 0;
      if (playerData.position === 'P') {
        // Pitcher scoring: lower ERA is better, more wins and strikeouts are better
        performanceScore = (era > 0 ? (1 / era) * 50 : 0) + (wins * 10) + (strikeouts * 2);
      } else {
        // Position player scoring: higher avg, HRs, RBIs, SBs are better
        performanceScore = (battingAvg * 100) + (homeRuns * 5) + (rbi * 2) + (stolenBases * 3);
      }

      return {
        ...playerData,
        rank: index + 1,
        calculated_stats: {
          win_pct: winPct,
          k9: k9,
          performance_score: Math.round(performanceScore * 10) / 10
        },
        display_stats: {
          batting_avg: battingAvg.toFixed(3),
          era: era.toFixed(2),
          win_pct: winPct.toFixed(3),
          k9: k9.toFixed(1)
        }
      };
    });

    // Get team statistics for comparison
    const teamStats = await Player.aggregate('batting_avg', 'AVG', {
      where: {
        team_id: req.user.team_id,
        status: 'active',
        batting_avg: { [Op.not]: null }
      }
    });

    const teamERA = await Player.aggregate('era', 'AVG', {
      where: {
        team_id: req.user.team_id,
        status: 'active',
        era: { [Op.not]: null }
      }
    });

    const summary = {
      total_players: playersWithStats.length,
      team_batting_avg: parseFloat(teamStats) || 0,
      team_era: parseFloat(teamERA) || 0,
      filters: {
        position,
        school_type,
        status,
        sort_by,
        order
      }
    };

    res.json({
      success: true,
      data: playersWithStats,
      summary
    });

  } catch (error) {
    console.error('Get player performance error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching player performance data'
    });
  }
});

module.exports = router; 