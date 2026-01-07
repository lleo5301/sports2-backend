/**
 * @fileoverview Schedule Events routes for managing calendar events associated with schedule templates.
 * All routes in this file require authentication via the protect middleware.
 * Events are scoped to teams - users can only access events belonging to their team.
 *
 * Data Structure:
 * - ScheduleEvent: Top-level event definition with default time/location and metadata
 *   - ScheduleEventDate: Individual occurrences of the event with optional overrides
 *
 * Event Date Management:
 * Events support multiple occurrence dates with per-date overrides for:
 * - Start/end times (override the event's default times)
 * - Location (override the event's default location)
 * - Notes (date-specific notes)
 *
 * This allows a single event definition (e.g., "Weekly Practice") to be scheduled
 * on multiple dates with variations for specific occurrences.
 *
 * Deletion Behavior:
 * - ScheduleEvent: Hard delete with cascade - removes all associated event dates
 * - ScheduleEventDate: Hard delete
 *
 * @module routes/scheduleEvents
 * @requires express
 * @requires express-validator
 * @requires ../middleware/auth
 * @requires ../middleware/permissions
 * @requires ../models
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { ScheduleEvent, ScheduleEventDate, Location, User, ScheduleTemplate } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

/**
 * @description Validation middleware for schedule event creation.
 * Validates all event fields and the required event_dates array.
 *
 * Event Types:
 * - practice: Regular team practice session
 * - game: Scheduled game or match
 * - scrimmage: Inter-squad or informal competition
 * - tournament: Tournament participation
 * - meeting: Team meetings (film sessions, strategy, etc.)
 * - training: Specialized training sessions
 * - conditioning: Physical conditioning workouts
 * - team_building: Team bonding activities
 * - other: Miscellaneous events
 *
 * Priority Levels:
 * - low: Optional attendance
 * - medium: Standard importance (default)
 * - high: Important event, attendance expected
 * - critical: Mandatory attendance (games, important meetings)
 *
 * Event Dates Array:
 * Each event must have at least one scheduled date. Dates can include overrides
 * for time and location to handle variations in recurring events.
 */
