const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

module.exports = [
  {
    name: 'search_players',
    description: 'Search for players by name, position, or class year. Use this to find player IDs before calling other player tools.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search by player name (first or last)' },
        position: { type: 'string', description: 'Filter by position (P, C, 1B, 2B, 3B, SS, LF, CF, RF, OF, DH)' },
        class_year: { type: 'string', description: 'Filter by class year (FR, SO, JR, SR, GR)' }
      }
    },
    handler: async (input, { team_id }) => {
      const conditions = ['p.team_id = :team_id'];
      const replacements = { team_id };

      if (input.query) {
        conditions.push("(LOWER(p.first_name) LIKE LOWER(:q) OR LOWER(p.last_name) LIKE LOWER(:q) OR LOWER(CONCAT(p.first_name, ' ', p.last_name)) LIKE LOWER(:q))");
        replacements.q = `%${input.query}%`;
      }
      if (input.position) {
        conditions.push('p.position = :position');
        replacements.position = input.position;
      }
      if (input.class_year) {
        conditions.push('p.class_year = :class_year');
        replacements.class_year = input.class_year;
      }

      const players = await sequelize.query(`
        SELECT p.id, p.first_name, p.last_name, p.position, p.jersey_number,
               p.class_year, p.bats, p.throws, p.height, p.weight,
               p.batting_avg, p.home_runs, p.rbi, p.era, p.wins, p.losses,
               p.status, p.photo_url
        FROM players p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.last_name, p.first_name
        LIMIT 25
      `, { replacements, type: QueryTypes.SELECT });

      return { players, count: players.length };
    }
  },

  {
    name: 'get_player_stats',
    description: 'Get detailed batting, pitching, or fielding statistics for a specific player. Returns season stats if season specified, career stats otherwise.',
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID (use search_players to find)' },
        season: { type: 'string', description: 'Season name (e.g., "2026 Baseball"). Omit for career stats.' },
        stat_type: { type: 'string', enum: ['batting', 'pitching', 'fielding'], description: 'Type of stats to return' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      const [player] = await sequelize.query(`
        SELECT id, first_name, last_name, position, jersey_number, class_year, bats, throws
        FROM players WHERE id = :player_id AND team_id = :team_id
      `, { replacements: { player_id: input.player_id, team_id }, type: QueryTypes.SELECT });

      if (!player) return { error: 'Player not found' };

      if (input.season) {
        const [stats] = await sequelize.query(`
          SELECT * FROM player_season_stats
          WHERE player_id = :player_id AND season = :season
        `, { replacements: { player_id: input.player_id, season: input.season }, type: QueryTypes.SELECT });
        return { player, season: input.season, stats: stats || null };
      } else {
        const [stats] = await sequelize.query(`
          SELECT * FROM player_career_stats WHERE player_id = :player_id
        `, { replacements: { player_id: input.player_id }, type: QueryTypes.SELECT });
        return { player, career_stats: stats || null };
      }
    }
  },

  {
    name: 'get_player_splits',
    description: "Get a player's split statistics (vs LHP/RHP, home/away, RISP, with runners, two outs, bases loaded, leadoff, conference).",
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID' },
        season: { type: 'string', description: 'Season name. Omit for most recent.' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      const seasonCondition = input.season ? 'AND pss.season = :season' : '';
      const replacements = { player_id: input.player_id, team_id };
      if (input.season) replacements.season = input.season;

      const stats = await sequelize.query(`
        SELECT pss.season, pss.split_stats
        FROM player_season_stats pss
        JOIN players p ON p.id = pss.player_id
        WHERE pss.player_id = :player_id AND p.team_id = :team_id ${seasonCondition}
        ORDER BY pss.season DESC
        LIMIT 1
      `, { replacements, type: QueryTypes.SELECT });

      if (!stats.length || !stats[0].split_stats) {
        return { error: 'No split stats available for this player/season' };
      }
      return { season: stats[0].season, splits: stats[0].split_stats };
    }
  },

  {
    name: 'get_player_trend',
    description: "Get a player's game-by-game performance over recent games to identify hot/cold streaks and trends.",
    parameters: {
      type: 'object',
      properties: {
        player_id: { type: 'integer', description: 'Player ID' },
        last_n_games: { type: 'integer', description: 'Number of recent games (default 10)' }
      },
      required: ['player_id']
    },
    handler: async (input, { team_id }) => {
      const limit = input.last_n_games || 10;
      const games = await sequelize.query(`
        SELECT g.game_date, g.opponent, g.result, g.team_score, g.opponent_score,
               gs.at_bats, gs.runs, gs.hits, gs.doubles, gs.triples, gs.home_runs,
               gs.rbi, gs.walks, gs.strikeouts_batting, gs.stolen_bases,
               gs.innings_pitched, gs.hits_allowed, gs.runs_allowed, gs.earned_runs,
               gs.walks_allowed, gs.strikeouts_pitching, gs.pitches_thrown,
               gs.position_played
        FROM game_statistics gs
        JOIN games g ON g.id = gs.game_id
        JOIN players p ON p.id = gs.player_id
        WHERE gs.player_id = :player_id AND p.team_id = :team_id
        ORDER BY g.game_date DESC
        LIMIT :limit
      `, { replacements: { player_id: input.player_id, team_id, limit }, type: QueryTypes.SELECT });

      return { player_id: input.player_id, games: games.reverse(), count: games.length };
    }
  },

  {
    name: 'compare_players',
    description: 'Compare 2 or more players side-by-side on their season or career statistics.',
    parameters: {
      type: 'object',
      properties: {
        player_ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Array of 2+ player IDs to compare'
        },
        season: { type: 'string', description: 'Season name. Omit for career stats.' }
      },
      required: ['player_ids']
    },
    handler: async (input, { team_id }) => {
      const ids = input.player_ids;
      if (!ids || ids.length < 2) return { error: 'Need at least 2 player IDs' };

      const players = await sequelize.query(`
        SELECT id, first_name, last_name, position, jersey_number, class_year, bats, throws
        FROM players WHERE id IN (:ids) AND team_id = :team_id
      `, { replacements: { ids, team_id }, type: QueryTypes.SELECT });

      let stats;
      if (input.season) {
        stats = await sequelize.query(`
          SELECT player_id, season, games_played, games_started,
                 at_bats, runs, hits, doubles, triples, home_runs, rbi,
                 walks, strikeouts, stolen_bases, caught_stealing,
                 batting_average, on_base_percentage, slugging_percentage, ops,
                 innings_pitched, wins, losses, saves, era, whip,
                 strikeouts_pitching, walks_pitching
          FROM player_season_stats WHERE player_id IN (:ids) AND season = :season
        `, { replacements: { ids, season: input.season }, type: QueryTypes.SELECT });
      } else {
        stats = await sequelize.query(`
          SELECT * FROM player_career_stats WHERE player_id IN (:ids)
        `, { replacements: { ids }, type: QueryTypes.SELECT });
      }

      return { players, stats, comparison_type: input.season ? 'season' : 'career' };
    }
  }
];
