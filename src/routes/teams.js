/**
 * @fileoverview Team routes for managing team data, branding, permissions, rosters, and statistics.
 * This file contains both public endpoints (team list for registration) and protected endpoints
 * requiring authentication. Protected routes enforce multi-tenant isolation - users can only
 * access and modify their own team's data.
 *
 * Key permission requirements:
 * - team_settings: Required for updating team information
 * - user_management: Required for managing user permissions
 * - Branding changes: Restricted to super_admin and head_coach roles
 *
 * @module routes/teams
 * @requires express
 * @requires express-validator
 * @requires path
 * @requires fs
 * @requires ../middleware/auth
 * @requires ../middleware/permissions
 * @requires ../middleware/upload
 * @requires ../models
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const { checkPermission, isSuperAdmin } = require('../middleware/permissions');
const { uploadLogo, handleUploadError, logosDir } = require('../middleware/upload');

/**
 * @description Helper function to check if a user has permission to modify team branding.
 *              Only super_admin users or head_coach role can modify branding (logo, colors).
 * @param {Object} user - The authenticated user object
 * @returns {boolean} True if user can modify branding, false otherwise
 */
const canModifyBranding = (user) => {
  return isSuperAdmin(user) || user.role === 'head_coach';
};
const { Team, User, UserPermission, Schedule, ScheduleSection, ScheduleActivity } = require('../models');

const router = express.Router();

/**
 * @description Validation middleware for team creation.
 *              Validates team name (required), program name, conference, division,
 *              location, and brand colors.
 * @type {Array<ValidationChain>}
 */
const validateTeamCreate = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

/**
 * @description Validation middleware for team updates.
 *              All fields are optional for partial updates.
 * @type {Array<ValidationChain>}
 */
const validateTeamUpdate = [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('program_name').optional().trim().isLength({ max: 100 }).withMessage('Program name must be less than 100 characters'),
  body('conference').optional().trim().isLength({ max: 100 }).withMessage('Conference must be less than 100 characters'),
  body('division').optional().isIn(['D1', 'D2', 'D3', 'NAIA', 'JUCO']).withMessage('Invalid division'),
  body('city').optional().trim().isLength({ max: 50 }).withMessage('City must be less than 50 characters'),
  body('state').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2 characters'),
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color')
];

/**
 * @description Validation middleware for user permission operations.
 *              Validates user ID, permission type, optional grant status,
 *              expiration date, and notes.
 * @type {Array<ValidationChain>}
 */
const validatePermission = [
  body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  body('permission_type').isIn([
    'depth_chart_view', 'depth_chart_create', 'depth_chart_edit', 'depth_chart_delete', 'depth_chart_manage_positions',
    'player_assign', 'player_unassign', 'schedule_view', 'schedule_create', 'schedule_edit', 'schedule_delete',
    'reports_view', 'reports_create', 'reports_edit', 'reports_delete', 'team_settings', 'user_management'
  ]).withMessage('Invalid permission type'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters')
];

/**
 * @description Helper middleware to handle express-validator validation errors.
 *              Returns 400 status with error details if validation fails.
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

/**
 * @route GET /api/teams
 * @description Retrieves a list of all teams in the system. This is a public endpoint
 *              used primarily during user registration to allow users to select their team.
 *              Returns limited team attributes for security (no user lists or sensitive data).
 * @access Public - No authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of team objects
 * @returns {number} response.data[].id - Team ID
 * @returns {string} response.data[].name - Team name
 * @returns {string} response.data[].program_name - Program/school name
 * @returns {string} response.data[].conference - Athletic conference
 * @returns {string} response.data[].division - NCAA/NAIA division
 * @returns {string} response.data[].city - Team city
 * @returns {string} response.data[].state - Team state (2-char abbreviation)
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/', async (req, res) => {
  try {
    // Database: Fetch all teams with limited attributes, sorted alphabetically
    const teams = await Team.findAll({
      attributes: ['id', 'name', 'program_name', 'conference', 'division', 'city', 'state'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: teams
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching teams'
    });
  }
});

/**
 * @route POST /api/teams
 * @description Creates a new team in the system. This is an admin-only operation
 *              that requires the team_management permission. Validates that the
 *              team name is unique before creation.
 * @access Private - Requires authentication and team_management permission
 * @middleware validateTeamCreate - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('team_management') - Permission check
 *
 * @param {string} req.body.name - Team name (1-100 chars, required, must be unique)
 * @param {string} [req.body.program_name] - Program/school name (max 100 chars)
 * @param {string} [req.body.conference] - Athletic conference (max 100 chars)
 * @param {string} [req.body.division] - NCAA division ('D1', 'D2', 'D3', 'NAIA', 'JUCO')
 * @param {string} [req.body.city] - Team city (max 50 chars)
 * @param {string} [req.body.state] - State abbreviation (2 chars)
 * @param {string} [req.body.primary_color] - Primary brand color (hex format: #XXXXXX)
 * @param {string} [req.body.secondary_color] - Secondary brand color (hex format: #XXXXXX)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created team object
 *
 * @throws {400} Validation failed - Request body validation errors
 * @throws {400} Team name already exists - Duplicate team name
 * @throws {401} Unauthorized - Invalid or missing JWT token
 * @throws {403} Forbidden - Missing team_management permission
 * @throws {500} Server error - Database operation failure
 */
router.post('/',
  validateTeamCreate,
  handleValidationErrors,
  protect,
  checkPermission('team_management'),
  async (req, res) => {
    try {
      // Business logic: Check for duplicate team names to ensure uniqueness
      const existingTeam = await Team.findOne({
        where: { name: req.body.name }
      });

      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: 'Team name already exists'
        });
      }

      // Database: Create the new team record
      const team = await Team.create(req.body);

      res.status(201).json({
        success: true,
        message: 'Team created successfully',
        data: team
      });
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating team'
      });
    }
  }
);

