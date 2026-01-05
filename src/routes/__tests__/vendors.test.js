const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Vendor } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Vendors API - Complete CRUD Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;

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
      team_id: otherTeam.id
    });

    // Generate auth tokens
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

  beforeEach(async () => {
    // Clean up vendors before each test
    await Vendor.destroy({ where: {}, force: true });
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
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should create vendor with all fields', async () => {
      const response = await request(app)
        .post('/api/vendors')
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
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendor_type: 'Equipment'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required vendor_type', async () => {
      const response = await request(app)
        .post('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          company_name: 'Test Vendor'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate vendor_type enum values', async () => {
      const response = await request(app)
        .post('/api/vendors')
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
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate website URL format', async () => {
      const response = await request(app)
        .post('/api/vendors')
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
      const response = await request(app)
        .post('/api/vendors')
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
      const response = await request(app)
        .put('/api/vendors/1')
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
    });

    it('should update vendor with all fields', async () => {
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
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .put('/api/vendors/99999')
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

      const response = await request(app)
        .put(`/api/vendors/${vendor.id}`)
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
      const response = await request(app)
        .delete('/api/vendors/1')
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

      const response = await request(app)
        .delete(`/api/vendors/${vendor.id}`)
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

      await request(app)
        .delete(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify vendor is gone from database
      const deletedVendor = await Vendor.findByPk(vendor.id);
      expect(deletedVendor).toBeNull();
    });

    it('should return 404 for non-existent vendor', async () => {
      const response = await request(app)
        .delete('/api/vendors/99999')
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

      const response = await request(app)
        .delete(`/api/vendors/${vendor.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Vendor not found');

      // Verify vendor still exists
      const unchangedVendor = await Vendor.findByPk(vendor.id);
      expect(unchangedVendor).not.toBeNull();
      expect(unchangedVendor.company_name).toBe('Other Team Vendor');
    });
  });
});
