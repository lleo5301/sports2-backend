// Integration tests for vendors route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
const { Vendor, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
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

describe('Vendors List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testVendors = [];

  beforeAll(async () => {
    // Ensure we're using the test database
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

    // Sync database
    await sequelize.sync({ force: true });

    // Create test team
    testTeam = await Team.create({
      name: 'Test Team',
      program_name: 'Test Program',
      school: 'Test University',
      division: 'D1',
      conference: 'Test Conference',
      city: 'Test City',
      state: 'TS'
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Test',
      last_name: 'Coach',
      email: 'test@example.com',
      password: 'password123',
      role: 'coach',
      team_id: testTeam.id
    });

    // Generate auth token
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

  describe('GET /api/vendors - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
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
      // Alphabetically: Apparel, Equipment, Medical, Technology, Transportation
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
        .expect(401);

      expect(response.body.success).toBe(false);
    });

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
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/vendors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should only see the 5 vendors from testTeam, not the 6th from otherTeam
      expect(response.body.data.length).toBe(5);
      response.body.data.forEach(vendor => {
        expect(vendor.team_id).toBe(testTeam.id);
      });
    });
  });
});