// Middleware: Apply JWT authentication to all subsequent routes
// Routes below this line require a valid JWT token in the Authorization header
router.use(protect);

/**
 * @route GET /api/teams/recent-schedules
 * @description Retrieves recent past schedule events for the authenticated user's team.
 *              Flattens the nested schedule/section/activity structure into a flat event list.
 *              Returns events sorted by date and time in descending order (most recent first).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.limit=5] - Maximum number of events to return
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of flattened event objects
 * @returns {string} response.data[].id - Activity ID
 * @returns {string} response.data[].title - Activity name
 * @returns {string} response.data[].date - Event date
 * @returns {string} response.data[].time - Event time
 * @returns {string} response.data[].location - Event location
 * @returns {string} response.data[].type - Section type (e.g., 'practice', 'game')
 * @returns {string} response.data[].notes - Activity notes
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/recent-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // Database: Fetch schedules with nested sections and activities for team
    // Only include active schedules with dates before today (past events)
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          // Business logic: Filter for past dates only
          [require('sequelize').Op.lt]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'DESC']]
            }
          ]
        }
      ],
      order: [['date', 'DESC']],
      limit
    });

    // Business logic: Flatten nested schedule structure into flat event list
    // This simplifies frontend consumption of schedule data
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Business logic: Sort by date and time (most recent first), then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateB - dateA; // Descending order for recent
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching recent schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent schedules'
    });
  }
});

/**
 * @route GET /api/teams/upcoming-schedules
 * @description Retrieves upcoming schedule events for the authenticated user's team.
 *              Flattens the nested schedule/section/activity structure into a flat event list.
 *              Returns events sorted by date and time in ascending order (soonest first).
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {number} [req.query.limit=5] - Maximum number of events to return
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of flattened event objects
 * @returns {string} response.data[].id - Activity ID
 * @returns {string} response.data[].title - Activity name
 * @returns {string} response.data[].date - Event date
 * @returns {string} response.data[].time - Event time
 * @returns {string} response.data[].location - Event location
 * @returns {string} response.data[].type - Section type (e.g., 'practice', 'game')
 * @returns {string} response.data[].notes - Activity notes
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/upcoming-schedules', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const today = new Date();

    // Database: Fetch schedules with nested sections and activities for team
    // Only include active schedules with dates on or after today (future events)
    const schedules = await Schedule.findAll({
      where: {
        team_id: req.user.team_id,
        is_active: true,
        date: {
          // Business logic: Filter for today and future dates
          [require('sequelize').Op.gte]: today
        }
      },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'ASC']]
            }
          ]
        }
      ],
      order: [['date', 'ASC']],
      limit
    });

    // Business logic: Flatten nested schedule structure into flat event list
    const events = [];
    schedules.forEach(schedule => {
      schedule.ScheduleSections.forEach(section => {
        section.ScheduleActivities.forEach(activity => {
          events.push({
            id: activity.id,
            title: activity.activity,
            date: schedule.date,
            time: activity.time,
            location: activity.location || schedule.location,
            type: section.type,
            notes: activity.notes
          });
        });
      });
    });

    // Business logic: Sort by date and time (soonest first), then limit
    events.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateA - dateB;
    });

    res.json({
      success: true,
      data: events.slice(0, limit)
    });
  } catch (error) {
    console.error('Error fetching upcoming schedules:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming schedules'
    });
  }
});

/**
 * @route GET /api/teams/me
 * @description Retrieves the current authenticated user's team information.
 *              Returns full team details for the team the user belongs to.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team object with all fields
 *
 * @throws {400} Bad request - User is not associated with a team
 * @throws {404} Not found - Team record not found in database
 * @throws {500} Server error - Database query failure
 */
