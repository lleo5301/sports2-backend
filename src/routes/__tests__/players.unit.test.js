// Unit-level tests for players route handlers internal logic
// We mock Express req/res and Sequelize models to verify behavior
const request = require('supertest');
const app = require('../../server');
const { Player, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
const jwt = require('jsonwebtoken');

describe('players routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../players');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});

describe('Players List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testPlayers = [];

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

    // Create test players with varying data for sorting
    const playersData = [
      {
        first_name: 'Alice',
        last_name: 'Anderson',
        position: 'P',
        school_type: 'HS',
        graduation_year: 2024,
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Bob',
        last_name: 'Brown',
        position: 'C',
        school_type: 'COLL',
        graduation_year: 2023,
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Charlie',
        last_name: 'Chen',
        position: '1B',
        school_type: 'HS',
        graduation_year: 2025,
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Diana',
        last_name: 'Davis',
        position: 'SS',
        school_type: 'COLL',
        graduation_year: 2024,
        status: 'transferred',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Edward',
        last_name: 'Evans',
        position: 'OF',
        school_type: 'HS',
        graduation_year: 2023,
        status: 'graduated',
        team_id: testTeam.id,
        created_by: testUser.id
      }
    ];

    // Create players sequentially to ensure different created_at timestamps
    for (const playerData of playersData) {
      const player = await Player.create(playerData);
      testPlayers.push(player);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /api/players - Default Sorting', () => {
    it('should sort by created_at DESC by default', async () => {
      const response = await request(app)
        .get('/api/players')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);

      // Verify descending order by created_at (most recent first)
      const timestamps = response.body.data.map(p => new Date(p.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/players - Sorting by first_name', () => {
    it('should sort by first_name ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
    });

    it('should sort by first_name DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Edward', 'Diana', 'Charlie', 'Bob', 'Alice']);
    });

    it('should handle case-insensitive sortDirection for first_name', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=asc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
    });
  });

  describe('GET /api/players - Sorting by last_name', () => {
    it('should sort by last_name ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=last_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.last_name);
      expect(names).toEqual(['Anderson', 'Brown', 'Chen', 'Davis', 'Evans']);
    });

    it('should sort by last_name DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=last_name&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.last_name);
      expect(names).toEqual(['Evans', 'Davis', 'Chen', 'Brown', 'Anderson']);
    });
  });

  describe('GET /api/players - Sorting by position', () => {
    it('should sort by position ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=position&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const positions = response.body.data.map(p => p.position);
      expect(positions).toEqual(['1B', 'C', 'OF', 'P', 'SS']);
    });

    it('should sort by position DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=position&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const positions = response.body.data.map(p => p.position);
      expect(positions).toEqual(['SS', 'P', 'OF', 'C', '1B']);
    });
  });

  describe('GET /api/players - Sorting by school_type', () => {
    it('should sort by school_type ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=school_type&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const schoolTypes = response.body.data.map(p => p.school_type);
      // COLL comes before HS alphabetically
      const collCount = schoolTypes.filter(s => s === 'COLL').length;
      const hsCount = schoolTypes.filter(s => s === 'HS').length;
      expect(collCount).toBe(2);
      expect(hsCount).toBe(3);
      // Verify COLL entries come first
      expect(schoolTypes[0]).toBe('COLL');
      expect(schoolTypes[1]).toBe('COLL');
    });

    it('should sort by school_type DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=school_type&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const schoolTypes = response.body.data.map(p => p.school_type);
      // HS comes before COLL in descending order
      expect(schoolTypes[0]).toBe('HS');
      expect(schoolTypes[1]).toBe('HS');
      expect(schoolTypes[2]).toBe('HS');
    });
  });

  describe('GET /api/players - Sorting by graduation_year', () => {
    it('should sort by graduation_year ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=graduation_year&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const years = response.body.data.map(p => p.graduation_year);
      for (let i = 1; i < years.length; i++) {
        expect(years[i]).toBeGreaterThanOrEqual(years[i - 1]);
      }
    });

    it('should sort by graduation_year DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=graduation_year&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const years = response.body.data.map(p => p.graduation_year);
      for (let i = 1; i < years.length; i++) {
        expect(years[i]).toBeLessThanOrEqual(years[i - 1]);
      }
    });
  });

  describe('GET /api/players - Sorting by status', () => {
    it('should sort by status ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=status&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(p => p.status);
      // Alphabetical order: active, graduated, inactive, transferred
      expect(statuses[0]).toBe('active');
      expect(statuses[statuses.length - 1]).toBe('transferred');
    });

    it('should sort by status DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=status&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const statuses = response.body.data.map(p => p.status);
      // Reverse alphabetical order
      expect(statuses[0]).toBe('transferred');
      expect(statuses[statuses.length - 1]).toBe('active');
    });
  });

  describe('GET /api/players - Sorting by created_at', () => {
    it('should sort by created_at ASC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=created_at&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(p => new Date(p.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });

    it('should sort by created_at DESC', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=created_at&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(p => new Date(p.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/players - Validation', () => {
    it('should return 400 for invalid orderBy column', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=invalid_column&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid sortDirection', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for both invalid orderBy and sortDirection', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=bad_column&sortDirection=BAD_DIR')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/players - Sorting with Filters', () => {
    it('should sort filtered results by first_name', async () => {
      const response = await request(app)
        .get('/api/players?school_type=HS&orderBy=first_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(3); // 3 HS players
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Alice', 'Charlie', 'Edward']);
    });

    it('should sort filtered results by position', async () => {
      const response = await request(app)
        .get('/api/players?status=active&orderBy=position&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2); // 2 active players
      const positions = response.body.data.map(p => p.position);
      expect(positions).toEqual(['1B', 'P']);
    });

    it('should sort search results', async () => {
      const response = await request(app)
        .get('/api/players?search=a&orderBy=last_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Players with 'a' in name, school, city, etc
      expect(response.body.data.length).toBeGreaterThan(0);
      const names = response.body.data.map(p => p.last_name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });
  });
});