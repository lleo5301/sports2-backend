/**
 * @fileoverview High School Coaches routes for managing high school coaching contacts.
 * All routes in this file require authentication via the protect middleware.
 * High school coaches are scoped to teams - users can only access coaches belonging to their team.
 *
 * High School Coach Model Purpose:
 * This model represents external high school coaching contacts that the team interacts with
 * for recruiting purposes. These are feeder school coaches who may send players to the
 * college/travel ball program. This is NOT for managing the team's own coaching staff.
 *
 * High School Coach Structure:
 * - HighSchoolCoach: Represents a high school coach contact with the following key fields:
 *   - first_name: Coach's first name (required)
 *   - last_name: Coach's last name (required)
 *   - school_name: High school name (required)
 *   - school_district: School district (optional)
 *   - position: Role at school ('Head Coach' | 'Assistant Coach' | 'JV Coach' | 'Freshman Coach' | 'Pitching Coach' | 'Hitting Coach')
 *   - phone: Contact phone number
 *   - email: Contact email address
 *   - city: City where school is located
 *   - state: State where school is located
 *   - region: Geographic region for recruiting
 *   - years_coaching: Number of years coaching experience (0-50)
 *   - conference: Athletic conference the school belongs to
 *   - school_classification: School size classification ('1A' through '6A' or 'Private')
 *   - relationship_type: How the contact was established ('Recruiting Contact' | 'Former Player' | 'Coaching Connection' | 'Tournament Contact' | 'Camp Contact' | 'Other')
 *   - notes: General notes about the coach
 *   - last_contact_date: Date of most recent contact
 *   - next_contact_date: Scheduled date for next follow-up
 *   - contact_notes: Notes about contact history/plans
 *   - players_sent_count: Number of players sent to the program from this coach
 *   - status: Whether the contact is active ('active' | 'inactive')
 *   - created_by: User ID who created the record
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see high school coaches belonging to their team
 *
 * @module routes/highSchoolCoaches
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { HighSchoolCoach, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/high-school-coaches
 * @description Retrieves a paginated list of high school coaches for the authenticated user's team.
 *              Supports filtering by state, position, relationship type, status, and search text.
 *              Search performs case-insensitive matching across first_name, last_name, school_name,
 *              school_district, email, and city fields.
 *              Results are ordered by creation date (newest first).
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search text to filter across multiple fields (case-insensitive)
 * @param {string} [req.query.state] - Filter by state where school is located
 * @param {string} [req.query.position] - Filter by position ('Head Coach' | 'Assistant Coach' | 'JV Coach' | 'Freshman Coach' | 'Pitching Coach' | 'Hitting Coach')
 * @param {string} [req.query.relationship_type] - Filter by relationship type ('Recruiting Contact' | 'Former Player' | 'Coaching Connection' | 'Tournament Contact' | 'Camp Contact' | 'Other')
 * @param {string} [req.query.status='active'] - Filter by coach status ('active' | 'inactive')
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=20] - Number of records per page (minimum: 1, maximum: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of high school coach objects with Creator association
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Records per page
 * @returns {number} response.pagination.total - Total number of matching records
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {400} Validation failed - Invalid query parameters
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {500} Server error - Database query failure
 *
 * @example
 * // Request: GET /api/high-school-coaches?state=TX&position=Head%20Coach&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "first_name": "John",
 *       "last_name": "Smith",
 *       "school_name": "Lincoln High School",
 *       "school_district": "Lincoln ISD",
 *       "position": "Head Coach",
 *       "state": "TX",
 *       "city": "Austin",
 *       "years_coaching": 15,
 *       "school_classification": "5A",
 *       "players_sent_count": 3,
 *       "status": "active",
 *       "Creator": { "id": "uuid", "first_name": "Admin", "last_name": "User" }
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
 * }
 */
