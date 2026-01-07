/**
 * @fileoverview Scouts routes for managing professional scout contacts.
 * All routes in this file require authentication via the protect middleware.
 * Scouts are scoped to teams - users can only access scouts belonging to their team.
 *
 * Scout Model Purpose:
 * This model represents professional baseball scouts (e.g., MLB scouts, college scouts)
 * that the team interacts with for player exposure and recruiting purposes. Scouts are
 * external contacts who evaluate players, NOT internal team staff.
 *
 * Scout Structure:
 * - Scout: Represents a professional scout contact with the following key fields:
 *   - first_name: Scout's first name (required)
 *   - last_name: Scout's last name (required)
 *   - organization_name: Organization the scout represents (required, e.g., "Atlanta Braves", "University of Georgia")
 *   - position: Scout's role ('Area Scout' | 'Cross Checker' | 'National Cross Checker' | 'Scouting Director')
 *   - email: Contact email address
 *   - phone: Contact phone number
 *   - notes: General notes about the scout
 *   - coverage_area: Geographic region the scout covers (e.g., "Southeast", "Georgia/Alabama")
 *   - specialization: Areas of expertise (e.g., "Pitching", "Position Players", "High School")
 *   - last_contact_date: Date of most recent contact
 *   - next_contact_date: Scheduled date for next follow-up
 *   - contact_notes: Notes about contact history/plans
 *   - status: Whether the contact is active ('active' | 'inactive')
 *   - created_by: User ID who created the record
 *
 * Scout Position Hierarchy:
 * - Area Scout: Covers a specific geographic territory, first point of contact
 * - Cross Checker: Reviews Area Scout recommendations, covers multiple areas
 * - National Cross Checker: Reviews Cross Checker recommendations, covers entire nation
 * - Scouting Director: Oversees entire scouting department for an organization
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see scouts belonging to their team
 *
 * @module routes/scouts
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Scout, User } = require('../models');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/scouts
 * @description Retrieves a paginated list of professional scouts for the authenticated user's team.
 *              Supports filtering by status, position, and search text.
 *              Results are ordered by creation date (newest first).
 *              Search covers multiple fields: name, organization, email, coverage area, and specialization.
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search text to filter by first_name, last_name, organization_name, email, coverage_area, or specialization (case-insensitive)
 * @param {string} [req.query.status='active'] - Filter by scout status ('active' | 'inactive')
 * @param {string} [req.query.position] - Filter by position ('Area Scout' | 'Cross Checker' | 'National Cross Checker' | 'Scouting Director')
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=20] - Number of records per page (minimum: 1, maximum: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of scout objects with Creator association
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
 * // Request: GET /api/scouts?search=braves&status=active&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "first_name": "Mike",
 *       "last_name": "Johnson",
 *       "organization_name": "Atlanta Braves",
 *       "position": "Area Scout",
 *       "email": "mjohnson@braves.com",
 *       "phone": "555-1234",
 *       "coverage_area": "Georgia/Alabama",
 *       "specialization": "High School",
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
  query('position').optional().isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
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
    // Searches: first_name, last_name, organization_name, email, coverage_area, specialization
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { organization_name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { coverage_area: { [Op.iLike]: `%${search}%` } },
        { specialization: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Execute paginated query with Creator association
    const { count, rows: scouts } = await Scout.findAndCountAll({
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

    // Response: Return scouts with pagination metadata
    res.json({
      success: true,
      data: scouts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Get scouts error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching scouts'
    });
  }
});

/**
 * @route GET /api/scouts/:id
 * @description Retrieves a single scout by ID.
 *              Only returns the scout if it belongs to the authenticated user's team.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the scout to retrieve
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Scout object with Creator association
 * @returns {string} response.data.id - Scout UUID
 * @returns {string} response.data.first_name - Scout's first name
 * @returns {string} response.data.last_name - Scout's last name
 * @returns {string} response.data.organization_name - Organization name (e.g., team/university)
 * @returns {string} response.data.position - Scout's role/title
 * @returns {string} response.data.email - Contact email
 * @returns {string} response.data.phone - Contact phone
 * @returns {string} response.data.notes - General notes
 * @returns {string} response.data.coverage_area - Geographic region covered
 * @returns {string} response.data.specialization - Areas of expertise
 * @returns {string} response.data.last_contact_date - Date of last contact
 * @returns {string} response.data.next_contact_date - Scheduled next contact date
 * @returns {string} response.data.contact_notes - Contact history notes
 * @returns {string} response.data.status - Status ('active' | 'inactive')
 * @returns {Object} response.data.Creator - User who created the record
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Scout with given ID not found or belongs to different team
 * @throws {500} Server error - Database query failure
 */
