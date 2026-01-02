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
const { body, validationResult, query } = require('express-validator');
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

        // Business logic: Create all activities for this section using bulk insert
        if (sectionData.activities && sectionData.activities.length > 0) {
          const activities = sectionData.activities.map((activity, index) => ({
            section_id: section.id,
            time: activity.time,
            activity: activity.activity,
            location: activity.location || null,
            staff: activity.staff || null,
            group: activity.group || null,
            notes: activity.notes || null,
            // Business logic: Sort order from array position for consistent ordering
            sort_order: index
          }));

          // Database: Bulk create activities for efficiency
          await ScheduleActivity.bulkCreate(activities);
        }
      }
    }

    // Database: Fetch the complete created schedule with all associations
    // This ensures the response includes all nested data with proper formatting
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
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    // Notification: Fire-and-forget notification to team members
    // This does not block the response - errors are handled gracefully in the service
    notificationService.sendSchedulePublishedNotification(
      createdSchedule,
      req.user.team_id,
      req.user.id
    );

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
 * @route PUT /api/schedules/byId/:id
 * @description Updates an existing schedule with complete replacement of sections and activities.
 *              This is a full replacement operation - all existing sections and activities are deleted
 *              and recreated from the request body. Use this for complete schedule restructuring.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateSchedule - Validates required schedule fields
 * @middleware handleValidationErrors - Returns 400 if validation fails
 *
 * @param {string} req.params.id - Schedule UUID to update
 * @param {string} req.body.team_name - Display name for the team on this schedule
 * @param {string} req.body.program_name - Program name
 * @param {string} req.body.date - Schedule date in YYYY-MM-DD format
 * @param {string} [req.body.motto] - Optional motivational motto
 * @param {Array<Object>} req.body.sections - Complete array of sections (replaces existing)
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Updated schedule with all nested sections and activities
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {404} Not found - Schedule doesn't exist, is soft-deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/byId/:id', validateSchedule, handleValidationErrors, async (req, res) => {
  try {
    const { team_name, program_name, date, motto, sections } = req.body;

    // Database: Verify schedule exists and user has access
    const existingSchedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow updates to schedules within user's team
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Error: Return 404 if schedule not found (includes team access check)
    if (!existingSchedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Database: Update the main schedule fields
    await existingSchedule.update({
      team_name,
      program_name,
      date,
      motto
    });

    // Business logic: Full replacement strategy - delete all existing sections
    // Cascade deletion will automatically remove all associated activities
    await ScheduleSection.destroy({
      where: { schedule_id: existingSchedule.id }
    });

    // Business logic: Recreate sections and activities from request body
    // This ensures clean slate with new structure and ordering
    if (sections && sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const sectionData = sections[i];
        const section = await ScheduleSection.create({
          schedule_id: existingSchedule.id,
          type: sectionData.type,
          title: sectionData.title,
          sort_order: i
        });

        // Create activities for this section
        if (sectionData.activities && sectionData.activities.length > 0) {
          const activities = sectionData.activities.map((activity, index) => ({
            section_id: section.id,
            time: activity.time,
            activity: activity.activity,
            location: activity.location || null,
            staff: activity.staff || null,
            group: activity.group || null,
            notes: activity.notes || null,
            sort_order: index
          }));

          await ScheduleActivity.bulkCreate(activities);
        }
      }
    }

    // Database: Fetch the complete updated schedule with all associations
    const updatedSchedule = await Schedule.findOne({
      where: { id: existingSchedule.id },
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
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
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
 * @route DELETE /api/schedules/byId/:id
 * @description Soft deletes a schedule by setting is_active to false.
 *              The schedule and all associated data remain in the database for historical purposes.
 *              Soft-deleted schedules are excluded from all GET queries via the is_active filter.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Schedule UUID to delete
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Schedule doesn't exist, is already soft-deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/byId/:id', async (req, res) => {
  try {
    // Database: Find schedule with team isolation and active status check
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow deletion of schedules within user's team
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Error: Return 404 if schedule not found (includes team access check)
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Business logic: Soft delete by setting is_active = false
    // Preserves historical data while hiding from active queries
    await schedule.update({ is_active: false });

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * @route POST /api/schedules/:id/sections
 * @description Adds a new section to an existing schedule.
 *              Automatically assigns the next available sort_order for proper ordering.
 *              Use this for incremental section additions without affecting existing sections.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateSection - Validates section type and title
 * @middleware handleValidationErrors - Returns 400 if validation fails
 *
 * @param {string} req.params.id - Schedule UUID to add section to
 * @param {string} req.body.type - Section type (general, pitchers, position_players, etc.)
 * @param {string} req.body.title - Section display title
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Created section object
 *
 * @throws {400} Validation failed - Invalid section type or missing title
 * @throws {404} Not found - Schedule doesn't exist, is soft-deleted, or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/:id/sections', validateSection, handleValidationErrors, async (req, res) => {
  try {
    const { type, title } = req.body;

    // Database: Verify schedule exists and user has access
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        // Permission: Only allow adding sections to user's team schedules
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Error: Return 404 if schedule not found
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Business logic: Get the highest current sort_order to append new section at the end
    const lastSection = await ScheduleSection.findOne({
      where: { schedule_id: schedule.id },
      order: [['sort_order', 'DESC']]
    });

    // Business logic: New section gets next sort_order (0 if first section)
    const sortOrder = lastSection ? lastSection.sort_order + 1 : 0;

    // Database: Create the new section
    const section = await ScheduleSection.create({
      schedule_id: schedule.id,
      type,
      title,
      sort_order: sortOrder
    });

    res.status(201).json({
      message: 'Section added successfully',
      data: section
    });
  } catch (error) {
    console.error('Error adding section:', error);
    res.status(500).json({ error: 'Failed to add section' });
  }
});

/**
 * @route POST /api/schedules/sections/:sectionId/activities
 * @description Adds a new activity to an existing section.
 *              Verifies section belongs to a schedule in the user's team.
 *              Automatically assigns the next available sort_order.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 * @middleware validateActivity - Validates time and activity fields
 * @middleware handleValidationErrors - Returns 400 if validation fails
 *
 * @param {string} req.params.sectionId - Section UUID to add activity to
 * @param {string} req.body.time - Activity time (e.g., "9:00 AM")
 * @param {string} req.body.activity - Activity description/name
 * @param {string} [req.body.location] - Activity location
 * @param {string} [req.body.staff] - Staff member responsible
 * @param {string} [req.body.group] - Player group assignment
 * @param {string} [req.body.notes] - Additional notes
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Created activity object
 *
 * @throws {400} Validation failed - Missing time or activity description
 * @throws {404} Not found - Section doesn't exist or parent schedule doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/sections/:sectionId/activities', validateActivity, handleValidationErrors, async (req, res) => {
  try {
    const { time, activity, location, staff, group, notes } = req.body;

    // Database: Verify section exists and belongs to user's team
    // Uses nested include to check through Section -> Schedule -> Team
    const section = await ScheduleSection.findOne({
      include: [
        {
          model: Schedule,
          where: {
            // Permission: Verify section belongs to user's team schedule
            team_id: req.user.team_id,
            is_active: true
          }
        }
      ],
      where: { id: req.params.sectionId }
    });

    // Error: Return 404 if section not found or unauthorized
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Business logic: Get the highest current sort_order to append new activity at the end
    const lastActivity = await ScheduleActivity.findOne({
      where: { section_id: section.id },
      order: [['sort_order', 'DESC']]
    });

    // Business logic: New activity gets next sort_order (0 if first activity)
    const sortOrder = lastActivity ? lastActivity.sort_order + 1 : 0;

    // Database: Create the new activity
    const newActivity = await ScheduleActivity.create({
      section_id: section.id,
      time,
      activity,
      location,
      staff,
      group,
      notes,
      sort_order: sortOrder
    });

    res.status(201).json({
      message: 'Activity added successfully',
      data: newActivity
    });
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

/**
 * @route DELETE /api/schedules/sections/:sectionId
 * @description Hard deletes a section and all its associated activities.
 *              Verifies section belongs to a schedule in the user's team before deletion.
 *              Cascade deletion automatically removes all child activities.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.sectionId - Section UUID to delete
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Section doesn't exist or parent schedule doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/sections/:sectionId', async (req, res) => {
  try {
    // Database: Verify section exists and belongs to user's team
    const section = await ScheduleSection.findOne({
      include: [
        {
          model: Schedule,
          where: {
            // Permission: Verify section belongs to user's team schedule
            team_id: req.user.team_id,
            is_active: true
          }
        }
      ],
      where: { id: req.params.sectionId }
    });

    // Error: Return 404 if section not found or unauthorized
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Database: Hard delete the section
    // Business logic: Cascade deletion will automatically remove all child activities
    await section.destroy();

    res.json({ message: 'Section deleted successfully' });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

/**
 * @route DELETE /api/schedules/activities/:activityId
 * @description Hard deletes a single activity from a section.
 *              Verifies activity belongs to a section within the user's team before deletion.
 *              Uses nested includes to validate ownership through Section -> Schedule -> Team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.activityId - Activity UUID to delete
 *
 * @returns {Object} response
 * @returns {string} response.message - Success confirmation
 *
 * @throws {404} Not found - Activity doesn't exist or parent schedule doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/activities/:activityId', async (req, res) => {
  try {
    // Database: Verify activity exists and belongs to user's team
    // Uses doubly-nested include to check Activity -> Section -> Schedule
    const activity = await ScheduleActivity.findOne({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                // Permission: Verify activity belongs to user's team schedule
                team_id: req.user.team_id,
                is_active: true
              }
            }
          ]
        }
      ],
      where: { id: req.params.activityId }
    });

    // Error: Return 404 if activity not found or unauthorized
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Database: Hard delete the activity
    await activity.destroy();

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

/**
 * @route GET /api/schedules/export-pdf
 * @description Exports all team schedules as a printable HTML document.
 *              Generates a formatted HTML page with print-friendly CSS styles.
 *              Includes all schedules, sections, and activities in table format.
 *
 *              Note: Currently returns HTML that can be printed as PDF from browser.
 *              For true PDF generation, would need puppeteer, jsPDF, or similar library.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {string} HTML document - Complete printable schedule document
 * @header Content-Type: text/html
 * @header Content-Disposition: attachment; filename="team-schedules.html"
 *
 * @throws {500} Server error - Database query or HTML generation failure
 */
router.get('/export-pdf', async (req, res) => {
  try {
    // Database: Fetch all team schedules with full nested structure
    // Note: No is_active filter - exports all schedules including inactive
    const schedules = await Schedule.findAll({
      where: { team_id: req.user.team_id },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              // Business logic: Order activities by time for chronological display
              order: [['time', 'ASC']]
            }
          ]
        }
      ],
      // Business logic: Order schedules by date, most recent first
      order: [['date', 'DESC']]
    });

    // Business logic: Build HTML document with print-friendly styling
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Team Schedules</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .schedule { margin-bottom: 30px; border: 1px solid #ddd; padding: 20px; }
          .header { background: #f5f5f5; padding: 10px; margin: -20px -20px 20px -20px; }
          .section { margin-bottom: 20px; }
          .activity { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
          .time { font-weight: bold; min-width: 80px; }
          .activity-name { flex: 1; }
          .location { font-style: italic; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          /* Print-specific styles for proper page breaks */
          @media print {
            body { margin: 0; }
            .schedule { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>Team Schedules</h1>
    `;

    // Business logic: Generate HTML for each schedule with sections and activities
    schedules.forEach(schedule => {
      html += `
        <div class="schedule">
          <div class="header">
            <h2>${schedule.team_name} - ${schedule.program_name}</h2>
            <p><strong>Date:</strong> ${new Date(schedule.date).toLocaleDateString()}</p>
            ${schedule.motto ? `<p><strong>Motto:</strong> ${schedule.motto}</p>` : ''}
          </div>
      `;

      // Business logic: Render sections with activities in table format
      if (schedule.ScheduleSections && schedule.ScheduleSections.length > 0) {
        schedule.ScheduleSections.forEach(section => {
          html += `
            <div class="section">
              <h3>${section.title}</h3>
              ${section.ScheduleActivities && section.ScheduleActivities.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Activity</th>
                      <th>Location</th>
                      <th>Staff/Group</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${section.ScheduleActivities.map(activity => `
                      <tr>
                        <td>${activity.time}</td>
                        <td>${activity.activity}</td>
                        <td>${activity.location || ''}</td>
                        <td>${activity.staff || activity.group || ''}</td>
                        <td>${activity.notes || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p>No activities scheduled</p>'}
            </div>
          `;
        });
      } else {
        html += '<p>No sections defined</p>';
      }

      html += '</div>';
    });

    html += `
        </body>
      </html>
    `;

    // Business logic: Set headers for HTML file download
    // Browser can then print-to-PDF or save directly
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename="team-schedules.html"');
    res.send(html);

  } catch (error) {
    console.error('Error exporting schedules:', error);
    res.status(500).json({ error: 'Failed to export schedules' });
  }
});

module.exports = router;
