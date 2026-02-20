/**
 * @fileoverview Scouting report routes for player and prospect evaluations.
 * Handles CRUD operations for scouting reports with skill ratings and evaluations.
 * Reports can target either a rostered Player (player_id) or an external Prospect (prospect_id).
 * Team isolation is enforced via the target entity's team_id.
 *
 * @module routes/reports/scouting
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { ScoutingReport, Player, Prospect, User } = require('../../models');
const { Op } = require('sequelize');

const router = express.Router();

router.use(protect);

// Shared includes for fetching reports with both Player and Prospect associations
const reportIncludes = (teamId) => [
  {
    model: Player,
    required: false,
    where: { team_id: teamId },
    attributes: ['id', 'first_name', 'last_name', 'position', 'school']
  },
  {
    model: Prospect,
    required: false,
    where: { team_id: teamId },
    attributes: ['id', 'first_name', 'last_name', 'primary_position', 'school_name', 'school_type', 'graduation_year', 'photo_url']
  },
  {
    model: User,
    attributes: ['id', 'first_name', 'last_name']
  }
];

/**
 * @route GET /api/reports/scouting
 * @description Retrieves scouting reports with pagination and optional filtering.
 *   Filter by player_id, prospect_id, type (player|prospect), or date range.
 *   Team isolation enforced via Player/Prospect team_id.
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const teamId = req.user.team_id;

    const whereClause = {};

    if (req.query.player_id) {
      whereClause.player_id = req.query.player_id;
    }

    if (req.query.prospect_id) {
      whereClause.prospect_id = req.query.prospect_id;
    }

    // Filter by type: 'player' returns only player reports, 'prospect' only prospect reports
    if (req.query.type === 'player') {
      whereClause.player_id = { [Op.not]: null };
    } else if (req.query.type === 'prospect') {
      whereClause.prospect_id = { [Op.not]: null };
    }

    if (req.query.start_date && req.query.end_date) {
      whereClause.report_date = {
        [Op.between]: [req.query.start_date, req.query.end_date]
      };
    }

    // Use left joins so reports with either player_id or prospect_id are returned.
    // Team isolation: at least one of Player or Prospect must match user's team.
    const includes = [
      {
        model: Player,
        required: false,
        where: { team_id: teamId },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school']
      },
      {
        model: Prospect,
        required: false,
        where: { team_id: teamId },
        attributes: ['id', 'first_name', 'last_name', 'primary_position', 'school_name', 'school_type', 'graduation_year', 'photo_url']
      }
    ];

    const { count, rows: reports } = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: includes,
      order: [['report_date', 'DESC']],
      limit,
      offset
    });

    // Filter out reports that didn't match either Player or Prospect for this team
    const teamReports = reports.filter(r => r.Player || r.Prospect);

    res.json({
      success: true,
      data: teamReports,
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

/**
 * @route POST /api/reports/scouting
 * @description Creates a new scouting report for a player or prospect.
 *   Exactly one of player_id or prospect_id is required.
 *   Validates that the target belongs to the user's team.
 */
