// Integration tests for coaches route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
const { Coach, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
const jwt = require('jsonwebtoken');

describe('coaches routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../coaches');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function')
    expect(typeof router.post).toBe('function')
    expect(typeof router.put).toBe('function')
    expect(typeof router.delete).toBe('function')
  })
})

describe('Coaches List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testCoaches = [];

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

    // Create test coaches with varying data for sorting
    const coachesData = [
      {
        first_name: 'Alice',
        last_name: 'Anderson',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'alice@lincoln.edu',
        phone: '555-0001',
        last_contact_date: new Date('2024-01-15'),
        next_contact_date: new Date('2024-02-15'),
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Bob',
        last_name: 'Brown',
        school_name: 'Washington Academy',
        position: 'Recruiting Coordinator',
        email: 'bob@washington.edu',
        phone: '555-0002',
        last_contact_date: new Date('2024-02-10'),
        next_contact_date: new Date('2024-03-10'),
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Charlie',
        last_name: 'Chen',
        school_name: 'Jefferson Prep',
        position: 'Pitching Coach',
        email: 'charlie@jefferson.edu',
        phone: '555-0003',
        last_contact_date: new Date('2024-03-05'),
        next_contact_date: new Date('2024-04-05'),
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Diana',
        last_name: 'Davis',
        school_name: 'Adams High School',
        position: 'Volunteer',
        email: 'diana@adams.edu',
        phone: '555-0004',
        last_contact_date: new Date('2024-01-20'),
        next_contact_date: new Date('2024-02-20'),
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Edward',
        last_name: 'Evans',
        school_name: 'Madison Academy',
        position: 'Head Coach',
        email: 'edward@madison.edu',
        phone: '555-0005',
        last_contact_date: new Date('2024-02-25'),
        next_contact_date: new Date('2024-03-25'),
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      }
    ];

    // Create coaches sequentially to ensure different created_at timestamps
    for (const coachData of coachesData) {
      const coach = await Coach.create(coachData);
      testCoaches.push(coach);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /api/coaches - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
      const response = await request(app)
        .get('/api/coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/coaches - Sorting by first_name', () => {
    it('should sort by first_name ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
    });

    it('should sort by first_name DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Edward', 'Diana', 'Charlie', 'Bob', 'Alice']);
    });

    it('should handle case-insensitive sortDirection for first_name', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=asc&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
    });
  });

  describe('GET /api/coaches - Sorting by last_name', () => {
    it('should sort by last_name ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=last_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.last_name);
      expect(names).toEqual(['Anderson', 'Brown', 'Chen', 'Davis', 'Evans']);
    });

    it('should sort by last_name DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=last_name&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.last_name);
      expect(names).toEqual(['Evans', 'Davis', 'Chen', 'Brown', 'Anderson']);
    });
  });

  describe('GET /api/coaches - Sorting by school_name', () => {
    it('should sort by school_name ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=school_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const schools = response.body.data.map(c => c.school_name);
      expect(schools).toEqual(['Adams High School', 'Jefferson Prep', 'Lincoln High School', 'Madison Academy', 'Washington Academy']);
    });

    it('should sort by school_name DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=school_name&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const schools = response.body.data.map(c => c.school_name);
      expect(schools).toEqual(['Washington Academy', 'Madison Academy', 'Lincoln High School', 'Jefferson Prep', 'Adams High School']);
    });
  });

  describe('GET /api/coaches - Sorting by position', () => {
    it('should sort by position ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=position&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const positions = response.body.data.map(c => c.position);
      // Alphabetical order: Head Coach, Pitching Coach, Recruiting Coordinator, Volunteer
      expect(positions[0]).toBe('Head Coach');
      expect(positions[positions.length - 1]).toBe('Volunteer');
    });

    it('should sort by position DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=position&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const positions = response.body.data.map(c => c.position);
      // Reverse alphabetical order
      expect(positions[0]).toBe('Volunteer');
      expect(positions[positions.length - 1]).toBe('Head Coach');
    });
  });

  describe('GET /api/coaches - Sorting by last_contact_date', () => {
    it('should sort by last_contact_date ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=last_contact_date&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(c => new Date(c.last_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by last_contact_date DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=last_contact_date&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(c => new Date(c.last_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/coaches - Sorting by next_contact_date', () => {
    it('should sort by next_contact_date ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=next_contact_date&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(c => new Date(c.next_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort by next_contact_date DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=next_contact_date&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(c => new Date(c.next_contact_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/coaches - Sorting by status', () => {
    it('should sort by status ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=status&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(c => c.status);
      // Alphabetical order: active comes before inactive
      const activeCount = statuses.filter(s => s === 'active').length;
      const inactiveCount = statuses.filter(s => s === 'inactive').length;
      expect(activeCount).toBe(3);
      expect(inactiveCount).toBe(2);
      expect(statuses[0]).toBe('active');
      expect(statuses[statuses.length - 1]).toBe('inactive');
    });

    it('should sort by status DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=status&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(c => c.status);
      // Reverse alphabetical order: inactive comes before active
      expect(statuses[0]).toBe('inactive');
      expect(statuses[statuses.length - 1]).toBe('active');
    });
  });

  describe('GET /api/coaches - Sorting by created_at', () => {
    it('should sort by created_at ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=created_at&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it('should sort by created_at DESC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=created_at&sortDirection=DESC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/coaches - Validation', () => {
    it('should return 400 for invalid orderBy column', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=invalid_column&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid sortDirection', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for both invalid orderBy and sortDirection', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=bad_column&sortDirection=BAD_DIR')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/coaches - Sorting with Filters', () => {
    it('should sort filtered results by first_name', async () => {
      const response = await request(app)
        .get('/api/coaches?status=active&orderBy=first_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(3); // 3 active coaches
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Alice', 'Charlie', 'Diana']);
    });

    it('should sort filtered results by position', async () => {
      const response = await request(app)
        .get('/api/coaches?position=Head Coach&orderBy=last_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2); // 2 Head Coaches
      const names = response.body.data.map(c => c.last_name);
      expect(names).toEqual(['Anderson', 'Evans']);
    });

    it('should sort search results', async () => {
      const response = await request(app)
        .get('/api/coaches?search=high&orderBy=school_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Coaches with 'high' in name, school, or email
      expect(response.body.data.length).toBeGreaterThan(0);
      const schools = response.body.data.map(c => c.school_name);
      // Verify ascending order
      for (let i = 1; i < schools.length; i++) {
        expect(schools[i].localeCompare(schools[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /api/coaches - Sorting with Pagination', () => {
    it('should sort and paginate correctly', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=ASC&page=1&limit=2&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(5);

      // First page should have Alice and Bob
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Alice', 'Bob']);
    });

    it('should sort second page correctly', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=ASC&page=2&limit=2&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);

      // Second page should have Charlie and Diana
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Charlie', 'Diana']);
    });
  });

  describe('GET /api/coaches - Edge Cases', () => {
    it('should handle sorting with only orderBy parameter (use default sortDirection)', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(c => c.first_name);
      // Default sortDirection is DESC
      expect(names).toEqual(['Edward', 'Diana', 'Charlie', 'Bob', 'Alice']);
    });

    it('should handle sorting with only sortDirection parameter (use default orderBy)', async () => {
      const response = await request(app)
        .get('/api/coaches?sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Default orderBy is created_at, so should be oldest first
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/coaches - Authentication', () => {
    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=ASC')
        .expect(401);
    });
  });

  describe('GET /api/coaches - Team Isolation', () => {
    it('should only return and sort coaches from the authenticated user\'s team', async () => {
      // Create another team and coach
      const otherTeam = await Team.create({
        name: 'Other Team',
        program_name: 'Other Program',
        school: 'Other University',
        division: 'D1',
        conference: 'Other Conference',
        city: 'Other City',
        state: 'OT'
      });

      await Coach.create({
        first_name: 'Zack',
        last_name: 'Zimmerman',
        school_name: 'Zebra High School',
        position: 'Head Coach',
        email: 'zack@zebra.edu',
        phone: '555-9999',
        last_contact_date: new Date('2024-01-01'),
        next_contact_date: new Date('2024-02-01'),
        status: 'active',
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?orderBy=first_name&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5); // Only original 5 coaches
      const names = response.body.data.map(c => c.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
      expect(names).not.toContain('Zack');
    });
  });
});