router.get('/:id', async (req, res) => {
  try {
    // Database: Find scout by ID, scoped to user's team
    // Multi-tenant isolation: Only returns scout if team_id matches
    const scout = await Scout.findOne({
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

    // Error: Scout not found or belongs to different team
    if (!scout) {
      return res.status(404).json({
        success: false,
        error: 'Scout not found'
      });
    }

    // Response: Return the scout
    res.json({
      success: true,
      data: scout
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Get scout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching scout'
    });
  }
});

/**
 * @route POST /api/scouts
 * @description Creates a new scout record for the authenticated user's team.
 *              Automatically assigns the team_id from the authenticated user
 *              and records the creating user as created_by.
 * @access Private - Requires authentication
 *
 * @param {string} req.body.first_name - Scout's first name (required, 1-100 chars)
 * @param {string} req.body.last_name - Scout's last name (required, 1-100 chars)
 * @param {string} req.body.organization_name - Organization name (required, 1-200 chars, e.g., "Atlanta Braves", "University of Georgia")
 * @param {string} req.body.position - Scout's role (required: 'Area Scout' | 'Cross Checker' | 'National Cross Checker' | 'Scouting Director')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.notes] - General notes about the scout
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 * @param {string} [req.body.coverage_area] - Geographic region covered (max 500 chars, e.g., "Southeast", "Georgia/Alabama")
 * @param {string} [req.body.specialization] - Areas of expertise (max 200 chars, e.g., "Pitching", "High School", "Position Players")
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Newly created scout object with Creator association
 *
 * @throws {400} Validation failed - Missing required fields or invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {500} Server error - Database creation failure
 *
 * @example
 * // Request: POST /api/scouts
 * // Body:
 * {
 *   "first_name": "Mike",
 *   "last_name": "Johnson",
 *   "organization_name": "Atlanta Braves",
 *   "position": "Area Scout",
 *   "email": "mjohnson@braves.com",
 *   "phone": "555-9876",
 *   "coverage_area": "Georgia/Alabama",
 *   "specialization": "High School"
 * }
 */
router.post('/', [
  // Validation: Required fields with length constraints
  body('first_name').trim().isLength({ min: 1, max: 100 }),
  body('last_name').trim().isLength({ min: 1, max: 100 }),
  body('organization_name').trim().isLength({ min: 1, max: 200 }),
  body('position').isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
  // Validation: Optional fields with format constraints
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('coverage_area').optional().isLength({ max: 500 }),
  body('specialization').optional().isLength({ max: 200 })
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

    // Database: Create scout with team scoping and creator tracking
    // Business logic: Automatically assign team_id and created_by from authenticated user
    const scout = await Scout.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Database: Fetch the created scout with Creator association
    // This ensures consistent response format with Creator included
    const createdScout = await Scout.findByPk(scout.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return created scout with 201 status
    res.status(201).json({
      success: true,
      data: createdScout
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Create scout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating scout'
    });
  }
});

/**
 * @route PUT /api/scouts/:id
 * @description Updates an existing scout record.
 *              Only allows updating scouts belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the scout to update
 * @param {string} [req.body.first_name] - Scout's first name (1-100 chars)
 * @param {string} [req.body.last_name] - Scout's last name (1-100 chars)
 * @param {string} [req.body.organization_name] - Organization name (1-200 chars)
 * @param {string} [req.body.position] - Scout's role ('Area Scout' | 'Cross Checker' | 'National Cross Checker' | 'Scouting Director')
 * @param {string} [req.body.phone] - Contact phone number (max 20 chars)
 * @param {string} [req.body.email] - Contact email address (must be valid email, max 255 chars)
 * @param {string} [req.body.notes] - General notes about the scout
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history and plans
 * @param {string} [req.body.status] - Status ('active' | 'inactive')
 * @param {string} [req.body.coverage_area] - Geographic region covered (max 500 chars)
 * @param {string} [req.body.specialization] - Areas of expertise (max 200 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Updated scout object with Creator association
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Scout with given ID not found or belongs to different team
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request: PUT /api/scouts/uuid-here
 * // Body (partial update):
 * {
 *   "last_contact_date": "2024-01-15",
 *   "next_contact_date": "2024-02-01",
 *   "contact_notes": "Discussed upcoming showcase event"
 * }
 */
router.put('/:id', [
  // Validation: All fields optional for partial updates
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('organization_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('position').optional().isIn(['Area Scout', 'Cross Checker', 'National Cross Checker', 'Scouting Director']),
  body('phone').optional().isLength({ max: 20 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('notes').optional().isString(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('contact_notes').optional().isString(),
  body('status').optional().isIn(['active', 'inactive']),
  body('coverage_area').optional().isLength({ max: 500 }),
  body('specialization').optional().isLength({ max: 200 })
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

    // Database: Find scout by ID, scoped to user's team
    // Multi-tenant isolation: Only allows update if team_id matches
    const scout = await Scout.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Scout not found or belongs to different team
    if (!scout) {
      return res.status(404).json({
        success: false,
        error: 'Scout not found'
      });
    }

    // Database: Apply partial update with provided fields
    // Business logic: Sequelize's update() only changes provided fields
    await scout.update(req.body);

    // Database: Fetch updated scout with Creator association
    const updatedScout = await Scout.findByPk(scout.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return updated scout
    res.json({
      success: true,
      data: updatedScout
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Update scout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating scout'
    });
  }
});

/**
 * @route DELETE /api/scouts/:id
 * @description Permanently deletes a scout record.
 *              Only allows deleting scouts belonging to the authenticated user's team.
 *              This is a HARD DELETE - the record is permanently removed from the database.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the scout to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Confirmation message ('Scout deleted successfully')
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Not found - Scout with given ID not found or belongs to different team
 * @throws {500} Server error - Database deletion failure
 *
 * @example
 * // Request: DELETE /api/scouts/uuid-here
 * // Response:
 * {
 *   "success": true,
 *   "message": "Scout deleted successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    // Database: Find scout by ID, scoped to user's team
    // Multi-tenant isolation: Only allows delete if team_id matches
    const scout = await Scout.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Scout not found or belongs to different team
    if (!scout) {
      return res.status(404).json({
        success: false,
        error: 'Scout not found'
      });
    }

    // Database: Permanently delete the scout record
    // Note: This is a HARD delete, not a soft delete
    await scout.destroy();

    // Response: Confirm successful deletion
    res.json({
      success: true,
      message: 'Scout deleted successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Delete scout error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting scout'
    });
  }
});

module.exports = router;
