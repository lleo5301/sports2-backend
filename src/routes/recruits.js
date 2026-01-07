/**
 * @fileoverview Recruits routes for managing the recruiting board and preference lists.
 * All routes in this file require authentication via the protect middleware.
 * Data is scoped to teams - users can only access recruits and preference lists belonging to their team.
 *
 * Recruiting Board Purpose:
 * The recruiting board displays position player prospects (non-pitchers) in a card format for
 * team staff to review and manage. This is the primary interface for viewing available recruits.
 *
 * Preference List System:
 * Preference lists organize recruits into categorized groups for tracking recruiting progress:
 * - new_players: Recently added prospects not yet evaluated
 * - overall_pref_list: Master list of preferred recruits across all categories
 * - hs_pref_list: High school recruit preferences
 * - college_transfers: College transfer portal candidates
 *
 * PreferenceList Model Structure:
 * - list_type: Category of the list ('new_players' | 'overall_pref_list' | 'hs_pref_list' | 'college_transfers')
 * - priority: Ranking within the list (1-999, lower is higher priority)
 * - status: Recruiting status ('active' | 'inactive' | 'committed' | 'signed' | 'lost')
 * - interest_level: Level of mutual interest ('High' | 'Medium' | 'Low' | 'Unknown')
 * - notes: General notes about the prospect
 * - visit_scheduled: Whether a campus visit is scheduled
 * - visit_date: Scheduled visit date
 * - scholarship_offered: Whether a scholarship has been offered
 * - scholarship_amount: Dollar amount of scholarship offered
 * - last_contact_date: Date of most recent contact
 * - next_contact_date: Scheduled date for next follow-up
 * - contact_notes: Notes about contact history
 * - added_by: User who added the entry
 * - added_date: Date when entry was added
 *
 * Business Rules:
 * - Recruiting board excludes pitchers (P) and designated hitters (DH)
 * - A player can only appear once per list_type (enforced via unique constraint)
 * - Preference lists track the full recruiting pipeline from discovery to signing
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see preference lists and recruits belonging to their team
 *
 * @module routes/recruits
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Player, PreferenceList, User } = require('../models');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/recruits
 * @description Retrieves a paginated list of position player prospects (recruiting board) for
 *              the authenticated user's team. Excludes pitchers (P) and designated hitters (DH)
 *              to focus on position players. Supports filtering by school type, position, and
 *              search text. Search performs case-insensitive matching across first_name, last_name,
 *              school, city, and state fields. Includes each player's preference list data if available.
 *              Results are ordered by creation date (newest first).
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.school_type] - Filter by school type ('HS' for high school | 'COLL' for college)
 * @param {string} [req.query.position] - Filter by position ('C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'OF')
 * @param {string} [req.query.search] - Search text to filter across multiple fields (case-insensitive)
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=20] - Number of records per page (minimum: 1, maximum: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of player objects with PreferenceList association
 * @returns {string} response.data[].id - Player UUID
 * @returns {string} response.data[].first_name - Player's first name
 * @returns {string} response.data[].last_name - Player's last name
 * @returns {string} response.data[].position - Playing position
 * @returns {string} response.data[].school_type - School type ('HS' | 'COLL')
 * @returns {string} response.data[].school - School name
 * @returns {string} response.data[].city - City
 * @returns {string} response.data[].state - State
 * @returns {Array<Object>} response.data[].PreferenceLists - Associated preference list entries
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
 * // Request: GET /api/recruits?school_type=HS&position=SS&search=smith&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "first_name": "John",
 *       "last_name": "Smith",
 *       "position": "SS",
 *       "school_type": "HS",
 *       "school": "Lincoln High",
 *       "city": "Austin",
 *       "state": "TX",
 *       "PreferenceLists": [
 *         { "list_type": "hs_pref_list", "priority": 1, "status": "active", "interest_level": "High" }
 *       ]
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
 * }
 */
