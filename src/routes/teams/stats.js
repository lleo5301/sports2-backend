/**
 * @fileoverview Statistics and roster routes for teams.
 * Handles retrieval of team statistics and roster organized by position.
 * All routes enforce team isolation - users can only view their own team's data.
 *
 * Key features:
 * - Comprehensive team statistics including player counts, reports, schedules, and game records
 * - Roster organization by position groups (pitchers, catchers, infielders, outfielders, DH)
 * - Calculated metrics (win rate, player retention rate)
 *
 * @module routes/teams/stats
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route GET /api/teams/stats
 * @description Retrieves comprehensive statistics for the authenticated user's team.
 *              Includes player counts, scouting report totals, schedule counts,
 *              and game record (wins/losses/ties) with calculated rates.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics
 * @returns {number} response.data.totalPlayers - Total player count
 * @returns {number} response.data.activePlayers - Active player count
 * @returns {number} response.data.totalReports - Total scouting report count
 * @returns {number} response.data.totalSchedules - Active schedule count
 * @returns {number} response.data.totalGames - Total game count
 * @returns {number} response.data.wins - Win count
 * @returns {number} response.data.losses - Loss count
 * @returns {number} response.data.ties - Tie count
 * @returns {number} response.data.winRate - Win percentage (0-1)
 * @returns {number} response.data.playerRetentionRate - Active/total player ratio (0-1)
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats', async (req, res) => {
  try {
    const { Player, ScoutingReport, Schedule, Game } = require('../../models');

    // Database: Count total players for the team
    const totalPlayers = await Player.count({
      where: { team_id: req.user.team_id }
    });

    // Database: Count active players for the team
    const activePlayers = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      }
    });

    // Database: Count scouting reports for team's players
    // Uses join to filter by team through Player association
    const totalReports = await ScoutingReport.count({
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id }
        }
      ]
    });

    // Database: Count active schedules for the team
    const totalSchedules = await Schedule.count({
      where: {
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Database: Count games and game results for the team
    const totalGames = await Game.count({
      where: { team_id: req.user.team_id }
    });

    const wins = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'W'
      }
    });

    const losses = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'L'
      }
    });

    const ties = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'T'
      }
    });

    // Business logic: Calculate derived statistics
    const stats = {
      totalPlayers,
      activePlayers,
      totalReports,
      totalSchedules,
      totalGames,
      wins,
      losses,
      ties,
      // Business logic: Calculate win rate (0 if no games played)
      winRate: totalGames > 0 ? wins / totalGames : 0,
      // Business logic: Calculate player retention rate (active/total, 0 if no players)
      playerRetentionRate: totalPlayers > 0 ? activePlayers / totalPlayers : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});

/**
 * @route GET /api/teams/roster
 * @description Retrieves the team roster organized by position groups.
 *              Returns active players only, grouped into pitchers, catchers,
 *              infielders, outfielders, and designated hitters.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Roster organized by position group
 * @returns {Array<Object>} response.data.pitchers - Players with position 'P'
 * @returns {Array<Object>} response.data.catchers - Players with position 'C'
 * @returns {Array<Object>} response.data.infielders - Players with positions '1B', '2B', '3B', 'SS'
 * @returns {Array<Object>} response.data.outfielders - Players with positions 'LF', 'CF', 'RF', 'OF'
 * @returns {Array<Object>} response.data.designated_hitters - Players with position 'DH'
 * @returns {number} response.data.total_players - Total count of active players
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/roster', async (req, res) => {
  try {
    const { Player } = require('../../models');

    // Database: Fetch active players for the team with roster-relevant attributes
    const players = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      },
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'height', 'weight', 'graduation_year', 'school', 'city', 'state',
        'batting_avg', 'era', 'created_at'
      ],
      order: [
        ['position', 'ASC'],
        ['last_name', 'ASC'],
        ['first_name', 'ASC']
      ]
    });

    // Business logic: Group players by position categories for roster display
    // This matches common baseball roster organization patterns
    const roster = {
      pitchers: players.filter(p => p.position === 'P'),
      catchers: players.filter(p => p.position === 'C'),
      infielders: players.filter(p => ['1B', '2B', '3B', 'SS'].includes(p.position)),
      outfielders: players.filter(p => ['LF', 'CF', 'RF', 'OF'].includes(p.position)),
      designated_hitters: players.filter(p => p.position === 'DH'),
      total_players: players.length
    };

    res.json({
      success: true,
      data: roster
    });
  } catch (error) {
    console.error('Error fetching team roster:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team roster'
    });
  }
});

/**
 * GET /api/v1/teams/dashboard
 * Coach's dashboard: record, team stats, recent games, stat leaders.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { Team, Game, Player, PlayerSeasonStats } = require('../../models');

    const team = await Team.findByPk(req.user.team_id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Recent games (last 10)
    const recentGames = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      attributes: ['id', 'opponent', 'game_date', 'home_away', 'result',
        'team_score', 'opponent_score', 'game_summary', 'running_record',
        'running_conference_record'],
      order: [['game_date', 'DESC']],
      limit: 10
    });

    // Stat leaders (top 3 in key categories)
    const seasonStats = await PlayerSeasonStats.findAll({
      where: { team_id: req.user.team_id, source_system: 'presto' },
      include: [{ model: Player, as: 'player', attributes: ['id', 'first_name', 'last_name'] }],
      order: [['created_at', 'DESC']]
    });

    // Deduplicate to latest season per player
    const latestByPlayer = {};
    for (const ss of seasonStats) {
      if (!latestByPlayer[ss.player_id]) latestByPlayer[ss.player_id] = ss;
    }
    const allStats = Object.values(latestByPlayer);

    const leaderFor = (field, limit = 3, filter = () => true) => {
      return allStats
        .filter(s => s[field] !== null && s[field] !== undefined && filter(s))
        .sort((a, b) => parseFloat(b[field]) - parseFloat(a[field]))
        .slice(0, limit)
        .map(s => ({
          player_id: s.player_id,
          name: s.player ? `${s.player.first_name} ${s.player.last_name}` : 'Unknown',
          value: s[field]
        }));
    };

    const eraLeaders = allStats
      .filter(s => s.era !== null && s.era !== undefined && parseFloat(s.innings_pitched) >= 5)
      .sort((a, b) => parseFloat(a.era) - parseFloat(b.era))
      .slice(0, 3)
      .map(s => ({
        player_id: s.player_id,
        name: s.player ? `${s.player.first_name} ${s.player.last_name}` : 'Unknown',
        value: s.era
      }));

    res.json({
      success: true,
      data: {
        record: {
          wins: team.wins || 0,
          losses: team.losses || 0,
          ties: team.ties || 0,
          conference_wins: team.conference_wins || 0,
          conference_losses: team.conference_losses || 0
        },
        team_batting: team.team_batting_stats || {},
        team_pitching: team.team_pitching_stats || {},
        team_fielding: team.team_fielding_stats || {},
        recent_games: recentGames.map(g => ({
          id: g.id,
          date: g.game_date,
          opponent: g.opponent,
          home_away: g.home_away,
          result: g.result,
          score: g.team_score !== null ? `${g.team_score}-${g.opponent_score}` : null,
          game_summary: g.game_summary,
          running_record: g.running_record,
          running_conference_record: g.running_conference_record
        })),
        leaders: {
          batting_avg: leaderFor('batting_average', 3, s => s.at_bats >= 10),
          home_runs: leaderFor('home_runs'),
          rbi: leaderFor('rbi'),
          stolen_bases: leaderFor('stolen_bases'),
          era: eraLeaders,
          strikeouts: leaderFor('strikeouts_pitching')
        },
        stats_last_synced_at: team.stats_last_synced_at
      }
    });
  } catch (error) {
    console.error('Error fetching team dashboard:', error);
    res.status(500).json({ success: false, error: 'Error fetching team dashboard' });
  }
});

/**
 * GET /api/v1/teams/game-log
 * Team game log with per-game team stats and running record.
 */