router.get('/me', async (req, res) => {
  try {
    console.log('Teams /me endpoint hit');
    console.log('User team_id:', req.user.team_id);
    console.log('User object:', req.user);

    // Validation: Ensure user has a team association
    if (!req.user.team_id) {
      return res.status(400).json({
        success: false,
        message: 'User is not associated with a team'
      });
    }

    // Database: Fetch the user's team by primary key
    const team = await Team.findByPk(req.user.team_id);

    // Error: Handle case where team record doesn't exist
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team'
    });
  }
});

/**
 * @route GET /api/teams/byId/:id
 * @description Retrieves a specific team by ID with associated user list.
 *              Returns team details including all team members.
 *              Note: This may expose user data across teams - consider access control.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Team ID (UUID or integer)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team object with Users association
 * @returns {Array<Object>} response.data.Users - Team members
 * @returns {number} response.data.Users[].id - User ID
 * @returns {string} response.data.Users[].first_name - User first name
 * @returns {string} response.data.Users[].last_name - User last name
 * @returns {string} response.data.Users[].email - User email
 * @returns {string} response.data.Users[].role - User role
 *
 * @throws {404} Not found - Team with given ID doesn't exist
 * @throws {500} Server error - Database query failure
 */
router.get('/byId/:id', async (req, res) => {
  try {
    // Database: Fetch team by ID with associated users
    const team = await Team.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email', 'role']
        }
      ]
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team'
    });
  }
});

/**
 * @route PUT /api/teams/me
 * @description Updates the current authenticated user's team information.
 *              Requires team_settings permission. Accepts partial updates.
 * @access Private - Requires authentication and team_settings permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('team_settings') - Permission check
 *
 * @param {string} [req.body.name] - Team name (1-100 chars)
 * @param {string} [req.body.program_name] - Program/school name (max 100 chars)
 * @param {string} [req.body.conference] - Athletic conference (max 100 chars)
 * @param {string} [req.body.division] - NCAA division ('D1', 'D2', 'D3', 'NAIA', 'JUCO')
 * @param {string} [req.body.city] - Team city (max 50 chars)
 * @param {string} [req.body.state] - State abbreviation (2 chars)
 * @param {string} [req.body.primary_color] - Primary brand color (hex format)
 * @param {string} [req.body.secondary_color] - Secondary brand color (hex format)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated team object
 *
 * @throws {403} Forbidden - Missing team_settings permission
 * @throws {404} Not found - Team record not found
 * @throws {500} Server error - Database operation failure
 */
router.put('/me',
  checkPermission('team_settings'),
  async (req, res) => {
    try {
      // Database: Fetch user's team for update
      const team = await Team.findByPk(req.user.team_id);

      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Database: Apply partial updates from request body
      await team.update(req.body);

      res.json({
        success: true,
        message: 'Team updated successfully',
        data: team
      });
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating team'
      });
    }
  }
);

/**
 * @route POST /api/teams/logo
 * @description Uploads a new team logo image. Restricted to super_admin and head_coach roles.
 *              Accepts image files via multipart/form-data. If a logo already exists,
 *              the old file is deleted before saving the new one.
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 * @middleware canModifyBranding - Role check (inline)
 * @middleware uploadLogo - Multer middleware for image upload
 * @middleware handleUploadError - Upload error handler
 *
 * @param {File} req.file - Logo image file (via multipart/form-data)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Logo URL data
 * @returns {string} response.data.logo_url - Path to the uploaded logo
 *
 * @throws {400} Bad request - No logo file provided
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - File or database operation failure
 */
