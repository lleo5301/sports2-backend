const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { depthChartPermissions } = require('../middleware/permissions');
const { 
  DepthChart, 
  DepthChartPosition, 
  DepthChartPlayer, 
  Player, 
  User,
  Team 
} = require('../models');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Validation middleware
const validateDepthChart = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required and must be 1-100 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('effective_date').optional().isISO8601().withMessage('effective_date must be a valid date'),
  body('notes').optional().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters')
];

const validatePosition = [
  body('position_code').trim().isLength({ min: 1, max: 10 }).withMessage('Position code is required and must be 1-10 characters'),
  body('position_name').trim().isLength({ min: 1, max: 50 }).withMessage('Position name is required and must be 1-50 characters'),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color'),
  body('icon').optional().isLength({ max: 50 }).withMessage('Icon must be less than 50 characters'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('Sort order must be a non-negative integer'),
  body('max_players').optional().isInt({ min: 1 }).withMessage('Max players must be a positive integer'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters')
];

const validatePlayerAssignment = [
  body('player_id').isInt({ min: 1 }).withMessage('Player ID must be a positive integer'),
  body('depth_order').isInt({ min: 1 }).withMessage('Depth order must be a positive integer'),
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

// GET /api/depth-charts - Get all depth charts for the team
router.get('/', async (req, res) => {
  try {
    const depthCharts = await DepthChart.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ],
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: depthCharts
    });
  } catch (error) {
    console.error('Error fetching depth charts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching depth charts'
    });
  }
});

// GET /api/depth-charts/:id - Get specific depth chart
router.get('/byId/:id', async (req, res) => {
  try {
    const depthChart = await DepthChart.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id,
        is_active: true
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        },
        {
          model: DepthChartPosition,
          where: { is_active: true },
          required: false,
          order: [['sort_order', 'ASC']],
          include: [
            {
              model: DepthChartPlayer,
              where: { is_active: true },
              required: false,
              order: [['depth_order', 'ASC']],
              include: [
                {
                  model: Player,
                  attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'graduation_year', 'batting_avg', 'home_runs', 'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts', 'status', 'has_medical_issues']
                },
                {
                  model: User,
                  as: 'AssignedBy',
                  attributes: ['id', 'first_name', 'last_name']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!depthChart) {
      return res.status(404).json({
        success: false,
        message: 'Depth chart not found'
      });
    }

    res.json({
      success: true,
      data: depthChart
    });
  } catch (error) {
    console.error('Error fetching depth chart:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching depth chart'
    });
  }
});

// POST /api/depth-charts - Create new depth chart
router.post('/',
  validateDepthChart,
  handleValidationErrors,
  depthChartPermissions.canCreate,
  async (req, res) => {
    try {
      const { name, description, is_default, effective_date, notes, positions } = req.body;

      // If this is set as default, unset other default charts
      if (is_default) {
        await DepthChart.update(
          { is_default: false },
          { where: { team_id: req.user.team_id, is_default: true } }
        );
      }

      const depthChart = await DepthChart.create({
        name,
        description,
        team_id: req.user.team_id,
        created_by: req.user.id,
        is_default,
        effective_date,
        notes
      });

      // Create default positions if provided
      if (positions && Array.isArray(positions)) {
        const defaultPositions = [
          { position_code: 'P', position_name: 'Pitcher', color: '#EF4444', icon: 'Shield', sort_order: 1 },
          { position_code: 'C', position_name: 'Catcher', color: '#3B82F6', icon: 'Shield', sort_order: 2 },
          { position_code: '1B', position_name: 'First Base', color: '#10B981', icon: 'Target', sort_order: 3 },
          { position_code: '2B', position_name: 'Second Base', color: '#F59E0B', icon: 'Target', sort_order: 4 },
          { position_code: '3B', position_name: 'Third Base', color: '#8B5CF6', icon: 'Target', sort_order: 5 },
          { position_code: 'SS', position_name: 'Shortstop', color: '#6366F1', icon: 'Target', sort_order: 6 },
          { position_code: 'LF', position_name: 'Left Field', color: '#EC4899', icon: 'Zap', sort_order: 7 },
          { position_code: 'CF', position_name: 'Center Field', color: '#14B8A6', icon: 'Zap', sort_order: 8 },
          { position_code: 'RF', position_name: 'Right Field', color: '#F97316', icon: 'Zap', sort_order: 9 },
          { position_code: 'DH', position_name: 'Designated Hitter', color: '#06B6D4', icon: 'Heart', sort_order: 10 }
        ];

        const positionsToCreate = positions.length > 0 ? positions : defaultPositions;
        
        for (const position of positionsToCreate) {
          await DepthChartPosition.create({
            depth_chart_id: depthChart.id,
            ...position
          });
        }
      }

      // Fetch the created depth chart with positions
      const createdDepthChart = await DepthChart.findByPk(depthChart.id, {
        include: [
          {
            model: DepthChartPosition,
            where: { is_active: true },
            required: false
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdDepthChart
      });
    } catch (error) {
      console.error('Error creating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating depth chart'
      });
    }
  }
);

// PUT /api/depth-charts/:id - Update depth chart
router.put('/byId/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  validateDepthChart,
  handleValidationErrors,
  depthChartPermissions.canEdit,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      const { name, description, is_default, effective_date, notes } = req.body;

      // If this is set as default, unset other default charts
      if (is_default && !depthChart.is_default) {
        await DepthChart.update(
          { is_default: false },
          { where: { team_id: req.user.team_id, is_default: true } }
        );
      }

      await depthChart.update({
        name,
        description,
        is_default,
        effective_date,
        notes,
        version: depthChart.version + 1
      });

      res.json({
        success: true,
        data: depthChart
      });
    } catch (error) {
      console.error('Error updating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating depth chart'
      });
    }
  }
);

