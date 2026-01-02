/**
 * @fileoverview Player recommendation routes for depth charts.
 * Provides intelligent player recommendations based on position fit, performance metrics,
 * experience, and health status using a multi-factor scoring algorithm.
 *
 * All routes require authentication and player assignment permissions.
 * Team isolation is enforced - users only see recommendations for their team's players.
 *
 * @module routes/depthCharts/recommendations
 * @requires express
 * @requires express-validator
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 */

const express = require('express');
const { param } = require('express-validator');
const { protect } = require('../../middleware/auth');
const { depthChartPermissions } = require('../../middleware/permissions');
const {
  DepthChart,
  DepthChartPosition,
  DepthChartPlayer,
  Player
} = require('../../models');
const { handleValidationErrors } = require('./validators');
const { getPositionMatchScore, getPerformanceScore } = require('./helpers');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route GET /api/depth-charts/:id/recommended-players/:positionId
 * @description Retrieves a ranked list of recommended players for a specific position.
 *              Uses a scoring algorithm that considers position match, performance metrics,
 *              experience (years remaining), and health status. Returns top 10 recommendations.
 *
 *              Scoring Algorithm:
 *              1. Position Match (0-100 points):
 *                 - Exact match: 100 points
 *                 - Same position group (e.g., OF for LF): 80 points
 *                 - Utility player: 60 points
 *                 - Mismatch: 20 points
 *
 *              2. Performance Score (varies by position type):
 *                 Pitchers: ERA, strikeouts, win rate
 *                 Position players: Batting avg, HR, RBI, stolen bases
 *
 *              3. Experience (0-25+ points):
 *                 +5 points per year remaining until graduation
 *
 *              4. Health (-30 to +20 points):
 *                 No medical issues: +20 points
 *                 Has medical issues: -30 points
 *
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing recommendations
 *
 * @param {number} req.params.id - Depth chart ID
 * @param {number} req.params.positionId - Position ID to get recommendations for
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Top 10 recommended players with scores
 * @returns {number} response.data[].score - Composite recommendation score
 * @returns {Array<string>} response.data[].reasons - Top 3 scoring factors
 *
 * @throws {400} Validation failed - Invalid depth chart or position ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart or position doesn't exist
 * @throws {500} Server error - Database query failure
 */
router.get('/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Verify position exists and belongs to this depth chart
      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get all team players eligible for recommendation
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Business logic: Score each player based on position fit and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Scoring component 1: Position match
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Scoring component 2: Performance metrics
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Scoring component 3: Experience (years remaining)
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            // Business logic: Prefer players with more eligibility remaining
            score += yearsRemaining * 5;
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Scoring component 4: Health status
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          // Business logic: Significant penalty for injury-prone players
          score -= 30;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          // Business logic: Limit reasons to top 3 for cleaner UI
          reasons: reasons.slice(0, 3)
        };
      });

      // Business logic: Sort by score (highest first) and return top 10
      const recommendedPlayers = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendedPlayers
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/byId/:id/recommended-players/:positionId
 * @description Alternative route to retrieve recommended players for a position.
 *              Identical functionality to GET /:id/recommended-players/:positionId.
 *              Exists to support consistent /byId/:id path pattern.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing recommendations
 *
 * @param {number} req.params.id - Depth chart ID
 * @param {number} req.params.positionId - Position ID to get recommendations for
 *
 * @returns {Object} response - Same as GET /:id/recommended-players/:positionId
 *
 * @throws {400} Validation failed - Invalid depth chart or position ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart or position doesn't exist
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id/recommended-players/:positionId',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      // Database: Verify depth chart exists and belongs to user's team
      const depthChart = await DepthChart.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id,
          is_active: true
        }
      });

      // Error: Return 404 if chart not found
      if (!depthChart) {
        return res.status(404).json({
          success: false,
          message: 'Depth chart not found'
        });
      }

      // Database: Verify position exists and belongs to this depth chart
      const position = await DepthChartPosition.findOne({
        where: {
          id: req.params.positionId,
          depth_chart_id: depthChart.id,
          is_active: true
        }
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get all team players eligible for recommendation
      const allPlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ]
      });

      // Business logic: Score each player based on position fit and performance
      const scoredPlayers = allPlayers.map(player => {
        let score = 0;
        let reasons = [];

        // Scoring component 1: Position match
        if (player.position && position.position_code) {
          const positionMatch = getPositionMatchScore(player.position, position.position_code);
          score += positionMatch.score;
          reasons.push(...positionMatch.reasons);
        }

        // Scoring component 2: Performance metrics
        const performanceScore = getPerformanceScore(player, position.position_code);
        score += performanceScore.score;
        reasons.push(...performanceScore.reasons);

        // Scoring component 3: Experience (years remaining)
        if (player.graduation_year) {
          const currentYear = new Date().getFullYear();
          const yearsRemaining = player.graduation_year - currentYear;
          if (yearsRemaining > 0) {
            score += yearsRemaining * 5;
            reasons.push(`Graduation year: ${player.graduation_year}`);
          }
        }

        // Scoring component 4: Health status
        // Note: Slightly different penalty (-10 vs -30) in this route variant
        if (!player.has_medical_issues) {
          score += 20;
          reasons.push('No medical issues');
        } else {
          score -= 10;
          reasons.push('Has medical issues');
        }

        return {
          ...player.toJSON(),
          score,
          reasons
        };
      });

      // Business logic: Sort by score (highest first) and return top 10
      const recommendations = scoredPlayers
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      console.error('Error fetching recommended players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching recommended players'
      });
    }
  }
);

module.exports = router;