router.post('/logo',
  // Permission: Only super_admin and head_coach can modify team branding
  (req, res, next) => {
    if (!canModifyBranding(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admins and head coaches can update team branding'
      });
    }
    next();
  },
  uploadLogo,
  handleUploadError,
  async (req, res) => {
    try {
      // Validation: Ensure a file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No logo file provided'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // File cleanup: Delete old logo file if it exists
      if (team.school_logo_url) {
        const oldLogoPath = path.join(logosDir, path.basename(team.school_logo_url));
        try {
          if (fs.existsSync(oldLogoPath)) {
            fs.unlinkSync(oldLogoPath);
          }
        } catch (err) {
          console.warn('Could not delete old logo:', err.message);
        }
      }

      // Database: Update team with new logo URL path
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      await team.update({ school_logo_url: logoUrl });

      res.json({
        success: true,
        message: 'Logo uploaded successfully',
        data: {
          logo_url: logoUrl
        }
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading logo'
      });
    }
  }
);

/**
 * @route DELETE /api/teams/logo
 * @description Removes the team logo. Restricted to super_admin and head_coach roles.
 *              Deletes the logo file from the filesystem and clears the URL from the database.
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - File or database operation failure
 */
router.delete('/logo',
  async (req, res) => {
    try {
      // Permission: Only super_admin and head_coach can modify team branding
      if (!canModifyBranding(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins and head coaches can update team branding'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // File cleanup: Delete logo file from filesystem if it exists
      if (team.school_logo_url) {
        const logoPath = path.join(logosDir, path.basename(team.school_logo_url));
        try {
          if (fs.existsSync(logoPath)) {
            fs.unlinkSync(logoPath);
          }
        } catch (err) {
          console.warn('Could not delete logo file:', err.message);
        }
      }

      // Database: Clear logo URL from team record
      await team.update({ school_logo_url: null });

      res.json({
        success: true,
        message: 'Logo removed successfully'
      });
    } catch (error) {
      console.error('Error removing logo:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing logo'
      });
    }
  }
);

/**
 * @route PUT /api/teams/branding
 * @description Updates team brand colors. Restricted to super_admin and head_coach roles.
 *              Accepts primary and secondary colors in hex format (#XXXXXX).
 * @access Private - Requires authentication and super_admin or head_coach role
 * @middleware protect - JWT authentication required
 * @middleware express-validator - Color format validation
 * @middleware handleValidationErrors - Validation error handler
 *
 * @param {string} [req.body.primary_color] - Primary brand color (hex format: #XXXXXX)
 * @param {string} [req.body.secondary_color] - Secondary brand color (hex format: #XXXXXX)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated branding data
 * @returns {string} response.data.primary_color - Current primary color
 * @returns {string} response.data.secondary_color - Current secondary color
 *
 * @throws {400} Validation failed - Invalid hex color format
 * @throws {403} Forbidden - User is not super_admin or head_coach
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database operation failure
 */
router.put('/branding',
  body('primary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Primary color must be a valid hex color'),
  body('secondary_color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Secondary color must be a valid hex color'),
  handleValidationErrors,
  async (req, res) => {
    try {
      // Permission: Only super_admin and head_coach can modify team branding
      if (!canModifyBranding(req.user)) {
        return res.status(403).json({
          success: false,
          message: 'Only super admins and head coaches can update team branding'
        });
      }

      // Database: Fetch the user's team
      const team = await Team.findByPk(req.user.team_id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Business logic: Build update object with only provided colors
      const { primary_color, secondary_color } = req.body;
      const updateData = {};

      if (primary_color) {
        updateData.primary_color = primary_color;
      }
      if (secondary_color) {
        updateData.secondary_color = secondary_color;
      }

      // Database: Apply color updates
      await team.update(updateData);

      res.json({
        success: true,
        message: 'Team branding updated successfully',
        data: {
          primary_color: team.primary_color,
          secondary_color: team.secondary_color
        }
      });
    } catch (error) {
      console.error('Error updating branding:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating team branding'
      });
    }
  }
);

/**
 * @route GET /api/teams/branding
 * @description Retrieves the team's branding information including name, logo, and colors.
 *              Returns default colors (#3B82F6, #EF4444) if none are set.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Branding information
 * @returns {string} response.data.name - Team name
 * @returns {string} response.data.program_name - Program/school name
 * @returns {string|null} response.data.logo_url - Logo URL path or null
 * @returns {string} response.data.primary_color - Primary color (default: #3B82F6)
 * @returns {string} response.data.secondary_color - Secondary color (default: #EF4444)
 *
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database query failure
 */
router.get('/branding', async (req, res) => {
  try {
    // Database: Fetch team with only branding-related attributes
    const team = await Team.findByPk(req.user.team_id, {
      attributes: ['id', 'name', 'program_name', 'school_logo_url', 'primary_color', 'secondary_color']
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Business logic: Return branding data with default colors if not set
    res.json({
      success: true,
      data: {
        name: team.name,
        program_name: team.program_name,
        logo_url: team.school_logo_url,
        primary_color: team.primary_color || '#3B82F6',
        secondary_color: team.secondary_color || '#EF4444'
      }
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team branding'
    });
  }
});

/**
 * @route GET /api/teams/users
 * @description Retrieves all users belonging to the authenticated user's team.
 *              Returns basic user information sorted alphabetically by name.
 *              Multi-tenant isolation: Only returns users from the requesting user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of user objects
 * @returns {number} response.data[].id - User ID
 * @returns {string} response.data[].first_name - User first name
 * @returns {string} response.data[].last_name - User last name
 * @returns {string} response.data[].email - User email address
 * @returns {string} response.data[].role - User role (e.g., 'head_coach', 'assistant', 'scout')
 * @returns {string} response.data[].created_at - Account creation timestamp
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/users', async (req, res) => {
  try {
    // Database: Fetch all users belonging to the user's team
    // Permission: Multi-tenant isolation via team_id filter
    const users = await User.findAll({
      where: {
        team_id: req.user.team_id
      },
      attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'created_at'],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']]
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching team users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team users'
    });
  }
});

/**
 * @route GET /api/teams/permissions
 * @description Retrieves all user permissions for the authenticated user's team.
 *              Includes user details for each permission record.
 *              Multi-tenant isolation: Only returns permissions from the requesting user's team.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of permission objects
 * @returns {number} response.data[].id - Permission ID
 * @returns {number} response.data[].user_id - User ID
 * @returns {number} response.data[].team_id - Team ID
 * @returns {string} response.data[].permission_type - Permission type code
 * @returns {boolean} response.data[].is_granted - Whether permission is granted
 * @returns {string|null} response.data[].expires_at - Expiration timestamp
 * @returns {string|null} response.data[].notes - Permission notes
 * @returns {Object} response.data[].User - Associated user info
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/permissions', async (req, res) => {
  try {
    // Database: Fetch all permissions for the team with user details
    // Permission: Multi-tenant isolation via team_id filter
    const permissions = await UserPermission.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching team permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team permissions'
    });
  }
});

/**
 * @route POST /api/teams/permissions
 * @description Grants a new permission to a user on the team.
 *              Requires user_management permission. Validates that the target user
 *              belongs to the same team and doesn't already have the permission.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware validatePermission - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {number} req.body.user_id - Target user ID (must be positive integer)
 * @param {string} req.body.permission_type - Permission type (see validatePermission for valid values)
 * @param {boolean} [req.body.is_granted=true] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created permission object
 *
 * @throws {400} Validation failed - Invalid request body
 * @throws {400} Permission already exists - Duplicate permission
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - User not found in team
 * @throws {500} Server error - Database operation failure
 */
router.post('/permissions',
  validatePermission,
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Validation: Ensure target user exists and belongs to the same team
      // This enforces multi-tenant isolation for permission grants
      const user = await User.findOne({
        where: {
          id: req.body.user_id,
          team_id: req.user.team_id
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in team'
        });
      }

      // Business logic: Check for existing permission to prevent duplicates
      const existingPermission = await UserPermission.findOne({
        where: {
          user_id: req.body.user_id,
          team_id: req.user.team_id,
          permission_type: req.body.permission_type
        }
      });

      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: 'Permission already exists for this user'
        });
      }

      // Database: Create the new permission record
      // Track who granted the permission for audit purposes
      const permission = await UserPermission.create({
        user_id: req.body.user_id,
        team_id: req.user.team_id,
        permission_type: req.body.permission_type,
        granted_by: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Permission added successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding permission'
      });
    }
  }
);

