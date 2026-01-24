/**
 * @fileoverview Vendors routes for managing vendor and supplier information.
 * All routes in this file require authentication via the protect middleware.
 * Vendors are scoped to teams - users can only access vendors belonging to their team.
 *
 * Vendor Model Purpose:
 * Vendors represent external companies and service providers that supply equipment,
 * apparel, technology, food services, transportation, medical supplies, facility
 * services, or other team-related goods and services. This module provides CRM-like
 * functionality for tracking vendor relationships, contracts, and contact history.
 *
 * Vendor Structure:
 * - Vendor: Represents an external supplier with the following key fields:
 *   - company_name: Vendor company name (required, 1-200 chars)
 *   - contact_person: Primary contact at the vendor (optional, max 100 chars)
 *   - email: Contact email address (optional, valid email format, max 255 chars)
 *   - phone: Contact phone number (optional, max 20 chars)
 *   - website: Company website URL (optional, valid URL format)
 *   - vendor_type: Category of vendor services (Equipment|Apparel|Technology|Food Service|Transportation|Medical|Facilities|Other)
 *   - contract_value: Total contract value (optional, decimal)
 *   - contract_start_date: When current contract began (optional, ISO8601 date)
 *   - contract_end_date: When current contract expires (optional, ISO8601 date)
 *   - services_provided: Description of services/products provided (optional, text)
 *   - last_contact_date: Most recent contact with vendor (optional, ISO8601 date)
 *   - next_contact_date: Scheduled follow-up date (optional, ISO8601 date)
 *   - status: Current relationship status (active|inactive|pending|expired)
 *   - created_by: User ID who created the record
 *
 * Vendor Types:
 * - Equipment: Sporting equipment suppliers (bats, balls, gloves, etc.)
 * - Apparel: Uniforms, team merchandise, and clothing providers
 * - Technology: Software, analytics, and tech equipment vendors
 * - Food Service: Catering, concessions, and meal providers
 * - Transportation: Bus companies, travel agencies, charter services
 * - Medical: Athletic training supplies, medical equipment vendors
 * - Facilities: Groundskeeping, maintenance, facility services
 * - Other: Any other vendor category
 *
 * Status Lifecycle:
 * - pending: Initial contact made, no active contract
 * - active: Current active contract or relationship
 * - inactive: Temporarily paused relationship
 * - expired: Contract has ended, relationship on hold
 *
 * Deletion Behavior:
 * - Hard delete is used (not soft delete)
 * - No cascade protections - vendors can be deleted freely
 * - Consider using 'inactive' status instead of deletion for audit purposes
 *
 * Multi-Tenant Isolation:
 * - All queries filter by team_id from the authenticated user
 * - Users can only see vendors belonging to their team
 * - vendor_type and status values are consistent across all teams
 *
 * Permission Model:
 * - All operations: Any authenticated team member
 * - No explicit permission checks beyond authentication
 * - Consider adding vendor_manage permission for stricter control
 *
 * @module routes/vendors
 * @requires express
 * @requires express-validator
 * @requires sequelize
 * @requires ../middleware/auth
 * @requires ../models
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Vendor, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Middleware: Apply authentication to all routes in this router
// All vendor operations require a valid JWT token
router.use(protect);

/**
 * Validation middleware for listing vendors.
 * Validates query parameters for filtering and pagination.
 *
 * @constant {Array<ValidationChain>} validateVendorList
 * @description Express-validator chain for GET /api/vendors
 *
 * @property {string} [search] - Optional search term for text search
 * @property {string} [vendor_type] - Optional filter by vendor category
 * @property {string} [status] - Optional filter by relationship status
 * @property {number} [page] - Optional page number (min: 1)
 * @property {number} [limit] - Optional items per page (min: 1, max: 100)
 */
