/**
 * @fileoverview Position management routes for depth charts.
 * Handles adding, updating, and deleting positions on depth charts.
 * Positions represent slots in the depth chart where players can be assigned.
 *
 * All routes require authentication and position management permissions.
 * Team isolation is enforced - users can only manage positions on depth charts
 * belonging to their team.
 *
 * @module routes/depthCharts/positions
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
  DepthChartPosition
} = require('../../models');
const {
  validatePosition,
  handleValidationErrors
} = require('./validators');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route POST /api/depth-charts/:id/positions
 * @description Adds a new position to an existing depth chart.
 *              Positions represent slots in the depth chart where players can be assigned.
 *              Supports customization of visual appearance (color, icon) and ordering.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('id') - Validates depth chart ID is a positive integer
 * @middleware validatePosition - Request body validation for position fields
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.id - Depth chart ID to add position to
 * @param {string} req.body.position_code - Position code (1-10 chars, e.g., 'P', 'C', '1B')
 * @param {string} req.body.position_name - Display name (1-50 chars, e.g., 'Pitcher')
 * @param {string} [req.body.color] - Hex color code (e.g., '#EF4444')
 * @param {string} [req.body.icon] - Icon name (max 50 chars)
 * @param {number} [req.body.sort_order] - Display order (non-negative integer)
 * @param {number} [req.body.max_players] - Maximum players allowed (positive integer)
 * @param {string} [req.body.description] - Position description (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Created position object
 *
 * @throws {400} Validation failed - Invalid depth chart ID or request body
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Depth chart doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/:id/positions',
  param('id').isInt({ min: 1 }).withMessage('Invalid depth chart ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
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

      // Database: Create new position linked to the depth chart
      const position = await DepthChartPosition.create({
        depth_chart_id: depthChart.id,
        ...req.body
      });

      res.status(201).json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error adding position:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding position'
      });
    }
  }
);

/**
 * @route PUT /api/depth-charts/positions/:positionId
 * @description Updates an existing position's properties.
 *              Supports updating code, name, visual styling, and ordering.
 *              Position must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware validatePosition - Request body validation for position fields
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.positionId - Position ID to update
 * @param {string} [req.body.position_code] - Updated position code (1-10 chars)
 * @param {string} [req.body.position_name] - Updated display name (1-50 chars)
 * @param {string} [req.body.color] - Updated hex color code
 * @param {string} [req.body.icon] - Updated icon name
 * @param {number} [req.body.sort_order] - Updated display order
 * @param {number} [req.body.max_players] - Updated maximum players allowed
 * @param {string} [req.body.description] - Updated position description
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated position object
 *
 * @throws {400} Validation failed - Invalid position ID or request body
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Position doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.put('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  validatePosition,
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
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

      // Error: Return 404 if position not found or belongs to another team
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Database: Apply updates to the position
      await position.update(req.body);

      res.json({
        success: true,
        data: position
      });
    } catch (error) {
      console.error('Error updating position:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating position'
      });
    }
  }
);

/**
 * @route DELETE /api/depth-charts/positions/:positionId
 * @description Soft deletes a position by setting is_active to false.
 *              Position data and player assignments are preserved but hidden.
 *              Position must belong to a depth chart owned by the user's team.
 * @access Private - Requires authentication and position management permission
 * @middleware protect - JWT authentication required
 * @middleware param('positionId') - Validates position ID is a positive integer
 * @middleware handleValidationErrors - Validation error handling
 * @middleware depthChartPermissions.canManagePositions - Permission check for position management
 *
 * @param {number} req.params.positionId - Position ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {400} Validation failed - Invalid position ID
 * @throws {403} Forbidden - User lacks position management permission
 * @throws {404} Not found - Position doesn't exist or belongs to another team's chart
 * @throws {500} Server error - Database operation failure
 */
router.delete('/positions/:positionId',
  param('positionId').isInt({ min: 1 }).withMessage('Invalid position ID'),
  handleValidationErrors,
  depthChartPermissions.canManagePositions,
  async (req, res) => {
    try {
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

      // Error: Return 404 if position not found or belongs to another team
      if (!position) {
        return res.status(404).json({
          success: false,
          message: 'Position not found'
        });
      }

      // Business logic: Soft delete preserves data and player assignment history
      await position.update({ is_active: false });

      res.json({
        success: true,
        message: 'Position deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting position:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting position'
      });
    }
  }
);

module.exports = router;