router.get('/', [
  // Validation: Query parameter rules
  query('school_type').optional().isIn(['HS', 'COLL']),
  query('position').optional().isIn(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF']),
  query('search').optional().isString(),
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
      school_type,
      position,
      search,
      page = 1,
      limit = 20
    } = req.query;

    // Calculate pagination offset
    const offset = (page - 1) * limit;

    // Database: Build dynamic where clause for filtering
    // Multi-tenant isolation: Always scope to user's team
    // Business logic: Exclude pitchers (P) and designated hitters (DH) from recruiting board
    // This focuses the board on position players only
    const whereClause = {
      team_id: req.user.team_id,
      position: {
        [Op.notIn]: ['P', 'DH'] // Exclude pitchers and DH from recruiting board
      }
    };

    // Business logic: Apply school type filter (HS = high school, COLL = college)
    if (school_type) {
      whereClause.school_type = school_type;
    }

    // Business logic: Apply position filter if provided
    // Note: This overrides the notIn clause, so only the specified position is returned
    if (position) {
      whereClause.position = position;
    }

    // Business logic: Search across multiple fields using case-insensitive matching
    // Searches: first_name, last_name, school, city, state
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Execute paginated query with PreferenceList association
    // Includes preference list data to show recruiting status on each player card
    // Uses LEFT JOIN (required: false) to include players not yet on any preference list
    const { count, rows: players } = await Player.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: PreferenceList,
          where: { team_id: req.user.team_id },
          required: false, // LEFT JOIN - include players without preference list entries
          attributes: ['list_type', 'priority', 'status', 'interest_level']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Response: Return players with pagination metadata
    res.json({
      success: true,
      data: players,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Get recruits error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching recruits'
    });
  }
});

/**
 * @route GET /api/recruits/preference-lists
 * @description Retrieves a paginated list of preference list entries for the authenticated user's team.
 *              Supports filtering by list type and recruiting status.
 *              Returns entries ordered by priority (ascending) then by added_date (newest first).
 *              Includes associated Player and AddedBy User data.
 * @access Private - Requires authentication
 *
 * @param {string} [req.query.list_type] - Filter by list category ('new_players' | 'overall_pref_list' | 'hs_pref_list' | 'college_transfers')
 * @param {string} [req.query.status] - Filter by recruiting status ('active' | 'inactive' | 'committed' | 'signed' | 'lost')
 * @param {number} [req.query.page=1] - Page number for pagination (minimum: 1)
 * @param {number} [req.query.limit=20] - Number of records per page (minimum: 1, maximum: 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of preference list entries with associations
 * @returns {string} response.data[].id - Preference list entry UUID
 * @returns {string} response.data[].list_type - List category
 * @returns {number} response.data[].priority - Priority ranking (1-999)
 * @returns {string} response.data[].status - Recruiting status
 * @returns {string} response.data[].interest_level - Level of interest
 * @returns {Object} response.data[].Player - Associated player object
 * @returns {Object} response.data[].AddedBy - User who added the entry
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
 * // Request: GET /api/recruits/preference-lists?list_type=hs_pref_list&status=active&page=1
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "uuid",
 *       "list_type": "hs_pref_list",
 *       "priority": 1,
 *       "status": "active",
 *       "interest_level": "High",
 *       "Player": {
 *         "id": "uuid",
 *         "first_name": "John",
 *         "last_name": "Smith",
 *         "position": "SS",
 *         "school_type": "HS",
 *         "school": "Lincoln High",
 *         "city": "Austin",
 *         "state": "TX",
 *         "graduation_year": 2025
 *       },
 *       "AddedBy": { "id": "uuid", "first_name": "Coach", "last_name": "Jones" }
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
 * }
 */
router.get('/preference-lists', [
  // Validation: Query parameter rules for list filtering
  query('list_type').optional().isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers']),
  query('status').optional().isIn(['active', 'inactive', 'committed', 'signed', 'lost']),
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
      list_type,
      status,
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

    // Business logic: Apply list type filter to view specific categories
    if (list_type) {
      whereClause.list_type = list_type;
    }

    // Business logic: Apply status filter to track recruiting pipeline
    // Status progression: active -> committed -> signed (success) or lost (failure)
    if (status) {
      whereClause.status = status;
    }

    // Database: Execute paginated query with Player and AddedBy associations
    // Order by priority (highest priority first) then by added_date (newest first)
    const { count, rows: preferenceLists } = await PreferenceList.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state', 'graduation_year']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['priority', 'ASC'], ['added_date', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Response: Return preference lists with pagination metadata
    res.json({
      success: true,
      data: preferenceLists,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Get preference lists error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching preference lists'
    });
  }
});

