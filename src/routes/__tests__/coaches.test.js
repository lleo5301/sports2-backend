// Integration tests for coaches route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
<<<<<<< HEAD
const { Coach, User, Team, sequelize } = require('../../models');
=======
const { Coach, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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

<<<<<<< HEAD
describe('Coaches API - Complete CRUD Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;

  beforeAll(async () => {
    // Ensure database connection
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }
    
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Coaches Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Coaches Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Coaches',
      last_name: 'TestUser',
      email: 'coaches-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-coaches-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
=======
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
  });

  afterAll(async () => {
    // Clean up test data
    await Coach.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
    await sequelize.close();
  });

  beforeEach(async () => {
    // Clean up coaches before each test
    await Coach.destroy({ where: {}, force: true });
  });

  describe('GET /api/coaches - Authentication', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/coaches')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/coaches - Basic Retrieval', () => {
    it('should return empty array when no coaches exist', async () => {
=======

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
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
      const response = await request(app)
        .get('/api/coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
<<<<<<< HEAD
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of coaches for authenticated user team', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        phone: '555-1234',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Recruiting Coordinator',
        email: 'mjohnson@central.edu',
        phone: '555-5678',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(2);
    });
  });

  describe('GET /api/coaches - Team Isolation', () => {
    it('should only return coaches for user team (team isolation)', async () => {
      // Create coaches for different teams
      await Coach.create({
        first_name: 'My',
        last_name: 'Coach',
        school_name: 'My School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Other',
        last_name: 'Coach',
        school_name: 'Other School',
        position: 'Head Coach',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('My');
    });
  });

  describe('GET /api/coaches - Status Filtering', () => {
    it('should filter coaches by status (active)', async () => {
      // Create coaches with different statuses
      await Coach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should filter coaches by status (inactive)', async () => {
      // Create coaches with different statuses
      await Coach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?status=inactive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('inactive');
    });

    it('should default to active status filter', async () => {
      // Create coaches with different statuses
      await Coach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should sort by status ASC', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'Active1',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Inactive1',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Active2',
        last_name: 'Coach',
        school_name: 'School C',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?orderBy=status&sortDirection=ASC&status=')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(c => c.status);
      // Alphabetical order: active comes before inactive
      const activeCount = statuses.filter(s => s === 'active').length;
      const inactiveCount = statuses.filter(s => s === 'inactive').length;
      expect(activeCount).toBe(2);
      expect(inactiveCount).toBe(1);
      expect(statuses[0]).toBe('active');
      expect(statuses[statuses.length - 1]).toBe('inactive');
    });

    it('should sort by status DESC', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'Active1',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Inactive1',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Active2',
        last_name: 'Coach',
        school_name: 'School C',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

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

  describe('GET /api/coaches - Position Filtering', () => {
    it('should filter coaches by position (Head Coach)', async () => {
      // Create coaches with different positions
      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Recruiting',
        last_name: 'Coordinator',
        school_name: 'School B',
        position: 'Recruiting Coordinator',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?position=Head Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Head Coach');
    });

    it('should filter coaches by position (Recruiting Coordinator)', async () => {
      // Create coaches with different positions
      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Recruiting',
        last_name: 'Coordinator',
        school_name: 'School B',
        position: 'Recruiting Coordinator',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?position=Recruiting Coordinator')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Recruiting Coordinator');
    });

    it('should filter coaches by position (Pitching Coach)', async () => {
      // Create coaches with different positions
      await Coach.create({
        first_name: 'Pitching',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Pitching Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?position=Pitching Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Pitching Coach');
    });

    it('should filter coaches by position (Volunteer)', async () => {
      // Create coaches with different positions
      await Coach.create({
        first_name: 'Volunteer',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Volunteer',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?position=Volunteer')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Volunteer');
    });

    it('should sort by position ASC', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Pitching',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Pitching Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Recruiting',
        last_name: 'Coordinator',
        school_name: 'School C',
        position: 'Recruiting Coordinator',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Volunteer',
        last_name: 'Coach',
        school_name: 'School D',
        position: 'Volunteer',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

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
      // Create test coaches
      await Coach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Pitching',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Pitching Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Recruiting',
        last_name: 'Coordinator',
        school_name: 'School C',
        position: 'Recruiting Coordinator',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Volunteer',
        last_name: 'Coach',
        school_name: 'School D',
        position: 'Volunteer',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

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

  describe('GET /api/coaches - Search Functionality', () => {
    it('should search coaches by first name', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        email: 'mjohnson@central.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?search=john')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('John');
    });

    it('should search coaches by last name', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        email: 'mjohnson@central.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?search=johnson')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].last_name).toBe('Johnson');
    });

    it('should search coaches by school name', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        email: 'mjohnson@central.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?search=lincoln')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].school_name).toBe('Lincoln High School');
    });

    it('should search coaches by email', async () => {
      // Create test coaches
      await Coach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Coach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        email: 'mjohnson@central.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/coaches?search=jsmith')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].email).toBe('jsmith@lincoln.edu');
=======
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
    });
  });

  describe('GET /api/coaches - Sorting by first_name', () => {
<<<<<<< HEAD
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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
<<<<<<< HEAD
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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
<<<<<<< HEAD
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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

<<<<<<< HEAD
  describe('GET /api/coaches - Sorting by last_contact_date', () => {
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
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
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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
<<<<<<< HEAD
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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

<<<<<<< HEAD
  describe('GET /api/coaches - Sorting by created_at', () => {
    beforeEach(async () => {
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
        await Coach.create(coachData);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    it('should sort by created_at DESC by default', async () => {
      const response = await request(app)
        .get('/api/coaches')
=======
  describe('GET /api/coaches - Sorting by status', () => {
    it('should sort by status ASC', async () => {
      const response = await request(app)
        .get('/api/coaches?orderBy=status&sortDirection=ASC&status=')
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
<<<<<<< HEAD
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(c => new Date(c.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });

=======
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
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
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
<<<<<<< HEAD
    });
  });
});
=======
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
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
