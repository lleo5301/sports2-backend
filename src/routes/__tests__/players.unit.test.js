// Unit-level tests for players route handlers internal logic
// We mock Express req/res and Sequelize models to verify behavior
const request = require('supertest');
const app = require('../../server');
<<<<<<< HEAD
<<<<<<< HEAD
const { Player, User, Team, ScoutingReport } = require('../../models');
const { sequelize } = require('../../config/database');
=======
const { sequelize, User, Team, Player, ScoutingReport } = require('../../models');
>>>>>>> auto-claude/027-consolidate-player-stats-summary-endpoint-into-sin
=======
const { Player, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
const jwt = require('jsonwebtoken');

describe('players routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../players');
    // sanity check to ensure router is created; Express router attaches methods
<<<<<<< HEAD
    const router = require('../players');
=======
>>>>>>> auto-claude/037-add-eslint-configuration-to-backend-service
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});
<<<<<<< HEAD

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints
describe('Players List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testPlayers = [];
<<<<<<< HEAD
=======

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
      // Players with 'a' in name, school, city, or state
      expect(response.body.data.length).toBeGreaterThan(0);
      const lastNames = response.body.data.map(p => p.last_name);
      // Verify ascending order
      for (let i = 1; i < lastNames.length; i++) {
        expect(lastNames[i].localeCompare(lastNames[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /api/players - Sorting with Pagination', () => {
    it('should sort and paginate correctly', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=ASC&page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(5);

      // First page should have Alice and Bob
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Alice', 'Bob']);
    });

    it('should sort second page correctly', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=ASC&page=2&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);

      // Second page should have Charlie and Diana
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Charlie', 'Diana']);
    });
  });

  describe('GET /api/players - Edge Cases', () => {
    it('should handle sorting with only orderBy parameter (use default sortDirection)', async () => {
      const response = await request(app)
        .get('/api/players?orderBy=first_name')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map(p => p.first_name);
      // Default sortDirection is DESC
      expect(names).toEqual(['Edward', 'Diana', 'Charlie', 'Bob', 'Alice']);
    });

    it('should handle sorting with only sortDirection parameter (use default orderBy)', async () => {
      const response = await request(app)
        .get('/api/players?sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Default orderBy is created_at, so should be oldest first
      const timestamps = response.body.data.map(p => new Date(p.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/players - Authentication', () => {
    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=ASC')
        .expect(401);
    });
  });

  describe('GET /api/players - Team Isolation', () => {
    it('should only return and sort players from the authenticated user\'s team', async () => {
      // Create another team and player
      const otherTeam = await Team.create({
        name: 'Other Team',
        program_name: 'Other Program',
        school: 'Other University',
        division: 'D1',
        conference: 'Other Conference',
        city: 'Other City',
        state: 'OT'
      });

      await Player.create({
        first_name: 'Zack',
        last_name: 'Zimmerman',
        position: 'P',
        school_type: 'COLL',
        graduation_year: 2024,
        status: 'active',
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/players?orderBy=first_name&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5); // Only original 5 players
      const names = response.body.data.map(p => p.first_name);
      expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Edward']);
      expect(names).not.toContain('Zack');
    });
  });
});

>>>>>>> auto-claude/031-add-configurable-sort-order-to-list-endpoints

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
      // Players with 'a' in name
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });
});

