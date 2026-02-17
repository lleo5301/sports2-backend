'use strict';

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize, Roster, RosterEntry, Player, Game, GameStatistic, User } = require('../models');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(protect);

// Helper: standard validation error response
const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, error: 'Validation failed', details: errors.array() });
    return false;
  }
  return true;
};

// ─── Roster CRUD ────────────────────────────────────────────────

// GET / — List rosters
router.get('/', [
  query('roster_type').optional().isIn(['game_day', 'travel', 'practice', 'season', 'custom']),
  query('source').optional().isIn(['manual', 'presto']),
  query('is_active').optional().isIn(['true', 'false']),
  query('game_id').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const { roster_type, source, is_active, game_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { team_id: req.user.team_id };
    if (roster_type) {
      where.roster_type = roster_type;
    }
    if (source) {
      where.source = source;
    }
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    }
    if (game_id) {
      where.game_id = game_id;
    }

    const { count, rows: rosters } = await Roster.findAndCountAll({
      where,
      include: [
        {
          model: Game,
          attributes: ['id', 'opponent', 'game_date', 'home_away'],
          required: false
        }
      ],
      attributes: {
        include: [
          [sequelize.literal('(SELECT COUNT(*) FROM roster_entries WHERE roster_entries.roster_id = "Roster".id)'), 'entry_count']
        ]
      },
      order: [['effective_date', 'DESC NULLS LAST'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      subQuery: false
    });

    res.json({
      success: true,
      data: rosters,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('List rosters error:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching rosters' });
  }
});

// GET /:id — Get roster with entries
router.get('/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id },
      include: [
        {
          model: RosterEntry,
          as: 'entries',
          include: [{
            model: Player,
            attributes: ['id', 'first_name', 'last_name', 'position', 'height', 'weight', 'class_year', 'photo_url', 'bats', 'throws', 'jersey_number']
          }],
          order: [
            ['order', 'ASC NULLS LAST'],
            [Player, 'last_name', 'ASC']
          ]
        },
        {
          model: Game,
          attributes: ['id', 'opponent', 'game_date', 'home_away'],
          required: false
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    const data = roster.toJSON();
    data.total_entries = data.entries ? data.entries.length : 0;

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Get roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while fetching roster' });
  }
});

// POST / — Create roster
router.post('/', [
  body('name').notEmpty().isLength({ max: 150 }),
  body('roster_type').isIn(['game_day', 'travel', 'practice', 'season', 'custom']),
  body('description').optional().isString(),
  body('game_id').optional().isInt({ min: 1 }),
  body('effective_date').optional().isISO8601(),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const { name, roster_type, description, game_id, effective_date, is_active } = req.body;

    // Validate game belongs to team if provided
    if (game_id) {
      const game = await Game.findOne({ where: { id: game_id, team_id: req.user.team_id } });
      if (!game) {
        return res.status(400).json({ success: false, error: 'Game not found or does not belong to your team' });
      }
    }

    const roster = await Roster.create({
      name,
      roster_type,
      source: 'manual',
      description: description || null,
      game_id: game_id || null,
      effective_date: effective_date || null,
      is_active: is_active !== undefined ? is_active : true,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Re-fetch with empty entries for consistent response
    const created = await Roster.findByPk(roster.id, {
      include: [{ model: RosterEntry, as: 'entries' }]
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    logger.error('Create roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while creating roster' });
  }
});

// PUT /:id — Update roster metadata
router.put('/:id', [
  param('id').isInt({ min: 1 }),
  body('name').optional().isLength({ min: 1, max: 150 }),
  body('roster_type').optional().isIn(['game_day', 'travel', 'practice', 'season', 'custom']),
  body('description').optional().isString(),
  body('effective_date').optional().isISO8601(),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    const { team_id: _t, created_by: _c, source: _s, ...updateData } = req.body;
    await roster.update(updateData);

    res.json({ success: true, data: roster });
  } catch (error) {
    logger.error('Update roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while updating roster' });
  }
});

// DELETE /:id — Delete roster (cascades entries via FK)
router.delete('/:id', [
  param('id').isInt({ min: 1 })
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    await roster.destroy();

    res.json({ success: true, message: 'Roster deleted successfully' });
  } catch (error) {
    logger.error('Delete roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while deleting roster' });
  }
});

// ─── Entry Management ───────────────────────────────────────────