/**
 * @route PUT /api/teams/permissions/:id
 * @description Updates an existing permission. Requires user_management permission.
 *              Multi-tenant isolation: Can only update permissions within user's team.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Permission ID to update
 * @param {boolean} [req.body.is_granted] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated permission object
 *
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 */
router.put('/permissions/:id',
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          // Permission: Multi-tenant isolation - only allow updating team's permissions
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Apply updates from request body
      await permission.update(req.body);

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating permission'
      });
    }
  }
);

/**
 * @route GET /api/teams/byid/:id/users
 * @description Legacy endpoint - Retrieves all users belonging to the authenticated user's team.
 *              Note: The :id parameter is ignored; uses authenticated user's team_id.
 *              Maintained for backwards compatibility.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Team ID (ignored - uses authenticated user's team)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of user objects
 *
 * @throws {500} Server error - Database query failure
 * @deprecated Use GET /api/teams/users instead
 */
router.get('/byid/:id/users', async (req, res) => {
  try {
    // Note: The :id param is ignored; always uses authenticated user's team
    // Permission: Multi-tenant isolation via team_id filter
    const users = await User.findAll({
      where: {
        team_id: req.user.team_id
      },
      attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'created_at'],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']]
    });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching team users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team users'
    });
  }
});

/**
 * @route GET /api/teams/byid/:id/permissions
 * @description Legacy endpoint - Retrieves all permissions for the authenticated user's team.
 *              Note: The :id parameter is ignored; uses authenticated user's team_id.
 *              Maintained for backwards compatibility.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Team ID (ignored - uses authenticated user's team)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of permission objects with User details
 *
 * @throws {500} Server error - Database query failure
 * @deprecated Use GET /api/teams/permissions instead
 */
