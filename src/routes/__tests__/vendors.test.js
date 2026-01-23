const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Vendor } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('vendors routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../vendors');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});

describe('Vendors List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let _otherAuthToken;
  const testVendors = [];

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Vendors Test Team',
      program_name: 'Vendors Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Vendors Test Team',
      program_name: 'Other Vendors Test Team Program',
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
    // Generate auth token with jti for blacklist checking
    authToken = jwt.sign(
      {
        id: testUser.id,
        jti: '9916faf3-535a-4d46-b1bc-c5375a6f9bee',
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET || 'test_secret'
    );
    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-vendors-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });
    // Generate auth token for other user
    _otherAuthToken = jwt.sign(
      {
        id: otherUser.id,
        jti: '840de278-a2a9-4d0d-af0a-fe0e13d1c890',
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET || 'test_secret'
    );
    // Generate auth tokens
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

  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /api/vendors', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/vendors')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

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
      expect(response.body.data[0].Creator.first_name).toBe('Vendors');
      expect(response.body.data[0].Creator.last_name).toBe('TestUser');
    });

    it('should sort vendors by created_at descending', async () => {
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
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(v => new Date(v.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/vendors - Sorting by company_name', () => {
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
    it('should sort by vendor_type ASC', async () => {
      const response = await request(app)
        .get('/api/vendors?orderBy=vendor_type&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const types = response.body.data.map(v => v.vendor_type);
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
      it('should sort by status ASC', async () => {
        const response = await request(app)
          .get('/api/vendors?orderBy=status&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const statuses = response.body.data.map(v => v.status);
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
      });

      it('should sort by status DESC', async () => {
        const response = await request(app)
          .get('/api/vendors?orderBy=status&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const statuses = response.body.data.map(v => v.status);
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
        expect(response.body.data.Creator.first_name).toBe('Vendors');
        expect(response.body.data.Creator.last_name).toBe('TestUser');
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({
            company_name: 'Test Vendor',
            vendor_type: 'Equipment'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should create vendor with required fields only', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'New Vendor',
            vendor_type: 'Equipment'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.company_name).toBe('New Vendor');
        expect(response.body.data.vendor_type).toBe('Equipment');
        expect(response.body.data.team_id).toBe(testTeam.id);
        expect(response.body.data.created_by).toBe(testUser.id);
      });

      it('should create vendor with all fields', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
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
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.company_name).toBe('Complete Vendor');
        expect(response.body.data.contact_person).toBe('Jane Doe');
        expect(response.body.data.email).toBe('jane@vendor.com');
        expect(response.body.data.vendor_type).toBe('Apparel');
      });

      it('should validate required company_name', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            vendor_type: 'Equipment'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate required vendor_type', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Test Vendor'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate vendor_type enum values', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Test Vendor',
            vendor_type: 'InvalidType'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should accept all valid vendor_type values', async () => {
        const vendorTypes = ['Equipment', 'Apparel', 'Technology', 'Food Service', 'Transportation', 'Medical', 'Facilities', 'Other'];

        for (const type of vendorTypes) {
          const { token, cookies } = await getCsrfToken(app);
          const response = await request(app)
            .post('/api/vendors')
            .set('Cookie', cookies)
            .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Test Vendor',
            vendor_type: 'Equipment',
            email: 'invalid-email'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate website URL format', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Test Vendor',
            vendor_type: 'Equipment',
            website: 'not-a-url'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate company_name max length (200 chars)', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'a'.repeat(201),
            vendor_type: 'Equipment'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate contact_person max length (100 chars)', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/vendors')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Test Vendor',
            vendor_type: 'Equipment'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.Creator).toBeDefined();
        expect(response.body.data.Creator.first_name).toBe('Vendors');
        expect(response.body.data.Creator.last_name).toBe('TestUser');
      });
    });

    describe('PUT /api/vendors/:id', () => {
      it('should require authentication', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/vendors/1')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .send({ company_name: 'Updated' })
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should update vendor with partial fields', async () => {
        const vendor = await Vendor.create({
          company_name: 'Original Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Updated Vendor'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.company_name).toBe('Updated Vendor');
        expect(response.body.data.vendor_type).toBe('Equipment');
      });

      it('should update vendor with all fields', async () => {
        const vendor = await Vendor.create({
          company_name: 'Original Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Updated Vendor',
            contact_person: 'New Contact',
            email: 'new@vendor.com',
            phone: '555-4321',
            website: 'https://newvendor.com',
            vendor_type: 'Apparel',
            status: 'inactive',
            contract_value: 15000,
            contract_start_date: '2024-02-01',
            contract_end_date: '2025-01-31'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.company_name).toBe('Updated Vendor');
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

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            website: 'not-a-url'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      });

      it('should return 404 for non-existent vendor', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put('/api/vendors/99999')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Updated'
          })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Vendor not found');
      });

      it('should enforce team isolation (cannot update other team vendor)', async () => {
        const vendor = await Vendor.create({
          company_name: 'Other Team Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: otherTeam.id,
          created_by: otherUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Hacked Vendor'
          })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Vendor not found');

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

        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
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
        const vendor = await Vendor.create({
          company_name: 'Test Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .put(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            company_name: 'Updated Vendor'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.Creator).toBeDefined();
        expect(response.body.data.Creator.first_name).toBe('Vendors');
      });
    });

    describe('DELETE /api/vendors/:id', () => {
      it('should require authentication', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .delete('/api/vendors/1')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .expect(401);

        expect(response.body.success).toBe(false);
      });

      it('should delete vendor', async () => {
        const vendor = await Vendor.create({
          company_name: 'To Delete Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .delete(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
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

        const { token, cookies } = await getCsrfToken(app);
        await request(app)
          .delete(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Verify vendor is gone from database
        const deletedVendor = await Vendor.findByPk(vendor.id);
        expect(deletedVendor).toBeNull();
      });

      it('should return 404 for non-existent vendor', async () => {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .delete('/api/vendors/99999')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Vendor not found');
      });

      it('should enforce team isolation (cannot delete other team vendor)', async () => {
        const vendor = await Vendor.create({
          company_name: 'Other Team Vendor',
          vendor_type: 'Equipment',
          status: 'active',
          team_id: otherTeam.id,
          created_by: otherUser.id
        });

        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .delete(`/api/vendors/${vendor.id}`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Vendor not found');
        // Should only see the 5 vendors from testTeam, not the 6th from otherTeam
        expect(response.body.data.length).toBe(5);
        response.body.data.forEach(vendor => {
          expect(vendor.team_id).toBe(testTeam.id);
        });
      });
    });
  });
});
