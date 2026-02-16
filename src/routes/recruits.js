/**
 * @fileoverview Recruits routes for managing the recruiting board and preference lists.
 * All routes in this file require authentication via the protect middleware.
 * Data is scoped to teams - users can only access recruits and preference lists belonging to their team.
 *
 * Recruiting Board Purpose:
 * The recruiting board displays prospect data in a card format for
 * team staff to review and manage. This is the primary interface for viewing available recruits.
 * All positions are included (no P/DH exclusion).
 *
 * Preference List System:
 * Preference lists organize recruits into categorized groups for tracking recruiting progress:
 * - new_players: Recently added prospects not yet evaluated
 * - overall_pref_list: Master list of preferred recruits across all categories
 * - hs_pref_list: High school recruit preferences
 * - college_transfers: College transfer portal candidates
 * - pitchers_pref_list: Pitcher-specific preferences
 *
 * PreferenceList Model Structure:
 * - player_id: (nullable) Legacy FK to Player model
 * - prospect_id: (nullable) FK to Prospect model
 * - list_type: Category of the list
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
 * - Recruiting board queries Prospects (not Players) and includes all positions
 * - A prospect/player can only appear once per list_type (enforced via unique constraint)
 * - Exactly one of player_id or prospect_id must be set per preference list entry
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
const { Player, Prospect, PreferenceList, User } = require('../models');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware: Apply JWT authentication to all routes in this file
// All subsequent routes require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/v1/recruits
 * @description Retrieves a paginated list of prospects (recruiting board) for
 *              the authenticated user's team. All positions are included.
 *              Supports filtering by school type, position, and search text.
 *              Search performs case-insensitive matching across first_name, last_name,
 *              school_name, city, and state fields. Includes each prospect's preference
 *              list data if available. Results are ordered by creation date (newest first).
 * @access Private - Requires authentication
 */
