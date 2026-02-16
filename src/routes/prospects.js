'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Prospect, ProspectMedia, User } = require('../models');
const { protect } = require('../middleware/auth');
const { uploadProspectMedia, handleUploadError } = require('../middleware/upload');
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

// Helper to detect media_type from MIME type
const detectMediaType = (mimetype) => {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('image/')) return 'photo';
  if (mimetype === 'application/pdf') return 'document';
  return 'document';
};

// POST /:id/media — upload file or add external URL
router.post('/:id/media', [
  param('id').isInt({ min: 1 })
], (req, res, next) => {
  // Try multer upload first; if no file, continue to JSON handler
  uploadProspectMedia(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    next();
  });
}, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    // Verify prospect exists and belongs to team
    const prospect = await Prospect.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!prospect) {
      // Clean up uploaded file if prospect not found
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    let mediaData;

    if (req.file) {
      // File upload mode
      mediaData = {
        prospect_id: prospect.id,
        uploaded_by: req.user.id,
        media_type: detectMediaType(req.file.mimetype),
        file_path: req.file.path,
        title: req.body.title || req.file.originalname,
        description: req.body.description || null
      };
    } else {
      // External URL mode
      const { url, media_type, title, description } = req.body;

      if (!url) {
        return res.status(400).json({ success: false, error: 'Either a file or url is required' });
      }

      if (!media_type || !['video', 'photo', 'document'].includes(media_type)) {
        return res.status(400).json({ success: false, error: 'Valid media_type (video, photo, document) is required for URL media' });
      }

      mediaData = {
        prospect_id: prospect.id,
        uploaded_by: req.user.id,
        media_type,
        url,
        title: title || null,
        description: description || null
      };
    }

    const media = await ProspectMedia.create(mediaData);

    res.status(201).json({ success: true, data: media });
  } catch (error) {
    logger.error('Upload prospect media error:', error);
    res.status(500).json({ success: false, error: 'Server error while uploading media' });
  }
});

// DELETE /:id/media/:mediaId — delete media
router.delete('/:id/media/:mediaId', [
  param('id').isInt({ min: 1 }),
  param('mediaId').isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    }

    // Find media where the prospect belongs to user's team
    const prospect = await Prospect.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!prospect) {
      return res.status(404).json({ success: false, error: 'Prospect not found' });
    }

    const media = await ProspectMedia.findOne({
      where: { id: req.params.mediaId, prospect_id: prospect.id }
    });

    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    // Delete file from disk if it was an uploaded file
    if (media.file_path) {
      fs.unlink(media.file_path, (err) => {
        if (err && err.code !== 'ENOENT') {
          logger.error('Error deleting media file:', err);
        }
      });
    }

    await media.destroy();

    res.json({ success: true, message: 'Media deleted successfully' });
  } catch (error) {
    logger.error('Delete prospect media error:', error);
    res.status(500).json({ success: false, error: 'Server error while deleting media' });
  }
});

module.exports = router;