=======
>>>>>>> auto-claude/027-consolidate-player-stats-summary-endpoint-into-sin
describe('GET /api/players/stats/summary', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'Stats Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create other team for isolation testing
    otherTeam = await Team.create({
      name: 'Other Stats Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Stats',
      last_name: 'TestUser',
      email: 'stats-test@example.com',
      password: 'password123',
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await ScoutingReport.destroy({
      where: {
        player_id: (await Player.findAll({
          where: {
            team_id: [testTeam.id, otherTeam.id]
          },
          attributes: ['id']
        })).map(p => p.id)
      }
    });
    await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await testUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up players and reports before each test
    await ScoutingReport.destroy({
      where: {
        player_id: (await Player.findAll({
          where: {
            team_id: [testTeam.id, otherTeam.id]
          },
          attributes: ['id']
        })).map(p => p.id)
      }
    });
    await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
  });

  it('should require authentication', async () => {
    const response = await request(app)
      .get('/api/players/stats/summary')
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Not authorized, no token');
  });

  it('should return correct data structure with all 4 fields', async () => {
    const response = await request(app)
      .get('/api/players/stats/summary')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('total_players');
    expect(response.body.data).toHaveProperty('active_recruits');
    expect(response.body.data).toHaveProperty('recent_reports');
    expect(response.body.data).toHaveProperty('team_avg');
    expect(typeof response.body.data.total_players).toBe('number');
    expect(typeof response.body.data.active_recruits).toBe('number');
    expect(typeof response.body.data.recent_reports).toBe('number');
    expect(typeof response.body.data.team_avg).toBe('number');
  });

  it('should handle empty data gracefully (return 0s, not errors)', async () => {
    const response = await request(app)
      .get('/api/players/stats/summary')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.total_players).toBe(0);
    expect(response.body.data.active_recruits).toBe(0);
    expect(response.body.data.recent_reports).toBe(0);
    expect(response.body.data.team_avg).toBe(0);
  });

  it('should return correct counts based on test data', async () => {
    // Create players with different school types and statuses
    const player1 = await Player.create({
      first_name: 'Active',
      last_name: 'HSRecruit',
      school_type: 'HS',
      position: 'P',
      status: 'active',
      batting_avg: 0.300,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    const player2 = await Player.create({
      first_name: 'Inactive',
      last_name: 'HSRecruit',
      school_type: 'HS',
      position: 'C',
      status: 'inactive',
      batting_avg: 0.250,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    const player3 = await Player.create({
      first_name: 'College',
      last_name: 'Player',
      school_type: 'COLL',
      position: '1B',
      status: 'active',
      batting_avg: 0.320,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    // Create recent scouting report (within last 30 days)
    await ScoutingReport.create({
      player_id: player1.id,
      report_date: new Date(),
      overall_rating: 85,
      notes: 'Great potential',
      created_by: testUser.id
    });

    // Create old scouting report (older than 30 days - should not be counted)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    await ScoutingReport.create({
      player_id: player2.id,
      report_date: oldDate,
      overall_rating: 75,
      notes: 'Old report',
      created_by: testUser.id,
      created_at: oldDate
    });

    const response = await request(app)
      .get('/api/players/stats/summary')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.total_players).toBe(3); // All 3 players
    expect(response.body.data.active_recruits).toBe(1); // Only player1 is HS + active
    expect(response.body.data.recent_reports).toBe(1); // Only 1 report in last 30 days
    // Average: (0.300 + 0.250 + 0.320) / 3 = 0.29
    expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
  });

  it('should enforce team isolation (only count players from user team)', async () => {
    // Create players for test team
    await Player.create({
      first_name: 'Test',
      last_name: 'Player1',
      school_type: 'HS',
      position: 'P',
      status: 'active',
      batting_avg: 0.300,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    await Player.create({
      first_name: 'Test',
      last_name: 'Player2',
      school_type: 'HS',
      position: 'C',
      status: 'active',
      batting_avg: 0.280,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    // Create players for other team (should NOT be counted)
    const otherPlayer = await Player.create({
      first_name: 'Other',
      last_name: 'Player1',
      school_type: 'HS',
      position: 'P',
      status: 'active',
      batting_avg: 0.350,
      team_id: otherTeam.id,
      created_by: testUser.id
    });

    // Create scouting report for other team player
    await ScoutingReport.create({
      player_id: otherPlayer.id,
      report_date: new Date(),
      overall_rating: 90,
      notes: 'Other team report',
      created_by: testUser.id
    });

    const response = await request(app)
      .get('/api/players/stats/summary')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    // Should only count test team players, not other team
    expect(response.body.data.total_players).toBe(2);
    expect(response.body.data.active_recruits).toBe(2);
    expect(response.body.data.recent_reports).toBe(0); // No reports for test team
    // Average should only include test team: (0.300 + 0.280) / 2 = 0.29
    expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
  });

  it('should calculate team_avg correctly when some players have no batting_avg', async () => {
    // Create players with and without batting averages
    await Player.create({
      first_name: 'With',
      last_name: 'Avg',
      school_type: 'HS',
      position: 'P',
      status: 'active',
      batting_avg: 0.300,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    await Player.create({
      first_name: 'No',
      last_name: 'Avg',
      school_type: 'HS',
      position: 'C',
      status: 'active',
      batting_avg: null, // No batting average
      team_id: testTeam.id,
      created_by: testUser.id
    });

    await Player.create({
      first_name: 'Also',
      last_name: 'WithAvg',
      school_type: 'COLL',
      position: '1B',
      status: 'active',
      batting_avg: 0.280,
      team_id: testTeam.id,
      created_by: testUser.id
    });

    const response = await request(app)
      .get('/api/players/stats/summary')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.total_players).toBe(3);
    // Average should only include non-null values: (0.300 + 0.280) / 2 = 0.29
    expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
  });
<<<<<<< HEAD
});
=======
});
>>>>>>> auto-claude/027-consolidate-player-stats-summary-endpoint-into-sin
=======
>>>>>>> auto-claude/037-add-eslint-configuration-to-backend-service
