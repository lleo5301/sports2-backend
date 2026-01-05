/**
 * @fileoverview Schedule routes for managing team practice schedules, sections, and activities.
 * All routes in this file require authentication via the protect middleware.
 * Schedules are scoped to teams - users can only access schedules belonging to their team.
 *
 * Data Structure Hierarchy:
 * - Schedule: Top-level container with team/program info, date, and motto
 *   - ScheduleSection: Groups activities by type (general, position_players, pitchers, etc.)
 *     - ScheduleActivity: Individual scheduled activities with time, location, staff, etc.
 *
 * Deletion Behavior:
 * - Schedule: Soft delete (is_active = false) - preserves historical data
 * - Section: Hard delete with cascade - deletes all child activities
 * - Activity: Hard delete
 *
 * @module routes/schedules
 * @requires express
 * @requires express-validator
 * @requires ../models
 * @requires ../middleware/auth
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { Schedule, ScheduleSection, ScheduleActivity, User, Team } = require('../models');
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @description Validation middleware for schedule creation/update.
 * Validates required fields: team_name, program_name, date, and sections array.
 * Sections contain nested activities that are validated during creation.
 */
const validateSchedule = [
  body('team_name').notEmpty().withMessage('Team name is required'),
  body('program_name').notEmpty().withMessage('Program name is required'),
  body('date').isDate().withMessage('Valid date is required'),
  body('sections').isArray().withMessage('Sections must be an array')
];

/**
 * @description Validation middleware for section creation.
 * Validates section type against allowed values and requires a title.
 * Section types are specialized for different training groups:
 * - general: Team-wide activities
 * - position_players: Position player drills
 * - pitchers: Pitcher-specific work
 * - grinder_performance/hitting/defensive: Specialized training groups
 * - bullpen: Bullpen sessions
 * - live_bp: Live batting practice sessions
 */
const validateSection = [
  body('type').isIn([
    'general', 'position_players', 'pitchers', 'grinder_performance',
    'grinder_hitting', 'grinder_defensive', 'bullpen', 'live_bp'
  ]).withMessage('Invalid section type'),
  body('title').notEmpty().withMessage('Section title is required')
];

/**
 * @description Validation middleware for activity creation.
 * Validates required fields for individual scheduled activities.
 */
const validateActivity = [
  body('time').notEmpty().withMessage('Time is required'),
  body('activity').notEmpty().withMessage('Activity is required')
];

