/**
 * @fileoverview Locations routes for managing venue and facility information.
 * All routes in this file require authentication via the protect middleware.
 * Locations are scoped to teams - users can only access locations belonging to their team.
 *
 * Location Model Purpose:
 * Locations represent physical venues where games, practices, and events take place.
 * These can be home fields, away stadiums, indoor facilities, or other training venues.
 * Locations are linked to ScheduleEvents for event scheduling.
 *
 * Location Structure:
 * - Location: Represents a physical venue with the following key fields:
 *   - name: Venue name (required, 1-200 chars, unique per team)
 *   - address: Street address (optional, max 500 chars)
 *   - city: City name (optional, max 100 chars)
 *   - state: State/province (optional, max 50 chars)
 *   - zip_code: Postal code (optional, max 20 chars)
 *   - location_type: Type of venue (field|gym|facility|stadium|practice_field|batting_cage|weight_room|classroom|other)
 *   - capacity: Maximum capacity (optional, positive integer)
 *   - notes: General notes about the venue (optional, max 1000 chars)
 *   - contact_info: Contact details object (optional, JSONB)
 *   - amenities: List of available amenities (optional, array)
 *   - is_active: Whether location is currently available (boolean)
 *   - is_home_venue: Whether this is a team's home venue (boolean)
 *   - created_by: User ID who created the record
 *
 * Location Types:
 * - field: Outdoor playing field
 * - gym: Indoor gymnasium
 * - facility: Multi-purpose training facility
 * - stadium: Large venue with seating
 * - practice_field: Dedicated practice area
 * - batting_cage: Indoor/outdoor batting cage
 * - weight_room: Strength training area
 * - classroom: Meeting/video review room
 * - other: Other venue types
 *
 * Deletion Behavior:
 * - Hard delete is used (not soft delete)
 * - Cascade protection: Cannot delete if location is used in ScheduleEvents
 * - Users must remove/reassign location from events before deletion
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see locations belonging to their team
 * - Location names must be unique within a team (not globally)
 *
 * Permission Model:
 * - Read operations: Any authenticated team member
 * - Create: Requires 'schedule_create' permission
 * - Update: Requires 'schedule_edit' permission
 * - Delete: Requires 'schedule_delete' permission
 *
 * @module routes/locations
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../middleware/permissions
 * @requires ../models
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const { handleValidationErrors } = require('../middleware/validation');
const { Location, User } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

/**
 * Validation middleware for creating a new location.
 * Validates all required and optional fields for location creation.
 *
 * @constant {Array<ValidationChain>} validateLocationCreate
 * @description Express-validator chain for POST /api/locations
 *
 * @property {string} name - Required, 1-200 characters
 * @property {string} [address] - Optional, max 500 characters
 * @property {string} [city] - Optional, max 100 characters
 * @property {string} [state] - Optional, max 50 characters
 * @property {string} [zip_code] - Optional, max 20 characters
 * @property {string} [location_type] - Optional, must be valid type
 * @property {number} [capacity] - Optional, positive integer
 * @property {string} [notes] - Optional, max 1000 characters
 * @property {Object} [contact_info] - Optional, must be object
 * @property {Array} [amenities] - Optional, must be array
 * @property {boolean} [is_active] - Optional, defaults to true
 * @property {boolean} [is_home_venue] - Optional, defaults to false
 */
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