// DELETE /api/depth-charts/:id - Delete depth chart
router.delete('/byId/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canDelete,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Soft delete by setting is_active to false
      await depthChart.update({ is_active: false });

      res.json({
        success: true,
        message: 'Depth chart deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting depth chart'
      });
    }
  }
);

// POST /api/depth-charts/:id/positions - Add position to depth chart
router.post('/:id/positions',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      const position = await DepthChartPosition.create({
        depth_chart_id: depthChart.id,
        ...req.body
      });

      res.status(201).json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error adding position:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding position'
      });
    }
  }
);

// PUT /api/depth-charts/positions/:positionId - Update position
router.put('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      await position.update(req.body);

      res.json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error updating position:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating position'
      });
    }
  }
);

// DELETE /api/depth-charts/positions/:positionId - Delete position
router.delete('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Soft delete by setting is_active to false
      await position.update({ is_active: false });

      res.json({
        success: true,
        message: 'Position deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting position:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting position'
      });
    }
  }
);

// POST /api/depth-charts/positions/:positionId/players - Assign player to position
router.post('/positions/:positionId/players',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePlayerAssignment,
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const { player_id, depth_order, notes } = req.body;

      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Check if player exists and belongs to the team
      const player = await Player.findOne({
        where: {
          id: player_id,
          team_id: req.user.team_id
        }
      });

      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found'
        });
      }

      // Check if player is already assigned to this position
      const existingAssignment = await DepthChartPlayer.findOne({
        where: {
          depth_chart_id: position.depth_chart_id,
          position_id: position.id,
          player_id,
          is_active: true
        }
      });

      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Player is already assigned to this position'
        });
      }

      const assignment = await DepthChartPlayer.create({
        depth_chart_id: position.depth_chart_id,
        position_id: position.id,
        player_id,
        depth_order,
        notes,
        assigned_by: req.user.id
      });

      // Fetch the assignment with player details
      const createdAssignment = await DepthChartPlayer.findByPk(assignment.id, {
        include: [
          {
            model: Player,
            attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'graduation_year']
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdAssignment
      });
    } catch (error) {
      console.error('Error assigning player:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning player'
      });
    }
  }
);