router.get('/byid/:id/permissions', async (req, res) => {
  try {
    // Note: The :id param is ignored; always uses authenticated user's team
    const permissions = await UserPermission.findAll({
      where: {
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching team permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team permissions'
    });
  }
});

/**
 * @route POST /api/teams/byid/:id/permissions
 * @description Legacy endpoint - Grants a new permission to a team user.
 *              Note: The :id parameter is ignored; uses authenticated user's team_id.
 *              Requires user_management permission. Maintained for backwards compatibility.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware validatePermission - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Team ID (ignored - uses authenticated user's team)
 * @param {number} req.body.user_id - Target user ID
 * @param {string} req.body.permission_type - Permission type code
 * @param {boolean} [req.body.is_granted=true] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date
 * @param {string} [req.body.notes] - Notes about the permission
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Created permission object
 *
 * @throws {400} Validation failed - Invalid request body
 * @throws {400} Permission already exists - Duplicate permission
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - User not found in team
 * @throws {500} Server error - Database operation failure
 * @deprecated Use POST /api/teams/permissions instead
 */
router.post('/byid/:id/permissions',
  validatePermission,
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Validation: Ensure target user exists and belongs to the same team
      const user = await User.findOne({
        where: {
          id: req.body.user_id,
          team_id: req.user.team_id
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found in team'
        });
      }

      // Business logic: Check for existing permission to prevent duplicates
      const existingPermission = await UserPermission.findOne({
        where: {
          user_id: req.body.user_id,
          team_id: req.user.team_id,
          permission_type: req.body.permission_type
        }
      });

      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: 'Permission already exists for this user'
        });
      }

      // Database: Create permission with all optional fields
      const permission = await UserPermission.create({
        user_id: req.body.user_id,
        team_id: req.user.team_id,
        permission_type: req.body.permission_type,
        is_granted: req.body.is_granted !== false, // Default to true
        expires_at: req.body.expires_at || null,
        notes: req.body.notes || null,
        granted_by: req.user.id
      });

      res.json({
        success: true,
        message: 'Permission added successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error adding permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding permission'
      });
    }
  }
);

/**
 * @route PUT /api/teams/byid/:team_id/permissions/:id
 * @description Legacy endpoint - Updates an existing permission.
 *              Note: The :team_id parameter is ignored; uses authenticated user's team_id.
 *              Requires user_management permission. Maintained for backwards compatibility.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware param validation - Permission ID validation
 * @middleware express-validator - Request body validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.team_id - Team ID (ignored - uses authenticated user's team)
 * @param {string} req.params.id - Permission ID to update (must be positive integer)
 * @param {boolean} [req.body.is_granted] - Whether permission is granted
 * @param {string} [req.body.expires_at] - Permission expiration date (ISO8601)
 * @param {string} [req.body.notes] - Notes about the permission (max 500 chars)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated permission object
 *
 * @throws {400} Validation failed - Invalid parameters
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 * @deprecated Use PUT /api/teams/permissions/:id instead
 */
router.put('/byid/:team_id/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  body('is_granted').optional().isBoolean().withMessage('is_granted must be a boolean'),
  body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes must be less than 500 characters'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      // Note: Uses authenticated user's team_id, not the :team_id param
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Apply updates, preserving existing values for undefined fields
      await permission.update({
        is_granted: req.body.is_granted !== undefined ? req.body.is_granted : permission.is_granted,
        expires_at: req.body.expires_at !== undefined ? req.body.expires_at : permission.expires_at,
        notes: req.body.notes !== undefined ? req.body.notes : permission.notes
      });

      res.json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating permission'
      });
    }
  }
);

