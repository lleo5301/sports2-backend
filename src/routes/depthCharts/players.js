/**
 * @fileoverview Player assignment routes for depth charts.
 * Handles assigning and unassigning players to depth chart positions,
 * and retrieving available players for assignment.
 *
 * All routes require authentication and player assignment permissions.
 * Team isolation is enforced - users can only manage player assignments on depth charts
 * belonging to their team.
 *
 * @module routes/depthCharts/players
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
const {
  validatePlayerAssignment,
  handleValidationErrors
} = require('./validators');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route POST /api/depth-charts/positions/:positionId/players
 * @description Assigns a player to a position on the depth chart.
 *              Players are assigned with a depth order indicating their ranking within the position.
 *              Validates that the player exists, belongs to the team, and isn't already assigned.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware validatePlayerAssignment - Request body validation for assignment
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for player assignment
 *
 * @param {number} req.params.positionId - Position ID to assign player to
 * @param {number} req.body.player_id - ID of player to assign (positive integer)
 * @param {number} req.body.depth_order - Ranking within position (1 = starter, 2 = backup, etc.)
 * @param {string} [req.body.notes] - Assignment notes (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created assignment with player details
 * @returns {Object} response.data.Player - Assigned player info (name, position, etc.)
 *
 * @throws {400} Validation failed - Invalid IDs, player already assigned, or validation errors
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Position or player doesn't exist or belongs to another team
 * @throws {500} Server error - Database operation failure
 */
router.post('/positions/:positionId/players',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePlayerAssignment,
  handleValidationErrors,
  depthChartPermissions.canAssignPlayers,
  async (req, res) => {
    try {
      const { player_id, depth_order, notes } = req.body;

      // Database: Find position with team isolation via depth chart join
      const position = await DepthChartPosition.findOne({
        where: { id: req.params.positionId },
        include: [
          {
            // Permission: Verify position belongs to a chart owned by user's team
            model: DepthChart,
            where: { team_id: req.user.team_id, is_active: true }
          }
        ]
      });

      // Error: Return 404 if position not found
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Validation: Check if player exists and belongs to the team
      const player = await Player.findOne({
        where: {
          id: player_id,
          // Permission: Player must belong to user's team
          team_id: req.user.team_id
        }
      });

      // Error: Return 404 if player not found
      if (!player) {
        return res.status(404).json({
          success: false,
          message: 'Player not found'
        });
      }

      // Business logic: Check for duplicate assignment to same position
      // A player can be assigned to multiple positions, but not twice to the same one
      const existingAssignment = await DepthChartPlayer.findOne({
        where: {
          depth_chart_id: position.depth_chart_id,
          position_id: position.id,
          player_id,
          is_active: true
        }
      });

      // Error: Prevent duplicate assignments to same position
      if (existingAssignment) {
        return res.status(400).json({
          success: false,
          message: 'Player is already assigned to this position'
        });
      }

      // Database: Create the player assignment with tracking metadata
      const assignment = await DepthChartPlayer.create({
        depth_chart_id: position.depth_chart_id,
        position_id: position.id,
        player_id,
        depth_order,
        notes,
        // Business logic: Track who made the assignment
        assigned_by: req.user.id
      });

      // Database: Fetch the assignment with player details for response
      const createdAssignment = await DepthChartPlayer.findByPk(assignment.id, {
        include: [
          {
            model: Player,
            attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'graduation_year']
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: createdAssignment
      });
    } catch (error) {
      console.error('Error assigning player:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning player'
      });
    }
  }
);

/**
 * @route DELETE /api/depth-charts/players/:assignmentId
 * @description Removes a player assignment from a depth chart position.
 *              Soft deletes by setting is_active to false, preserving assignment history.
 *              Assignment must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and player unassignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('assignmentId') - Validates assignment ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canUnassignPlayers - Permission check for player removal
 *
 * @param {number} req.params.assignmentId - Player assignment ID to remove
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid assignment ID
 * @throws {403} Forbidden - User lacks player unassignment permission
 * @throws {404} Not found - Assignment doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.delete('/players/:assignmentId',
  param('assignmentId').isInt({ min: 1 }).withMessage('Invalid assignment ID'),
  handleValidationErrors,
  depthChartPermissions.canUnassignPlayers,
  async (req, res) => {
    try {
      // Database: Find assignment with team isolation via position and depth chart joins
      const assignment = await DepthChartPlayer.findOne({
        where: { id: req.params.assignmentId },
        include: [
          {
            model: DepthChartPosition,
            required: true,
            include: [
              {
                // Permission: Verify assignment belongs to a chart owned by user's team
                model: DepthChart,
                required: true,
                where: { team_id: req.user.team_id, is_active: true }
              }
            ]
          }
        ]
      });

      // Error: Return 404 if assignment not found or belongs to another team
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }

      // Business logic: Soft delete preserves assignment history for auditing
      await assignment.update({ is_active: false });

      res.json({
        success: true,
        message: 'Player assignment removed successfully'
      });
    } catch (error) {
      console.error('Error removing player assignment:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing player assignment'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/:id/available-players
 * @description Retrieves a list of players available for assignment to the specified depth chart.
 *              Returns only active players from the team who are not already assigned to this chart.
 *              Includes player stats for informed assignment decisions.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing available players
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of available player objects
 * @returns {number} response.data[].id - Player ID
 * @returns {string} response.data[].first_name - Player first name
 * @returns {string} response.data[].last_name - Player last name
 * @returns {string} response.data[].position - Player's primary position
 * @returns {Object} response.data[].batting/pitching stats - Player statistics
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
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

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      // Business logic: Build exclusion list of already-assigned players
      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get available players (active, on team, not assigned to this chart)
      const availablePlayers = await Player.findAll({
        where: {
          team_id: req.user.team_id,
          // Business logic: Exclude players already on this depth chart
          id: { [require('sequelize').Op.notIn]: assignedPlayerIds },
          status: 'active'
        },
        // Business logic: Include stats for assignment decision-making
        attributes: [
          'id', 'first_name', 'last_name', 'position', 'school_type',
          'graduation_year', 'height', 'weight', 'batting_avg', 'home_runs',
          'rbi', 'stolen_bases', 'era', 'wins', 'losses', 'strikeouts',
          'has_medical_issues', 'has_comparison', 'status'
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

/**
 * @route GET /api/depth-charts/byId/:id/available-players
 * @description Alternative route to retrieve players available for assignment.
 *              Identical functionality to GET /:id/available-players.
 *              Exists to support consistent /byId/:id path pattern.
 * @access Private - Requires authentication and player assignment permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canAssignPlayers - Permission check for viewing available players
 *
 * @param {number} req.params.id - Depth chart ID
 *
 * @returns {Object} response - Same as GET /:id/available-players
 *
 * @throws {400} Validation failed - Invalid depth chart ID
 * @throws {403} Forbidden - User lacks player assignment permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id/available-players',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
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

      // Database: Get all player IDs already assigned to this depth chart
      const assignedPlayers = await DepthChartPlayer.findAll({
        where: {
          depth_chart_id: depthChart.id,
          is_active: true
        },
        attributes: ['player_id']
      });

      // Business logic: Build exclusion list of already-assigned players
      const assignedPlayerIds = assignedPlayers.map(ap => ap.player_id);

      // Database: Get available players (active, on team, not assigned to this chart)
      const availablePlayers = await Player.findAll({
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
        ],
        order: [['first_name', 'ASC'], ['last_name', 'ASC']]
      });

      res.json({
        success: true,
        data: availablePlayers
      });
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching available players'
      });
    }
  }
);

module.exports = router;