router.get('/', [
  // Validation: Query parameter rules
  query('school_type').optional().isIn(['HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent']),
  query('position').optional().isIn(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL']),
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
    // No position exclusion -- all positions included in recruiting board
    const whereClause = {
      team_id: req.user.team_id
    };

    // Business logic: Apply school type filter
    if (school_type) {
      whereClause.school_type = school_type;
    }

    // Business logic: Apply position filter if provided (uses Prospect's primary_position)
    if (position) {
      whereClause.primary_position = position;
    }

    // Business logic: Search across multiple fields using case-insensitive matching
    // Searches: first_name, last_name, school_name, city, state
    if (search) {
      whereClause[Op.or] = [
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { school_name: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Database: Execute paginated query with PreferenceList association
    // Queries Prospect model instead of Player
    // Includes preference list data to show recruiting status on each prospect card
    // Uses LEFT JOIN (required: false) to include prospects not yet on any preference list
    const { count, rows: prospects } = await Prospect.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: PreferenceList,
          where: { team_id: req.user.team_id },
          required: false, // LEFT JOIN - include prospects without preference list entries
          attributes: ['list_type', 'priority', 'status', 'interest_level']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Response: Return prospects with pagination metadata
    res.json({
      success: true,
      data: prospects,
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
 * @route GET /api/v1/recruits/preference-lists
 * @description Retrieves a paginated list of preference list entries for the authenticated user's team.
 *              Supports filtering by list type and recruiting status.
 *              Returns entries ordered by priority (ascending) then by added_date (newest first).
 *              Includes associated Player, Prospect, and AddedBy User data.
 * @access Private - Requires authentication
 */
router.get('/preference-lists', [
  // Validation: Query parameter rules for list filtering
  query('list_type').optional().isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers', 'pitchers_pref_list']),
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

    // Database: Execute paginated query with Player, Prospect, and AddedBy associations
    // Order by priority (highest priority first) then by added_date (newest first)
    const { count, rows: preferenceLists } = await PreferenceList.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Player,
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state', 'graduation_year']
        },
        {
          model: Prospect,
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'primary_position', 'school_type', 'school_name', 'city', 'state', 'graduation_year']
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
 * @route POST /api/v1/recruits/preference-lists
 * @description Adds a player or prospect to a preference list for the authenticated user's team.
 *              Exactly one of player_id or prospect_id must be provided.
 *              Verifies the target entity belongs to the user's team before adding.
 *              Prevents duplicate entries - an entity can only appear once per list type.
 *              Automatically tracks who added the entry and when.
 * @access Private - Requires authentication
 */
router.post('/preference-lists', [
  // Validation: player_id and prospect_id are both optional (custom validation enforces exactly one)
  body('player_id').optional().isInt({ min: 1 }),
  body('prospect_id').optional().isInt({ min: 1 }),
  body('list_type').isIn(['new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers', 'pitchers_pref_list']),
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
    const { player_id, prospect_id, list_type, ...preferenceData } = req.body;

    // Custom validation: exactly one of player_id or prospect_id must be provided
    if (player_id && prospect_id) {
      return res.status(400).json({
        success: false,
        error: 'Provide either player_id or prospect_id, not both'
      });
    }
    if (!player_id && !prospect_id) {
      return res.status(400).json({
        success: false,
        error: 'Either player_id or prospect_id is required'
      });
    }

    if (prospect_id) {
      // Database: Verify prospect exists and belongs to user's team
      const prospectRecord = await Prospect.findOne({
        where: { id: prospect_id, team_id: req.user.team_id }
      });
      if (!prospectRecord) {
        return res.status(404).json({
          success: false,
          error: 'Prospect not found'
        });
      }

      // Database: Check if prospect is already in this list type
      const existingPreference = await PreferenceList.findOne({
        where: { prospect_id, team_id: req.user.team_id, list_type }
      });
      if (existingPreference) {
        return res.status(400).json({
          success: false,
          error: 'Prospect is already in this preference list'
        });
      }
    } else {
      // Database: Verify player exists and belongs to user's team
      const playerRecord = await Player.findOne({
        where: { id: player_id, team_id: req.user.team_id }
      });
      if (!playerRecord) {
        return res.status(404).json({
          success: false,
          error: 'Player not found'
        });
      }

      // Database: Check if player is already in this list type
      const existingPreference = await PreferenceList.findOne({
        where: { player_id, team_id: req.user.team_id, list_type }
      });
      if (existingPreference) {
        return res.status(400).json({
          success: false,
          error: 'Player is already in this preference list'
        });
      }
    }

    // Database: Create new preference list entry
    // Business logic: Automatically assign team_id and added_by from authenticated user
    const preference = await PreferenceList.create({
      ...preferenceData,
      player_id: player_id || null,
      prospect_id: prospect_id || null,
      list_type,
      team_id: req.user.team_id,
      added_by: req.user.id
    });

    // Database: Fetch the created entry with associations for consistent response format
    const createdPreference = await PreferenceList.findByPk(preference.id, {
      include: [
        {
          model: Player,
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: Prospect,
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'primary_position', 'school_type', 'school_name', 'city', 'state']
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
 * @route PUT /api/v1/recruits/preference-lists/:id
 * @description Updates an existing preference list entry.
 *              Only allows updating entries belonging to the authenticated user's team.
 *              Supports partial updates - only provided fields are updated.
 *              Used to track recruiting progress (status changes, contact updates, scholarship offers).
 * @access Private - Requires authentication
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
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'position', 'school_type', 'school', 'city', 'state']
        },
        {
          model: Prospect,
          required: false,
          attributes: ['id', 'first_name', 'last_name', 'primary_position', 'school_type', 'school_name', 'city', 'state']
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
 * @route DELETE /api/v1/recruits/preference-lists/:id
 * @description Removes an entry from a preference list.
 *              Only allows deleting entries belonging to the authenticated user's team.
 *              This is a HARD DELETE - the entry is permanently removed from the database.
 *              The player/prospect record itself is not affected, only the preference list association.
 * @access Private - Requires authentication
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
    // Business logic: Only removes the list association, not the player/prospect record
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