/**
 * Validation middleware for updating an existing location.
 * All fields are optional for partial updates.
 *
 * @constant {Array<ValidationChain>} validateLocationUpdate
 * @description Express-validator chain for PUT /api/locations/:id
 *
 * @property {string} [name] - Optional, 1-200 characters (must be unique within team if changed)
 * @property {string} [address] - Optional, max 500 characters
 * @property {string} [city] - Optional, max 100 characters
 * @property {string} [state] - Optional, max 50 characters
 * @property {string} [zip_code] - Optional, max 20 characters
 * @property {string} [location_type] - Optional, must be valid type
 * @property {number} [capacity] - Optional, positive integer
 * @property {string} [notes] - Optional, max 1000 characters
 * @property {Object} [contact_info] - Optional, must be object
 * @property {Array} [amenities] - Optional, must be array
 * @property {boolean} [is_active] - Optional
 * @property {boolean} [is_home_venue] - Optional
 */
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

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/locations
 * @description Retrieves a paginated list of locations for the authenticated user's team.
 *              Supports filtering by search text, location type, active status, and home venue status.
 *              Results are ordered alphabetically by name.
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search text to filter by name, address, or city (case-insensitive)
 * @param {string} [req.query.location_type] - Filter by location type (field|gym|facility|stadium|practice_field|batting_cage|weight_room|classroom|other)
 * @param {string} [req.query.is_active] - Filter by active status ('true' | 'false')
 * @param {string} [req.query.is_home_venue] - Filter by home venue status ('true' | 'false')
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=50] - Number of records per page (minimum: 1)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of location objects with Creator association
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Records per page
 * @returns {number} response.pagination.total - Total number of matching records
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {500} Server error - Database query failure
 *
 * @example
 * // Request: GET /api/locations?search=stadium&location_type=field&is_home_venue=true&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": 1,
 *       "name": "Home Stadium",
 *       "address": "123 Main St",
 *       "city": "Springfield",
 *       "state": "IL",
 *       "zip_code": "62701",
 *       "location_type": "stadium",
 *       "capacity": 5000,
 *       "is_active": true,
 *       "is_home_venue": true,
 *       "Creator": { "id": 1, "first_name": "Admin", "last_name": "User", "email": "admin@team.com" }
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
 * }
 */
router.get('/', async (req, res) => {
  try {
    // Extract query parameters with defaults
    const { search, location_type, is_active, is_home_venue, page = 1, limit = 50 } = req.query;

    // Database: Build dynamic where clause for filtering
    // Multi-tenant isolation: Always scope to user's team
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Search across name, address, and city fields
    // Uses case-insensitive iLike matching for flexible search
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { address: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Business logic: Filter by location type if provided
    if (location_type) {
      whereClause.location_type = location_type;
    }

    // Business logic: Filter by active status
    // Query param is string, convert to boolean for database query
    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }

    // Business logic: Filter by home venue status
    if (is_home_venue !== undefined) {
      whereClause.is_home_venue = is_home_venue === 'true';
    }

    // Calculate pagination offset
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Database: Execute paginated query with Creator association
    // Order by name alphabetically for consistent display
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

    // Response: Return locations with pagination metadata
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
    // Error: Log and return generic server error
    console.error('Get locations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching locations'
    });
  }
});

/**
 * @route GET /api/locations/:id
 * @description Retrieves a single location by ID.
 *              Only returns the location if it belongs to the authenticated user's team.
 * @access Private - Requires authentication
 *
 * @param {number} req.params.id - Integer ID of the location to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Location object with Creator association
 * @returns {number} response.data.id - Location ID
 * @returns {string} response.data.name - Venue name
 * @returns {string} response.data.address - Street address
 * @returns {string} response.data.city - City name
 * @returns {string} response.data.state - State/province
 * @returns {string} response.data.zip_code - Postal code
 * @returns {string} response.data.location_type - Type of venue
 * @returns {number} response.data.capacity - Maximum capacity
 * @returns {string} response.data.notes - General notes
 * @returns {Object} response.data.contact_info - Contact details
 * @returns {Array} response.data.amenities - Available amenities
 * @returns {boolean} response.data.is_active - Whether currently available
 * @returns {boolean} response.data.is_home_venue - Whether a home venue
 * @returns {Object} response.data.Creator - User who created the record
 *
 * @throws {400} Validation failed - Location ID must be an integer
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Location with given ID not found or belongs to different team
 * @throws {500} Server error - Database query failure
 *
 * @example
 * // Request: GET /api/locations/1
 * // Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": 1,
 *     "name": "Home Stadium",
 *     "address": "123 Main St",
 *     "city": "Springfield",
 *     "state": "IL",
 *     "location_type": "stadium",
 *     "capacity": 5000,
 *     "is_active": true,
 *     "is_home_venue": true,
 *     "amenities": ["parking", "concessions", "restrooms"],
 *     "Creator": { "id": 1, "first_name": "Admin", "last_name": "User", "email": "admin@team.com" }
 *   }
 * }
 */
router.get('/:id',
  param('id').isInt().withMessage('Location ID must be an integer'),
  handleValidationErrors,
  async (req, res) => {
  try {
    // Database: Find location by ID, scoped to user's team
    // Multi-tenant isolation: Only returns location if team_id matches
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

    // Error: Location not found or belongs to different team
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    // Response: Return the location
    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching location'
    });
  }
});

