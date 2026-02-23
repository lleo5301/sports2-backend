const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'get_game_boxscore',
    description: 'Get the full box score for a specific game including all player stats and game summary.',
    parameters: {
      type: 'object',
      properties: {
        game_id: { type: 'integer', description: 'Game ID' }
      },
      required: ['game_id']
    },
    handler: async (input, { team_id }) => {
      const [game] = await sequelize.query(`
        SELECT id, opponent, game_date, home_away, team_score, opponent_score,
               result, location, season_name, venue_name, game_status, attendance,
               weather, game_duration, game_summary, team_stats, opponent_stats,
               running_record, play_by_play
        FROM games WHERE id = :game_id AND team_id = :team_id
      `, { replacements: { game_id: input.game_id, team_id }, type: QueryTypes.SELECT });

      if (!game) return { error: 'Game not found' };

      const playerStats = await sequelize.query(`
        SELECT gs.*, p.first_name, p.last_name, p.jersey_number, p.position
        FROM game_statistics gs
        JOIN players p ON p.id = gs.player_id
        WHERE gs.game_id = :game_id
        ORDER BY gs.position_played, p.last_name
      `, { replacements: { game_id: input.game_id }, type: QueryTypes.SELECT });

      return { game, player_stats: playerStats };
    }
  },

  {
    name: 'get_play_by_play',
    description: 'Get play-by-play data for a game, optionally filtered by inning.',
    parameters: {
      type: 'object',
      properties: {
        game_id: { type: 'integer', description: 'Game ID' },
        inning: { type: 'integer', description: 'Filter to specific inning number' }
      },
      required: ['game_id']
    },
    handler: async (input, { team_id }) => {
      const [game] = await sequelize.query(`
        SELECT id, opponent, game_date, play_by_play
        FROM games WHERE id = :game_id AND team_id = :team_id
      `, { replacements: { game_id: input.game_id, team_id }, type: QueryTypes.SELECT });

      if (!game) return { error: 'Game not found' };
      if (!game.play_by_play) return { error: 'No play-by-play data available for this game' };

      let pbp = game.play_by_play;
      if (input.inning && Array.isArray(pbp)) {
        pbp = pbp.filter(p => p.inning === input.inning);
      }

      return { game_id: game.id, opponent: game.opponent, game_date: game.game_date, plays: pbp };
    }
  },

  {
    name: 'get_team_record',
    description: "Get the team's win-loss record, optionally filtered by conference, home/away, or season.",
    parameters: {
      type: 'object',
      properties: {
        season: { type: 'string', description: 'Season name to filter' },
        split: { type: 'string', enum: ['overall', 'conference', 'home', 'away', 'neutral'], description: 'Record split type' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['team_id = :team_id', "game_status = 'completed'"];
      const replacements = { team_id };

      if (input.season) {
        conditions.push('season_name = :season');
        replacements.season = input.season;
      }
      if (input.split === 'conference') conditions.push('is_conference = true');
      if (input.split === 'home') conditions.push("home_away = 'home'");
      if (input.split === 'away') conditions.push("home_away = 'away'");
      if (input.split === 'neutral') conditions.push('is_neutral = true');

      const [record] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE result = 'W') AS wins,
          COUNT(*) FILTER (WHERE result = 'L') AS losses,
          COUNT(*) FILTER (WHERE result = 'T') AS ties,
          COUNT(*) AS total_games,
          ROUND(AVG(team_score)::numeric, 1) AS avg_runs_scored,
          ROUND(AVG(opponent_score)::numeric, 1) AS avg_runs_allowed,
          SUM(team_score) AS total_runs_scored,
          SUM(opponent_score) AS total_runs_allowed
        FROM games WHERE ${conditions.join(' AND ')}
      `, { replacements, type: QueryTypes.SELECT });

      return { record, split: input.split || 'overall', season: input.season || 'all' };
    }
  },

  {
    name: 'get_team_stats',
    description: 'Get aggregated team-level batting or pitching statistics for the season.',
    parameters: {
      type: 'object',
      properties: {
        season: { type: 'string', description: 'Season name' },
        stat_type: { type: 'string', enum: ['batting', 'pitching'], description: 'Type of stats' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['g.team_id = :team_id'];
      const replacements = { team_id };

      if (input.season) {
        conditions.push('g.season_name = :season');
        replacements.season = input.season;
      }

      if (input.stat_type === 'pitching') {
        const [stats] = await sequelize.query(`
          SELECT
            COUNT(DISTINCT g.id) AS games,
            SUM(gs.innings_pitched) AS total_ip,
            SUM(gs.hits_allowed) AS total_hits_allowed,
            SUM(gs.earned_runs) AS total_earned_runs,
            SUM(gs.walks_allowed) AS total_walks,
            SUM(gs.strikeouts_pitching) AS total_strikeouts,
            SUM(gs.home_runs_allowed) AS total_hr_allowed,
            ROUND((SUM(gs.earned_runs) * 9.0 / NULLIF(SUM(gs.innings_pitched), 0))::numeric, 2) AS team_era,
            ROUND(((SUM(gs.walks_allowed) + SUM(gs.hits_allowed)) / NULLIF(SUM(gs.innings_pitched), 0))::numeric, 2) AS team_whip
          FROM game_statistics gs
          JOIN games g ON g.id = gs.game_id
          WHERE ${conditions.join(' AND ')} AND gs.innings_pitched > 0
        `, { replacements, type: QueryTypes.SELECT });
        return { stat_type: 'pitching', stats };
      } else {
        const [stats] = await sequelize.query(`
          SELECT
            COUNT(DISTINCT g.id) AS games,
            SUM(gs.at_bats) AS total_ab,
            SUM(gs.hits) AS total_hits,
            SUM(gs.runs) AS total_runs,
            SUM(gs.doubles) AS total_doubles,
            SUM(gs.triples) AS total_triples,
            SUM(gs.home_runs) AS total_hr,
            SUM(gs.rbi) AS total_rbi,
            SUM(gs.walks) AS total_walks,
            SUM(gs.strikeouts_batting) AS total_strikeouts,
            SUM(gs.stolen_bases) AS total_sb,
            ROUND((SUM(gs.hits)::numeric / NULLIF(SUM(gs.at_bats), 0))::numeric, 3) AS team_avg,
            ROUND(((SUM(gs.hits) + SUM(gs.walks) + COALESCE(SUM(gs.hit_by_pitch), 0))::numeric /
              NULLIF(SUM(gs.at_bats) + SUM(gs.walks) + COALESCE(SUM(gs.hit_by_pitch), 0) + COALESCE(SUM(gs.sacrifice_flies), 0), 0))::numeric, 3) AS team_obp
          FROM game_statistics gs
          JOIN games g ON g.id = gs.game_id
          WHERE ${conditions.join(' AND ')} AND gs.at_bats > 0
        `, { replacements, type: QueryTypes.SELECT });
        return { stat_type: 'batting', stats };
      }
    }
  },

  {
    name: 'get_season_leaders',
    description: 'Get the top players in a specific statistical category. Use minimum qualifiers to filter small sample sizes.',
    parameters: {
      type: 'object',
      properties: {
        stat_field: {
          type: 'string',
          description: 'Stat field to rank by (e.g., batting_average, home_runs, rbi, era, strikeouts_pitching, stolen_bases, ops, wins)'
        },
        top_n: { type: 'integer', description: 'Number of top players (default 10)' },
        season: { type: 'string', description: 'Season name' },
        min_at_bats: { type: 'integer', description: 'Min at-bats qualifier for batting (default 20)' },
        min_innings: { type: 'number', description: 'Min innings pitched for pitching (default 10)' }
      },
      required: ['stat_field']
    },
    handler: async (input, { team_id }) => {
      const pitchingStats = ['era', 'whip', 'wins', 'losses', 'saves', 'strikeouts_pitching', 'walks_pitching', 'innings_pitched'];
      const isPitching = pitchingStats.includes(input.stat_field);
      const topN = input.top_n || 10;

      const conditions = ['p.team_id = :team_id'];
      const replacements = { team_id, limit: topN };

      if (input.season) {
        conditions.push('pss.season = :season');
        replacements.season = input.season;
      }

      if (isPitching) {
        const minIP = input.min_innings || 10;
        conditions.push('pss.innings_pitched >= :min_ip');
        replacements.min_ip = minIP;
      } else {
        const minAB = input.min_at_bats || 20;
        conditions.push('pss.at_bats >= :min_ab');
        replacements.min_ab = minAB;
      }

      const ascStats = ['era', 'whip'];
      const sortDir = ascStats.includes(input.stat_field) ? 'ASC' : 'DESC';

      const leaders = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.position, p.jersey_number, p.class_year,
               pss.season, pss.games_played, pss.at_bats, pss.innings_pitched,
               pss.${input.stat_field} AS stat_value
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE ${conditions.join(' AND ')} AND pss.${input.stat_field} IS NOT NULL
        ORDER BY pss.${input.stat_field} ${sortDir}
        LIMIT :limit
      `, { replacements, type: QueryTypes.SELECT });

      return { stat_field: input.stat_field, leaders, qualifier: isPitching ? `${replacements.min_ip}+ IP` : `${replacements.min_ab}+ AB` };
    }
  }
];