/**
 * @description Helper middleware to check validation results from express-validator.
 * Returns 400 error with validation details if any validation rules failed.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * @route GET /api/schedules
 * @description Retrieves a paginated list of schedules for the authenticated user's team.
 *              Supports filtering by specific date and optional team_id override.
 *              Returns schedules ordered by date (newest first), then by creation time.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=10] - Number of records per page
 * @param {string} [req.query.date] - Filter schedules by specific date (YYYY-MM-DD format)
 * @param {string} [req.query.team_id] - Optional team ID to filter by (defaults to user's team)
 *
 * @returns {Object} response
 * @returns {Array<Object>} response.data - Array of schedule objects with Creator and Team associations
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Records per page
 * @returns {number} response.pagination.total - Total number of matching records
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, date, team_id } = req.query;
    // Business logic: Calculate offset for pagination (0-indexed)
    const offset = (page - 1) * limit;

    // Business logic: Only return active (non-deleted) schedules
    const whereClause = {
      is_active: true
    };

    // Permission: Filter by specified team_id or default to user's team
    // This allows viewing schedules for teams the user may have access to
    if (team_id) {
      whereClause.team_id = team_id;
    } else {
      whereClause.team_id = req.user.team_id;
    }

    // Business logic: Apply date filter if specified for single-day view
    if (date) {
      whereClause.date = date;
    }

    // Database: Fetch schedules with count for pagination
    // Includes Creator (user who made the schedule) and Team info
    const schedules = await Schedule.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        }
      ],
      // Business logic: Order by date first (most recent), then creation time
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      data: schedules.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: schedules.count,
        pages: Math.ceil(schedules.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * @route GET /api/schedules/stats
 * @description Retrieves aggregated activity statistics for the authenticated user's team.
 *              Calculates total event count, events scheduled this week, and events this month.
 *              Uses nested includes to count activities through sections to schedules.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {Object} response.data - Statistics object
 * @returns {number} response.data.totalEvents - Total count of all scheduled activities
 * @returns {number} response.data.thisWeek - Count of activities from start of current week
 * @returns {number} response.data.thisMonth - Count of activities from start of current month
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats', async (req, res) => {
  try {
    // Business logic: Calculate date boundaries for filtering
    const today = new Date();
    const startOfWeek = new Date(today);
    // Business logic: Week starts on Sunday (day 0)
    startOfWeek.setDate(today.getDate() - today.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Database: Count all activities across all active schedules for the team
    // Uses nested includes: Activity -> Section -> Schedule (with team filter)
    const totalEvents = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true
              }
            }
          ]
        }
      ]
    });

    // Database: Count activities scheduled from start of this week onwards
    const thisWeek = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true,
                date: {
                  [require('sequelize').Op.gte]: startOfWeek
                }
              }
            }
          ]
        }
      ]
    });

    // Database: Count activities scheduled from start of this month onwards
    const thisMonth = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true,
                date: {
                  [require('sequelize').Op.gte]: startOfMonth
                }
              }
            }
          ]
        }
      ]
    });

    res.json({
      data: {
        totalEvents,
        thisWeek,
        thisMonth
      }
    });
  } catch (error) {
    console.error('Error fetching schedule stats:', error);
    res.status(500).json({ error: 'Failed to fetch schedule stats' });
  }
});

/**
 * @route GET /api/schedules/byId/:id
 * @description Retrieves a single schedule with all nested sections and activities.
 *              Provides complete hierarchical data for schedule detail view.
 *              Sections are ordered by sort_order, activities within sections by sort_order then time.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Schedule UUID
 *
 * @returns {Object} response
 * @returns {Object} response.data - Complete schedule object with nested data
 * @returns {Object} response.data.Creator - User who created the schedule
 * @returns {Object} response.data.Team - Associated team info
 * @returns {Array<Object>} response.data.ScheduleSections - Ordered array of sections
 * @returns {Array<Object>} response.data.ScheduleSections[].ScheduleActivities - Activities within each section
 *
 * @throws {404} Not found - Schedule doesn't exist, is soft-deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', async (req, res) => {
  try {
    // Database: Find schedule with full nested structure
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        is_active: true,
        // Permission: Only return schedules within user's team
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          // Business logic: Include all sections with their activities
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              // Business logic: Activities ordered by explicit sort_order, then time
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
            }
          ],
          // Business logic: Sections ordered by explicit sort_order
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    // Error: Return 404 if schedule not found (includes team access check)
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ data: schedule });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

/**
 * @route POST /api/schedules
 * @description Creates a new schedule with nested sections and activities in a single operation.
 *              Accepts a complete schedule structure and creates all related records.
 *              Sections and activities are assigned sort_order based on array position.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateSchedule - Validates required schedule fields
 * @middleware handleValidationErrors - Returns 400 if validation fails
 *
 * @param {string} req.body.team_name - Display name for the team on this schedule
 * @param {string} req.body.program_name - Program name (e.g., "Varsity Baseball")
 * @param {string} req.body.date - Schedule date in YYYY-MM-DD format
 * @param {string} [req.body.motto] - Optional motivational motto for the day
 * @param {Array<Object>} req.body.sections - Array of section objects
 * @param {string} req.body.sections[].type - Section type (general, pitchers, position_players, etc.)
 * @param {string} req.body.sections[].title - Section display title
 * @param {Array<Object>} [req.body.sections[].activities] - Activities within the section
 * @param {string} req.body.sections[].activities[].time - Activity time (e.g., "9:00 AM")
 * @param {string} req.body.sections[].activities[].activity - Activity description
 * @param {string} [req.body.sections[].activities[].location] - Activity location
 * @param {string} [req.body.sections[].activities[].staff] - Staff member responsible
 * @param {string} [req.body.sections[].activities[].group] - Player group assignment
 * @param {string} [req.body.sections[].activities[].notes] - Additional notes
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Created schedule with all nested sections and activities
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {500} Server error - Database operation failure
 */