/**
 * @route POST /api/locations
 * @description Creates a new location for the authenticated user's team.
 *              Automatically assigns the team_id from the authenticated user
 *              and records the creating user as created_by.
 *              Enforces unique location names within the team.
 * @access Private - Requires 'schedule_create' permission
 * @middleware validateLocationCreate, handleValidationErrors, checkPermission('schedule_create')
 *
 * @param {string} req.body.name - Venue name (required, 1-200 chars, unique per team)
 * @param {string} [req.body.address] - Street address (max 500 chars)
 * @param {string} [req.body.city] - City name (max 100 chars)
 * @param {string} [req.body.state] - State/province (max 50 chars)
 * @param {string} [req.body.zip_code] - Postal code (max 20 chars)
 * @param {string} [req.body.location_type] - Type of venue (field|gym|facility|stadium|practice_field|batting_cage|weight_room|classroom|other)
 * @param {number} [req.body.capacity] - Maximum capacity (positive integer)
 * @param {string} [req.body.notes] - General notes (max 1000 chars)
 * @param {Object} [req.body.contact_info] - Contact details object
 * @param {Array} [req.body.amenities] - Available amenities array
 * @param {boolean} [req.body.is_active=true] - Whether location is currently available
 * @param {boolean} [req.body.is_home_venue=false] - Whether this is a home venue
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Newly created location object with Creator association
 *
 * @throws {400} Validation failed - Missing required fields or invalid field values
 * @throws {400} Duplicate name - A location with this name already exists for the team
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {403} Forbidden - User lacks 'schedule_create' permission
 * @throws {500} Server error - Database creation failure
 *
 * @example
 * // Request: POST /api/locations
 * // Body:
 * {
 *   "name": "Training Facility",
 *   "address": "456 Sports Ave",
 *   "city": "Springfield",
 *   "state": "IL",
 *   "zip_code": "62702",
 *   "location_type": "facility",
 *   "capacity": 100,
 *   "amenities": ["weight_room", "batting_cages", "video_room"],
 *   "is_home_venue": false
 * }
 */
router.post('/', validateLocationCreate, handleValidationErrors, checkPermission('schedule_create'), async (req, res) => {
  try {
    // Business logic: Check for duplicate name within the team
    // Location names must be unique per team for clear identification
    const existingLocation = await Location.findOne({
      where: {
        name: req.body.name,
        team_id: req.user.team_id
      }
    });

    // Error: Duplicate location name within team
    if (existingLocation) {
      return res.status(400).json({
        success: false,
        message: 'A location with this name already exists for your team'
      });
    }

    // Database: Create location with team scoping and creator tracking
    // Business logic: Automatically assign team_id and created_by
    const location = await Location.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created location with Creator association
    // This ensures consistent response format with Creator included
    const createdLocation = await Location.findByPk(location.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ]
    });

    // Response: Return created location with 201 status
    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: createdLocation
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Create location error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating location'
    });
  }
});

/**
 * @route PUT /api/locations/:id
 * @description Updates an existing location record.
 *              Only allows updating locations belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 *              Enforces unique location names when name is changed.
 * @access Private - Requires 'schedule_edit' permission
 * @middleware param validation, validateLocationUpdate, handleValidationErrors, checkPermission('schedule_edit')
 *
 * @param {number} req.params.id - Integer ID of the location to update
 * @param {string} [req.body.name] - Venue name (1-200 chars, must be unique within team)
 * @param {string} [req.body.address] - Street address (max 500 chars)
 * @param {string} [req.body.city] - City name (max 100 chars)
 * @param {string} [req.body.state] - State/province (max 50 chars)
 * @param {string} [req.body.zip_code] - Postal code (max 20 chars)
 * @param {string} [req.body.location_type] - Type of venue (field|gym|facility|stadium|practice_field|batting_cage|weight_room|classroom|other)
 * @param {number} [req.body.capacity] - Maximum capacity (positive integer)
 * @param {string} [req.body.notes] - General notes (max 1000 chars)
 * @param {Object} [req.body.contact_info] - Contact details object
 * @param {Array} [req.body.amenities] - Available amenities array
 * @param {boolean} [req.body.is_active] - Whether location is currently available
 * @param {boolean} [req.body.is_home_venue] - Whether this is a home venue
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated location object with Creator association
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {400} Duplicate name - A location with this name already exists (if name changed)
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {403} Forbidden - User lacks 'schedule_edit' permission
 * @throws {404} Not found - Location with given ID not found or belongs to different team
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request: PUT /api/locations/1
 * // Body (partial update):
 * {
 *   "capacity": 6000,
 *   "amenities": ["parking", "concessions", "restrooms", "press_box"]
 * }
 */