/**
 * @route DELETE /api/teams/permissions/:id
 * @description Deletes/revokes a permission from a user.
 *              Requires user_management permission.
 *              Multi-tenant isolation: Can only delete permissions within user's team.
 * @access Private - Requires authentication and user_management permission
 * @middleware protect - JWT authentication required
 * @middleware param validation - Permission ID validation
 * @middleware handleValidationErrors - Validation error handler
 * @middleware checkPermission('user_management') - Permission check
 *
 * @param {string} req.params.id - Permission ID to delete (must be positive integer)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 *
 * @throws {400} Validation failed - Invalid permission ID
 * @throws {403} Forbidden - Missing user_management permission
 * @throws {404} Not found - Permission not found in team
 * @throws {500} Server error - Database operation failure
 */
router.delete('/permissions/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid permission ID'),
  handleValidationErrors,
  checkPermission('user_management'),
  async (req, res) => {
    try {
      // Database: Find permission with team isolation check
      const permission = await UserPermission.findOne({
        where: {
          id: req.params.id,
          // Permission: Multi-tenant isolation
          team_id: req.user.team_id
        }
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Database: Hard delete the permission record
      await permission.destroy();

      res.json({
        success: true,
        message: 'Permission removed successfully'
      });
    } catch (error) {
      console.error('Error removing permission:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing permission'
      });
    }
  }
);

/**
 * @route GET /api/teams/stats
 * @description Retrieves comprehensive statistics for the authenticated user's team.
 *              Includes player counts, scouting report totals, schedule counts,
 *              and game record (wins/losses/ties) with calculated rates.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required (applied twice - router.use and inline)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team statistics
 * @returns {number} response.data.totalPlayers - Total player count
 * @returns {number} response.data.activePlayers - Active player count
 * @returns {number} response.data.totalReports - Total scouting report count
 * @returns {number} response.data.totalSchedules - Active schedule count
 * @returns {number} response.data.totalGames - Total game count
 * @returns {number} response.data.wins - Win count
 * @returns {number} response.data.losses - Loss count
 * @returns {number} response.data.ties - Tie count
 * @returns {number} response.data.winRate - Win percentage (0-1)
 * @returns {number} response.data.playerRetentionRate - Active/total player ratio (0-1)
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const { Player, ScoutingReport, Schedule, Game } = require('../models');

    // Database: Count total players for the team
    const totalPlayers = await Player.count({
      where: { team_id: req.user.team_id }
    });

    // Database: Count active players for the team
    const activePlayers = await Player.count({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      }
    });

    // Database: Count scouting reports for team's players
    // Uses join to filter by team through Player association
    const totalReports = await ScoutingReport.count({
      include: [
        {
          model: Player,
          where: { team_id: req.user.team_id }
        }
      ]
    });

    // Database: Count active schedules for the team
    const totalSchedules = await Schedule.count({
      where: {
        team_id: req.user.team_id,
        is_active: true
      }
    });

    // Database: Count games and game results for the team
    const totalGames = await Game.count({
      where: { team_id: req.user.team_id }
    });

    const wins = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'W'
      }
    });

    const losses = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'L'
      }
    });

    const ties = await Game.count({
      where: {
        team_id: req.user.team_id,
        result: 'T'
      }
    });

    // Business logic: Calculate derived statistics
    const stats = {
      totalPlayers,
      activePlayers,
      totalReports,
      totalSchedules,
      totalGames,
      wins,
      losses,
      ties,
      // Business logic: Calculate win rate (0 if no games played)
      winRate: totalGames > 0 ? wins / totalGames : 0,
      // Business logic: Calculate player retention rate (active/total, 0 if no players)
      playerRetentionRate: totalPlayers > 0 ? activePlayers / totalPlayers : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team statistics'
    });
  }
});

/**
 * @route GET /api/teams/roster
 * @description Retrieves the team roster organized by position groups.
 *              Returns active players only, grouped into pitchers, catchers,
 *              infielders, outfielders, and designated hitters.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Roster organized by position group
 * @returns {Array<Object>} response.data.pitchers - Players with position 'P'
 * @returns {Array<Object>} response.data.catchers - Players with position 'C'
 * @returns {Array<Object>} response.data.infielders - Players with positions '1B', '2B', '3B', 'SS'
 * @returns {Array<Object>} response.data.outfielders - Players with positions 'LF', 'CF', 'RF', 'OF'
 * @returns {Array<Object>} response.data.designated_hitters - Players with position 'DH'
 * @returns {number} response.data.total_players - Total count of active players
 *
 * @throws {500} Server error - Database query failure
 */
