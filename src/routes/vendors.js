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
const { createSortValidators, buildOrderClause } = require('../utils/sorting');

const router = express.Router();

// Middleware: Apply authentication to all routes in this router
// All vendor operations require a valid JWT token
router.use(protect);

/**
 * Validation middleware for listing vendors.
 * Validates query parameters for filtering, pagination, and sorting.
 *
 * @constant {Array<ValidationChain>} validateVendorList
 * @description Express-validator chain for GET /api/vendors
 *
 * @property {string} [search] - Optional search term for text search
 * @property {string} [vendor_type] - Optional filter by vendor category
 * @property {string} [status] - Optional filter by relationship status
 * @property {string} [orderBy] - Optional column to sort by
 * @property {string} [sortDirection] - Optional sort direction ('ASC' or 'DESC')
 * @property {number} [page] - Optional page number (min: 1)
 * @property {number} [limit] - Optional items per page (min: 1, max: 100)
 */
const validateVendorList = [
  query('search').optional().isString(),
  query('vendor_type').optional().isIn(['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other']),
  query('status').optional().isIn(['active', 'inactive', 'pending', 'expired']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  ...createSortValidators('vendors')
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
 * Supports configurable sorting via orderBy and sortDirection query parameters.
 *
 * @access  Private - Requires authentication
 *
 * @param {string} [req.query.search] - Search term for text search across multiple fields
 * @param {string} [req.query.vendor_type] - Filter by vendor category (Equipment|Apparel|Technology|Food Service|Transportation|Medical|Facilities|Other)
 * @param {string} [req.query.status=active] - Filter by status (active|inactive|pending|expired), defaults to 'active'
 * @param {string} [req.query.orderBy=created_at] - Column to sort by (company_name, contact_person, vendor_type, contract_value, contract_start_date, contract_end_date, last_contact_date, next_contact_date, created_at, status)
 * @param {string} [req.query.sortDirection=DESC] - Sort direction ('ASC' or 'DESC', case-insensitive)
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
 * @throws {400} Validation failed - Invalid query parameters or invalid orderBy column or sortDirection value
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
    if (validationError) return;

    // Extract query parameters with defaults
    const {
      search,
      vendor_type,
      status = 'active',  // Default to showing only active vendors
      orderBy,
      sortDirection,
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

    // Business logic: Build dynamic order clause from query parameters (defaults to created_at DESC)
    const orderClause = buildOrderClause('vendors', orderBy, sortDirection);

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
      order: orderClause,
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

module.exports = router;