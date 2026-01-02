/**
 * @fileoverview Analytics routes for aggregated statistics and analysis data.
 * Handles player performance, team statistics, scouting analysis, and recruitment pipeline reports.
 * All routes enforce team isolation and require reports_view permission.
 *
 * Analytics Report Types:
 *
 * 1. Player Performance (GET /player-performance):
 *    - Aggregated stats across team roster
 *    - Filtering by position, school type
 *    - Includes batting and pitching statistics
 *
 * 2. Team Statistics (GET /team-statistics):
 *    - Win/loss records and percentages
 *    - Player breakdown by position and school type
 *    - Season filtering support
 *
 * 3. Scouting Analysis (GET /scouting-analysis):
 *    - Aggregated scouting report metrics
 *    - Average grades across reports
 *    - Position-based grouping
 *
 * 4. Recruitment Pipeline (GET /recruitment-pipeline):
 *    - Prospect tracking by priority and status
 *    - High school recruits grouped by position
 *    - Recent additions tracking
 *
 * Permission Model:
 * All routes require:
 * - Authentication via protect middleware
 * - reports_view permission via checkPermission middleware
 *
 * @module routes/reports/analytics
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 * @requires ./helpers
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permissions');
const { Player, Team, ScoutingReport, Game, PreferenceList } = require('../../models');
const { Op } = require('sequelize');
const { gradeToNumeric } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route GET /api/reports/player-performance
 * @description Retrieves detailed player performance statistics with permission validation.
 *              Returns batting and pitching statistics for active players with optional filtering.
 *              Includes summary statistics (averages) in the response.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Filter by date range start (currently unused)
 * @param {string} [req.query.end_date] - Filter by date range end (currently unused)
 * @param {string} [req.query.position] - Filter by player position
 * @param {string} [req.query.school_type] - Filter by school type (HS, COLL)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Performance data
 * @returns {Array<Object>} response.data.players - Player statistics array
 * @returns {number} response.data.players[].id - Player ID
 * @returns {string} response.data.players[].first_name - Player's first name
 * @returns {string} response.data.players[].last_name - Player's last name
 * @returns {string} response.data.players[].position - Player's position
 * @returns {string} response.data.players[].school_type - School type (HS/COLL)
 * @returns {number} response.data.players[].batting_avg - Batting average
 * @returns {number} response.data.players[].on_base_pct - On-base percentage
 * @returns {number} response.data.players[].slugging_pct - Slugging percentage
 * @returns {number} response.data.players[].ops - On-base plus slugging
 * @returns {number} response.data.players[].runs - Runs scored
 * @returns {number} response.data.players[].hits - Hit count
 * @returns {number} response.data.players[].rbis - Runs batted in
 * @returns {number} response.data.players[].walks - Walk count
 * @returns {number} response.data.players[].strikeouts - Strikeout count
 * @returns {number} response.data.players[].era - Earned run average
 * @returns {number} response.data.players[].wins - Pitching wins
 * @returns {number} response.data.players[].losses - Pitching losses
 * @returns {number} response.data.players[].saves - Save count
 * @returns {number} response.data.players[].innings_pitched - Innings pitched
 * @returns {Object} response.data.filters - Applied filter values
 * @returns {Object} response.data.summary - Aggregated statistics
 * @returns {number} response.data.summary.total_players - Total player count
 * @returns {number} response.data.summary.avg_batting_avg - Average batting average
 * @returns {number} response.data.summary.avg_era - Average ERA
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/player-performance', checkPermission('reports_view'), async (req, res) => {
  try {
    const { start_date, end_date, position, school_type } = req.query;

    // Business logic: Build where clause for active players with filters
    const whereClause = {
      team_id: req.user.team_id,
      status: 'active'
    };

    // Filter: Optionally filter by position
    if (position) whereClause.position = position;
    // Filter: Optionally filter by school type
    if (school_type) whereClause.school_type = school_type;

    // Database: Fetch players with comprehensive performance stats
    const players = await Player.findAll({
      where: whereClause,
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'batting_avg', 'on_base_pct', 'slugging_pct', 'ops',
        'runs', 'hits', 'rbis', 'walks', 'strikeouts',
        'era', 'wins', 'losses', 'saves', 'innings_pitched'
      ],
      // Business logic: Sort by batting average descending (best performers first)
      order: [['batting_avg', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        players,
        filters: { start_date, end_date, position, school_type },
        // Business logic: Calculate summary statistics for the team
        summary: {
          total_players: players.length,
          avg_batting_avg: players.reduce((sum, p) => sum + (parseFloat(p.batting_avg) || 0), 0) / players.length || 0,
          avg_era: players.reduce((sum, p) => sum + (parseFloat(p.era) || 0), 0) / players.length || 0
        }
      }
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching player performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching player performance report'
    });
  }
});

/**
 * @route GET /api/reports/team-statistics
 * @description Retrieves comprehensive team statistics including game records and roster breakdown.
 *              Calculates win/loss/tie records and categorizes players by position and school type.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.season] - Optional filter by season
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics
 * @returns {Object} response.data.games - Game statistics
 * @returns {number} response.data.games.total - Total games played
 * @returns {number} response.data.games.wins - Total wins
 * @returns {number} response.data.games.losses - Total losses
 * @returns {number} response.data.games.ties - Total ties
 * @returns {string} response.data.games.win_percentage - Win percentage
 * @returns {Object} response.data.players - Player breakdown
 * @returns {number} response.data.players.total - Total active players
 * @returns {number} response.data.players.pitchers - Number of pitchers
 * @returns {number} response.data.players.position_players - Number of position players
 * @returns {number} response.data.players.high_school - High school players
 * @returns {number} response.data.players.college - College players
 * @returns {string} response.data.season - Season filter applied (or 'All')
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/team-statistics', checkPermission('reports_view'), async (req, res) => {
  try {
    const { season } = req.query;

    // Business logic: Build where clause for games
    const whereClause = { team_id: req.user.team_id };
    // Filter: Optionally filter by season
    if (season) whereClause.season = season;

    // Database: Fetch team games for win/loss record
    const games = await Game.findAll({ where: whereClause });

    // Database: Fetch active players for roster breakdown
    const players = await Player.findAll({
      where: { team_id: req.user.team_id, status: 'active' }
    });

    // Business logic: Calculate game statistics and player breakdown
    const stats = {
      games: {
        total: games.length,
        wins: games.filter(g => g.result === 'W').length,
        losses: games.filter(g => g.result === 'L').length,
        ties: games.filter(g => g.result === 'T').length,
        win_percentage: games.length > 0 ? (games.filter(g => g.result === 'W').length / games.length * 100).toFixed(1) : 0
      },
      players: {
        total: players.length,
        pitchers: players.filter(p => p.position === 'P').length,
        position_players: players.filter(p => p.position !== 'P').length,
        high_school: players.filter(p => p.school_type === 'HS').length,
        college: players.filter(p => p.school_type === 'COLL').length
      },
      season: season || 'All'
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching team statistics report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics report'
    });
  }
});

/**
 * @route GET /api/reports/scouting-analysis
 * @description Retrieves scouting analysis with aggregated metrics across scouting reports.
 *              Calculates average grades, groups reports by position, and returns recent reports.
 *              Uses a grade-to-numeric conversion for averaging letter grades (A+ = 97, A = 93, etc.).
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @param {string} [req.query.start_date] - Start date for date range filter (ISO 8601)
 * @param {string} [req.query.end_date] - End date for date range filter (ISO 8601)
 * @param {string} [req.query.position] - Position filter (currently unused in query)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Analysis data
 * @returns {number} response.data.total_reports - Total scouting reports found
 * @returns {string} response.data.average_grade - Average numeric grade (0-100 scale)
 * @returns {Object} response.data.reports_by_position - Count of reports grouped by position
 * @returns {Array<Object>} response.data.recent_reports - Last 10 scouting reports
 * @returns {Object} response.data.date_range - Applied date range filter
 * @returns {string} response.data.generated_at - Report generation timestamp
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/scouting-analysis', checkPermission('reports_view'), async (req, res) => {
  try {
    const { start_date, end_date, position } = req.query;

    console.log('Scouting analysis request - user team_id:', req.user.team_id);
    console.log('Scouting analysis request - query params:', req.query);

    // Business logic: Build where clause for date filtering
    const whereClause = {};
    if (start_date && end_date) {
      whereClause.report_date = { [Op.between]: [start_date, end_date] };
    }

    // Database: Fetch scouting reports with player info
    const reports = await ScoutingReport.findAndCountAll({
      where: whereClause,
      include: [{
        model: Player,
        // Permission: Multi-tenant isolation via Player's team_id
        where: { team_id: req.user.team_id },
        attributes: ['id', 'first_name', 'last_name', 'position', 'school_type']
      }],
      order: [['report_date', 'DESC']]
    });

    console.log('Scouting analysis query result count:', reports.count);

    // Business logic: Calculate average grade from valid grades
    const totalReports = reports.count;
    const validGrades = reports.rows.filter(r => r.overall_grade).map(r => gradeToNumeric(r.overall_grade));
    const avgGrade = validGrades.length > 0
      ? (validGrades.reduce((sum, grade) => sum + grade, 0) / validGrades.length).toFixed(1)
      : 0;

    // Business logic: Build analysis response
    const analysis = {
      total_reports: totalReports,
      average_grade: avgGrade,
      reports_by_position: {},
      recent_reports: reports.rows.slice(0, 10),
      date_range: { start_date, end_date },
      generated_at: new Date().toISOString()
    };

    // Business logic: Group reports by player position
    reports.rows.forEach(report => {
      const position = report.Player.position;
      if (!analysis.reports_by_position[position]) {
        analysis.reports_by_position[position] = 0;
      }
      analysis.reports_by_position[position]++;
    });

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching scouting analysis report:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error fetching scouting analysis report'
    });
  }
});

/**
 * @route GET /api/reports/recruitment-pipeline
 * @description Retrieves recruitment pipeline with actual database data.
 *              Returns high school recruits grouped by priority, status, and position.
 *              Uses PreferenceList association for tracking recruitment status.
 * @access Private - Requires authentication + reports_view permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('reports_view') - Report viewing permission required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Pipeline data
 * @returns {number} response.data.total_recruits - Total high school recruits
 * @returns {Object} response.data.by_priority - Counts grouped by priority (high/medium/low/unassigned)
 * @returns {number} response.data.by_priority.high - High priority recruits
 * @returns {number} response.data.by_priority.medium - Medium priority recruits
 * @returns {number} response.data.by_priority.low - Low priority recruits
 * @returns {number} response.data.by_priority.unassigned - Unassigned priority recruits
 * @returns {Object} response.data.by_status - Counts grouped by status (active/committed/declined/pending)
 * @returns {number} response.data.by_status.active - Active recruits
 * @returns {number} response.data.by_status.committed - Committed recruits
 * @returns {number} response.data.by_status.declined - Declined recruits
 * @returns {number} response.data.by_status.pending - Pending recruits
 * @returns {Object} response.data.by_position - Counts grouped by position
 * @returns {Array<Object>} response.data.recent_additions - Last 10 added recruits
 *
 * @throws {403} Forbidden - User lacks reports_view permission
 * @throws {500} Server error - Database query failure
 */