const validateScheduleEventCreate = [
  // Validation: Title is required and must be reasonable length
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  // Validation: Description is optional with max length
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  // Validation: Event type must be one of the predefined types
  body('event_type').optional().isIn(['practice', 'game', 'scrimmage', 'tournament', 'meeting', 'training', 'conditioning', 'team_building', 'other']).withMessage('Invalid event type'),
  // Validation: Schedule template is required - links event to a template
  body('schedule_template_id').isInt({ min: 1 }).withMessage('Schedule template ID must be a positive integer'),
  // Validation: Location is optional - can be overridden per date
  body('location_id').optional().isInt({ min: 1 }).withMessage('Location ID must be a positive integer'),
  // Validation: Time format HH:MM (24-hour)
  body('start_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('end_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  // Validation: Duration in minutes (1 minute to 24 hours max)
  body('duration_minutes').optional().isInt({ min: 1, max: 1440 }).withMessage('Duration must be between 1 and 1440 minutes'),
  // Validation: Recurring pattern is optional JSON object for future recurring support
  body('recurring_pattern').optional().isObject().withMessage('Recurring pattern must be an object'),
  // Validation: Equipment list for event preparation
  body('required_equipment').optional().isArray().withMessage('Required equipment must be an array'),
  // Validation: Participant limit for capacity planning
  body('max_participants').optional().isInt({ min: 1 }).withMessage('Max participants must be a positive integer'),
  // Validation: Target groups (e.g., ['varsity', 'pitchers']) for filtering
  body('target_groups').optional().isArray().withMessage('Target groups must be an array'),
  // Validation: Notes for event preparation/setup
  body('preparation_notes').optional().trim().isLength({ max: 1000 }).withMessage('Preparation notes must be less than 1000 characters'),
  // Validation: Priority affects display ordering and notifications
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority level'),
  // Validation: At least one event date is required
  body('event_dates').isArray({ min: 1 }).withMessage('Event dates array is required and must have at least one date'),
  // Validation: Each date must be valid ISO8601 format
  body('event_dates.*.event_date').isISO8601().withMessage('Event date must be a valid date'),
  // Validation: Time overrides allow per-date customization
  body('event_dates.*.start_time_override').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time override must be in HH:MM format'),
  body('event_dates.*.end_time_override').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time override must be in HH:MM format'),
  // Validation: Location override allows different venue for specific dates
  body('event_dates.*.location_id_override').optional().isInt({ min: 1 }).withMessage('Location ID override must be a positive integer'),
  // Validation: Date-specific notes (e.g., "Bring extra gear", "Early start")
  body('event_dates.*.notes').optional().trim().isLength({ max: 500 }).withMessage('Date notes must be less than 500 characters')
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
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/schedule-events
 * @description Retrieves a paginated list of schedule events for the authenticated user's team.
 *              Supports filtering by template, event type, location, and date range.
 *              Returns events with full associations including template, location, dates, and creator.
 *              Date filtering is applied to the event dates, allowing calendar-style queries.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.schedule_template_id] - Filter by specific schedule template
 * @param {string} [req.query.event_type] - Filter by event type (practice, game, meeting, etc.)
 * @param {number} [req.query.location_id] - Filter by default location
 * @param {string} [req.query.start_date] - Filter event dates starting from this date (YYYY-MM-DD)
 * @param {string} [req.query.end_date] - Filter event dates ending at this date (YYYY-MM-DD)
 * @param {number} [req.query.page=1] - Page number for pagination (1-indexed)
 * @param {number} [req.query.limit=50] - Number of records per page (max recommended: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of schedule event objects
 * @returns {Object} response.data[].ScheduleTemplate - Associated template info (id, name)
 * @returns {Object} response.data[].Location - Default location info (id, name, type, address)
 * @returns {Array<Object>} response.data[].EventDates - Array of scheduled dates with optional overrides
 * @returns {Object} response.data[].Creator - User who created the event
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
    const {
      schedule_template_id,
      event_type,
      location_id,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    // Permission: Filter events to user's team only (multi-tenant isolation)
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply optional filters to narrow results
    if (schedule_template_id) {
      whereClause.schedule_template_id = schedule_template_id;
    }

    if (event_type) {
      whereClause.event_type = event_type;
    }

    if (location_id) {
      whereClause.location_id = location_id;
    }

    // Business logic: Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Database: Fetch events with all associations for complete data
    const { count, rows: events } = await ScheduleEvent.findAndCountAll({
      where: whereClause,
      include: [
        {
          // Business logic: Include template name for display
          model: ScheduleTemplate,
          attributes: ['id', 'name']
        },
        {
          // Business logic: Include default location details
          model: Location,
          attributes: ['id', 'name', 'location_type', 'address']
        },
        {
          // Business logic: Include event dates with optional date range filter
          // required: false ensures events are returned even with no matching dates
          model: ScheduleEventDate,
          as: 'EventDates',
          where: start_date && end_date ? {
            // Business logic: Filter dates within specified range for calendar views
            event_date: {
              [Op.between]: [start_date, end_date]
            }
          } : undefined,
          required: false,
          include: [
            {
              // Business logic: Include override location for date-specific venues
              model: Location,
              as: 'OverrideLocation',
              attributes: ['id', 'name', 'location_type', 'address']
            }
          ]
        },
        {
          // Business logic: Include creator info for audit trail
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      // Business logic: Order by creation date, most recent first
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get schedule events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedule events'
    });
  }
});

/**
 * @route GET /api/schedule-events/:id
 * @description Retrieves a single schedule event with all associated data.
 *              Returns complete event information including template, location,
 *              all scheduled dates (with their overrides), and creator info.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} req.params.id - Schedule event ID
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Complete schedule event object
 * @returns {number} response.data.id - Event ID
 * @returns {string} response.data.title - Event title
 * @returns {string} response.data.description - Event description
 * @returns {string} response.data.event_type - Type of event
 * @returns {string} response.data.start_time - Default start time
 * @returns {string} response.data.end_time - Default end time
 * @returns {number} response.data.duration_minutes - Event duration
 * @returns {Object} response.data.recurring_pattern - Recurring pattern settings
 * @returns {Array<string>} response.data.required_equipment - List of required equipment
 * @returns {number} response.data.max_participants - Maximum participant count
 * @returns {Array<string>} response.data.target_groups - Target participant groups
 * @returns {string} response.data.preparation_notes - Notes for event preparation
 * @returns {string} response.data.priority - Event priority level
 * @returns {Object} response.data.ScheduleTemplate - Associated template (id, name)
 * @returns {Object} response.data.Location - Default location details
 * @returns {Array<Object>} response.data.EventDates - All scheduled occurrences
 * @returns {Object} response.data.Creator - User who created the event
 *
 * @throws {400} Invalid event ID - Parameter validation failed
 * @throws {404} Not found - Event doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id', param('id').isInt().withMessage('Event ID must be an integer'), async (req, res) => {
  try {
    // Validation: Check for parameter validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID',
        errors: errors.array()
      });
    }

    // Database: Fetch event with all associations
    const event = await ScheduleEvent.findOne({
      where: {
        id: req.params.id,
        // Permission: Only return events within user's team
        team_id: req.user.team_id
      },
      include: [
        {
          model: ScheduleTemplate,
          attributes: ['id', 'name']
        },
        {
          model: Location,
          attributes: ['id', 'name', 'location_type', 'address']
        },
        {
          // Business logic: Include all event dates with their overrides
          model: ScheduleEventDate,
          as: 'EventDates',
          include: [
            {
              model: Location,
              as: 'OverrideLocation',
              attributes: ['id', 'name', 'location_type', 'address']
            }
          ]
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Error: Return 404 if event not found (includes team access check)
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Schedule event not found'
      });
    }

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Get schedule event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schedule event'
    });
  }
});

/**
 * @route POST /api/schedule-events
 * @description Creates a new schedule event with associated dates.
 *              Validates that the schedule template and location belong to the user's team.
 *              Event dates are created in bulk for efficiency.
 *
 *              Event Date Override Pattern:
 *              Each event date can override the event's default time and location.
 *              This supports recurring events where specific occurrences differ:
 *              - Regular practice at Field A, but one date at Field B due to maintenance
 *              - Weekly meeting at 3pm, but moved to 4pm for one date
 *
 * @access Private - Requires authentication and schedule_create permission
 * @middleware protect - JWT authentication required
 * @middleware validateScheduleEventCreate - Validates all event fields
 * @middleware handleValidationErrors - Returns 400 if validation fails
 * @middleware checkPermission('schedule_create') - Requires schedule creation permission
 *
 * @param {string} req.body.title - Event title (1-200 characters)
 * @param {string} [req.body.description] - Event description (max 1000 characters)
 * @param {string} [req.body.event_type] - Event type (practice, game, meeting, etc.)
 * @param {number} req.body.schedule_template_id - ID of associated schedule template
 * @param {number} [req.body.location_id] - Default location ID
 * @param {string} [req.body.start_time] - Default start time (HH:MM format)
 * @param {string} [req.body.end_time] - Default end time (HH:MM format)
 * @param {number} [req.body.duration_minutes] - Event duration in minutes
 * @param {Object} [req.body.recurring_pattern] - Pattern for recurring events
 * @param {Array<string>} [req.body.required_equipment] - List of required equipment
 * @param {number} [req.body.max_participants] - Maximum participant count
 * @param {Array<string>} [req.body.target_groups] - Target participant groups
 * @param {string} [req.body.preparation_notes] - Notes for event preparation
 * @param {string} [req.body.priority] - Priority level (low, medium, high, critical)
 * @param {Array<Object>} req.body.event_dates - Array of event date objects (min 1)
 * @param {string} req.body.event_dates[].event_date - Date for this occurrence (ISO8601)
 * @param {string} [req.body.event_dates[].start_time_override] - Override start time
 * @param {string} [req.body.event_dates[].end_time_override] - Override end time
 * @param {number} [req.body.event_dates[].location_id_override] - Override location ID
 * @param {string} [req.body.event_dates[].notes] - Date-specific notes
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Created event with all associations
 *
 * @throws {400} Validation failed - Missing or invalid required fields
 * @throws {404} Not found - Schedule template or location not found or not in user's team
 * @throws {500} Server error - Database operation failure
 */
router.post('/', validateScheduleEventCreate, handleValidationErrors, checkPermission('schedule_create'), async (req, res) => {
  try {
    // Business logic: Separate event dates from main event data
    const { event_dates, ...eventData } = req.body;

    // Permission: Verify schedule template belongs to user's team
    // This ensures events are linked to authorized templates only
    const template = await ScheduleTemplate.findOne({
      where: {
        id: eventData.schedule_template_id,
        team_id: req.user.team_id
      }
    });

    // Error: Template not found or not in user's team
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Schedule template not found or does not belong to your team'
      });
    }

    // Permission: Verify location belongs to user's team (if provided)
    // Locations are team-specific resources
    if (eventData.location_id) {
      const location = await Location.findOne({
        where: {
          id: eventData.location_id,
          team_id: req.user.team_id
        }
      });

      // Error: Location not found or not in user's team
      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found or does not belong to your team'
        });
      }
    }

    // Database: Create the main event record
    // Associates with user's team and tracks the creator
    const event = await ScheduleEvent.create({
      ...eventData,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Bulk create event dates for efficiency
    // Each date inherits team_id and created_by from parent event
    const eventDatesData = event_dates.map(dateData => ({
      ...dateData,
      schedule_event_id: event.id,
      team_id: req.user.team_id,
      created_by: req.user.id
    }));

    await ScheduleEventDate.bulkCreate(eventDatesData);

    // Database: Fetch the complete created event with all associations
    // This ensures the response includes all nested data with proper formatting
    const createdEvent = await ScheduleEvent.findByPk(event.id, {
      include: [
        {
          model: ScheduleTemplate,
          attributes: ['id', 'name']
        },
        {
          model: Location,
          attributes: ['id', 'name', 'location_type', 'address']
        },
        {
          model: ScheduleEventDate,
          as: 'EventDates',
          include: [
            {
              model: Location,
              as: 'OverrideLocation',
              attributes: ['id', 'name', 'location_type', 'address']
            }
          ]
        },
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Schedule event created successfully',
      data: createdEvent
    });
  } catch (error) {
    console.error('Create schedule event error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating schedule event'
    });
  }
});

