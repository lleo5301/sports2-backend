const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { Team, User, UserPermission, Schedule, ScheduleSection, ScheduleActivity } = require('../models');

const router = express.Router();

// Validation middleware
const validateTeamCreate = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

const validateTeamUpdate = [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

const validatePermission = [
  body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  body('permission_type').isIn([
    'depth_chart_view', 'depth_chart_create', 'depth_chart_edit', 'depth_chart_delete', 'depth_chart_manage_positions',
    'player_assign', 'player_unassign', 'schedule_view', 'schedule_create', 'schedule_edit', 'schedule_delete',
    'reports_view', 'reports_create', 'reports_edit', 'reports_delete', 'team_settings', 'user_management'
  ]).withMessage('Invalid permission type'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
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

// GET /api/teams - Get all teams (for registration)
router.get('/', async (req, res) => {
  try {
    const teams = await Team.findAll({
      attributes: ['id', 'name', 'program_name', 'conference', 'division', 'city', 'state'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: teams
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching teams' 
    });
  }
});

// POST /api/teams - Create a new team (admin only)
router.post('/',
  validateTeamCreate,
  handleValidationErrors,
  protect,
  checkPermission('team_management'),
  async (req, res) => {
    try {
      // Check if team name already exists
      const existingTeam = await Team.findOne({
        where: { name: req.body.name }
      });

      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: 'Team name already exists'
        });
      }

      const team = await Team.create(req.body);

      res.status(201).json({
        success: true,
        message: 'Team created successfully',
        data: team
      });
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating team'
      });
    }
  }
);

// Apply authentication middleware to protected routes
router.use(protect);

// GET /api/teams/recent-schedules - Get recent schedules for the team
router.get('/recent-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // First, get schedules for the team
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          [require('sequelize').Op.lt]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'DESC']]
            }
          ]
        }
      ],
      order: [['date', 'DESC']],
      limit
    });

    // Flatten the events
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Sort by date and time, then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateB - dateA; // Descending order for recent
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching recent schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent schedules'
    });
  }
});

// GET /api/teams/upcoming-schedules - Get upcoming schedules for the team
router.get('/upcoming-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // First, get schedules for the team
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          [require('sequelize').Op.gte]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'ASC']]
            }
          ]
        }
      ],
      order: [['date', 'ASC']],
      limit
    });

    // Flatten the events
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Sort by date and time, then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateA - dateB;
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching upcoming schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming schedules'
    });
  }
});

// GET /api/teams/me - Get current user's team
router.get('/me', async (req, res) => {
  try {
    console.log('Teams /me endpoint hit');
    console.log('User team_id:', req.user.team_id);
    console.log('User object:', req.user);
    
    if (!req.user.team_id) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with a team'
      });
    }

    const team = await Team.findByPk(req.user.team_id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team'
    });
  }
});

// GET /api/teams/:id - Get a specific team
router.get('/byId/:id', async (req, res) => {
  try {
    const team = await Team.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email', 'role']
        }
      ]
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team'
    });
  }
});

// PUT /api/teams/me - Update current user's team
router.put('/me', 
  checkPermission('team_settings'),
  async (req, res) => {
    try {
      const team = await Team.findByPk(req.user.team_id);

      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      await team.update(req.body);

      res.json({
        success: true,
        message: 'Team updated successfully',
        data: team
      });
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating team'
      });
    }
  }
);

// GET /api/teams/users - Get all users in current team
router.get('/byid/:id/users', async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        team_id: req.user.team_id
      },
      attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'created_at'],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']]
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching team users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team users'
    });
  }
});

// GET /api/teams/permissions - Get all permissions for current team
router.get('/byid/:id/permissions', async (req, res) => {
  try {
    const permissions = await UserPermission.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching team permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team permissions'
    });
  }
});