router.get('/recruitment-pipeline', checkPermission('reports_view'), async (req, res) => {
  try {
    // Database: Fetch high school recruits with preference list data
    const recruits = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        // Business logic: Only high school players for recruitment pipeline
        school_type: 'HS',
        status: 'active'
      },
      include: [{
        model: PreferenceList,
        where: { team_id: req.user.team_id },
        // Business logic: Left join - include players without preference list entries
        required: false,
        attributes: ['list_type', 'priority', 'status', 'interest_level']
      }],
      // Business logic: Newest recruits first
      order: [['created_at', 'DESC']]
    });

    // Business logic: Build pipeline statistics
    const pipeline = {
      total_recruits: recruits.length,
      by_priority: {
        high: recruits.filter(r => r.PreferenceList?.priority === 'high').length,
        medium: recruits.filter(r => r.PreferenceList?.priority === 'medium').length,
        low: recruits.filter(r => r.PreferenceList?.priority === 'low').length,
        unassigned: recruits.filter(r => !r.PreferenceList?.priority).length
      },
      by_status: {
        active: recruits.filter(r => r.PreferenceList?.status === 'active').length,
        committed: recruits.filter(r => r.PreferenceList?.status === 'committed').length,
        declined: recruits.filter(r => r.PreferenceList?.status === 'declined').length,
        pending: recruits.filter(r => !r.PreferenceList?.status || r.PreferenceList?.status === 'pending').length
      },
      by_position: {},
      recent_additions: recruits.slice(0, 10)
    };

    // Business logic: Group by position
    recruits.forEach(recruit => {
      const position = recruit.position;
      if (!pipeline.by_position[position]) {
        pipeline.by_position[position] = 0;
      }
      pipeline.by_position[position]++;
    });

    res.json({
      success: true,
      data: pipeline
    });
  } catch (error) {
    // Error: Database query failure
    console.error('Error fetching recruitment pipeline report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recruitment pipeline report'
    });
  }
});

module.exports = router;