/**
 * @route PUT /api/schedule-events/:id
 * @description Updates an existing schedule event and optionally replaces event dates.
 *              Event metadata (title, description, times, etc.) is updated in place.
 *              If event_dates array is provided, all existing dates are deleted and
 *              replaced with the new dates (full replacement strategy).
 *
 *              Update Strategy:
 *              - Event fields: Partial update (only provided fields are changed)
 *              - Event dates: Full replacement (if event_dates provided, all dates replaced)
 *
 * @access Private - Requires authentication and schedule_edit permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('schedule_edit') - Requires schedule edit permission
 *
 * @param {number} req.params.id - Schedule event ID to update
 * @param {string} [req.body.title] - Updated event title
 * @param {string} [req.body.description] - Updated event description
 * @param {string} [req.body.event_type] - Updated event type
 * @param {number} [req.body.schedule_template_id] - Updated template ID
 * @param {number} [req.body.location_id] - Updated default location ID
 * @param {string} [req.body.start_time] - Updated default start time
 * @param {string} [req.body.end_time] - Updated default end time
 * @param {number} [req.body.duration_minutes] - Updated duration
 * @param {Object} [req.body.recurring_pattern] - Updated recurring pattern
 * @param {Array<string>} [req.body.required_equipment] - Updated equipment list
 * @param {number} [req.body.max_participants] - Updated max participants
 * @param {Array<string>} [req.body.target_groups] - Updated target groups
 * @param {string} [req.body.preparation_notes] - Updated preparation notes
 * @param {string} [req.body.priority] - Updated priority level
 * @param {Array<Object>} [req.body.event_dates] - New event dates (replaces all existing)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation
 * @returns {Object} response.data - Updated event with all associations
 *
 * @throws {400} Invalid event ID - Parameter validation failed
 * @throws {404} Not found - Event doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.put('/:id',
  param('id').isInt().withMessage('Event ID must be an integer'),
  checkPermission('schedule_edit'),
  async (req, res) => {
    try {
      // Business logic: Separate event dates from main event data
      const { event_dates, ...eventData } = req.body;

      // Database: Find event with team isolation
      const event = await ScheduleEvent.findOne({
        where: {
          id: req.params.id,
          // Permission: Only allow updates to events within user's team
          team_id: req.user.team_id
        }
      });

      // Error: Return 404 if event not found (includes team access check)
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Schedule event not found'
        });
      }

      // Database: Update the main event fields (partial update)
      await event.update(eventData);

      // Business logic: Full replacement of event dates if provided
      // This strategy ensures consistency - caller provides complete date list
      if (event_dates && Array.isArray(event_dates)) {
        // Database: Delete all existing dates (cascade from parent)
        await ScheduleEventDate.destroy({
          where: { schedule_event_id: event.id }
        });

        // Database: Bulk create new dates
        const eventDatesData = event_dates.map(dateData => ({
          ...dateData,
          schedule_event_id: event.id,
          team_id: req.user.team_id,
          created_by: req.user.id
        }));

        await ScheduleEventDate.bulkCreate(eventDatesData);
      }

      // Database: Fetch the complete updated event with all associations
      const updatedEvent = await ScheduleEvent.findByPk(event.id, {
        include: [
          {
            model: ScheduleTemplate,
            attributes: ['id', 'name']
          },
          {
            model: Location,
            attributes: ['id', 'name', 'location_type', 'address']
          },
          {
            model: ScheduleEventDate,
            as: 'EventDates',
            include: [
              {
                model: Location,
                as: 'OverrideLocation',
                attributes: ['id', 'name', 'location_type', 'address']
              }
            ]
          },
          {
            model: User,
            as: 'Creator',
            attributes: ['id', 'first_name', 'last_name']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Schedule event updated successfully',
        data: updatedEvent
      });
    } catch (error) {
      console.error('Update schedule event error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating schedule event'
      });
    }
  }
);

/**
 * @route DELETE /api/schedule-events/:id
 * @description Hard deletes a schedule event and all associated event dates.
 *              Event dates are deleted first to maintain referential integrity,
 *              then the main event record is removed.
 *
 *              Deletion Cascade:
 *              1. Delete all ScheduleEventDate records for this event
 *              2. Delete the ScheduleEvent record
 *
 *              Note: This is a permanent deletion. Consider implementing soft delete
 *              (is_active flag) if historical event data needs to be preserved.
 *
 * @access Private - Requires authentication and schedule_delete permission
 * @middleware protect - JWT authentication required
 * @middleware handleValidationErrors - Returns 400 if validation fails
 * @middleware checkPermission('schedule_delete') - Requires schedule delete permission
 *
 * @param {number} req.params.id - Schedule event ID to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation
 *
 * @throws {400} Invalid event ID - Parameter validation failed
 * @throws {404} Not found - Event doesn't exist or doesn't belong to user's team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/:id',
  param('id').isInt().withMessage('Event ID must be an integer'),
  handleValidationErrors,
  checkPermission('schedule_delete'),
  async (req, res) => {
    try {
      // Database: Find event with team isolation
      const event = await ScheduleEvent.findOne({
        where: {
          id: req.params.id,
          // Permission: Only allow deletion of events within user's team
          team_id: req.user.team_id
        }
      });

      // Error: Return 404 if event not found (includes team access check)
      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Schedule event not found'
        });
      }

      // Database: Delete associated event dates first
      // This maintains referential integrity before removing parent
      await ScheduleEventDate.destroy({
        where: { schedule_event_id: event.id }
      });

      // Database: Delete the main event record
      await event.destroy();

      res.json({
        success: true,
        message: 'Schedule event deleted successfully'
      });
    } catch (error) {
      console.error('Delete schedule event error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting schedule event'
      });
    }
  }
);

module.exports = router;
