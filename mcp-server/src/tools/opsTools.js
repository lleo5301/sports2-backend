const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_depth_chart',
    description: 'Get the current active depth chart showing positions and ranked player assignments.',
    parameters: {
      type: 'object',
      properties: {
        depth_chart_id: { type: 'integer', description: 'Specific depth chart ID. Omit for the active/default chart.' }
      }
    },
    handler: async (input, { team_id }) => {
      let chartCondition;
      const replacements = { team_id };

      if (input.depth_chart_id) {
        chartCondition = 'dc.id = :dc_id AND dc.team_id = :team_id';
        replacements.dc_id = input.depth_chart_id;
      } else {
        chartCondition = 'dc.team_id = :team_id AND dc.is_active = true';
      }

      const [chart] = await sequelize.query(`
        SELECT dc.id, dc.name, dc.description, dc.is_active, dc.version, dc.effective_date, dc.notes
        FROM depth_charts dc WHERE ${chartCondition} LIMIT 1
      `, { replacements, type: QueryTypes.SELECT });

      if (!chart) return { error: 'No active depth chart found' };

      const positions = await sequelize.query(`
        SELECT dcp.id AS position_id, dcp.position_name, dcp.display_order,
               dchp.assignment_order,
               p.id AS player_id, p.first_name, p.last_name, p.jersey_number, p.position, p.class_year
        FROM depth_chart_positions dcp
        LEFT JOIN depth_chart_players dchp ON dchp.depth_chart_position_id = dcp.id
        LEFT JOIN players p ON p.id = dchp.player_id
        WHERE dcp.depth_chart_id = :dc_id
        ORDER BY dcp.display_order, dchp.assignment_order
      `, { replacements: { dc_id: chart.id }, type: QueryTypes.SELECT });

      return { chart, positions };
    }
  },

  {
    name: 'get_schedule',
    description: 'Get team schedule — upcoming or past games.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['game', 'all'], description: 'Event type (default: game)' },
        upcoming: { type: 'boolean', description: 'If true, only future. If false, only past. Omit for all.' },
        limit: { type: 'integer', description: 'Max results (default 20)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['g.team_id = :team_id'];
      const replacements = { team_id, limit: input.limit || 20 };

      if (input.upcoming === true) {
        conditions.push('g.game_date >= CURRENT_DATE');
      } else if (input.upcoming === false) {
        conditions.push('g.game_date < CURRENT_DATE');
      }

      const sortDir = input.upcoming ? 'ASC' : 'DESC';

      const games = await sequelize.query(`
        SELECT g.id, g.opponent, g.game_date, g.game_time, g.home_away,
               g.team_score, g.opponent_score, g.result, g.game_status,
               g.location, g.venue_name, g.is_conference, g.event_type,
               g.season_name, g.opponent_logo_url
        FROM games g
        WHERE ${conditions.join(' AND ')}
        ORDER BY g.game_date ${sortDir}
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { games, count: games.length };
    }
  },

  {
    name: 'get_roster',
    description: 'Get the current team roster with player info, positions, and key stats.',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'string', description: 'Filter by position' },
        class_year: { type: 'string', description: 'Filter by class year (FR, SO, JR, SR, GR)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['p.team_id = :team_id', "p.status = 'active'"];
      const replacements = { team_id };

      if (input.position) {
        conditions.push('p.position = :position');
        replacements.position = input.position;
      }
      if (input.class_year) {
        conditions.push('p.class_year = :class_year');
        replacements.class_year = input.class_year;
      }

      const players = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.jersey_number, p.position,
               p.class_year, p.bats, p.throws, p.height, p.weight,
               p.hometown, p.high_school, p.batting_avg, p.home_runs, p.rbi,
               p.era, p.wins, p.losses, p.status, p.photo_url
        FROM players p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.jersey_number
      `, { replacements, type: QueryTypes.SELECT });

      return { roster: players, count: players.length };
    }
  },

  {
    name: 'get_daily_reports',
    description: 'Get daily practice or game reports with highlights, concerns, and attendance.',
    parameters: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['practice', 'game', 'scrimmage', 'workout'], description: 'Filter by report type' },
        limit: { type: 'integer', description: 'Max results (default 10)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['dr.team_id = :team_id'];
      const replacements = { team_id, limit: input.limit || 10 };

      if (input.report_type) {
        conditions.push('dr.report_type = :report_type');
        replacements.report_type = input.report_type;
      }

      const reports = await sequelize.query(`
        SELECT dr.id, dr.report_date, dr.report_type, dr.opponent, dr.location,
               dr.start_time, dr.end_time, dr.duration_minutes,
               dr.activities, dr.highlights, dr.concerns, dr.next_steps,
               dr.players_present, dr.players_absent,
               dr.temperature, dr.weather, dr.is_complete,
               u.first_name AS author_first, u.last_name AS author_last
        FROM daily_reports dr
        LEFT JOIN users u ON u.id = dr.created_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY dr.report_date DESC
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { reports, count: reports.length };
    }
  },

  {
    name: 'get_matchup_analysis',
    description: 'Get historical data against a specific opponent: past game results, stats, and tendencies.',
    parameters: {
      type: 'object',
      properties: {
        opponent_name: { type: 'string', description: 'Opponent team name (partial match supported)' }
      },
      required: ['opponent_name']
    },
    handler: async (input, { team_id }) => {
      const games = await sequelize.query(`
        SELECT g.id, g.opponent, g.game_date, g.home_away, g.team_score, g.opponent_score,
               g.result, g.game_status, g.team_stats, g.opponent_stats, g.game_summary
        FROM games g
        WHERE g.team_id = :team_id AND LOWER(g.opponent) LIKE LOWER(:opp)
          AND g.game_status = 'completed'
        ORDER BY g.game_date DESC
        LIMIT 20
      `, { replacements: { team_id, opp: `%${input.opponent_name}%` }, type: QueryTypes.SELECT });

      if (!games.length) return { error: `No completed games found against "${input.opponent_name}"` };

      const wins = games.filter(g => g.result === 'W').length;
      const losses = games.filter(g => g.result === 'L').length;

      return {
        opponent: input.opponent_name,
        record: { wins, losses, total: games.length },
        games
      };
    }
  }
];
