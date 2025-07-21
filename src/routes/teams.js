const express = require('express');
const { body, validationResult } = require('express-validator');
const { Team, User } = require('../models');
const { protect, isHeadCoach } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/teams
// @desc    Get all teams (for registration)
// @access  Public
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

// Apply authentication to protected routes
router.use(protect);

// @route   GET /api/teams/me
// @desc    Get current user's team information
// @access  Private
router.get('/me', async (req, res) => {
  try {
    const team = await Team.findByPk(req.user.team_id, {
      include: [{
        model: User,
        attributes: ['id', 'first_name', 'last_name', 'role', 'email']
      }]
    });

    if (!team) {
      return res.status(404).json({ 
        success: false, 
        error: 'Team not found' 
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching team' 
    });
  }
});

// @route   PUT /api/teams/me
// @desc    Update current user's team information (Head Coach only)
// @access  Private (Head Coach)
router.put('/me', isHeadCoach, [
  body('name').optional().isLength({ min: 1, max: 100 }),
  body('program_name').optional().isLength({ min: 1, max: 100 }),
  body('school_logo_url').optional().isURL(),
  body('conference').optional().isLength({ min: 1, max: 100 }),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']),
  body('city').optional().isLength({ min: 1, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 2 }),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i)
], async (req, res) => {
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

    const team = await Team.findByPk(req.user.team_id);

    if (!team) {
      return res.status(404).json({ 
        success: false, 
        error: 'Team not found' 
      });
    }

    await team.update(req.body);

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating team' 
    });
  }
});

module.exports = router; 