router.put('/:id',
  param('id').isInt().withMessage('Location ID must be an integer'),
  validateLocationUpdate,
  handleValidationErrors,
  checkPermission('schedule_edit'),
  async (req, res) => {
    try {
      // Database: Find location by ID, scoped to user's team
      // Multi-tenant isolation: Only allows update if team_id matches
      const location = await Location.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      // Error: Location not found or belongs to different team
      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found'
        });
      }

      // Business logic: Check for duplicate name if name is being changed
      // Excludes current location from uniqueness check using Op.ne
      if (req.body.name && req.body.name !== location.name) {
        const existingLocation = await Location.findOne({
          where: {
            name: req.body.name,
            team_id: req.user.team_id,
            id: { [Op.ne]: req.params.id }
          }
        });

        // Error: Duplicate location name within team
        if (existingLocation) {
          return res.status(400).json({
            success: false,
            message: 'A location with this name already exists for your team'
          });
        }
      }

      // Database: Apply partial update with provided fields
      // Business logic: Sequelize's update() only changes provided fields
      await location.update(req.body);

      // Database: Fetch the updated location with Creator association
      // This ensures consistent response format with Creator included
      const updatedLocation = await Location.findByPk(location.id, {
        include: [
          {
            model: User,
            as: 'Creator',
            attributes: ['id', 'first_name', 'last_name', 'email']
          }
        ]
      });

      // Response: Return updated location
      res.json({
        success: true,
        message: 'Location updated successfully',
        data: updatedLocation
      });
    } catch (error) {
      // Error: Log and return generic server error
      console.error('Update location error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating location'
      });
    }
  }
);

/**
 * @route DELETE /api/locations/:id
 * @description Permanently deletes a location record.
 *              Only allows deleting locations belonging to the authenticated user's team.
 *              This is a HARD DELETE - the record is permanently removed from the database.
 *              IMPORTANT: Cannot delete if location is referenced by any ScheduleEvent.
 * @access Private - Requires 'schedule_delete' permission
 * @middleware param validation, handleValidationErrors, checkPermission('schedule_delete')
 *
 * @param {number} req.params.id - Integer ID of the location to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Confirmation message ('Location deleted successfully')
 *
 * @throws {400} Validation failed - Location ID must be an integer
 * @throws {400} In use - Location is referenced by ScheduleEvents and cannot be deleted
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {403} Forbidden - User lacks 'schedule_delete' permission
 * @throws {404} Not found - Location with given ID not found or belongs to different team
 * @throws {500} Server error - Database deletion failure
 *
 * @example
 * // Request: DELETE /api/locations/1
 * // Response (success):
 * {
 *   "success": true,
 *   "message": "Location deleted successfully"
 * }
 *
 * @example
 * // Response (in use - cannot delete):
 * {
 *   "success": false,
 *   "message": "Cannot delete location. It is being used in 5 schedule event(s). Please remove or change the location in those events first."
 * }
 */
router.delete('/:id',
  param('id').isInt().withMessage('Location ID must be an integer'),
  handleValidationErrors,
  checkPermission('schedule_delete'),
  async (req, res) => {
    try {
      // Database: Find location by ID, scoped to user's team
      // Multi-tenant isolation: Only allows delete if team_id matches
      const location = await Location.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      // Error: Location not found or belongs to different team
      if (!location) {
        return res.status(404).json({
          success: false,
          message: 'Location not found'
        });
      }

      // Business logic: Check for cascade constraint - location in use
      // Prevents deletion if location is referenced by ScheduleEvents
      // Note: Late require to avoid circular dependency issues
      const { ScheduleEvent } = require('../models');
      const eventsUsingLocation = await ScheduleEvent.count({
        where: {
          [Op.or]: [
            { location_id: req.params.id },
          ]
        }
      });

      // Error: Location is in use and cannot be deleted
      // User must remove/reassign location from events before deletion
      if (eventsUsingLocation > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete location. It is being used in ${eventsUsingLocation} schedule event(s). Please remove or change the location in those events first.`
        });
      }

      // Database: Permanently delete the location record
      // Note: This is a HARD delete, not a soft delete
      await location.destroy();

      // Response: Confirm successful deletion
      res.json({
        success: true,
        message: 'Location deleted successfully'
      });
    } catch (error) {
      // Error: Log and return generic server error
      console.error('Delete location error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting location'
      });
    }
  }
);

module.exports = router;