router.get('/', [
  // Validation: Query parameter rules
  query('search').optional().isString(),
  query('state').optional().isString(),
  query('position').optional().isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  query('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  query('status').optional().isIn(['active', 'inactive']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Extract query parameters with defaults
    const {
      search,
      state,
      position,
      relationship_type,
      status = 'active',
      page = 1,
      limit = 20
    } = req.query;

    // Calculate pagination offset
    const offset = (page - 1) * limit;

    // Database: Build dynamic where clause for filtering
    // Multi-tenant isolation: Always scope to user's team
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply status filter (defaults to 'active')
    if (status) {
      whereClause.status = status;
    }

    // Business logic: Apply state filter if provided
    if (state) {
      whereClause.state = state;
    }

    // Business logic: Apply position filter if provided
    if (position) {
      whereClause.position = position;
    }

    // Business logic: Apply relationship type filter if provided
    if (relationship_type) {
      whereClause.relationship_type = relationship_type;
    }

    // Business logic: Search across multiple fields using case-insensitive matching
    // Searches: first_name, last_name, school_name, school_district, email, city
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { school_district: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Execute paginated query with Creator association
    const { count, rows: coaches } = await HighSchoolCoach.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Response: Return coaches with pagination metadata
    res.json({
      success: true,
      data: coaches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get high school coaches error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching high school coaches'
    });
  }
});

/**
 * @route GET /api/high-school-coaches/:id
 * @description Retrieves a single high school coach by ID.
 *              Only returns the coach if it belongs to the authenticated user's team.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the high school coach to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - High school coach object with Creator association
 * @returns {string} response.data.id - Coach UUID
 * @returns {string} response.data.first_name - Coach's first name
 * @returns {string} response.data.last_name - Coach's last name
 * @returns {string} response.data.school_name - High school name
 * @returns {string} response.data.school_district - School district
 * @returns {string} response.data.position - Coach's position at the school
 * @returns {string} response.data.phone - Contact phone number
 * @returns {string} response.data.email - Contact email address
 * @returns {string} response.data.city - City where school is located
 * @returns {string} response.data.state - State where school is located
 * @returns {string} response.data.region - Geographic region
 * @returns {number} response.data.years_coaching - Years of coaching experience
 * @returns {string} response.data.conference - Athletic conference
 * @returns {string} response.data.school_classification - School size classification
 * @returns {string} response.data.relationship_type - How contact was established
 * @returns {string} response.data.notes - General notes
 * @returns {string} response.data.last_contact_date - Date of last contact
 * @returns {string} response.data.next_contact_date - Scheduled next contact date
 * @returns {string} response.data.contact_notes - Contact history notes
 * @returns {number} response.data.players_sent_count - Number of players sent
 * @returns {string} response.data.status - Status ('active' | 'inactive')
 * @returns {Object} response.data.Creator - User who created the record
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - High school coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id', async (req, res) => {
  try {
    // Database: Find high school coach by ID, scoped to user's team
    // Multi-tenant isolation: Only returns coach if team_id matches
    const coach = await HighSchoolCoach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Error: Coach not found or belongs to different team
    if (!coach) {
      return res.status(404).json({
        success: false,
        error: 'High school coach not found'
      });
    }

    // Response: Return the coach
    res.json({
      success: true,
      data: coach
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get high school coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching high school coach'
    });
  }
});

/**
 * @route POST /api/high-school-coaches
 * @description Creates a new high school coach record for the authenticated user's team.
 *              Automatically assigns the team_id from the authenticated user
 *              and records the creating user as created_by.
 *              This is used to track feeder school coaches for recruiting purposes.
 * @access Private - Requires authentication
 *
 * @param {string} req.body.first_name - Coach's first name (required, 1-100 chars)
 * @param {string} req.body.last_name - Coach's last name (required, 1-100 chars)
 * @param {string} req.body.school_name - High school name (required, 1-200 chars)
 * @param {string} [req.body.school_district] - School district name (max 200 chars)
 * @param {string} req.body.position - Coach's position at school (required: 'Head Coach' | 'Assistant Coach' | 'JV Coach' | 'Freshman Coach' | 'Pitching Coach' | 'Hitting Coach')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.city] - City where school is located (max 100 chars)
 * @param {string} [req.body.state] - State where school is located (max 50 chars)
 * @param {string} [req.body.region] - Geographic region for recruiting (max 100 chars)
 * @param {number} [req.body.years_coaching] - Years of coaching experience (0-50)
 * @param {string} [req.body.conference] - Athletic conference (max 100 chars)
 * @param {string} [req.body.school_classification] - School size ('1A' | '2A' | '3A' | '4A' | '5A' | '6A' | 'Private')
 * @param {string} [req.body.relationship_type] - How contact was established ('Recruiting Contact' | 'Former Player' | 'Coaching Connection' | 'Tournament Contact' | 'Camp Contact' | 'Other')
 * @param {string} [req.body.notes] - General notes about the coach
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 * @param {number} [req.body.players_sent_count] - Number of players sent to program (min 0)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Newly created high school coach object with Creator association
 *
 * @throws {400} Validation failed - Missing required fields or invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {500} Server error - Database creation failure
 *
 * @example
 * // Request: POST /api/high-school-coaches
 * // Body:
 * {
 *   "first_name": "Mike",
 *   "last_name": "Johnson",
 *   "school_name": "Central High School",
 *   "school_district": "Central ISD",
 *   "position": "Head Coach",
 *   "email": "mjohnson@central.edu",
 *   "phone": "555-9876",
 *   "state": "TX",
 *   "city": "Dallas",
 *   "school_classification": "5A",
 *   "years_coaching": 12,
 *   "relationship_type": "Recruiting Contact"
 * }
 */
router.post('/', [
  // Validation: Required fields with length constraints
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('school_name').trim().isLength({ min: 1, max: 200 }),
  body('school_district').optional().trim().isLength({ max: 200 }),
  body('position').isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  // Validation: Optional contact information fields
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('city').optional().isLength({ max: 100 }),
  body('state').optional().isLength({ max: 50 }),
  body('region').optional().isLength({ max: 100 }),
  // Validation: Optional coaching experience and school details
  body('years_coaching').optional().isInt({ min: 0, max: 50 }),
  body('conference').optional().isLength({ max: 100 }),
  body('school_classification').optional().isIn(['1A', '2A', '3A', '4A', '5A', '6A', 'Private']),
  // Validation: Optional relationship and contact tracking fields
  body('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('players_sent_count').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Database: Create high school coach with team scoping and creator tracking
    // Business logic: Automatically assign team_id and created_by
    const coach = await HighSchoolCoach.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created coach with Creator association
    // This ensures consistent response format with Creator included
    const createdCoach = await HighSchoolCoach.findByPk(coach.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return created coach with 201 status
    res.status(201).json({
      success: true,
      data: createdCoach
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Create high school coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating high school coach'
    });
  }
});

/**
 * @route PUT /api/high-school-coaches/:id
 * @description Updates an existing high school coach record.
 *              Only allows updating coaches belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the high school coach to update
 * @param {string} [req.body.first_name] - Coach's first name (1-100 chars)
 * @param {string} [req.body.last_name] - Coach's last name (1-100 chars)
 * @param {string} [req.body.school_name] - High school name (1-200 chars)
 * @param {string} [req.body.school_district] - School district name (max 200 chars)
 * @param {string} [req.body.position] - Coach's position ('Head Coach' | 'Assistant Coach' | 'JV Coach' | 'Freshman Coach' | 'Pitching Coach' | 'Hitting Coach')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.city] - City where school is located (max 100 chars)
 * @param {string} [req.body.state] - State where school is located (max 50 chars)
 * @param {string} [req.body.region] - Geographic region for recruiting (max 100 chars)
 * @param {number} [req.body.years_coaching] - Years of coaching experience (0-50)
 * @param {string} [req.body.conference] - Athletic conference (max 100 chars)
 * @param {string} [req.body.school_classification] - School size ('1A' | '2A' | '3A' | '4A' | '5A' | '6A' | 'Private')
 * @param {string} [req.body.relationship_type] - How contact was established ('Recruiting Contact' | 'Former Player' | 'Coaching Connection' | 'Tournament Contact' | 'Camp Contact' | 'Other')
 * @param {string} [req.body.notes] - General notes about the coach
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 * @param {number} [req.body.players_sent_count] - Number of players sent to program (min 0)
 * @param {string} [req.body.status] - Status ('active' | 'inactive')
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Updated high school coach object with Creator association
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - High school coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request: PUT /api/high-school-coaches/uuid-here
 * // Body (partial update):
 * {
 *   "last_contact_date": "2024-01-15",
 *   "next_contact_date": "2024-02-01",
 *   "contact_notes": "Discussed spring recruiting schedule, interested in 2 players",
 *   "players_sent_count": 4
 * }
 */
router.put('/:id', [
  // Validation: All fields optional for partial updates
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('school_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('school_district').optional().trim().isLength({ max: 200 }),
  body('position').optional().isIn(['Head Coach', 'Assistant Coach', 'JV Coach', 'Freshman Coach', 'Pitching Coach', 'Hitting Coach']),
  // Validation: Optional contact information fields
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('city').optional().isLength({ max: 100 }),
  body('state').optional().isLength({ max: 50 }),
  body('region').optional().isLength({ max: 100 }),
  // Validation: Optional coaching experience and school details
  body('years_coaching').optional().isInt({ min: 0, max: 50 }),
  body('conference').optional().isLength({ max: 100 }),
  body('school_classification').optional().isIn(['1A', '2A', '3A', '4A', '5A', '6A', 'Private']),
  // Validation: Optional relationship and contact tracking fields
  body('relationship_type').optional().isIn(['Recruiting Contact', 'Former Player', 'Coaching Connection', 'Tournament Contact', 'Camp Contact', 'Other']),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('players_sent_count').optional().isInt({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    // Validation: Check for validation errors from express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    // Database: Find high school coach by ID, scoped to user's team
    // Multi-tenant isolation: Only allows update if team_id matches
    const coach = await HighSchoolCoach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Coach not found or belongs to different team
    if (!coach) {
      return res.status(404).json({
        success: false,
        error: 'High school coach not found'
      });
    }

    // Database: Apply partial update with provided fields
    // Business logic: Sequelize's update() only changes provided fields
    await coach.update(req.body);

    // Database: Fetch updated coach with Creator association
    const updatedCoach = await HighSchoolCoach.findByPk(coach.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return updated coach
    res.json({
      success: true,
      data: updatedCoach
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Update high school coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating high school coach'
    });
  }
});

/**
 * @route DELETE /api/high-school-coaches/:id
 * @description Permanently deletes a high school coach record.
 *              Only allows deleting coaches belonging to the authenticated user's team.
 *              This is a HARD DELETE - the record is permanently removed from the database.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the high school coach to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Confirmation message ('High school coach deleted successfully')
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - High school coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database deletion failure
 *
 * @example
 * // Request: DELETE /api/high-school-coaches/uuid-here
 * // Response:
 * {
 *   "success": true,
 *   "message": "High school coach deleted successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    // Database: Find high school coach by ID, scoped to user's team
    // Multi-tenant isolation: Only allows delete if team_id matches
    const coach = await HighSchoolCoach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Coach not found or belongs to different team
    if (!coach) {
      return res.status(404).json({
        success: false,
        error: 'High school coach not found'
      });
    }

    // Database: Permanently delete the high school coach record
    // Note: This is a HARD delete, not a soft delete
    await coach.destroy();

    // Response: Confirm successful deletion
    res.json({
      success: true,
      message: 'High school coach deleted successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Delete high school coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting high school coach'
    });
  }
});

module.exports = router;