// POST /:id/players — Add player(s) to roster
router.post('/:id/players', [
  param('id').isInt({ min: 1 }),
  body('players').isArray({ min: 1 }),
  body('players.*.player_id').isInt({ min: 1 }),
  body('players.*.position').optional().isString().isLength({ max: 10 }),
  body('players.*.jersey_number').optional().isInt({ min: 0, max: 99 }),
  body('players.*.order').optional().isInt({ min: 0 }),
  body('players.*.status').optional().isIn(['active', 'injured', 'suspended', 'inactive']),
  body('players.*.notes').optional().isString()
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    const { players } = req.body;
    const playerIds = players.map((p) => p.player_id);

    // Validate all players belong to team
    const validPlayers = await Player.findAll({
      where: { id: playerIds, team_id: req.user.team_id },
      attributes: ['id']
    });
    const validIds = new Set(validPlayers.map((p) => p.id));
    const invalidIds = playerIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Players not found on your team: ${invalidIds.join(', ')}`
      });
    }

    // Check for duplicates already in roster
    const existing = await RosterEntry.findAll({
      where: { roster_id: roster.id, player_id: playerIds },
      attributes: ['player_id']
    });
    if (existing.length > 0) {
      const dupes = existing.map((e) => e.player_id);
      return res.status(400).json({
        success: false,
        error: `Players already in roster: ${dupes.join(', ')}`
      });
    }

    // Bulk create entries
    const entries = await RosterEntry.bulkCreate(
      players.map((p) => ({
        roster_id: roster.id,
        player_id: p.player_id,
        position: p.position || null,
        jersey_number: p.jersey_number !== undefined ? p.jersey_number : null,
        order: p.order !== undefined ? p.order : null,
        status: p.status || 'active',
        notes: p.notes || null
      }))
    );

    // Re-fetch with Player association
    const created = await RosterEntry.findAll({
      where: { id: entries.map((e) => e.id) },
      include: [{
        model: Player,
        attributes: ['id', 'first_name', 'last_name', 'photo_url']
      }]
    });

    res.status(201).json({
      success: true,
      data: { added: created.length, entries: created }
    });
  } catch (error) {
    logger.error('Add players to roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while adding players to roster' });
  }
});

// PUT /:id/players/:playerId — Update entry
router.put('/:id/players/:playerId', [
  param('id').isInt({ min: 1 }),
  param('playerId').isInt({ min: 1 }),
  body('position').optional().isString().isLength({ max: 10 }),
  body('jersey_number').optional().isInt({ min: 0, max: 99 }),
  body('order').optional().isInt({ min: 0 }),
  body('status').optional().isIn(['active', 'injured', 'suspended', 'inactive']),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    // Verify roster belongs to team
    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    const entry = await RosterEntry.findOne({
      where: { roster_id: roster.id, player_id: req.params.playerId }
    });

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Player not found in roster' });
    }

    const { roster_id: _r, player_id: _p, ...updateData } = req.body;
    await entry.update(updateData);

    res.json({ success: true, data: entry });
  } catch (error) {
    logger.error('Update roster entry error:', error);
    res.status(500).json({ success: false, error: 'Server error while updating roster entry' });
  }
});

// DELETE /:id/players/:playerId — Remove player from roster
router.delete('/:id/players/:playerId', [
  param('id').isInt({ min: 1 }),
  param('playerId').isInt({ min: 1 })
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const roster = await Roster.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!roster) {
      return res.status(404).json({ success: false, error: 'Roster not found' });
    }

    const entry = await RosterEntry.findOne({
      where: { roster_id: roster.id, player_id: req.params.playerId }
    });

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Player not found in roster' });
    }

    await entry.destroy();

    res.json({ success: true, message: 'Player removed from roster' });
  } catch (error) {
    logger.error('Remove player from roster error:', error);
    res.status(500).json({ success: false, error: 'Server error while removing player from roster' });
  }
});

// ─── Backfill from PrestoSports ─────────────────────────────────

// POST /backfill — Create rosters from game statistics data
router.post('/backfill', [
  body('game_ids').optional().isArray({ min: 1 }),
  body('game_ids.*').optional().isInt({ min: 1 }),
  body('all').optional().isBoolean()
], async (req, res) => {
  try {
    if (!handleValidation(req, res)) {
      return;
    }

    const { game_ids, all } = req.body;

    if (!game_ids && !all) {
      return res.status(400).json({ success: false, error: 'Provide game_ids array or set all: true' });
    }

    // Find games to backfill
    const gameWhere = { team_id: req.user.team_id };
    if (!all && game_ids) {
      gameWhere.id = game_ids;
    }

    const games = await Game.findAll({
      where: gameWhere,
      order: [['game_date', 'ASC']]
    });

    // Find existing backfilled rosters to skip duplicates
    const existingRosters = await Roster.findAll({
      where: {
        team_id: req.user.team_id,
        source: 'presto',
        game_id: { [Op.ne]: null }
      },
      attributes: ['game_id']
    });
    const backfilledGameIds = new Set(existingRosters.map((r) => r.game_id));

    const results = { created: 0, skipped: 0, errors: [], rosters: [] };

    for (const game of games) {
      // Skip already backfilled
      if (backfilledGameIds.has(game.id)) {
        results.skipped++;
        continue;
      }

      // Get players who have stats in this game
      const stats = await GameStatistic.findAll({
        where: { game_id: game.id, team_id: req.user.team_id },
        include: [{
          model: Player,
          as: 'player',
          attributes: ['id', 'jersey_number', 'position']
        }]
      });

      if (stats.length === 0) {
        results.skipped++;
        continue;
      }

      try {
        // Auto-generate name: "vs {opponent} - {date}" or "@ {opponent} - {date}"
        const prefix = game.home_away === 'home' ? 'vs' : '@';
        const dateStr = game.game_date
          ? new Date(game.game_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'TBD';
        const rosterName = `${prefix} ${game.opponent} - ${dateStr} (PrestoSports)`;

        const roster = await Roster.create({
          team_id: req.user.team_id,
          name: rosterName,
          roster_type: 'game_day',
          source: 'presto',
          game_id: game.id,
          effective_date: game.game_date ? new Date(game.game_date).toISOString().split('T')[0] : null,
          is_active: true,
          created_by: req.user.id
        });

        const entries = await RosterEntry.bulkCreate(
          stats.map((stat, idx) => ({
            roster_id: roster.id,
            player_id: stat.player_id,
            position: stat.position_played || (stat.player ? stat.player.position : null),
            jersey_number: stat.player ? stat.player.jersey_number : null,
            order: idx + 1,
            status: 'active'
          }))
        );

        results.created++;
        results.rosters.push({
          id: roster.id,
          name: rosterName,
          game_id: game.id,
          entries: entries.length
        });
      } catch (err) {
        logger.error(`Backfill error for game ${game.id}:`, err);
        results.errors.push({ game_id: game.id, error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Backfill rosters error:', error);
    res.status(500).json({ success: false, error: 'Server error while backfilling rosters' });
  }
});

module.exports = router;
