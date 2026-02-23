const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_scouting_reports',
    description: 'Get scouting reports for a player or prospect. Returns 20-80 scale grades, notes, and evaluation details.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID (for rostered players)' },
        prospect_id: { type: 'integer', description: 'Prospect ID (for recruits)' },
        latest_only: { type: 'boolean', description: 'Only return the most recent report (default false)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['sr.team_id = :team_id'];
      const replacements = { team_id };

      if (input.player_id) {
        conditions.push('sr.player_id = :player_id');
        replacements.player_id = input.player_id;
      } else if (input.prospect_id) {
        conditions.push('sr.prospect_id = :prospect_id');
        replacements.prospect_id = input.prospect_id;
      } else {
        return { error: 'Either player_id or prospect_id is required' };
      }

      const limit = input.latest_only ? 'LIMIT 1' : 'LIMIT 10';

      const reports = await sequelize.query(`
        SELECT sr.id, sr.report_date, sr.game_date, sr.opponent, sr.event_type,
               sr.overall_present, sr.overall_future, sr.overall_future_potential,
               sr.hitting_present, sr.hitting_future,
               sr.bat_speed_present, sr.bat_speed_future,
               sr.raw_power_present, sr.raw_power_future,
               sr.game_power_present, sr.game_power_future,
               sr.plate_discipline_present, sr.plate_discipline_future,
               sr.pitching_present, sr.pitching_future,
               sr.fastball_present, sr.fastball_future,
               sr.curveball_present, sr.curveball_future,
               sr.slider_present, sr.slider_future,
               sr.changeup_present, sr.changeup_future,
               sr.command_present, sr.command_future,
               sr.fielding_present, sr.fielding_future,
               sr.arm_strength_present, sr.arm_strength_future,
               sr.speed_present, sr.speed_future,
               sr.baserunning_present, sr.baserunning_future,
               sr.intangibles_present, sr.intangibles_future,
               sr.baseball_iq_present, sr.baseball_iq_future,
               sr.work_ethic_grade, sr.coachability_grade,
               sr.overall_notes, sr.hitting_notes, sr.pitching_notes,
               sr.fielding_notes, sr.speed_notes, sr.intangibles_notes,
               sr.projection_notes, sr.mlb_comparison,
               sr.sixty_yard_dash, sr.fastball_velocity, sr.home_to_first,
               u.first_name AS scout_first, u.last_name AS scout_last
        FROM scouting_reports sr
        LEFT JOIN users u ON u.id = sr.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY sr.report_date DESC
        ${limit}
      `, { replacements, type: QueryTypes.SELECT });

      return { reports, count: reports.length };
    }
  },

  {
    name: 'get_prospect_pipeline',
    description: 'Get the recruiting prospect pipeline with status, position, grades, and school info.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (identified, evaluating, contacted, visiting, offered, committed, signed, passed)' },
        position: { type: 'string', description: 'Filter by position' },
        grad_year: { type: 'integer', description: 'Filter by graduation year' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['pr.team_id = :team_id'];
      const replacements = { team_id };

      if (input.status) {
        conditions.push('pr.status = :status');
        replacements.status = input.status;
      }
      if (input.position) {
        conditions.push('(pr.primary_position = :position OR pr.secondary_position = :position)');
        replacements.position = input.position;
      }
      if (input.grad_year) {
        conditions.push('pr.graduation_year = :grad_year');
        replacements.grad_year = input.grad_year;
      }

      const prospects = await sequelize.query(`
        SELECT pr.id, pr.first_name, pr.last_name, pr.primary_position, pr.secondary_position,
               pr.status, pr.school_name, pr.school_type, pr.city, pr.state,
               pr.graduation_year, pr.class_year, pr.height, pr.weight,
               pr.bats, pr.throws, pr.gpa, pr.sat_score, pr.act_score,
               pr.sixty_yard_dash, pr.fastball_velocity, pr.home_to_first,
               pr.video_url, pr.notes
        FROM prospects pr
        WHERE ${conditions.join(' AND ')}
        ORDER BY pr.status, pr.last_name
      `, { replacements, type: QueryTypes.SELECT });

      return { prospects, count: prospects.length };
    }
  },

  {
    name: 'get_recruiting_board',
    description: 'Get the preference list (recruiting board) showing ranked recruiting targets.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'integer', description: 'Specific preference list ID. Omit for all lists.' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['pl.team_id = :team_id'];
      const replacements = { team_id };

      if (input.list_id) {
        conditions.push('pl.id = :list_id');
        replacements.list_id = input.list_id;
      }

      const lists = await sequelize.query(`
        SELECT pl.*,
               p.first_name AS player_first, p.last_name AS player_last, p.position AS player_position,
               pr.first_name AS prospect_first, pr.last_name AS prospect_last, pr.primary_position AS prospect_position,
               pr.status AS prospect_status, pr.school_name AS prospect_school
        FROM preference_lists pl
        LEFT JOIN players p ON p.id = pl.player_id
        LEFT JOIN prospects pr ON pr.id = pl.prospect_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY pl.rank ASC NULLS LAST, pl.created_at DESC
      `, { replacements, type: QueryTypes.SELECT });

      return { entries: lists, count: lists.length };
    }
  }
];