const validateVendorList = [
  query('search').optional().isString(),
  query('vendor_type').optional().isIn(['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other']),
  query('status').optional().isIn(['active', 'inactive', 'pending', 'expired']),
  query('orderBy').optional().isIn(['company_name', 'contact_person', 'vendor_type', 'contract_value', 'contract_start_date', 'contract_end_date', 'last_contact_date', 'next_contact_date', 'status', 'created_at']),
  query('sortDirection').optional().isIn(['ASC', 'DESC', 'asc', 'desc']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

/**
 * Validation middleware for creating a new vendor.
 * Validates all required and optional fields for vendor creation.
 *
 * @constant {Array<ValidationChain>} validateVendorCreate
 * @description Express-validator chain for POST /api/vendors
 *
 * @property {string} company_name - Required, 1-200 characters
 * @property {string} [contact_person] - Optional, max 100 characters
 * @property {string} [email] - Optional, valid email format, max 255 characters
 * @property {string} [phone] - Optional, max 20 characters
 * @property {string} [website] - Optional, valid URL format
 * @property {string} vendor_type - Required, must be valid vendor type
 * @property {number} [contract_value] - Optional, decimal value
 * @property {string} [contract_start_date] - Optional, ISO8601 date format
 * @property {string} [contract_end_date] - Optional, ISO8601 date format
 * @property {string} [last_contact_date] - Optional, ISO8601 date format
 * @property {string} [next_contact_date] - Optional, ISO8601 date format
 */
const validateVendorCreate = [
  body('company_name').trim().isLength({ min: 1, max: 200 }),
  body('contact_person').optional().trim().isLength({ max: 100 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('phone').optional().isLength({ max: 20 }),
  body('website').optional().isURL(),
  body('vendor_type').isIn(['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other']),
  body('contract_value').optional().isDecimal(),
  body('contract_start_date').optional().isISO8601(),
  body('contract_end_date').optional().isISO8601(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601()
];

/**
 * Validation middleware for updating an existing vendor.
 * All fields are optional for partial updates.
 *
 * @constant {Array<ValidationChain>} validateVendorUpdate
 * @description Express-validator chain for PUT /api/vendors/:id
 *
 * @property {string} [company_name] - Optional, 1-200 characters
 * @property {string} [contact_person] - Optional, max 100 characters
 * @property {string} [email] - Optional, valid email format, max 255 characters
 * @property {string} [phone] - Optional, max 20 characters
 * @property {string} [website] - Optional, valid URL format
 * @property {string} [vendor_type] - Optional, must be valid vendor type
 * @property {number} [contract_value] - Optional, decimal value
 * @property {string} [contract_start_date] - Optional, ISO8601 date format
 * @property {string} [contract_end_date] - Optional, ISO8601 date format
 * @property {string} [last_contact_date] - Optional, ISO8601 date format
 * @property {string} [next_contact_date] - Optional, ISO8601 date format
 * @property {string} [status] - Optional, must be valid status value
 */
const validateVendorUpdate = [
  body('company_name').optional().trim().isLength({ min: 1, max: 200 }),
  body('contact_person').optional().trim().isLength({ max: 100 }),
  body('email').optional().isEmail().isLength({ max: 255 }),
  body('phone').optional().isLength({ max: 20 }),
  body('website').optional().isURL(),
  body('vendor_type').optional().isIn(['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other']),
  body('contract_value').optional().isDecimal(),
  body('contract_start_date').optional().isISO8601(),
  body('contract_end_date').optional().isISO8601(),
  body('last_contact_date').optional().isISO8601(),
  body('next_contact_date').optional().isISO8601(),
  body('status').optional().isIn(['active', 'inactive', 'pending', 'expired'])
];

/**
 * Helper function to handle validation errors.
 * Extracts validation errors and returns a formatted 400 response.
 *
 * @description Checks for validation errors from express-validator and
 * sends a standardized error response if any are found.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object|null} Returns error response if validation failed, null otherwise
 */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  return null;
};

/**
 * @route   GET /api/vendors
 * @description Retrieves a paginated list of vendors for the authenticated user's team.
 * Supports filtering by vendor type, status, and search text. Search performs
 * case-insensitive partial matching across company_name, contact_person,
 * services_provided, and email fields.
 *
 * @access  Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search term for text search across multiple fields
 * @param {string} [req.query.vendor_type] - Filter by vendor category (Equipment|Apparel|Technology|Food Service|Transportation|Medical|Facilities|Other)
 * @param {string} [req.query.status=active] - Filter by status (active|inactive|pending|expired), defaults to 'active'
 * @param {number} [req.query.page=1] - Page number for pagination
 * @param {number} [req.query.limit=20] - Items per page (max 100)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Array<Object>} response.data - Array of vendor objects
 * @returns {number} response.data[].id - Vendor ID
 * @returns {string} response.data[].company_name - Company name
 * @returns {string} response.data[].contact_person - Primary contact name
 * @returns {string} response.data[].email - Contact email
 * @returns {string} response.data[].phone - Contact phone
 * @returns {string} response.data[].website - Company website
 * @returns {string} response.data[].vendor_type - Vendor category
 * @returns {string} response.data[].status - Relationship status
 * @returns {Object} response.data[].Creator - User who created the vendor record
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.page - Current page number
 * @returns {number} response.pagination.limit - Items per page
 * @returns {number} response.pagination.total - Total matching vendors
 * @returns {number} response.pagination.pages - Total number of pages
 *
 * @throws {400} Validation failed - Invalid query parameters
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {500} Server error - Database or server failure
 *
 * @example
 * // Request: GET /api/vendors?search=equipment&vendor_type=Equipment&page=1&limit=10
 * // Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": 1,
 *       "company_name": "Sports Equipment Inc",
 *       "contact_person": "John Smith",
 *       "vendor_type": "Equipment",
 *       "status": "active",
 *       "Creator": { "id": 5, "first_name": "Jane", "last_name": "Coach" }
 *     }
 *   ],
 *   "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
 * }
 */
router.get('/', validateVendorList, async (req, res) => {
  try {
    // Validation: Check for any validation errors from middleware
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return;
    }

    // Extract query parameters with defaults
    const {
      search,
      vendor_type,
      status = 'active',  // Default to showing only active vendors
      orderBy = 'created_at',
      sortDirection = 'DESC',
      page = 1,
      limit = 20
    } = req.query;

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where clause with multi-tenant isolation
    // Business logic: Users can only see vendors belonging to their team
    const whereClause = {
      team_id: req.user.team_id
    };

    // Apply status filter (defaults to 'active')
    if (status) {
      whereClause.status = status;
    }

    // Apply vendor type filter if provided
    if (vendor_type) {
      whereClause.vendor_type = vendor_type;
    }

    // Apply search filter across multiple text fields
    // Business logic: Case-insensitive partial matching on company_name,
    // contact_person, services_provided, and email
    if (search) {
      whereClause[Op.or] = [
        { company_name: { [Op.iLike]: `%${search}%` } },
        { contact_person: { [Op.iLike]: `%${search}%` } },
        { services_provided: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Determine sort order
    const order = [[orderBy, sortDirection.toUpperCase()]];

    // Database: Fetch paginated vendors with creator association
    const { count, rows: vendors } = await Vendor.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Return paginated response
    res.json({
      success: true,
      data: vendors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching vendors'
    });
  }
});

/**
 * @route   GET /api/vendors/:id
 * @description Retrieves a specific vendor by ID. Only returns vendors belonging
 * to the authenticated user's team (multi-tenant isolation).
 *
 * @access  Private - Requires authentication
 *
 * @param {string} req.params.id - Vendor ID (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Vendor object with all fields
 * @returns {number} response.data.id - Vendor ID
 * @returns {string} response.data.company_name - Company name
 * @returns {string} response.data.contact_person - Primary contact name
 * @returns {string} response.data.email - Contact email
 * @returns {string} response.data.phone - Contact phone
 * @returns {string} response.data.website - Company website URL
 * @returns {string} response.data.vendor_type - Vendor category
 * @returns {string} response.data.services_provided - Description of services
 * @returns {number} response.data.contract_value - Contract value
 * @returns {string} response.data.contract_start_date - Contract start date
 * @returns {string} response.data.contract_end_date - Contract end date
 * @returns {string} response.data.last_contact_date - Last contact date
 * @returns {string} response.data.next_contact_date - Next scheduled contact
 * @returns {string} response.data.status - Relationship status
 * @returns {Object} response.data.Creator - User who created the record
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not found - Vendor does not exist or belongs to different team
 * @throws {500} Server error - Database or server failure
 *
 * @example
 * // Request: GET /api/vendors/123e4567-e89b-12d3-a456-426614174000
 * // Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "123e4567-e89b-12d3-a456-426614174000",
 *     "company_name": "Sports Equipment Inc",
 *     "contact_person": "John Smith",
 *     "email": "john@sportsequip.com",
 *     "vendor_type": "Equipment",
 *     "status": "active",
 *     "Creator": { "id": 5, "first_name": "Jane", "last_name": "Coach" }
 *   }
 * }
 */
router.get('/:id', async (req, res) => {
  try {
    // Database: Fetch vendor with team scoping for multi-tenant isolation
    const vendor = await Vendor.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id  // Multi-tenant: Only fetch vendor from user's team
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Error: Return 404 if vendor not found or belongs to different team
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Get vendor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching vendor'
    });
  }
});

/**
 * @route   POST /api/vendors
 * @description Creates a new vendor record for the authenticated user's team.
 * Automatically assigns team_id and created_by from the authenticated user.
 * New vendors are created with a default status if not specified.
 *
 * @access  Private - Requires authentication
 *
 * @param {string} req.body.company_name - Company name (required, 1-200 chars)
 * @param {string} [req.body.contact_person] - Primary contact name (max 100 chars)
 * @param {string} [req.body.email] - Contact email (valid email format)
 * @param {string} [req.body.phone] - Contact phone (max 20 chars)
 * @param {string} [req.body.website] - Company website (valid URL)
 * @param {string} req.body.vendor_type - Vendor category (required, Equipment|Apparel|Technology|Food Service|Transportation|Medical|Facilities|Other)
 * @param {number} [req.body.contract_value] - Contract monetary value
 * @param {string} [req.body.contract_start_date] - Contract start (ISO8601 format)
 * @param {string} [req.body.contract_end_date] - Contract end (ISO8601 format)
 * @param {string} [req.body.services_provided] - Description of services/products
 * @param {string} [req.body.last_contact_date] - Last contact date (ISO8601 format)
 * @param {string} [req.body.next_contact_date] - Next contact date (ISO8601 format)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status (true)
 * @returns {Object} response.data - Created vendor object with all fields
 *
 * @throws {400} Validation failed - Invalid or missing required fields
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {500} Server error - Database or server failure
 *
 * @example
 * // Request: POST /api/vendors
 * // Body:
 * {
 *   "company_name": "Pro Sports Equipment",
 *   "contact_person": "Mike Johnson",
 *   "email": "mike@prosports.com",
 *   "phone": "555-123-4567",
 *   "vendor_type": "Equipment",
 *   "contract_value": 50000,
 *   "contract_start_date": "2024-01-01",
 *   "contract_end_date": "2024-12-31"
 * }
 * // Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "123e4567-e89b-12d3-a456-426614174000",
 *     "company_name": "Pro Sports Equipment",
 *     ...
 *   }
 * }
 */
router.post('/', validateVendorCreate, async (req, res) => {
  try {
    // Validation: Check for any validation errors from middleware
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return;
    }

    // Database: Create vendor with automatic team and creator assignment
    // Business logic: team_id and created_by are set from authenticated user
    const vendor = await Vendor.create({
      ...req.body,
      team_id: req.user.team_id,    // Multi-tenant: Assign to user's team
      created_by: req.user.id        // Audit: Track who created the record
    });

    // Database: Re-fetch to include Creator association in response
    const createdVendor = await Vendor.findByPk(vendor.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Return 201 Created with the new vendor
    res.status(201).json({
      success: true,
      data: createdVendor
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Create vendor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating vendor'
    });
  }
});

/**
 * @route   PUT /api/vendors/:id
 * @description Updates an existing vendor record. Only vendors belonging to
 * the authenticated user's team can be updated (multi-tenant isolation).
 * Supports partial updates - only provided fields will be modified.
 *
 * @access  Private - Requires authentication
 *
 * @param {string} req.params.id - Vendor ID to update (UUID)
 * @param {string} [req.body.company_name] - Updated company name (1-200 chars)
 * @param {string} [req.body.contact_person] - Updated contact name (max 100 chars)
 * @param {string} [req.body.email] - Updated email (valid email format)
 * @param {string} [req.body.phone] - Updated phone (max 20 chars)
 * @param {string} [req.body.website] - Updated website (valid URL)
 * @param {string} [req.body.vendor_type] - Updated vendor category
 * @param {number} [req.body.contract_value] - Updated contract value
 * @param {string} [req.body.contract_start_date] - Updated contract start (ISO8601)
 * @param {string} [req.body.contract_end_date] - Updated contract end (ISO8601)
 * @param {string} [req.body.services_provided] - Updated services description
 * @param {string} [req.body.last_contact_date] - Updated last contact (ISO8601)
 * @param {string} [req.body.next_contact_date] - Updated next contact (ISO8601)
 * @param {string} [req.body.status] - Updated status (active|inactive|pending|expired)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {Object} response.data - Updated vendor object with all fields
 *
 * @throws {400} Validation failed - Invalid field values
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not found - Vendor does not exist or belongs to different team
 * @throws {500} Server error - Database or server failure
 *
 * @example
 * // Request: PUT /api/vendors/123e4567-e89b-12d3-a456-426614174000
 * // Body:
 * {
 *   "contact_person": "Jane Smith",
 *   "last_contact_date": "2024-03-15",
 *   "next_contact_date": "2024-04-15"
 * }
 * // Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "123e4567-e89b-12d3-a456-426614174000",
 *     "company_name": "Pro Sports Equipment",
 *     "contact_person": "Jane Smith",
 *     ...
 *   }
 * }
 */
router.put('/:id', validateVendorUpdate, async (req, res) => {
  try {
    // Validation: Check for any validation errors from middleware
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return;
    }

    // Database: Find vendor with team scoping for multi-tenant isolation
    const vendor = await Vendor.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id  // Multi-tenant: Only update vendor from user's team
      }
    });

    // Error: Return 404 if vendor not found or belongs to different team
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Database: Apply partial update with provided fields
    // Business logic: Only fields in req.body are updated, others preserved
    await vendor.update(req.body);

    // Database: Re-fetch to include Creator association in response
    const updatedVendor = await Vendor.findByPk(vendor.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedVendor
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Update vendor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating vendor'
    });
  }
});

