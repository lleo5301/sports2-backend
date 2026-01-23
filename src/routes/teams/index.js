/**
 * @fileoverview Main team routes module.
 * Provides core CRUD operations for teams and mounts sub-routers for
 * branding, permissions, schedules, and statistics.
 *
 * Key features:
 * - Public team listing for registration
 * - Team CRUD operations with team isolation
 * - User management within teams
 * - Branding management (via branding sub-router)
 * - Permission management (via permissions sub-router)
 * - Schedule access (via schedules sub-router)
 * - Team statistics and roster (via stats sub-router)
 *
 * Key permission requirements:
 * - team_settings: Required for updating team information
 * - user_management: Required for managing user permissions (handled by permissions sub-router)
 * - team_management: Required for creating new teams
 *
 * @module routes/teams
 * @requires express
 * @requires express-validator
 * @requires ../../middleware/auth
 * @requires ../../middleware/permissions
 * @requires ../../models
 */

const express = require('express');
const { protect } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permissions');
const { Team, User } = require('../../models');
const {
  validateTeamCreate,
  handleValidationErrors
} = require('./validators');

// Import sub-routers for domain-specific functionality
const brandingRouter = require('./branding');
const permissionsRouter = require('./permissions');
const schedulesRouter = require('./schedules');
const statsRouter = require('./stats');

const router = express.Router();

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

// Mount sub-routers for domain-specific functionality
// These handle branding, permissions, schedules, and statistics
router.use('/', brandingRouter);
router.use('/', permissionsRouter);
router.use('/', schedulesRouter);
router.use('/', statsRouter);

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
// Note: This route must be last to avoid conflicting with other named routes like /me, /users
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
