// Integration tests for vendors route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
const { Vendor, User, Team, sequelize } = require('../../models');
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

describe('Vendors API - Complete CRUD and Sorting Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;
  let testVendors = [];

  beforeAll(async () => {
    // Ensure database connection
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

    await sequelize.authenticate();

    // Sync database
    await sequelize.sync({ force: true });

    // Create test teams
    testTeam = await Team.create({
      name: 'Test Team',
      program_name: 'Test Program',
      school: 'Test University',
      division: 'D1',
      conference: 'Test Conference',
      city: 'Test City',
      state: 'TS'
    });

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
    testUser = await User.create({
      first_name: 'Test',
      last_name: 'Coach',
      email: 'test@example.com',
      password: 'password123',
      role: 'coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'Coach',
      email: 'other@example.com',
      password: 'password123',
      role: 'coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
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
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Clean up vendors before each test
    await Vendor.destroy({ where: {}, force: true });
  });

  describe('GET /api/vendors - Authentication', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/vendors - Basic Queries', () => {
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
  });

  describe('GET /api/vendors - Filtering by vendor_type', () => {
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
  });

  describe('GET /api/vendors - Pagination', () => {
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
  });

  describe('GET /api/vendors - Creator Information', () => {
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
      expect(response.body.data[0].Creator.first_name).toBe('Test');
      expect(response.body.data[0].Creator.last_name).toBe('Coach');
    });
  });

  describe('GET /api/vendors - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
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

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].company_name).toBe('Second Vendor');
      expect(response.body.data[1].company_name).toBe('First Vendor');
    });
  });

  describe('GET /api/vendors - Sorting by company_name', () => {
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

    it('should sort by vendor_type ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=vendor_type&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const types = response.body.data.map(v => v.vendor_type);
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

    it('should sort by status ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=status&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(v => v.status);
      expect(statuses).toEqual(['active', 'expired', 'inactive', 'pending']);
    });

    it('should sort by status DESC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=status&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(v => v.status);
      expect(statuses).toEqual(['pending', 'inactive', 'expired', 'active']);
    });
  });

  describe('GET /api/vendors/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors/1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

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
      expect(response.body.data.Creator.first_name).toBe('Test');
      expect(response.body.data.Creator.last_name).toBe('Coach');
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
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
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
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should create vendor with all fields', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
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
        })
        .expect(201);

      expect(response.body.success).toBe(true);
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
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendor_type: 'Equipment'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing vendor_type', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid vendor_type', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'InvalidType'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
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
    });

    it('should reject invalid website URL format', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          website: 'invalid-url'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return vendor with creator information', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Creator Test Vendor',
          vendor_type: 'Equipment'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Test');
      expect(response.body.data.Creator.last_name).toBe('Coach');
    });
  });

  describe('PUT /api/vendors/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/vendors/1')
        .send({
          company_name: 'Updated Vendor'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update vendor with partial data', async () => {
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
      expect(response.body.data.status).toBe('active');
    });

    it('should update multiple fields', async () => {
      const vendor = await Vendor.create({
        company_name: 'Original Vendor',
        vendor_type: 'Equipment',
        status: 'active',
        contact_person: 'John Doe',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Updated Vendor',
          vendor_type: 'Apparel',
          status: 'inactive',
          contact_person: 'Jane Smith'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.company_name).toBe('Updated Vendor');
      expect(response.body.data.vendor_type).toBe('Apparel');
      expect(response.body.data.status).toBe('inactive');
      expect(response.body.data.contact_person).toBe('Jane Smith');
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .put('/api/vendors/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Updated Vendor'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });

    it('should enforce team isolation on update', async () => {
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
    });

    it('should reject invalid vendor_type on update', async () => {
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
        company_name: 'Vendor to Delete',
        vendor_type: 'Equipment',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(getResponse.body.success).toBe(false);
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .delete('/api/vendors/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');
    });

    it('should enforce team isolation on delete', async () => {
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
    });
  });
});