/**
 * @route POST /api/recruits/preference-lists
 * @description Adds a player to a preference list for the authenticated user's team.
 *              Verifies the player belongs to the user's team before adding.
 *              Prevents duplicate entries - a player can only appear once per list type.
 *              Automatically tracks who added the entry and when.
 * @access Private - Requires authentication
 *
 * @param {number} req.body.player_id - ID of the player to add (required, must belong to team)
 * @param {string} req.body.list_type - List category (required: 'new_players' | 'overall_pref_list' | 'hs_pref_list' | 'college_transfers')
 * @param {number} [req.body.priority] - Priority ranking (1-999, lower is higher priority)
 * @param {string} [req.body.notes] - Notes about the prospect
 * @param {string} [req.body.interest_level] - Level of interest ('High' | 'Medium' | 'Low' | 'Unknown')
 * @param {boolean} [req.body.visit_scheduled] - Whether a campus visit is scheduled
 * @param {string} [req.body.visit_date] - Scheduled visit date (ISO 8601 format)
 * @param {boolean} [req.body.scholarship_offered] - Whether a scholarship has been offered
 * @param {number} [req.body.scholarship_amount] - Dollar amount of scholarship (min 0)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Created preference list entry with associations
 * @returns {string} response.data.id - New entry UUID
 * @returns {string} response.data.list_type - List category
 * @returns {number} response.data.priority - Priority ranking
 * @returns {Object} response.data.Player - Associated player object
 * @returns {Object} response.data.AddedBy - User who added the entry
 *
 * @throws {400} Validation failed - Missing required fields or invalid values
 * @throws {400} Player is already in this preference list - Duplicate entry attempt
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Player not found - Player doesn't exist or belongs to different team
 * @throws {500} Server error - Database creation failure
 *
 * @example
 * // Request: POST /api/recruits/preference-lists
 * // Body:
 * {
 *   "player_id": 123,
 *   "list_type": "hs_pref_list",
 *   "priority": 1,
 *   "interest_level": "High",
 *   "notes": "Top SS prospect, great bat speed"
 * }
 * // Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "list_type": "hs_pref_list",
 *     "priority": 1,
 *     "interest_level": "High",
 *     "notes": "Top SS prospect, great bat speed",
 *     "Player": { "id": 123, "first_name": "John", "last_name": "Smith", ... },
 *     "AddedBy": { "id": "uuid", "first_name": "Coach", "last_name": "Jones" }
 *   }
 * }
 */
router.post('/preference-lists', [
  // Validation: Required fields
  body('player_id').isInt({ min: 1 }),
  body('list_type').isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers']),
  // Validation: Optional recruiting tracking fields
  body('priority').optional().isInt({ min: 1, max: 999 }),
  body('notes').optional().isString(),
  body('interest_level').optional().isIn(['High', 'Medium', 'Low', 'Unknown']),
  // Validation: Optional visit scheduling fields
  body('visit_scheduled').optional().isBoolean(),
  body('visit_date').optional().isISO8601(),
  // Validation: Optional scholarship fields
  body('scholarship_offered').optional().isBoolean(),
  body('scholarship_amount').optional().isFloat({ min: 0 })
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

    // Destructure required fields and remaining optional preference data
    const { player_id, list_type, ...preferenceData } = req.body;

    // Database: Verify player exists and belongs to user's team
    // Multi-tenant isolation: Prevents adding players from other teams
    const player = await Player.findOne({
      where: {
        id: player_id,
        team_id: req.user.team_id
      }
    });

    // Error: Player not found or belongs to different team
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Player not found'
      });
    }

    // Database: Check if player is already in this list type
    // Business logic: Prevent duplicate entries per list type
    // A player can be on multiple different lists but not on the same list twice
    const existingPreference = await PreferenceList.findOne({
      where: {
        player_id,
        team_id: req.user.team_id,
        list_type
      }
    });

    // Error: Duplicate entry - player already in this list
    if (existingPreference) {
      return res.status(400).json({
        success: false,
        error: 'Player is already in this preference list'
      });
    }

    // Database: Create new preference list entry
    // Business logic: Automatically assign team_id and added_by from authenticated user
    const preference = await PreferenceList.create({
      ...preferenceData,
      player_id,
      list_type,
      team_id: req.user.team_id,
      added_by: req.user.id
    });

    // Database: Fetch the created entry with associations for consistent response format
    const createdPreference = await PreferenceList.findByPk(preference.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return created entry with 201 status
    res.status(201).json({
      success: true,
      data: createdPreference
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Add to preference list error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while adding to preference list'
    });
  }
});

