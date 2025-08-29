const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Vendor, User } = require('../models');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// @route   GET /api/vendors
// @desc    Get all vendors for the user's team
// @access  Private
router.get('/', [
  query('search').optional().isString(),
  query('vendor_type').optional().isIn(['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other']),
  query('status').optional().isIn(['active', 'inactive', 'pending', 'expired']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const { 
      search, 
      vendor_type,
      status = 'active',
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {
      team_id: req.user.team_id
    };

    if (status) {
      whereClause.status = status;
    }

    if (vendor_type) {
      whereClause.vendor_type = vendor_type;
    }

    if (search) {
      whereClause[Op.or] = [
        { company_name: { [Op.iLike]: `%${search}%` } },
        { contact_person: { [Op.iLike]: `%${search}%` } },
        { services_provided: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: vendors } = await Vendor.findAndCountAll({
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
    console.error('Get vendors error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching vendors' 
    });
  }
});

// @route   GET /api/vendors/:id
// @desc    Get a specific vendor
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
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
    console.error('Get vendor error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching vendor' 
    });
  }
});

// @route   POST /api/vendors
// @desc    Create a new vendor
// @access  Private
router.post('/', [
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const vendor = await Vendor.create({
      ...req.body,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    const createdVendor = await Vendor.findByPk(vendor.id, {
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: createdVendor
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while creating vendor' 
    });
  }
});

// @route   PUT /api/vendors/:id
// @desc    Update a vendor
// @access  Private
router.put('/:id', [
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const vendor = await Vendor.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vendor not found' 
      });
    }

    await vendor.update(req.body);

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
    console.error('Update vendor error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating vendor' 
    });
  }
});

// @route   DELETE /api/vendors/:id
// @desc    Delete a vendor
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id
      }
    });

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vendor not found' 
      });
    }

    await vendor.destroy();

    res.json({
      success: true,
      message: 'Vendor deleted successfully'
    });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting vendor' 
    });
  }
});

module.exports = router;
