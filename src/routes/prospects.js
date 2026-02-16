'use strict';

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Prospect, ProspectMedia, User } = require('../models');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(protect);

// POST / — create prospect
router.post('/', [
  body('first_name').notEmpty().isLength({ max: 100 }),
  body('last_name').notEmpty().isLength({ max: 100 }),
  body('primary_position').isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL']),
  body('school_type').optional().isIn(['HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent']),
  body('secondary_position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL']),
  body('bats').optional().isIn(['L', 'R', 'S']),
  body('throws').optional().isIn(['L', 'R']),
  body('class_year').optional().isIn(['FR', 'SO', 'JR', 'SR', 'GR']),
  body('status').optional().isIn(['identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed']),
  body('academic_eligibility').optional().isIn(['eligible', 'pending', 'ineligible', 'unknown']),
  body('email').optional({ checkFalsy: true }).isEmail(),
  body('graduation_year').optional().isInt({ min: 2020, max: 2035 }),
  body('weight').optional().isInt({ min: 100, max: 350 }),
  body('gpa').optional().isFloat({ min: 0, max: 4.0 }),
  body('sat_score').optional().isInt({ min: 400, max: 1600 }),
  body('act_score').optional().isInt({ min: 1, max: 36 }),
  body('fastball_velocity').optional().isInt({ min: 40, max: 110 }),
  body('exit_velocity').optional().isInt({ min: 40, max: 130 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const prospect = await Prospect.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    res.status(201).json({ success: true, data: prospect });
  } catch (error) {
    logger.error('Create prospect error:', error);
    res.status(500).json({ success: false, error: 'Server error while creating prospect' });
  }
});

// GET / — list prospects with filters
router.get('/', [
  query('school_type').optional().isIn(['HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent']),
  query('primary_position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL']),
  query('status').optional().isIn(['identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed']),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const { school_type, primary_position, status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { team_id: req.user.team_id };

    if (school_type) { whereClause.school_type = school_type; }
    if (primary_position) { whereClause.primary_position = primary_position; }
    if (status) { whereClause.status = status; }

    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: prospects } = await Prospect.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'Creator', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: prospects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Get prospects error:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching prospects' });
  }
});

// GET /:id — get single prospect
router.get('/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const prospect = await Prospect.findOne({
      where: { id: req.params.id, team_id: req.user.team_id },
      include: [
        { model: User, as: 'Creator', attributes: ['id', 'first_name', 'last_name'] },
        { model: ProspectMedia, as: 'media' }
      ]
    });

    if (!prospect) {
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    res.json({ success: true, data: prospect });
  } catch (error) {
    logger.error('Get prospect error:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching prospect' });
  }
});

// PUT /:id — update prospect
router.put('/:id', [
  param('id').isInt({ min: 1 }),
  body('first_name').optional().isLength({ min: 1, max: 100 }),
  body('last_name').optional().isLength({ min: 1, max: 100 }),
  body('primary_position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL']),
  body('status').optional().isIn(['identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed']),
  body('email').optional({ checkFalsy: true }).isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const prospect = await Prospect.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!prospect) {
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    // Don't allow changing team_id or created_by
    const { team_id: _t, created_by: _c, ...updateData } = req.body;
    await prospect.update(updateData);

    res.json({ success: true, data: prospect });
  } catch (error) {
    logger.error('Update prospect error:', error);
    res.status(500).json({ success: false, error: 'Server error while updating prospect' });
  }
});

// DELETE /:id — delete prospect
router.delete('/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    const prospect = await Prospect.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!prospect) {
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    await prospect.destroy();

    res.json({ success: true, message: 'Prospect deleted successfully' });
  } catch (error) {
    logger.error('Delete prospect error:', error);
    res.status(500).json({ success: false, error: 'Server error while deleting prospect' });
  }
});

module.exports = router;