// DELETE /api/depth-charts/players/:assignmentId - Remove player assignment
router.delete('/players/:assignmentId',
  param('assignmentId').isInt({ min: 1 }).withMessage('Invalid assignment ID'),
  handleValidationErrors,
  depthChartPermissions.canUnassignPlayers,
  async (req, res) => {
    try {
      const assignment = await DepthChartPlayer.findOne({
        where: { id: req.params.assignmentId },
        include: [
          {
            model: DepthChartPosition,
            include: [
              {
                model: DepthChart,
                where: { team_id: req.user.team_id, is_active: true }
              }
            ]
          }
        ]
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }

      // Soft delete by setting is_active to false
      await assignment.update({ is_active: false });

      res.json({
        success: true,
        message: 'Player assignment removed successfully'
      });
    } catch (error) {
      console.error('Error removing player assignment:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing player assignment'
      });
    }
  }
);

// GET /api/depth-charts/:id/available-players - Get available players for assignment
router.get('/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Get all players assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Get available players (not assigned to this depth chart)
      const availablePlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type', 
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs', 
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

// GET /api/depth-charts/byId/:id/available-players - Get available players for assignment (alternative route)
router.get('/byId/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Get all players assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Get available players (not assigned to this depth chart)
      const availablePlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type', 
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs', 
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

// GET /api/depth-charts/:id/recommended-players/:positionId - Get recommended players for a position
router.get('/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Get all players assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Get all team players for recommendations
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type', 
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs', 
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Score players based on position and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Position match scoring
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Performance scoring based on position type
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Experience scoring
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            score += yearsRemaining * 5; // Higher score for more years remaining
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Health scoring
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          score -= 30;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          reasons: reasons.slice(0, 3) // Limit to top 3 reasons
        };
      });

      // Sort by score (highest first) and return top recommendations
      const recommendedPlayers = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendedPlayers
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

// Helper function to score position matches
function getPositionMatchScore(playerPosition, targetPositionCode) {
  let score = 0;
  const reasons = [];

  // Exact position match
  if (playerPosition === targetPositionCode) {
    score += 100;
    reasons.push('Exact position match');
    return { score, reasons };
  }

  // Position group matches
  const positionGroups = {
    'P': ['P', 'SP', 'RP', 'CP'],
    'C': ['C'],
    '1B': ['1B', 'IF'],
    '2B': ['2B', 'IF', 'MI'],
    '3B': ['3B', 'IF', 'CI'],
    'SS': ['SS', 'IF', 'MI'],
    'LF': ['LF', 'OF'],
    'CF': ['CF', 'OF'],
    'RF': ['RF', 'OF'],
    'DH': ['DH', 'UTIL']
  };

  const targetGroup = positionGroups[targetPositionCode] || [];
  if (targetGroup.includes(playerPosition)) {
    score += 80;
    reasons.push('Position group match');
  } else if (playerPosition === 'UTIL' || playerPosition === 'IF' || playerPosition === 'OF') {
    score += 60;
    reasons.push('Utility player');
  } else {
    score += 20; // Base score for any player
    reasons.push('Position mismatch');
  }

  return { score, reasons };
}