// POST /api/teams/permissions - Add new permission
router.post('/byid/:id/permissions',
  validatePermission,
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Check if user exists and belongs to the team
      const user = await User.findOne({
        where: {
          id: req.body.user_id,
          team_id: req.user.team_id
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in team'
        });
      }

      // Check if permission already exists
      const existingPermission = await UserPermission.findOne({
        where: {
          user_id: req.body.user_id,
          team_id: req.user.team_id,
          permission_type: req.body.permission_type
        }
      });

      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: 'Permission already exists for this user'
        });
      }

      const permission = await UserPermission.create({
        user_id: req.body.user_id,
        team_id: req.user.team_id,
        permission_type: req.body.permission_type,
        is_granted: req.body.is_granted !== false, // Default to true
        expires_at: req.body.expires_at || null,
        notes: req.body.notes || null,
        granted_by: req.user.id
      });

      res.json({
        success: true,
        message: 'Permission added successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding permission'
      });
    }
  }
);

// PUT /api/teams/permissions/:id - Update permission
router.put('/byid/:team_id/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      await permission.update({
        is_granted: req.body.is_granted !== undefined ? req.body.is_granted : permission.is_granted,
        expires_at: req.body.expires_at !== undefined ? req.body.expires_at : permission.expires_at,
        notes: req.body.notes !== undefined ? req.body.notes : permission.notes
      });

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating permission'
      });
    }
  }
);

// DELETE /api/teams/permissions/:id - Delete permission
router.delete('/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      await permission.destroy();

      res.json({
        success: true,
        message: 'Permission removed successfully'
      });
    } catch (error) {
      console.error('Error removing permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing permission'
      });
    }
  }
);

// GET /api/teams/stats - Get team statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const { Player, ScoutingReport, Schedule, Game } = require('../models');

    // Get player statistics
    const totalPlayers = await Player.count({
      where: { team_id: req.user.team_id }
    });

    const activePlayers = await Player.count({
      where: { 
        team_id: req.user.team_id,
        status: 'active'
      }
    });

    // Get scouting report statistics
    const totalReports = await ScoutingReport.count({
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id }
        }
      ]
    });

    // Get schedule statistics
    const totalSchedules = await Schedule.count({
      where: { 
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Get game statistics
    const totalGames = await Game.count({
      where: { team_id: req.user.team_id }
    });

    const wins = await Game.count({
      where: { 
        team_id: req.user.team_id,
        result: 'W'
      }
    });

    const losses = await Game.count({
      where: { 
        team_id: req.user.team_id,
        result: 'L'
      }
    });

    const ties = await Game.count({
      where: { 
        team_id: req.user.team_id,
        result: 'T'
      }
    });

    const stats = {
      totalPlayers,
      activePlayers,
      totalReports,
      totalSchedules,
      totalGames,
      wins,
      losses,
      ties,
      winRate: totalGames > 0 ? wins / totalGames : 0,
      playerRetentionRate: totalPlayers > 0 ? activePlayers / totalPlayers : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});

// GET /api/teams/roster - Get team roster
router.get('/roster', protect, async (req, res) => {
  try {
    const { Player } = require('../models');
    
    const players = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      },
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'height', 'weight', 'graduation_year', 'school', 'city', 'state',
        'batting_avg', 'era', 'created_at'
      ],
      order: [
        ['position', 'ASC'],
        ['last_name', 'ASC'],
        ['first_name', 'ASC']
      ]
    });

    // Group players by position
    const roster = {
      pitchers: players.filter(p => p.position === 'P'),
      catchers: players.filter(p => p.position === 'C'),
      infielders: players.filter(p => ['1B', '2B', '3B', 'SS'].includes(p.position)),
      outfielders: players.filter(p => ['LF', 'CF', 'RF', 'OF'].includes(p.position)),
      designated_hitters: players.filter(p => p.position === 'DH'),
      total_players: players.length
    };

    res.json({
      success: true,
      data: roster
    });
  } catch (error) {
    console.error('Error fetching team roster:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team roster'
    });
  }
});

module.exports = router; 