router.post('/', async (req, res) => {
  try {
    const { player_id, prospect_id } = req.body;
    const teamId = req.user.team_id;

    // Validate exactly one target
    if (!player_id && !prospect_id) {
      return res.status(400).json({
        success: false,
        message: 'Either player_id or prospect_id is required'
      });
    }

    if (player_id && prospect_id) {
      return res.status(400).json({
        success: false,
        message: 'Provide either player_id or prospect_id, not both'
      });
    }

    // Validate target belongs to user's team
    if (player_id) {
      const player = await Player.findOne({
        where: { id: player_id, team_id: teamId }
      });
      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found or does not belong to your team'
        });
      }
    } else {
      const prospect = await Prospect.findOne({
        where: { id: prospect_id, team_id: teamId }
      });
      if (!prospect) {
        return res.status(404).json({
          success: false,
          message: 'Prospect not found or does not belong to your team'
        });
      }
    }

    // Whitelist allowed fields to prevent mass assignment
    const {
      report_date, game_date, opponent, event_type,
      overall_grade, hitting_grade, bat_speed, power_potential, plate_discipline,
      pitching_grade, fastball_grade, breaking_ball_grade, command,
      fielding_grade, arm_strength, arm_accuracy, range,
      speed_grade, intangibles_grade, work_ethic, coachability, projection,
      overall_present, overall_future, hitting_present, hitting_future,
      bat_speed_present, bat_speed_future, raw_power_present, raw_power_future,
      game_power_present, game_power_future, plate_discipline_present, plate_discipline_future,
      pitching_present, pitching_future, fastball_present, fastball_future,
      curveball_present, curveball_future, slider_present, slider_future,
      changeup_present, changeup_future, command_present, command_future,
      fielding_present, fielding_future, arm_strength_present, arm_strength_future,
      arm_accuracy_present, arm_accuracy_future, range_present, range_future,
      hands_present, hands_future, speed_present, speed_future,
      baserunning_present, baserunning_future, intangibles_present, intangibles_future,
      work_ethic_grade, coachability_grade, baseball_iq_present, baseball_iq_future,
      overall_future_potential,
      sixty_yard_dash, mlb_comparison,
      overall_notes, hitting_notes, pitching_notes, fielding_notes,
      speed_notes, intangibles_notes, projection_notes,
      fastball_velocity, home_to_first, is_draft, is_public
    } = req.body;

    const reportData = {
      player_id: player_id || null,
      prospect_id: prospect_id || null,
      created_by: req.user.id,
      report_date, game_date, opponent, event_type,
      overall_grade, hitting_grade, bat_speed, power_potential, plate_discipline,
      pitching_grade, fastball_grade, breaking_ball_grade, command,
      fielding_grade, arm_strength, arm_accuracy, range,
      speed_grade, intangibles_grade, work_ethic, coachability, projection,
      overall_present, overall_future, hitting_present, hitting_future,
      bat_speed_present, bat_speed_future, raw_power_present, raw_power_future,
      game_power_present, game_power_future, plate_discipline_present, plate_discipline_future,
      pitching_present, pitching_future, fastball_present, fastball_future,
      curveball_present, curveball_future, slider_present, slider_future,
      changeup_present, changeup_future, command_present, command_future,
      fielding_present, fielding_future, arm_strength_present, arm_strength_future,
      arm_accuracy_present, arm_accuracy_future, range_present, range_future,
      hands_present, hands_future, speed_present, speed_future,
      baserunning_present, baserunning_future, intangibles_present, intangibles_future,
      work_ethic_grade, coachability_grade, baseball_iq_present, baseball_iq_future,
      overall_future_potential,
      sixty_yard_dash, mlb_comparison,
      overall_notes, hitting_notes, pitching_notes, fielding_notes,
      speed_notes, intangibles_notes, projection_notes,
      fastball_velocity, home_to_first, is_draft, is_public
    };

    const scoutingReport = await ScoutingReport.create(reportData);

    const createdReport = await ScoutingReport.findByPk(scoutingReport.id, {
      include: reportIncludes(teamId)
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

/**
 * @route GET /api/reports/scouting/:id
 * @description Retrieves a specific scouting report by ID.
 *   Team isolation enforced via Player or Prospect team_id.
 */
router.get('/:id', async (req, res) => {
  try {
    const teamId = req.user.team_id;

    const report = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: reportIncludes(teamId)
    });

    // Must exist and belong to user's team via either Player or Prospect
    if (!report || (!report.Player && !report.Prospect)) {
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

/**
 * @route PUT /api/reports/scouting/:id
 * @description Updates an existing scouting report.
 *   Team isolation enforced via Player or Prospect team_id.
 *   Can reassign between player/prospect if new target belongs to user's team.
 */
router.put('/:id', async (req, res) => {
  try {
    const teamId = req.user.team_id;

    const existingReport = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: reportIncludes(teamId)
    });

    if (!existingReport || (!existingReport.Player && !existingReport.Prospect)) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found or does not belong to your team'
      });
    }

    // If changing player_id, verify new player belongs to user's team
    if (req.body.player_id && req.body.player_id !== existingReport.player_id) {
      const player = await Player.findOne({
        where: { id: req.body.player_id, team_id: teamId }
      });
      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found or does not belong to your team'
        });
      }
    }

    // If changing prospect_id, verify new prospect belongs to user's team
    if (req.body.prospect_id && req.body.prospect_id !== existingReport.prospect_id) {
      const prospect = await Prospect.findOne({
        where: { id: req.body.prospect_id, team_id: teamId }
      });
      if (!prospect) {
        return res.status(404).json({
          success: false,
          message: 'Prospect not found or does not belong to your team'
        });
      }
    }

    await existingReport.update(req.body);

    const updatedReport = await ScoutingReport.findByPk(existingReport.id, {
      include: reportIncludes(teamId)
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

/**
 * @route DELETE /api/reports/scouting/:id
 * @description Deletes a scouting report.
 *   Team isolation enforced via Player or Prospect team_id.
 */
router.delete('/:id', async (req, res) => {
  try {
    const teamId = req.user.team_id;

    const report = await ScoutingReport.findOne({
      where: { id: req.params.id },
      include: reportIncludes(teamId)
    });

    if (!report || (!report.Player && !report.Prospect)) {
      return res.status(404).json({
        success: false,
        message: 'Scouting report not found or does not belong to your team'
      });
    }

    await report.destroy();

    res.json({
      success: true,
      message: 'Scouting report deleted successfully'
    });
  } catch (error) {
    console.error('Delete scouting report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting scouting report'
    });
  }
});

module.exports = router;