router.get('/game-log', async (req, res) => {
  try {
    const { Game } = require('../../models');

    const games = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      attributes: ['id', 'opponent', 'game_date', 'home_away', 'result',
        'team_score', 'opponent_score', 'team_stats', 'game_summary',
        'running_record', 'running_conference_record', 'location'],
      order: [['game_date', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        games: games.map(g => ({
          id: g.id,
          date: g.game_date,
          opponent: g.opponent,
          home_away: g.home_away,
          result: g.result,
          score: g.team_score !== null ? `${g.team_score}-${g.opponent_score}` : null,
          location: g.location,
          team_stats: g.team_stats,
          game_summary: g.game_summary,
          running_record: g.running_record,
          running_conference_record: g.running_conference_record
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching team game log:', error);
    res.status(500).json({ success: false, error: 'Error fetching team game log' });
  }
});

/**
 * GET /api/v1/teams/aggregate-stats
 * Full team batting/pitching/fielding aggregates.
 */
router.get('/aggregate-stats', async (req, res) => {
  try {
    const { Team } = require('../../models');

    const team = await Team.findByPk(req.user.team_id, {
      attributes: ['team_batting_stats', 'team_pitching_stats', 'team_fielding_stats', 'stats_last_synced_at']
    });

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    res.json({
      success: true,
      data: {
        batting: team.team_batting_stats || {},
        pitching: team.team_pitching_stats || {},
        fielding: team.team_fielding_stats || {},
        last_synced_at: team.stats_last_synced_at
      }
    });
  } catch (error) {
    console.error('Error fetching team aggregate stats:', error);
    res.status(500).json({ success: false, error: 'Error fetching team aggregate stats' });
  }
});

/**
 * GET /api/v1/teams/lineup
 * Best-effort lineup derived from most recent game's box score.
 */
router.get('/lineup', async (req, res) => {
  try {
    const { Game, GameStatistic, Player } = require('../../models');
    // Find most recent completed games (check up to 5 in case the latest has incomplete stats)
    const recentGames = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      order: [['game_date', 'DESC']],
      limit: 5
    });

    if (recentGames.length === 0) {
      return res.json({
        success: true,
        data: { source: 'none', players: [], message: 'No completed games found' }
      });
    }

    // Find the most recent game that has at least 2 player stat rows
    let lastGame = null;
    let gameStats = [];
    for (const game of recentGames) {
      const stats = await GameStatistic.findAll({
        where: { game_id: game.id, team_id: req.user.team_id },
        include: [{
          model: Player,
          as: 'player',
          attributes: ['id', 'first_name', 'last_name', 'position', 'jersey_number', 'photo_url']
        }]
      });
      if (stats.length >= 2) {
        lastGame = game;
        gameStats = stats;
        break;
      }
    }

    if (!lastGame) {
      return res.json({
        success: true,
        data: { source: 'none', players: [], message: 'No games with complete stats found' }
      });
    }

    // Sort: position players first (by position), then pitchers
    const positionOrder = { 'C': 1, 'SS': 2, '2B': 3, '3B': 4, '1B': 5, 'LF': 6, 'CF': 7, 'RF': 8, 'DH': 9, 'P': 10 };
    const sorted = gameStats.sort((a, b) => {
      const posA = positionOrder[a.position_played] || 99;
      const posB = positionOrder[b.position_played] || 99;
      return posA - posB;
    });

    res.json({
      success: true,
      data: {
        source: 'last_game',
        game_id: lastGame.id,
        game_date: lastGame.game_date,
        opponent: lastGame.opponent,
        players: sorted.map(gs => ({
          player_id: gs.player?.id,
          name: gs.player ? `${gs.player.first_name} ${gs.player.last_name}` : 'Unknown',
          jersey_number: gs.player?.jersey_number,
          position: gs.position_played,
          photo_url: gs.player?.photo_url,
          batting: {
            ab: gs.at_bats, h: gs.hits, r: gs.runs, rbi: gs.rbi, bb: gs.walks
          }
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching team lineup:', error);
    res.status(500).json({ success: false, error: 'Error fetching team lineup' });
  }
});

module.exports = router;
