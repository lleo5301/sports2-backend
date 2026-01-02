/**
 * @fileoverview Schedule routes for teams.
 * Handles retrieval of recent and upcoming schedule events.
 * All routes enforce team isolation - users can only view their own team's schedules.
 *
 * Key features:
 * - Flattens nested schedule/section/activity structure for frontend consumption
 * - Sorts events chronologically (recent: descending, upcoming: ascending)
 * - Supports configurable result limits
 *
 * @module routes/teams/schedules
 * @requires express
 * @requires ../../middleware/auth
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { Schedule, ScheduleSection, ScheduleActivity } = require('../../models');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this module
router.use(protect);

/**
 * @route GET /api/teams/recent-schedules
 * @description Retrieves recent past schedule events for the authenticated user's team.
 *              Flattens the nested schedule/section/activity structure into a flat event list.
 *              Returns events sorted by date and time in descending order (most recent first).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.limit=5] - Maximum number of events to return
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of flattened event objects
 * @returns {string} response.data[].id - Activity ID
 * @returns {string} response.data[].title - Activity name
 * @returns {string} response.data[].date - Event date
 * @returns {string} response.data[].time - Event time
 * @returns {string} response.data[].location - Event location
 * @returns {string} response.data[].type - Section type (e.g., 'practice', 'game')
 * @returns {string} response.data[].notes - Activity notes
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/recent-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // Database: Fetch schedules with nested sections and activities for team
    // Only include active schedules with dates before today (past events)
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          // Business logic: Filter for past dates only
          [require('sequelize').Op.lt]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'DESC']]
            }
          ]
        }
      ],
      order: [['date', 'DESC']],
      limit
    });

    // Business logic: Flatten nested schedule structure into flat event list
    // This simplifies frontend consumption of schedule data
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Business logic: Sort by date and time (most recent first), then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateB - dateA; // Descending order for recent
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching recent schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent schedules'
    });
  }
});

/**
 * @route GET /api/teams/upcoming-schedules
 * @description Retrieves upcoming schedule events for the authenticated user's team.
 *              Flattens the nested schedule/section/activity structure into a flat event list.
 *              Returns events sorted by date and time in ascending order (soonest first).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.limit=5] - Maximum number of events to return
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of flattened event objects
 * @returns {string} response.data[].id - Activity ID
 * @returns {string} response.data[].title - Activity name
 * @returns {string} response.data[].date - Event date
 * @returns {string} response.data[].time - Event time
 * @returns {string} response.data[].location - Event location
 * @returns {string} response.data[].type - Section type (e.g., 'practice', 'game')
 * @returns {string} response.data[].notes - Activity notes
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/upcoming-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // Database: Fetch schedules with nested sections and activities for team
    // Only include active schedules with dates on or after today (future events)
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          // Business logic: Filter for today and future dates
          [require('sequelize').Op.gte]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'ASC']]
            }
          ]
        }
      ],
      order: [['date', 'ASC']],
      limit
    });

    // Business logic: Flatten nested schedule structure into flat event list
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Business logic: Sort by date and time (soonest first), then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateA - dateB;
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching upcoming schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming schedules'
    });
  }
});

module.exports = router;