router.get('/roster', protect, async (req, res) => {
  try {
    const { Player } = require('../models');

    // Database: Fetch active players for the team with roster-relevant attributes
    const players = await Player.findAll({
      where: {
        team_id: req.user.team_id,
        status: 'active'
      },
      attributes: [
        'id', 'first_name', 'last_name', 'position', 'school_type',
        'height', 'weight', 'graduation_year', 'school', 'city', 'state',
        'batting_avg', 'era', 'created_at'
      ],
      order: [
        ['position', 'ASC'],
        ['last_name', 'ASC'],
        ['first_name', 'ASC']
      ]
    });

    // Business logic: Group players by position categories for roster display
    // This matches common baseball roster organization patterns
    const roster = {
      pitchers: players.filter(p => p.position === 'P'),
      catchers: players.filter(p => p.position === 'C'),
      infielders: players.filter(p => ['1B', '2B', '3B', 'SS'].includes(p.position)),
      outfielders: players.filter(p => ['LF', 'CF', 'RF', 'OF'].includes(p.position)),
      designated_hitters: players.filter(p => p.position === 'DH'),
      total_players: players.length
    };

    res.json({
      success: true,
      data: roster
    });
  } catch (error) {
    console.error('Error fetching team roster:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team roster'
    });
  }
});

/**
 * @route GET /api/teams/:id
 * @description Retrieves a specific team by ID with associated user list.
 *              This route must be placed last to avoid conflicting with other named routes.
 *              Validates that the ID is a valid integer.
 * @access Private - Requires authentication
 * @middleware protect - JWT authentication required
 *
 * @param {string} req.params.id - Team ID (must be a valid integer)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Team object with Users association
 * @returns {Array<Object>} response.data.Users - Team members with limited attributes
 *
 * @throws {400} Bad request - Invalid team ID format
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database query failure
 */
// Note: This route must be last to avoid conflicting with other named routes like /me, /stats, /roster
router.get('/:id', async (req, res) => {
  try {
    // Validation: Ensure ID is a valid integer
    const teamId = parseInt(req.params.id);
    if (isNaN(teamId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid team ID'
      });
    }

    // Database: Fetch team with associated users
    const team = await Team.findByPk(teamId, {
      include: [
        {
          model: User,
          attributes: ['id', 'first_name', 'last_name', 'email', 'role']
        }
      ]
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching team'
    });
  }
});

/**
 * @route PUT /api/teams/:id
 * @description Updates a specific team by ID. Requires team_settings permission.
 *              Multi-tenant isolation: Users can only update their own team.
 *              This route must be placed last to avoid conflicting with other named routes.
 * @access Private - Requires authentication and team_settings permission
 * @middleware protect - JWT authentication required
 * @middleware checkPermission('team_settings') - Permission check
 *
 * @param {string} req.params.id - Team ID (must be a valid integer and match user's team)
 * @param {string} [req.body.name] - Team name (1-100 chars)
 * @param {string} [req.body.program_name] - Program/school name
 * @param {string} [req.body.conference] - Athletic conference
 * @param {string} [req.body.division] - NCAA division
 * @param {string} [req.body.city] - Team city
 * @param {string} [req.body.state] - State abbreviation
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success message
 * @returns {Object} response.data - Updated team object
 *
 * @throws {400} Bad request - Invalid team ID format
 * @throws {403} Forbidden - User can only update their own team
 * @throws {404} Not found - Team not found
 * @throws {500} Server error - Database operation failure
 */
// Note: This route must be last to avoid conflicting with other named routes
router.put('/:id',
  checkPermission('team_settings'),
  async (req, res) => {
    try {
      // Validation: Ensure ID is a valid integer
      const teamId = parseInt(req.params.id);
      if (isNaN(teamId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid team ID'
        });
      }

      // Permission: Multi-tenant isolation - users can only update their own team
      if (req.user.team_id !== teamId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own team'
        });
      }

      // Database: Fetch and update the team
      const team = await Team.findByPk(teamId);

      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Database: Apply updates from request body
      await team.update(req.body);

      res.json({
        success: true,
        message: 'Team updated successfully',
        data: team
      });
    } catch (error) {
      console.error('Error updating team:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating team'
      });
    }
  }
);

module.exports = router;
