<<<<<<< HEAD
// Integration tests for vendors route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
<<<<<<< HEAD
const { Vendor, User, Team, sequelize } = require('../../models');
=======
const { Vendor, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
const jwt = require('jsonwebtoken');

describe('vendors routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../vendors');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function')
    expect(typeof router.post).toBe('function')
    expect(typeof router.put).toBe('function')
    expect(typeof router.delete).toBe('function')
  })
})

<<<<<<< HEAD
describe('Vendors API - Complete CRUD and Sorting Tests', () => {
=======
const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Vendor } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Vendors API - Complete CRUD Tests', () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;
<<<<<<< HEAD
  let testVendors = [];

  beforeAll(async () => {
    // Ensure database connection
=======
describe('Vendors List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testVendors = [];

  beforeAll(async () => {
    // Ensure we're using the test database
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

<<<<<<< HEAD
    await sequelize.authenticate();

    // Sync database
    await sequelize.sync({ force: true });

    // Create test teams
=======
    // Sync database
    await sequelize.sync({ force: true });

    // Create test team
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    testTeam = await Team.create({
      name: 'Test Team',
      program_name: 'Test Program',
      school: 'Test University',
      division: 'D1',
      conference: 'Test Conference',
      city: 'Test City',
      state: 'TS'
    });

<<<<<<< HEAD
    otherTeam = await Team.create({
      name: 'Other Team',
      program_name: 'Other Program',
      school: 'Other University',
      division: 'D2',
      conference: 'Other Conference',
      city: 'Other City',
      state: 'OS'
    });

    // Create test users
=======
    // Create test user
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    testUser = await User.create({
      first_name: 'Test',
      last_name: 'Coach',
      email: 'test@example.com',
      password: 'password123',
      role: 'coach',
      team_id: testTeam.id
    });

<<<<<<< HEAD
    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'Coach',
      email: 'other@example.com',
      password: 'password123',
      role: 'coach',
=======

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Vendors Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Vendors Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Vendors',
      last_name: 'TestUser',
      email: 'vendors-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-vendors-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      team_id: otherTeam.id
    });

    // Generate auth tokens
<<<<<<< HEAD
=======
    // Generate auth token
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    authToken = jwt.sign(
      {
        id: testUser.id,
        email: testUser.email,
        role: testUser.role,
        team_id: testUser.team_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

<<<<<<< HEAD
    otherAuthToken = jwt.sign(
      {
        id: otherUser.id,
        email: otherUser.email,
        role: otherUser.role,
        team_id: otherUser.team_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
=======
    // Create test vendors with varying data for sorting
    const vendorsData = [
      {
        company_name: 'Alpha Sports Equipment',
        contact_person: 'Alice Anderson',
        email: 'alice@alphasports.com',
        phone: '555-0001',
        vendor_type: 'Equipment',
        contract_value: 50000.00,
        contract_start_date: '2024-01-15',
        contract_end_date: '2025-01-15',
        last_contact_date: '2024-03-10',
        next_contact_date: '2024-06-10',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        company_name: 'Zulu Apparel Co',
        contact_person: 'Bob Brown',
        email: 'bob@zuluapparel.com',
        phone: '555-0002',
        vendor_type: 'Apparel',
        contract_value: 75000.00,
        contract_start_date: '2024-02-01',
        contract_end_date: '2025-02-01',
        last_contact_date: '2024-04-15',
        next_contact_date: '2024-07-15',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        company_name: 'Beta Tech Solutions',
        contact_person: 'Charlie Chen',
        email: 'charlie@betatech.com',
        phone: '555-0003',
        vendor_type: 'Technology',
        contract_value: 30000.00,
        contract_start_date: '2024-03-01',
        contract_end_date: '2025-03-01',
        last_contact_date: '2024-02-20',
        next_contact_date: '2024-05-20',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        company_name: 'Midwest Transport',
        contact_person: 'Diana Davis',
        email: 'diana@midwesttransport.com',
        phone: '555-0004',
        vendor_type: 'Transportation',
        contract_value: 100000.00,
        contract_start_date: '2023-12-01',
        contract_end_date: '2024-12-01',
        last_contact_date: '2024-05-01',
        next_contact_date: '2024-08-01',
        status: 'pending',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        company_name: 'Elite Medical Supplies',
        contact_person: 'Eve Edwards',
        email: 'eve@elitemedical.com',
        phone: '555-0005',
        vendor_type: 'Medical',
        contract_value: 25000.00,
        contract_start_date: '2024-01-01',
        contract_end_date: '2024-06-30',
        last_contact_date: '2024-01-15',
        next_contact_date: '2024-04-15',
        status: 'expired',
        team_id: testTeam.id,
        created_by: testUser.id
      }
    ];

    // Create vendors sequentially to ensure different created_at timestamps
    for (const vendorData of vendorsData) {
      const vendor = await Vendor.create(vendorData);
      testVendors.push(vendor);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
  });

  afterAll(async () => {
    await sequelize.close();
  });

<<<<<<< HEAD
=======
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await Vendor.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

>>>>>>> auto-claude/039-improve-backend-route-test-coverage
  beforeEach(async () => {
    // Clean up vendors before each test
    await Vendor.destroy({ where: {}, force: true });
  });

<<<<<<< HEAD
  describe('GET /api/vendors - Authentication', () => {
=======
  describe('GET /api/vendors', () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
<<<<<<< HEAD
  });

  describe('GET /api/vendors - Basic Queries', () => {
=======

>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should return empty array when no vendors exist', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of vendors for authenticated user team', async () => {
      // Create test vendors
      await Vendor.create({
        company_name: 'Test Vendor 1',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Test Vendor 2',
        vendor_type: 'Apparel',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(2);
    });

    it('should only return vendors for user team (team isolation)', async () => {
      // Create vendors for different teams
      await Vendor.create({
        company_name: 'My Team Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Other Team Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].company_name).toBe('My Team Vendor');
    });
<<<<<<< HEAD
  });

  describe('GET /api/vendors - Filtering by vendor_type', () => {
=======

>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should filter vendors by vendor_type', async () => {
      // Create vendors with different types
      await Vendor.create({
        company_name: 'Equipment Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Apparel Vendor',
        vendor_type: 'Apparel',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors?vendor_type=Equipment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].vendor_type).toBe('Equipment');
    });

<<<<<<< HEAD
    it('should reject invalid vendor_type filter', async () => {
      const response = await request(app)
        .get('/api/vendors?vendor_type=InvalidType')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/vendors - Filtering by status', () => {
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should filter vendors by status', async () => {
      // Create vendors with different statuses
      await Vendor.create({
        company_name: 'Active Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Inactive Vendor',
        vendor_type: 'Equipment',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors?status=inactive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('inactive');
    });

    it('should default to active status filter', async () => {
      // Create vendors with different statuses
      await Vendor.create({
        company_name: 'Active Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Inactive Vendor',
        vendor_type: 'Equipment',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

<<<<<<< HEAD
    it('should reject invalid status filter', async () => {
      const response = await request(app)
        .get('/api/vendors?status=invalid-status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/vendors - Search Functionality', () => {
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should search vendors by company name', async () => {
      // Create vendors
      await Vendor.create({
        company_name: 'Sports Equipment Inc',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Apparel Solutions',
        vendor_type: 'Apparel',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors?search=Sports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].company_name).toBe('Sports Equipment Inc');
    });

    it('should search vendors by contact person', async () => {
      // Create vendors
      await Vendor.create({
        company_name: 'Test Vendor',
        contact_person: 'John Smith',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Vendor.create({
        company_name: 'Another Vendor',
        contact_person: 'Jane Doe',
        vendor_type: 'Apparel',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors?search=John')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].contact_person).toBe('John Smith');
    });
<<<<<<< HEAD
  });

  describe('GET /api/vendors - Pagination', () => {
=======

>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should support pagination', async () => {
      // Create multiple vendors
      for (let i = 1; i <= 5; i++) {
        await Vendor.create({
          company_name: `Vendor ${i}`,
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      }

      const response = await request(app)
        .get('/api/vendors?page=1&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(3);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(3);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.pages).toBe(2);
    });
<<<<<<< HEAD
  });

  describe('GET /api/vendors - Creator Information', () => {
=======

>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should include creator information', async () => {
      await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].Creator).toBeDefined();
<<<<<<< HEAD
      expect(response.body.data[0].Creator.first_name).toBe('Test');
      expect(response.body.data[0].Creator.last_name).toBe('Coach');
    });
  });

  describe('GET /api/vendors - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
=======
      expect(response.body.data[0].Creator.first_name).toBe('Vendors');
      expect(response.body.data[0].Creator.last_name).toBe('TestUser');
    });

    it('should sort vendors by created_at descending', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      // Create vendors at different times
      const vendor1 = await Vendor.create({
        company_name: 'First Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const vendor2 = await Vendor.create({
        company_name: 'Second Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

<<<<<<< HEAD
=======
  describe('GET /api/vendors - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
<<<<<<< HEAD
<<<<<<< HEAD
      expect(response.body.data[0].company_name).toBe('Second Vendor');
      expect(response.body.data[1].company_name).toBe('First Vendor');
=======
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(v => new Date(v.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    });
  });

  describe('GET /api/vendors - Sorting by company_name', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      // Create test vendors with varying data for sorting
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          contact_person: 'Alice Anderson',
          email: 'alice@alphasports.com',
          phone: '555-0001',
          vendor_type: 'Equipment',
          contract_value: 50000.00,
          contract_start_date: '2024-01-15',
          contract_end_date: '2025-01-15',
          last_contact_date: '2024-03-10',
          next_contact_date: '2024-06-10',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          contact_person: 'Bob Brown',
          email: 'bob@zuluapparel.com',
          phone: '555-0002',
          vendor_type: 'Apparel',
          contract_value: 75000.00,
          contract_start_date: '2024-02-01',
          contract_end_date: '2025-02-01',
          last_contact_date: '2024-04-15',
          next_contact_date: '2024-07-15',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          contact_person: 'Charlie Chen',
          email: 'charlie@betatech.com',
          phone: '555-0003',
          vendor_type: 'Technology',
          contract_value: 30000.00,
          contract_start_date: '2024-03-01',
          contract_end_date: '2025-03-01',
          last_contact_date: '2024-02-20',
          next_contact_date: '2024-05-20',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          contact_person: 'Diana Davis',
          email: 'diana@midwesttransport.com',
          phone: '555-0004',
          vendor_type: 'Transportation',
          contract_value: 100000.00,
          contract_start_date: '2023-12-01',
          contract_end_date: '2024-12-01',
          last_contact_date: '2024-05-01',
          next_contact_date: '2024-08-01',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          contact_person: 'Eve Edwards',
          email: 'eve@elitemedical.com',
          phone: '555-0005',
          vendor_type: 'Medical',
          contract_value: 25000.00,
          contract_start_date: '2024-01-01',
          contract_end_date: '2024-06-30',
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-04-15',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      // Create vendors sequentially to ensure different created_at timestamps
      for (const vendorData of vendorsData) {
        const vendor = await Vendor.create(vendorData);
        testVendors.push(vendor);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by company_name ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(v => v.company_name);
      expect(names).toEqual(['Alpha Sports Equipment', 'Beta Tech Solutions', 'Elite Medical Supplies', 'Midwest Transport', 'Zulu Apparel Co']);
    });

    it('should sort by company_name DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(v => v.company_name);
      expect(names).toEqual(['Zulu Apparel Co', 'Midwest Transport', 'Elite Medical Supplies', 'Beta Tech Solutions', 'Alpha Sports Equipment']);
    });

    it('should handle case-insensitive sortDirection for company_name', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=asc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(v => v.company_name);
      expect(names).toEqual(['Alpha Sports Equipment', 'Beta Tech Solutions', 'Elite Medical Supplies', 'Midwest Transport', 'Zulu Apparel Co']);
    });
  });

  describe('GET /api/vendors - Sorting by contact_person', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          contact_person: 'Alice Anderson',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          contact_person: 'Bob Brown',
          vendor_type: 'Apparel',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          contact_person: 'Charlie Chen',
          vendor_type: 'Technology',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          contact_person: 'Diana Davis',
          vendor_type: 'Transportation',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          contact_person: 'Eve Edwards',
          vendor_type: 'Medical',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by contact_person ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contact_person&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const contacts = response.body.data.map(v => v.contact_person);
      expect(contacts).toEqual(['Alice Anderson', 'Bob Brown', 'Charlie Chen', 'Diana Davis', 'Eve Edwards']);
    });

    it('should sort by contact_person DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contact_person&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const contacts = response.body.data.map(v => v.contact_person);
      expect(contacts).toEqual(['Eve Edwards', 'Diana Davis', 'Charlie Chen', 'Bob Brown', 'Alice Anderson']);
    });
  });

  describe('GET /api/vendors - Sorting by vendor_type', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by vendor_type ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=vendor_type&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const types = response.body.data.map(v => v.vendor_type);
<<<<<<< HEAD
=======
      // Alphabetically: Apparel, Equipment, Medical, Technology, Transportation
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
      expect(types).toEqual(['Apparel', 'Equipment', 'Medical', 'Technology', 'Transportation']);
    });

    it('should sort by vendor_type DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=vendor_type&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const types = response.body.data.map(v => v.vendor_type);
      expect(types).toEqual(['Transportation', 'Technology', 'Medical', 'Equipment', 'Apparel']);
    });
  });

  describe('GET /api/vendors - Sorting by contract_value', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          contract_value: 50000.00,
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          contract_value: 75000.00,
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          contract_value: 30000.00,
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          contract_value: 100000.00,
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          contract_value: 25000.00,
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by contract_value ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_value&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const values = response.body.data.map(v => parseFloat(v.contract_value));
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });

    it('should sort by contract_value DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_value&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const values = response.body.data.map(v => parseFloat(v.contract_value));
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by contract_start_date', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          contract_start_date: '2024-01-15',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          contract_start_date: '2024-02-01',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          contract_start_date: '2024-03-01',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          contract_start_date: '2023-12-01',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          contract_start_date: '2024-01-01',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by contract_start_date ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_start_date&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.contract_start_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by contract_start_date DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_start_date&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.contract_start_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by contract_end_date', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          contract_end_date: '2025-01-15',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          contract_end_date: '2025-02-01',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          contract_end_date: '2025-03-01',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          contract_end_date: '2024-12-01',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          contract_end_date: '2024-06-30',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by contract_end_date ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_end_date&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.contract_end_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by contract_end_date DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=contract_end_date&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.contract_end_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by last_contact_date', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          last_contact_date: '2024-03-10',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          last_contact_date: '2024-04-15',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          last_contact_date: '2024-02-20',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          last_contact_date: '2024-05-01',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          last_contact_date: '2024-01-15',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by last_contact_date ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=last_contact_date&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.last_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by last_contact_date DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=last_contact_date&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.last_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by next_contact_date', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          next_contact_date: '2024-06-10',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          next_contact_date: '2024-07-15',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          next_contact_date: '2024-05-20',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          next_contact_date: '2024-08-01',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Elite Medical Supplies',
          vendor_type: 'Medical',
          next_contact_date: '2024-04-15',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by next_contact_date ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=next_contact_date&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.next_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by next_contact_date DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=next_contact_date&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(v => new Date(v.next_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by status', () => {
<<<<<<< HEAD
    beforeEach(async () => {
      const vendorsData = [
        {
          company_name: 'Alpha Sports Equipment',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Zulu Apparel Co',
          vendor_type: 'Apparel',
          status: 'inactive',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Beta Tech Solutions',
          vendor_type: 'Technology',
          status: 'pending',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          company_name: 'Midwest Transport',
          vendor_type: 'Transportation',
          status: 'expired',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ];

      for (const vendorData of vendorsData) {
        await Vendor.create(vendorData);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    it('should sort by status ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=status&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(v => v.status);
<<<<<<< HEAD
      expect(statuses).toEqual(['active', 'expired', 'inactive', 'pending']);
=======
      // Alphabetically: active (2), expired (1), inactive (1), pending (1)
      const activeCount = statuses.filter(s => s === 'active').length;
      const expiredCount = statuses.filter(s => s === 'expired').length;
      const inactiveCount = statuses.filter(s => s === 'inactive').length;
      const pendingCount = statuses.filter(s => s === 'pending').length;
      expect(activeCount).toBe(2);
      expect(expiredCount).toBe(1);
      expect(inactiveCount).toBe(1);
      expect(pendingCount).toBe(1);
      // Verify 'active' entries come first
      expect(statuses[0]).toBe('active');
      expect(statuses[1]).toBe('active');
      expect(statuses[2]).toBe('expired');
      expect(statuses[3]).toBe('inactive');
      expect(statuses[4]).toBe('pending');
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    });

    it('should sort by status DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=status&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(v => v.status);
<<<<<<< HEAD
      expect(statuses).toEqual(['pending', 'inactive', 'expired', 'active']);
=======
      expect(response.body.data[0].company_name).toBe('Second Vendor');
      expect(response.body.data[1].company_name).toBe('First Vendor');
    });

    it('should reject invalid vendor_type filter', async () => {
      const response = await request(app)
        .get('/api/vendors?vendor_type=InvalidType')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid status filter', async () => {
      const response = await request(app)
        .get('/api/vendors?status=invalid-status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });
  });

  describe('GET /api/vendors/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors/1')
<<<<<<< HEAD
=======
      // Reverse alphabetically
      expect(statuses[0]).toBe('pending');
      expect(statuses[1]).toBe('inactive');
      expect(statuses[2]).toBe('expired');
      expect(statuses[3]).toBe('active');
      expect(statuses[4]).toBe('active');
    });
  });

  describe('GET /api/vendors - Sorting by created_at', () => {
    it('should sort by created_at ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=created_at&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(v => new Date(v.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it('should sort by created_at DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=created_at&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(v => new Date(v.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Validation', () => {
    it('should return 400 for invalid orderBy column', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=invalid_column&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid sortDirection', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for both invalid orderBy and sortDirection', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=bad_column&sortDirection=BAD_DIR')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/vendors - Sorting with Filters', () => {
    it('should sort filtered results by company_name (filter by vendor_type)', async () => {
      const response = await request(app)
        .get('/api/vendors?vendor_type=Equipment&orderBy=company_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1); // 1 Equipment vendor
      expect(response.body.data[0].company_name).toBe('Alpha Sports Equipment');
    });

    it('should sort filtered results by contract_value (filter by status)', async () => {
      const response = await request(app)
        .get('/api/vendors?status=active&orderBy=contract_value&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2); // 2 active vendors
      const values = response.body.data.map(v => parseFloat(v.contract_value));
      expect(values[0]).toBeGreaterThanOrEqual(values[1]);
    });

    it('should sort filtered results with search query', async () => {
      const response = await request(app)
        .get('/api/vendors?search=Tech&orderBy=company_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should match "Beta Tech Solutions" and "Midwest Transport"
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/vendors - Sorting with Pagination', () => {
    it('should sort and paginate correctly', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=ASC&page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(5);

      // First page should have Alpha Sports Equipment and Beta Tech Solutions
      const names = response.body.data.map(v => v.company_name);
      expect(names).toEqual(['Alpha Sports Equipment', 'Beta Tech Solutions']);
    });

    it('should maintain sort order across pages', async () => {
      const page1Response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=ASC&page=1&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const page2Response = await request(app)
        .get('/api/vendors?orderBy=company_name&sortDirection=ASC&page=2&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(page1Response.body.success).toBe(true);
      expect(page2Response.body.success).toBe(true);

      const page1Names = page1Response.body.data.map(v => v.company_name);
      const page2Names = page2Response.body.data.map(v => v.company_name);

      // Last name on page 1 should be <= first name on page 2
      if (page2Names.length > 0) {
        expect(page1Names[page1Names.length - 1].localeCompare(page2Names[0])).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('GET /api/vendors - Edge Cases', () => {
    it('should use default sorting when only orderBy is provided', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=company_name')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(v => v.company_name);
      // Should use DESC by default
      expect(names).toEqual(['Zulu Apparel Co', 'Midwest Transport', 'Elite Medical Supplies', 'Beta Tech Solutions', 'Alpha Sports Equipment']);
    });

    it('should ignore sortDirection when orderBy is not provided', async () => {
      const response = await request(app)
        .get('/api/vendors?sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should fall back to default created_at DESC
      const timestamps = response.body.data.map(v => new Date(v.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors')
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        .expect(401);

      expect(response.body.success).toBe(false);
    });

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    it('should return vendor by id', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        contact_person: 'John Smith',
        email: 'john@test.com',
        phone: '555-1234',
        website: 'https://test.com',
        vendor_type: 'Equipment',
        status: 'active',
        contract_value: 10000,
        contract_start_date: '2024-01-01',
        contract_end_date: '2024-12-31',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.company_name).toBe('Test Vendor');
      expect(response.body.data.contact_person).toBe('John Smith');
      expect(response.body.data.email).toBe('john@test.com');
      expect(response.body.data.vendor_type).toBe('Equipment');
    });

    it('should include creator information', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
<<<<<<< HEAD
      expect(response.body.data.Creator.first_name).toBe('Test');
      expect(response.body.data.Creator.last_name).toBe('Coach');
=======
      expect(response.body.data.Creator.first_name).toBe('Vendors');
      expect(response.body.data.Creator.last_name).toBe('TestUser');
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .get('/api/vendors/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });

    it('should enforce team isolation (cannot access other team vendor)', async () => {
      const vendor = await Vendor.create({
        company_name: 'Other Team Vendor',
        vendor_type: 'Equipment',
<<<<<<< HEAD
=======
    it('should only return vendors for user\'s team', async () => {
      // Create another team and vendor
      const otherTeam = await Team.create({
        name: 'Other Team',
        program_name: 'Other Program',
        school: 'Other University',
        division: 'D1',
        conference: 'Other Conference',
        city: 'Other City',
        state: 'OT'
      });

      const otherUser = await User.create({
        first_name: 'Other',
        last_name: 'Coach',
        email: 'other@example.com',
        password: 'password123',
        role: 'coach',
        team_id: otherTeam.id
      });

      await Vendor.create({
        company_name: 'Other Vendor Inc',
        contact_person: 'Other Person',
        email: 'other@vendor.com',
        phone: '555-9999',
        vendor_type: 'Other',
        contract_value: 10000.00,
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        .get(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });
  });

  describe('POST /api/vendors', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create vendor with required fields only', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'New Vendor',
          vendor_type: 'Equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.company_name).toBe('New Vendor');
      expect(response.body.data.vendor_type).toBe('Equipment');
<<<<<<< HEAD
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.team_id).toBe(testTeam.id);
=======
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });

    it('should create vendor with all fields', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
<<<<<<< HEAD
          company_name: 'Full Vendor',
          contact_person: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          website: 'https://example.com',
          vendor_type: 'Apparel',
          status: 'inactive',
          contract_value: 50000,
          contract_start_date: '2024-01-01',
          contract_end_date: '2024-12-31',
          last_contact_date: '2024-03-15',
          next_contact_date: '2024-06-15',
          notes: 'Test vendor'
=======
          company_name: 'Complete Vendor',
          contact_person: 'Jane Doe',
          email: 'jane@vendor.com',
          phone: '555-9876',
          website: 'https://vendor.com',
          vendor_type: 'Apparel',
          contract_value: 25000,
          contract_start_date: '2024-01-01',
          contract_end_date: '2024-12-31',
          services_provided: 'Uniforms and team apparel',
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-02-15'
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        })
        .expect(201);

      expect(response.body.success).toBe(true);
<<<<<<< HEAD
      expect(response.body.data.company_name).toBe('Full Vendor');
      expect(response.body.data.contact_person).toBe('John Doe');
      expect(response.body.data.email).toBe('john@example.com');
      expect(response.body.data.phone).toBe('555-1234');
      expect(response.body.data.website).toBe('https://example.com');
      expect(response.body.data.vendor_type).toBe('Apparel');
      expect(response.body.data.status).toBe('inactive');
      expect(response.body.data.contract_value).toBe(50000);
    });

    it('should reject missing company_name', async () => {
=======
      expect(response.body.data.company_name).toBe('Complete Vendor');
      expect(response.body.data.contact_person).toBe('Jane Doe');
      expect(response.body.data.email).toBe('jane@vendor.com');
      expect(response.body.data.vendor_type).toBe('Apparel');
    });

    it('should validate required company_name', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendor_type: 'Equipment'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
<<<<<<< HEAD
    });

    it('should reject missing vendor_type', async () => {
=======
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required vendor_type', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
<<<<<<< HEAD
    });

    it('should reject invalid vendor_type', async () => {
=======
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate vendor_type enum values', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'InvalidType'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
<<<<<<< HEAD
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          status: 'invalid-status'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
=======
      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept all valid vendor_type values', async () => {
      const vendorTypes = ['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other'];

      for (const type of vendorTypes) {
        const response = await request(app)
          .post('/api/vendors')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: `${type} Vendor`,
            vendor_type: type
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.vendor_type).toBe(type);
      }
    });

    it('should validate email format', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
<<<<<<< HEAD
    });

    it('should reject invalid website URL format', async () => {
=======
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate website URL format', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
<<<<<<< HEAD
          website: 'invalid-url'
=======
          website: 'not-a-url'
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        })
        .expect(400);

      expect(response.body.success).toBe(false);
<<<<<<< HEAD
    });

    it('should return vendor with creator information', async () => {
=======
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate company_name max length (200 chars)', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
<<<<<<< HEAD
          company_name: 'Creator Test Vendor',
=======
          company_name: 'a'.repeat(201),
          vendor_type: 'Equipment'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate contact_person max length (100 chars)', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          contact_person: 'a'.repeat(101)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate phone max length (20 chars)', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          phone: '1'.repeat(21)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate contract_start_date ISO8601 format', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          contract_start_date: 'invalid-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate contract_end_date ISO8601 format', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          contract_end_date: 'not-a-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should auto-assign created_by from authenticated user', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should include creator information in response', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
          vendor_type: 'Equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
<<<<<<< HEAD
      expect(response.body.data.Creator.first_name).toBe('Test');
      expect(response.body.data.Creator.last_name).toBe('Coach');
=======
      expect(response.body.data.Creator.first_name).toBe('Vendors');
      expect(response.body.data.Creator.last_name).toBe('TestUser');
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });
  });

  describe('PUT /api/vendors/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/vendors/1')
<<<<<<< HEAD
        .send({
          company_name: 'Updated Vendor'
        })
=======
        .send({ company_name: 'Updated' })
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        .expect(401);

      expect(response.body.success).toBe(false);
    });

<<<<<<< HEAD
    it('should update vendor with partial data', async () => {
=======
    it('should update vendor with partial fields', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const vendor = await Vendor.create({
        company_name: 'Original Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Updated Vendor'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.company_name).toBe('Updated Vendor');
      expect(response.body.data.vendor_type).toBe('Equipment');
<<<<<<< HEAD
      expect(response.body.data.status).toBe('active');
    });

    it('should update multiple fields', async () => {
=======
    });

    it('should update vendor with all fields', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const vendor = await Vendor.create({
        company_name: 'Original Vendor',
        vendor_type: 'Equipment',
        status: 'active',
<<<<<<< HEAD
        contact_person: 'John Doe',
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Updated Vendor',
<<<<<<< HEAD
          vendor_type: 'Apparel',
          status: 'inactive',
          contact_person: 'Jane Smith'
=======
          contact_person: 'New Contact',
          email: 'new@vendor.com',
          phone: '555-4321',
          website: 'https://newvendor.com',
          vendor_type: 'Apparel',
          status: 'inactive',
          contract_value: 15000,
          contract_start_date: '2024-02-01',
          contract_end_date: '2025-01-31'
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.company_name).toBe('Updated Vendor');
<<<<<<< HEAD
      expect(response.body.data.vendor_type).toBe('Apparel');
      expect(response.body.data.status).toBe('inactive');
      expect(response.body.data.contact_person).toBe('Jane Smith');
=======
      expect(response.body.data.contact_person).toBe('New Contact');
      expect(response.body.data.vendor_type).toBe('Apparel');
      expect(response.body.data.status).toBe('inactive');
    });

    it('should update vendor status', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'expired'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('expired');
    });

    it('should validate status enum values', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'invalid-status'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate vendor_type enum on update', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendor_type: 'InvalidType'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format on update', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate website URL format on update', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          website: 'not-a-url'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .put('/api/vendors/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
<<<<<<< HEAD
          company_name: 'Updated Vendor'
=======
          company_name: 'Updated'
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });

<<<<<<< HEAD
    it('should enforce team isolation on update', async () => {
=======
    it('should enforce team isolation (cannot update other team vendor)', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const vendor = await Vendor.create({
        company_name: 'Other Team Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Hacked Vendor'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
<<<<<<< HEAD
    });

    it('should reject invalid vendor_type on update', async () => {
=======

      // Verify vendor was not updated
      const unchangedVendor = await Vendor.findByPk(vendor.id);
      expect(unchangedVendor.company_name).toBe('Other Team Vendor');
    });

    it('should verify database update', async () => {
      const vendor = await Vendor.create({
        company_name: 'Original Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Database Updated Vendor'
        })
        .expect(200);

      // Verify in database
      const updatedVendor = await Vendor.findByPk(vendor.id);
      expect(updatedVendor.company_name).toBe('Database Updated Vendor');
    });

    it('should include creator information in response', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
<<<<<<< HEAD
          vendor_type: 'InvalidType'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid status on update', async () => {
      const vendor = await Vendor.create({
        company_name: 'Test Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'invalid-status'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
=======
          company_name: 'Updated Vendor'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Vendors');
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });
  });

  describe('DELETE /api/vendors/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/vendors/1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete vendor', async () => {
      const vendor = await Vendor.create({
<<<<<<< HEAD
        company_name: 'Vendor to Delete',
=======
        company_name: 'To Delete Vendor',
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/vendors/${vendor.id}`)
<<<<<<< HEAD
=======
        .get('/api/vendors')
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
=======
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
<<<<<<< HEAD
<<<<<<< HEAD

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(getResponse.body.success).toBe(false);
=======
      expect(response.body.message).toBe('Vendor deleted successfully');
    });

    it('should verify vendor is deleted from database (hard delete)', async () => {
      const vendor = await Vendor.create({
        company_name: 'To Delete Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await request(app)
        .delete(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify vendor is gone from database
      const deletedVendor = await Vendor.findByPk(vendor.id);
      expect(deletedVendor).toBeNull();
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .delete('/api/vendors/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });

<<<<<<< HEAD
    it('should enforce team isolation on delete', async () => {
=======
    it('should enforce team isolation (cannot delete other team vendor)', async () => {
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
      const vendor = await Vendor.create({
        company_name: 'Other Team Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .delete(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
<<<<<<< HEAD
    });
  });
});
=======
      // Should only see the 5 vendors from testTeam, not the 6th from otherTeam
      expect(response.body.data.length).toBe(5);
      response.body.data.forEach(vendor => {
        expect(vendor.team_id).toBe(testTeam.id);
      });
    });
  });
});
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
=======

      // Verify vendor still exists
      const unchangedVendor = await Vendor.findByPk(vendor.id);
      expect(unchangedVendor).not.toBeNull();
      expect(unchangedVendor.company_name).toBe('Other Team Vendor');
    });
  });
});
>>>>>>> auto-claude/039-improve-backend-route-test-coverage