/**
 * @route PUT /api/recruits/preference-lists/:id
 * @description Updates an existing preference list entry.
 *              Only allows updating entries belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 *              Used to track recruiting progress (status changes, contact updates, scholarship offers).
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the preference list entry to update
 * @param {number} [req.body.priority] - Priority ranking (1-999, lower is higher priority)
 * @param {string} [req.body.notes] - Notes about the prospect
 * @param {string} [req.body.status] - Recruiting status ('active' | 'inactive' | 'committed' | 'signed' | 'lost')
 * @param {string} [req.body.interest_level] - Level of interest ('High' | 'Medium' | 'Low' | 'Unknown')
 * @param {boolean} [req.body.visit_scheduled] - Whether a campus visit is scheduled
 * @param {string} [req.body.visit_date] - Scheduled visit date (ISO 8601 format)
 * @param {boolean} [req.body.scholarship_offered] - Whether a scholarship has been offered
 * @param {number} [req.body.scholarship_amount] - Dollar amount of scholarship (min 0)
 * @param {string} [req.body.last_contact_date] - Date of most recent contact (ISO 8601 format)
 * @param {string} [req.body.next_contact_date] - Scheduled next contact date (ISO 8601 format)
 * @param {string} [req.body.contact_notes] - Notes about contact history
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Updated preference list entry with associations
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Preference list entry not found - Entry doesn't exist or belongs to different team
 * @throws {500} Server error - Database update failure
 *
 * @example
 * // Request: PUT /api/recruits/preference-lists/uuid-here
 * // Body (updating recruiting status after verbal commitment):
 * {
 *   "status": "committed",
 *   "scholarship_offered": true,
 *   "scholarship_amount": 25000,
 *   "notes": "Verbal commitment received, waiting on NLI"
 * }
 */
router.put('/preference-lists/:id', [
  // Validation: All fields optional for partial updates
  // Priority and ranking fields
  body('priority').optional().isInt({ min: 1, max: 999 }),
  body('notes').optional().isString(),
  // Validation: Status and interest level for pipeline tracking
  body('status').optional().isIn(['active', 'inactive', 'committed', 'signed', 'lost']),
  body('interest_level').optional().isIn(['High', 'Medium', 'Low', 'Unknown']),
  // Validation: Visit scheduling fields
  body('visit_scheduled').optional().isBoolean(),
  body('visit_date').optional().isISO8601(),
  // Validation: Scholarship fields
  body('scholarship_offered').optional().isBoolean(),
  body('scholarship_amount').optional().isFloat({ min: 0 }),
  // Validation: Contact tracking fields for CRM-like functionality
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

    // Database: Find preference list entry by ID, scoped to user's team
    // Multi-tenant isolation: Only allows update if team_id matches
    const preference = await PreferenceList.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Entry not found or belongs to different team
    if (!preference) {
      return res.status(404).json({
        success: false,
        error: 'Preference list entry not found'
      });
    }

    // Database: Apply partial update with provided fields
    // Business logic: Sequelize's update() only changes provided fields
    await preference.update(req.body);

    // Database: Fetch updated entry with associations for consistent response format
    const updatedPreference = await PreferenceList.findByPk(preference.id, {
      include: [
        {
          model: Player,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: User,
          as: 'AddedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Response: Return updated entry
    res.json({
      success: true,
      data: updatedPreference
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Update preference list error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating preference list'
    });
  }
});

/**
 * @route DELETE /api/recruits/preference-lists/:id
 * @description Removes a player from a preference list.
 *              Only allows deleting entries belonging to the authenticated user's team.
 *              This is a HARD DELETE - the entry is permanently removed from the database.
 *              The player record itself is not affected, only the preference list association.
 * @access Private - Requires authentication
 *
 * @param {string} req.params.id - UUID of the preference list entry to delete
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {string} response.message - Confirmation message ('Player removed from preference list successfully')
 *
 * @throws {401} Unauthorized - Missing or invalid JWT token
 * @throws {404} Preference list entry not found - Entry doesn't exist or belongs to different team
 * @throws {500} Server error - Database deletion failure
 *
 * @example
 * // Request: DELETE /api/recruits/preference-lists/uuid-here
 * // Response:
 * {
 *   "success": true,
 *   "message": "Player removed from preference list successfully"
 * }
 */
router.delete('/preference-lists/:id', async (req, res) => {
  try {
    // Database: Find preference list entry by ID, scoped to user's team
    // Multi-tenant isolation: Only allows delete if team_id matches
    const preference = await PreferenceList.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    // Error: Entry not found or belongs to different team
    if (!preference) {
      return res.status(404).json({
        success: false,
        error: 'Preference list entry not found'
      });
    }

    // Database: Permanently delete the preference list entry
    // Note: This is a HARD delete, not a soft delete
    // Business logic: Only removes the list association, not the player record
    await preference.destroy();

    // Response: Confirm successful deletion
    res.json({
      success: true,
      message: 'Player removed from preference list successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    logger.error('Remove from preference list error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while removing from preference list'
    });
  }
});

module.exports = router;
