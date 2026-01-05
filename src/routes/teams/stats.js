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

module.exports = router;