// Helper function to score performance based on position
function getPerformanceScore(player, positionCode) {
  let score = 0;
  const reasons = [];

  // Pitching positions
  if (['P', 'SP', 'RP', 'CP'].includes(positionCode)) {
    if (player.era !== null && player.era < 3.00) {
      score += 50;
      reasons.push(`Excellent ERA: ${player.era}`);
    } else if (player.era !== null && player.era < 4.00) {
      score += 30;
      reasons.push(`Good ERA: ${player.era}`);
    }
    
    if (player.strikeouts !== null && player.strikeouts > 50) {
      score += 20;
      reasons.push(`High strikeouts: ${player.strikeouts}`);
    }
    
    if (player.wins !== null && player.losses !== null) {
      const winRate = player.wins / (player.wins + player.losses);
      if (winRate > 0.6) {
        score += 25;
        reasons.push(`Good win rate: ${(winRate * 100).toFixed(0)}%`);
      }
    }
  }
  // Hitting positions
  else {
    if (player.batting_avg !== null && player.batting_avg > 0.300) {
      score += 40;
      reasons.push(`High average: ${player.batting_avg}`);
    } else if (player.batting_avg !== null && player.batting_avg > 0.250) {
      score += 20;
      reasons.push(`Good average: ${player.batting_avg}`);
    }
    
    if (player.home_runs !== null && player.home_runs > 5) {
      score += 15;
      reasons.push(`Power hitter: ${player.home_runs} HR`);
    }
    
    if (player.rbi !== null && player.rbi > 20) {
      score += 15;
      reasons.push(`RBI producer: ${player.rbi} RBI`);
    }
    
    if (player.stolen_bases !== null && player.stolen_bases > 10) {
      score += 15;
      reasons.push(`Speed: ${player.stolen_bases} SB`);
    }
  }

  return { score, reasons };
}

// GET /api/depth-charts/byId/:id/recommended-players/:positionId - Get recommended players for a position (alternative route)
router.get('/byId/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Get all players assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Get all team players for recommendations
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type', 
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs', 
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Score players based on position and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Position match scoring
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Performance scoring based on position type
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Experience scoring
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            score += yearsRemaining * 5; // Higher score for more years remaining
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Health scoring
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          score -= 10;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          reasons
        };
      });

      // Sort by score (highest first) and return top recommendations
      const recommendations = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

// POST /api/depth-charts/:id/duplicate - Duplicate a depth chart
router.post('/:id/duplicate',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canCreate,
  async (req, res) => {
    try {
      const originalChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        },
        include: [
          {
            model: DepthChartPosition,
            where: { is_active: true },
            required: false
          }
        ]
      });

      if (!originalChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Create new depth chart
      const newChart = await DepthChart.create({
        name: `${originalChart.name} (Copy)`,
        description: originalChart.description,
        team_id: req.user.team_id,
        created_by: req.user.id,
        is_active: true,
        is_default: false,
        version: 1,
        effective_date: null,
        notes: `Duplicated from ${originalChart.name}`
      });

      // Duplicate positions
      if (originalChart.DepthChartPositions) {
        for (const position of originalChart.DepthChartPositions) {
          await DepthChartPosition.create({
            depth_chart_id: newChart.id,
            position_code: position.position_code,
            position_name: position.position_name,
            color: position.color,
            icon: position.icon,
            sort_order: position.sort_order,
            is_active: true,
            max_players: position.max_players,
            description: position.description
          });
        }
      }

      res.json({
        success: true,
        message: 'Depth chart duplicated successfully',
        data: { id: newChart.id }
      });
    } catch (error) {
      console.error('Error duplicating depth chart:', error);
      res.status(500).json({
        success: false,
        message: 'Error duplicating depth chart'
      });
    }
  }
);

// GET /api/depth-charts/:id/history - Get depth chart history
router.get('/:id/history',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  handleValidationErrors,
  depthChartPermissions.canView,
  async (req, res) => {
    try {
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // For now, return basic history. In a real implementation, you might want to create a separate history table
      const history = [
        {
          id: 1,
          action: 'Created',
          description: `Depth chart "${depthChart.name}" was created`,
          created_at: depthChart.created_at,
          User: {
            id: depthChart.created_by,
            first_name: 'System',
            last_name: 'User'
          }
        }
      ];

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching depth chart history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching depth chart history'
      });
    }
  }
);

module.exports = router; 