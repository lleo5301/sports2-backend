const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { ScheduleTemplate, Team, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/schedule-templates
// @desc    Get all schedule templates for user's team
// @access  Private
router.get('/', [
  query('search').optional().isString(),
  query('is_default').optional().isBoolean()
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

    const { search, is_default } = req.query;

    // Build where clause
    const whereClause = {
      team_id: req.user.team_id,
      is_active: true
    };

    if (is_default !== undefined) {
      whereClause.is_default = is_default === 'true';
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const templates = await ScheduleTemplate.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Get schedule templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching schedule templates'
    });
  }
});

// @route   GET /api/schedule-templates/:id
// @desc    Get a specific schedule template
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const template = await ScheduleTemplate.findOne({
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
        }
      ]
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching schedule template'
    });
  }
});

// @route   POST /api/schedule-templates
// @desc    Create a new schedule template
// @access  Private
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().isString(),
  body('template_data').isObject(),
  body('is_default').optional().isBoolean()
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

    // If setting as default, unset other defaults for this team
    if (req.body.is_default) {
      await ScheduleTemplate.update(
        { is_default: false },
        {
          where: {
            team_id: req.user.team_id,
            is_default: true
          }
        }
      );
    }

    const template = await ScheduleTemplate.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdTemplate = await ScheduleTemplate.findByPk(template.id, {
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
      data: createdTemplate
    });
  } catch (error) {
    console.error('Create schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating schedule template'
    });
  }
});

// @route   PUT /api/schedule-templates/:id
// @desc    Update a schedule template
// @access  Private
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('description').optional().isString(),
  body('template_data').optional().isObject(),
  body('is_default').optional().isBoolean()
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

    const template = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    // If setting as default, unset other defaults for this team
    if (req.body.is_default) {
      await ScheduleTemplate.update(
        { is_default: false },
        {
          where: {
            team_id: req.user.team_id,
            is_default: true,
            id: { [Op.ne]: req.params.id }
          }
        }
      );
    }

    await template.update(req.body);

    const updatedTemplate = await ScheduleTemplate.findByPk(template.id, {
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
      data: updatedTemplate
    });
  } catch (error) {
    console.error('Update schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating schedule template'
    });
  }
});

// @route   DELETE /api/schedule-templates/:id
// @desc    Delete a schedule template
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const template = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    await template.update({ is_active: false });

    res.json({
      success: true,
      message: 'Schedule template deleted successfully'
    });
  } catch (error) {
    console.error('Delete schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting schedule template'
    });
  }
});

// @route   POST /api/schedule-templates/:id/duplicate
// @desc    Duplicate a schedule template
// @access  Private
router.post('/:id/duplicate', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().isString()
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

    const originalTemplate = await ScheduleTemplate.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id,
        is_active: true
      }
    });

    if (!originalTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Schedule template not found'
      });
    }

    const duplicatedTemplate = await ScheduleTemplate.create({
      name: req.body.name,
      description: req.body.description || originalTemplate.description,
      template_data: originalTemplate.template_data,
      team_id: req.user.team_id,
      created_by: req.user.id,
      is_default: false
    });

    const createdTemplate = await ScheduleTemplate.findByPk(duplicatedTemplate.id, {
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
      data: createdTemplate
    });
  } catch (error) {
    console.error('Duplicate schedule template error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while duplicating schedule template'
    });
  }
});

module.exports = router;
