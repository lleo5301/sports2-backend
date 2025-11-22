const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { ScheduleEvent, ScheduleEventDate, Location, User, ScheduleTemplate } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Validation middleware
const validateScheduleEventCreate = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('event_type').optional().isIn(['practice', 'game', 'scrimmage', 'tournament', 'meeting', 'training', 'conditioning', 'team_building', 'other']).withMessage('Invalid event type'),
  body('schedule_template_id').isInt({ min: 1 }).withMessage('Schedule template ID must be a positive integer'),
  body('location_id').optional().isInt({ min: 1 }).withMessage('Location ID must be a positive integer'),
  body('start_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
  body('end_time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format'),
  body('duration_minutes').optional().isInt({ min: 1, max: 1440 }).withMessage('Duration must be between 1 and 1440 minutes'),
  body('recurring_pattern').optional().isObject().withMessage('Recurring pattern must be an object'),
  body('required_equipment').optional().isArray().withMessage('Required equipment must be an array'),
  body('max_participants').optional().isInt({ min: 1 }).withMessage('Max participants must be a positive integer'),
  body('target_groups').optional().isArray().withMessage('Target groups must be an array'),
  body('preparation_notes').optional().trim().isLength({ max: 1000 }).withMessage('Preparation notes must be less than 1000 characters'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority level'),
  body('event_dates').isArray({ min: 1 }).withMessage('Event dates array is required and must have at least one date'),
  body('event_dates.*.event_date').isISO8601().withMessage('Event date must be a valid date'),
  body('event_dates.*.start_time_override').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time override must be in HH:MM format'),
  body('event_dates.*.end_time_override').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time override must be in HH:MM format'),
  body('event_dates.*.location_id_override').optional().isInt({ min: 1 }).withMessage('Location ID override must be a positive integer'),
  body('event_dates.*.notes').optional().trim().isLength({ max: 500 }).withMessage('Date notes must be less than 500 characters')
];

// Helper function to handle validation errors
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

// Apply authentication middleware to all routes
router.use(protect);

// GET /api/schedule-events - Get all events for user's templates
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
    
    const whereClause = {
      team_id: req.user.team_id
    };

    // Add filters
    if (schedule_template_id) {
      whereClause.schedule_template_id = schedule_template_id;
    }

    if (event_type) {
      whereClause.event_type = event_type;
    }

    if (location_id) {
      whereClause.location_id = location_id;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: events } = await ScheduleEvent.findAndCountAll({
      where: whereClause,
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
          where: start_date && end_date ? {
            event_date: {
              [Op.between]: [start_date, end_date]
            }
          } : undefined,
          required: false,
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
      ],
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

// GET /api/schedule-events/:id - Get a specific event
router.get('/:id', param('id').isInt().withMessage('Event ID must be an integer'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID',
        errors: errors.array()
      });
    }

    const event = await ScheduleEvent.findOne({
      where: {
        id: req.params.id,
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

// POST /api/schedule-events - Create a new event with dates
router.post('/', validateScheduleEventCreate, handleValidationErrors, checkPermission('schedule_create'), async (req, res) => {
  try {
    const { event_dates, ...eventData } = req.body;

    // Verify schedule template belongs to user's team
    const template = await ScheduleTemplate.findOne({
      where: {
        id: eventData.schedule_template_id,
        team_id: req.user.team_id
      }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Schedule template not found or does not belong to your team'
      });
    }

    // Verify location belongs to user's team (if provided)
    if (eventData.location_id) {
      const location = await Location.findOne({
        where: {
          id: eventData.location_id,
          team_id: req.user.team_id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found or does not belong to your team'
        });
      }
    }

    // Create the event
    const event = await ScheduleEvent.create({
      ...eventData,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Create event dates
    const eventDatesData = event_dates.map(dateData => ({
      ...dateData,
      schedule_event_id: event.id,
      team_id: req.user.team_id,
      created_by: req.user.id
    }));

    await ScheduleEventDate.bulkCreate(eventDatesData);

    // Fetch the created event with all includes
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

// PUT /api/schedule-events/:id - Update an event
router.put('/:id', 
  param('id').isInt().withMessage('Event ID must be an integer'),
  checkPermission('schedule_edit'), 
  async (req, res) => {
    try {
      const { event_dates, ...eventData } = req.body;

      const event = await ScheduleEvent.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Schedule event not found'
        });
      }

      // Update the event
      await event.update(eventData);

      // If event_dates are provided, update them
      if (event_dates && Array.isArray(event_dates)) {
        // Delete existing dates
        await ScheduleEventDate.destroy({
          where: { schedule_event_id: event.id }
        });

        // Create new dates
        const eventDatesData = event_dates.map(dateData => ({
          ...dateData,
          schedule_event_id: event.id,
          team_id: req.user.team_id,
          created_by: req.user.id
        }));

        await ScheduleEventDate.bulkCreate(eventDatesData);
      }

      // Fetch the updated event with all includes
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

// DELETE /api/schedule-events/:id - Delete an event
router.delete('/:id', 
  param('id').isInt().withMessage('Event ID must be an integer'),
  handleValidationErrors,
  checkPermission('schedule_delete'), 
  async (req, res) => {
    try {
      const event = await ScheduleEvent.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!event) {
        return res.status(404).json({
          success: false,
          message: 'Schedule event not found'
        });
      }

      // Delete associated event dates first
      await ScheduleEventDate.destroy({
        where: { schedule_event_id: event.id }
      });

      // Delete the event
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




