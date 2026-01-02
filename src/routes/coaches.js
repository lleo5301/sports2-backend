/**
 * @fileoverview Coaches routes for managing external coaching staff contacts.
 * All routes in this file require authentication via the protect middleware.
 * Coaches are scoped to teams - users can only access coaches belonging to their team.
 *
 * Coach Model Purpose:
 * This model represents external coaching contacts (e.g., high school coaches,
 * travel ball coaches, club team coaches) that the team interacts with for
 * recruiting purposes. This is NOT for managing the team's own coaching staff.
 *
 * Coach Structure:
 * - Coach: Represents an external coaching contact with the following key fields:
 *   - first_name: Coach's first name (required)
 *   - last_name: Coach's last name (required)
 *   - school_name: School or organization the coach represents (required)
 *   - position: Role/title of the coach ('Head Coach' | 'Recruiting Coordinator' | 'Pitching Coach' | 'Volunteer')
 *   - email: Contact email address
 *   - phone: Contact phone number
 *   - notes: General notes about the coach
 *   - last_contact_date: Date of most recent contact
 *   - next_contact_date: Scheduled date for next follow-up
 *   - contact_notes: Notes about contact history/plans
 *   - status: Whether the contact is active ('active' | 'inactive')
 *   - created_by: User ID who created the record
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see coaches belonging to their team
 *
 * @module routes/coaches
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Coach, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/coaches
 * @description Retrieves a paginated list of coaches for the authenticated user's team.
 *              Supports filtering by status, position, and search text.
 *              Results are ordered by creation date (newest first).
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search text to filter by first_name, last_name, school_name, or email (case-insensitive)
 * @param {string} [req.query.status='active'] - Filter by coach status ('active' | 'inactive')
 * @param {string} [req.query.position] - Filter by position ('Head Coach' | 'Recruiting Coordinator' | 'Pitching Coach' | 'Volunteer')
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=20] - Number of records per page (minimum: 1, maximum: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of coach objects with Creator association
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
 * // Request: GET /api/coaches?search=smith&status=active&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "first_name": "John",
 *       "last_name": "Smith",
 *       "school_name": "Lincoln High School",
 *       "position": "Head Coach",
 *       "email": "jsmith@lincoln.edu",
 *       "phone": "555-1234",
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
  query('status').optional().isIn(['active', 'inactive']),
  query('position').optional().isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
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
      status = 'active',
      position,
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

    // Business logic: Apply position filter if provided
    if (position) {
      whereClause.position = position;
    }

    // Business logic: Search across multiple fields using case-insensitive matching
    // Searches: first_name, last_name, school_name, email
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Execute paginated query with Creator association
    const { count, rows: coaches } = await Coach.findAndCountAll({
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
    console.error('Get coaches error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching coaches'
    });
  }
});

/**
 * @route GET /api/coaches/:id
 * @description Retrieves a single coach by ID.
 *              Only returns the coach if it belongs to the authenticated user's team.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the coach to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Coach object with Creator association
 * @returns {string} response.data.id - Coach UUID
 * @returns {string} response.data.first_name - Coach's first name
 * @returns {string} response.data.last_name - Coach's last name
 * @returns {string} response.data.school_name - School or organization name
 * @returns {string} response.data.position - Coach's role/title
 * @returns {string} response.data.email - Contact email
 * @returns {string} response.data.phone - Contact phone
 * @returns {string} response.data.notes - General notes
 * @returns {string} response.data.last_contact_date - Date of last contact
 * @returns {string} response.data.next_contact_date - Scheduled next contact date
 * @returns {string} response.data.contact_notes - Contact history notes
 * @returns {string} response.data.status - Status ('active' | 'inactive')
 * @returns {Object} response.data.Creator - User who created the record
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id', async (req, res) => {
  try {
    // Database: Find coach by ID, scoped to user's team
    // Multi-tenant isolation: Only returns coach if team_id matches
    const coach = await Coach.findOne({
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
        error: 'Coach not found'
      });
    }

    // Response: Return the coach
    res.json({
      success: true,
      data: coach
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching coach'
    });
  }
});

/**
 * @route POST /api/coaches
 * @description Creates a new coach record for the authenticated user's team.
 *              Automatically assigns the team_id from the authenticated user
 *              and records the creating user as created_by.
 * @access Private - Requires authentication
 *
 * @param {string} req.body.first_name - Coach's first name (required, 1-100 chars)
 * @param {string} req.body.last_name - Coach's last name (required, 1-100 chars)
 * @param {string} req.body.school_name - School or organization name (required, 1-200 chars)
 * @param {string} req.body.position - Coach's role (required: 'Head Coach' | 'Recruiting Coordinator' | 'Pitching Coach' | 'Volunteer')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.notes] - General notes about the coach
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Newly created coach object with Creator association
 *
 * @throws {400} Validation failed - Missing required fields or invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {500} Server error - Database creation failure
 *
 * @example
 * // Request: POST /api/coaches
 * // Body:
 * {
 *   "first_name": "Mike",
 *   "last_name": "Johnson",
 *   "school_name": "Central High School",
 *   "position": "Head Coach",
 *   "email": "mjohnson@central.edu",
 *   "phone": "555-9876"
 * }
 */