/**
 * @route   DELETE /api/vendors/:id
 * @description Permanently deletes a vendor record. Only vendors belonging to
 * the authenticated user's team can be deleted (multi-tenant isolation).
 * This is a hard delete - the record is permanently removed from the database.
 *
 * Note: Consider using PUT to set status to 'inactive' instead of deleting,
 * to preserve audit history and allow for potential recovery.
 *
 * @access  Private - Requires authentication
 *
 * @param {string} req.params.id - Vendor ID to delete (UUID)
 *
 * @returns {Object} response
 * @returns {boolean} response.success - Operation success status
 * @returns {string} response.message - Success confirmation message
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {404} Not found - Vendor does not exist or belongs to different team
 * @throws {500} Server error - Database or server failure
 *
 * @example
 * // Request: DELETE /api/vendors/123e4567-e89b-12d3-a456-426614174000
 * // Response:
 * {
 *   "success": true,
 *   "message": "Vendor deleted successfully"
 * }
 */
router.delete('/:id', async (req, res) => {
  try {
    // Database: Find vendor with team scoping for multi-tenant isolation
    const vendor = await Vendor.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id  // Multi-tenant: Only delete vendor from user's team
      }
    });

    // Error: Return 404 if vendor not found or belongs to different team
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    // Database: Permanently delete the vendor record (hard delete)
    // Note: No cascade protections - vendors can be deleted freely
    await vendor.destroy();

    res.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {
    // Error: Log and return generic server error
    console.error('Delete vendor error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting vendor'
    });
  }
});

module.exports = router;
