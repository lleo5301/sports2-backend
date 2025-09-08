const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { Location, User } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Validation middleware
const validateLocationCreate = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must be less than 500 characters'),
  body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('state').optional().trim().isLength({ max: 50 }).withMessage('State must be less than 50 characters'),
  body('zip_code').optional().trim().isLength({ max: 20 }).withMessage('Zip code must be less than 20 characters'),
  body('location_type').optional().isIn(['field', 'gym', 'facility', 'stadium', 'practice_field', 'batting_cage', 'weight_room', 'classroom', 'other']).withMessage('Invalid location type'),
  body('capacity').optional().isInt({ min: 0 }).withMessage('Capacity must be a positive integer'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters'),
  body('contact_info').optional().isObject().withMessage('Contact info must be an object'),
  body('amenities').optional().isArray().withMessage('Amenities must be an array'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
  body('is_home_venue').optional().isBoolean().withMessage('is_home_venue must be a boolean')
];

const validateLocationUpdate = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
  body('address').optional().trim().isLength({ max: 500 }).withMessage('Address must be less than 500 characters'),
  body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('state').optional().trim().isLength({ max: 50 }).withMessage('State must be less than 50 characters'),
  body('zip_code').optional().trim().isLength({ max: 20 }).withMessage('Zip code must be less than 20 characters'),
  body('location_type').optional().isIn(['field', 'gym', 'facility', 'stadium', 'practice_field', 'batting_cage', 'weight_room', 'classroom', 'other']).withMessage('Invalid location type'),
  body('capacity').optional().isInt({ min: 0 }).withMessage('Capacity must be a positive integer'),
  body('notes').optional().trim().isLength({ max: 1000 }).withMessage('Notes must be less than 1000 characters'),
  body('contact_info').optional().isObject().withMessage('Contact info must be an object'),
  body('amenities').optional().isArray().withMessage('Amenities must be an array'),
  body('is_active').optional().isBoolean().withMessage('is_active must be a boolean'),
  body('is_home_venue').optional().isBoolean().withMessage('is_home_venue must be a boolean')
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

// GET /api/locations - Get all locations for the team
router.get('/', async (req, res) => {
  try {
    const { search, location_type, is_active, is_home_venue, page = 1, limit = 50 } = req.query;
    
    const whereClause = {
      team_id: req.user.team_id
    };

    // Add filters
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (location_type) {
      whereClause.location_type = location_type;
    }

    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }

    if (is_home_venue !== undefined) {
      whereClause.is_home_venue = is_home_venue === 'true';
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: locations } = await Location.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: locations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching locations'
    });
  }
});

// GET /api/locations/:id - Get a specific location
router.get('/:id', param('id').isInt().withMessage('Location ID must be an integer'), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location ID',
        errors: errors.array()
      });
    }

    const location = await Location.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching location'
    });
  }
});

// POST /api/locations - Create a new location
router.post('/', validateLocationCreate, handleValidationErrors, checkPermission('schedule_create'), async (req, res) => {
  try {
    // Check for duplicate name within the team
    const existingLocation = await Location.findOne({
      where: {
        name: req.body.name,
        team_id: req.user.team_id
      }
    });

    if (existingLocation) {
      return res.status(400).json({
        success: false,
        message: 'A location with this name already exists for your team'
      });
    }

    const location = await Location.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Fetch the created location with includes
    const createdLocation = await Location.findByPk(location.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: createdLocation
    });
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating location'
    });
  }
});

// PUT /api/locations/:id - Update a location
router.put('/:id', 
  param('id').isInt().withMessage('Location ID must be an integer'),
  validateLocationUpdate, 
  handleValidationErrors, 
  checkPermission('schedule_edit'), 
  async (req, res) => {
    try {
      const location = await Location.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found'
        });
      }

      // Check for duplicate name if name is being changed
      if (req.body.name && req.body.name !== location.name) {
        const existingLocation = await Location.findOne({
          where: {
            name: req.body.name,
            team_id: req.user.team_id,
            id: { [Op.ne]: req.params.id }
          }
        });

        if (existingLocation) {
          return res.status(400).json({
            success: false,
            message: 'A location with this name already exists for your team'
          });
        }
      }

      await location.update(req.body);

      // Fetch the updated location with includes
      const updatedLocation = await Location.findByPk(location.id, {
        include: [
          {
            model: User,
            as: 'Creator',
            attributes: ['id', 'first_name', 'last_name', 'email']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: updatedLocation
      });
    } catch (error) {
      console.error('Update location error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating location'
      });
    }
  }
);

// DELETE /api/locations/:id - Delete a location
router.delete('/:id', 
  param('id').isInt().withMessage('Location ID must be an integer'),
  handleValidationErrors,
  checkPermission('schedule_delete'), 
  async (req, res) => {
    try {
      const location = await Location.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found'
        });
      }

      // Check if location is being used in any schedule events
      const { ScheduleEvent } = require('../models');
      const eventsUsingLocation = await ScheduleEvent.count({
        where: {
          [Op.or]: [
            { location_id: req.params.id },
          ]
        }
      });

      if (eventsUsingLocation > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete location. It is being used in ${eventsUsingLocation} schedule event(s). Please remove or change the location in those events first.`
        });
      }

      await location.destroy();

      res.json({
        success: true,
        message: 'Location deleted successfully'
      });
    } catch (error) {
      console.error('Delete location error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting location'
      });
    }
  }
);

module.exports = router;