router.post('/', validateSchedule, handleValidationErrors, async (req, res) => {
  try {
    const { team_name, program_name, date, motto, sections } = req.body;

    // Database: Create the main schedule record
    // Associates with user's team and tracks the creator
    const schedule = await Schedule.create({
      team_name,
      program_name,
      date,
      motto,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Business logic: Create nested sections and activities if provided
    // Array index determines sort_order for consistent ordering
    if (sections && sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const sectionData = sections[i];
        // Database: Create section with sort_order from array position
        const section = await ScheduleSection.create({
          schedule_id: schedule.id,
          type: sectionData.type,
          title: sectionData.title,
          sort_order: i
        });

        // Business logic: Create activities for this section if provided
        // Activity sort_order is determined by position in activities array
        if (sectionData.activities && sectionData.activities.length > 0) {
          for (let j = 0; j < sectionData.activities.length; j++) {
            const activityData = sectionData.activities[j];
            // Database: Create activity with sort_order from array position
            await ScheduleActivity.create({
              section_id: section.id,
              time: activityData.time,
              activity: activityData.activity,
              location: activityData.location || null,
              staff: activityData.staff || null,
              group: activityData.group || null,
              notes: activityData.notes || null,
              sort_order: j
            });
          }
        }
      }
    }

    // Database: Fetch the created schedule with full nested data
    const createdSchedule = await Schedule.findOne({
      where: { id: schedule.id },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['sort_order', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    res.status(201).json({
      message: 'Schedule created successfully',
      data: createdSchedule
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * @route PUT /api/schedules/:id
 * @description Updates a schedule and its sections/activities.
 *              Currently supports full replacement of sections and activities.
 *              Existing sections are deleted and new ones are created based on provided array.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateSchedule - Validates required schedule fields
 * @middleware handleValidationErrors - Returns 400 if validation fails
 *
 * @param {string} req.params.id - Schedule UUID
 * @param {string} req.body.team_name - Updated team name
 * @param {string} req.body.program_name - Updated program name
 * @param {string} req.body.date - Updated schedule date
 * @param {string} [req.body.motto] - Updated motto
 * @param {Array<Object>} req.body.sections - New sections array (replaces existing)
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Updated schedule with full nested data
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {404} Not found - Schedule doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/:id', validateSchedule, handleValidationErrors, async (req, res) => {
  try {
    // Permission: Check that schedule belongs to user's team
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if schedule not found or unauthorized
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const { team_name, program_name, date, motto, sections } = req.body;

    // Database: Update schedule basic fields
    await schedule.update({
      team_name,
      program_name,
      date,
      motto
    });

    // Business logic: Replace sections entirely if provided
    // First delete existing sections (cascades to activities)
    if (sections && sections.length >= 0) {
      await ScheduleSection.destroy({
        where: { schedule_id: schedule.id }
      });

      // Database: Create new sections from provided array
      if (sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
          const sectionData = sections[i];
          // Database: Create section with sort_order from array position
          const section = await ScheduleSection.create({
            schedule_id: schedule.id,
            type: sectionData.type,
            title: sectionData.title,
            sort_order: i
          });

          // Business logic: Create activities for this section if provided
          if (sectionData.activities && sectionData.activities.length > 0) {
            for (let j = 0; j < sectionData.activities.length; j++) {
              const activityData = sectionData.activities[j];
              // Database: Create activity with sort_order from array position
              await ScheduleActivity.create({
                section_id: section.id,
                time: activityData.time,
                activity: activityData.activity,
                location: activityData.location || null,
                staff: activityData.staff || null,
                group: activityData.group || null,
                notes: activityData.notes || null,
                sort_order: j
              });
            }
          }
        }
      }
    }

    // Database: Fetch updated schedule with full nested data
    const updatedSchedule = await Schedule.findOne({
      where: { id: schedule.id },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['sort_order', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    res.json({
      message: 'Schedule updated successfully',
      data: updatedSchedule
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * @route DELETE /api/schedules/:id
 * @description Soft deletes a schedule (sets is_active = false).
 *              Does not delete sections or activities - only marks schedule as inactive.
 *              Historical data is preserved for audit trail.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Schedule UUID
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Schedule doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/:id', async (req, res) => {
  try {
    // Permission: Check that schedule belongs to user's team
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if schedule not found or unauthorized
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Business logic: Soft delete - preserve historical data
    await schedule.update({ is_active: false });

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * @route DELETE /api/schedules/:id/sections/:sectionId
 * @description Hard deletes a section and all its nested activities.
 *              Permanently removes the section and its child records.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Schedule UUID
 * @param {string} req.params.sectionId - Section UUID
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Schedule or section doesn't exist, or schedule doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/:id/sections/:sectionId', async (req, res) => {
  try {
    // Permission: Check that schedule belongs to user's team
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if schedule not found or unauthorized
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Database: Find and delete section (cascade deletes activities)
    const section = await ScheduleSection.findOne({
      where: {
        id: req.params.sectionId,
        schedule_id: schedule.id
      }
    });

    // Error: Return 404 if section not found
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Business logic: Hard delete section (cascades to activities)
    await section.destroy();

    res.json({ message: 'Section deleted successfully' });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

/**
 * @route DELETE /api/schedules/:id/sections/:sectionId/activities/:activityId
 * @description Hard deletes a single activity from a section.
 *              Permanently removes the activity record.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Schedule UUID
 * @param {string} req.params.sectionId - Section UUID
 * @param {string} req.params.activityId - Activity UUID
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Schedule, section, or activity doesn't exist, or schedule doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/:id/sections/:sectionId/activities/:activityId', async (req, res) => {
  try {
    // Permission: Check that schedule belongs to user's team
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Return 404 if schedule not found or unauthorized
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Database: Find and delete activity
    const activity = await ScheduleActivity.findOne({
      include: [
        {
          model: ScheduleSection,
          where: {
            id: req.params.sectionId,
            schedule_id: schedule.id
          }
        }
      ],
      where: { id: req.params.activityId }
    });

    // Error: Return 404 if activity not found
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Business logic: Hard delete activity
    await activity.destroy();

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

module.exports = router;