router.post('/', [
  // Validation: Required fields with length constraints
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('school_name').trim().isLength({ min: 1, max: 200 }),
  body('position').isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
  // Validation: Optional fields with format constraints
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString()
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

    // Database: Create coach with team scoping and creator tracking
    // Business logic: Automatically assign team_id and created_by
    const coach = await Coach.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created coach with Creator association
    // This ensures consistent response format with Creator included
    const createdCoach = await Coach.findByPk(coach.id, {
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
    console.error('Create coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating coach'
    });
  }
});

/**
 * @route PUT /api/coaches/:id
 * @description Updates an existing coach record.
 *              Only allows updating coaches belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the coach to update
 * @param {string} [req.body.first_name] - Coach's first name (1-100 chars)
 * @param {string} [req.body.last_name] - Coach's last name (1-100 chars)
 * @param {string} [req.body.school_name] - School or organization name (1-200 chars)
 * @param {string} [req.body.position] - Coach's role ('Head Coach' | 'Recruiting Coordinator' | 'Pitching Coach' | 'Volunteer')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.notes] - General notes about the coach
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 * @param {string} [req.body.status] - Status ('active' | 'inactive')
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Updated coach object with Creator association
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request: PUT /api/coaches/uuid-here
 * // Body (partial update):
 * {
 *   "last_contact_date": "2024-01-15",
 *   "next_contact_date": "2024-02-01",
 *   "contact_notes": "Discussed spring recruiting schedule"
 * }
 */
router.put('/:id', [
  // Validation: All fields optional for partial updates
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('school_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('position').optional().isIn(['Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
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

    // Database: Find coach by ID, scoped to user's team
    // Multi-tenant isolation: Only allows update if team_id matches
    const coach = await Coach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Coach not found or belongs to different team
    if (!coach) {
      return res.status(404).json({
        success: false,
        error: 'Coach not found'
      });
    }

    // Database: Apply partial update with provided fields
    // Business logic: Sequelize's update() only changes provided fields
    await coach.update(req.body);

    // Database: Fetch updated coach with Creator association
    const updatedCoach = await Coach.findByPk(coach.id, {
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
    console.error('Update coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating coach'
    });
  }
});

/**
 * @route DELETE /api/coaches/:id
 * @description Permanently deletes a coach record.
 *              Only allows deleting coaches belonging to the authenticated user's team.
 *              This is a HARD DELETE - the record is permanently removed from the database.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the coach to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Confirmation message ('Coach deleted successfully')
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Coach with given ID not found or belongs to different team
 * @throws {500} Server error - Database deletion failure
 *
 * @example
 * // Request: DELETE /api/coaches/uuid-here
 * // Response:
 * {
 *   "success": true,
 *   "message": "Coach deleted successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    // Database: Find coach by ID, scoped to user's team
    // Multi-tenant isolation: Only allows delete if team_id matches
    const coach = await Coach.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Coach not found or belongs to different team
    if (!coach) {
      return res.status(404).json({
        success: false,
        error: 'Coach not found'
      });
    }

    // Database: Permanently delete the coach record
    // Note: This is a HARD delete, not a soft delete
    await coach.destroy();

    // Response: Confirm successful deletion
    res.json({
      success: true,
      message: 'Coach deleted successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Delete coach error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting coach'
    });
  }
});

module.exports = router;
