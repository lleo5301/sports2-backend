const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Player, PreferenceList } = require('../../models');
const jwt = require('jsonwebtoken');

// Helper functions for creating test data
const createTestPlayer = (attrs = {}) => {
  return Player.create({
    first_name: 'Test',
    last_name: 'Player',
    position: 'SS',
    school_type: 'HS',
    school: 'Test High School',
    city: 'Austin',
    state: 'TX',
    team_id: global.testTeam.id,
    created_by: global.testUser.id,
    ...attrs
  });
};

const createOtherTeamPlayer = (attrs = {}) => {
  return Player.create({
    first_name: 'Other',
    last_name: 'Player',
    position: 'CF',
    school_type: 'HS',
    school: 'Other High School',
    city: 'Dallas',
    state: 'TX',
    team_id: global.otherTeam.id,
    created_by: global.otherUser.id,
    ...attrs
  });
};

const createPreferenceList = (playerId, attrs = {}) => {
  return PreferenceList.create({
    player_id: playerId,
    team_id: global.testTeam.id,
    list_type: 'hs_pref_list',
    priority: 1,
    status: 'active',
    added_by: global.testUser.id,
    ...attrs
  });
};

// Global test setup - runs once before all test suites
beforeAll(async () => {
  await sequelize.authenticate();

  // Use timestamp to ensure unique email addresses
  const timestamp = Date.now();

  // Create global test teams
  global.testTeam = await Team.create({
    name: 'Recruits Test Team',
    program_name: 'Recruits Test Team Program'
  });

  global.otherTeam = await Team.create({
    name: 'Other Recruits Test Team',
    program_name: 'Other Recruits Test Team Program'
  });

  // Create global test users
  global.testUser = await User.create({
    first_name: 'Recruits',
    last_name: 'TestUser',
    email: `recruits-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.testTeam.id
  });

  global.otherUser = await User.create({
    first_name: 'Other',
    last_name: 'User',
    email: `other-recruits-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.otherTeam.id
  });

  // Generate auth tokens
  global.authToken = jwt.sign({ id: global.testUser.id }, process.env.JWT_SECRET || 'test_secret');
  global.otherAuthToken = jwt.sign({ id: global.otherUser.id }, process.env.JWT_SECRET || 'test_secret');
});

// Global test cleanup - runs once after all test suites
afterAll(async () => {
  await PreferenceList.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
  await global.testUser.destroy();
  await global.otherUser.destroy();
  await global.testTeam.destroy();
  await global.otherTeam.destroy();
  await sequelize.close();
});

// Clean up between tests
afterEach(async () => {
  await PreferenceList.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
});

describe('Recruits API - Position Players (Recruits)', () => {
  describe('GET /api/recruits', () => {
    it('should return empty array when no recruits exist', async () => {
      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        pages: 0
      });
    });

    it('should return position players (excludes pitchers and DH)', async () => {
      await createTestPlayer({ first_name: 'John', last_name: 'Catcher', position: 'C' });
      await createTestPlayer({ first_name: 'Mike', last_name: 'Pitcher', position: 'P' });
      await createTestPlayer({ first_name: 'Dave', last_name: 'DH', position: 'DH' });
      await createTestPlayer({ first_name: 'Tom', last_name: 'Shortstop', position: 'SS' });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(p => p.position !== 'P' && p.position !== 'DH')).toBe(true);
    });

    it('should only return recruits for user team (team isolation)', async () => {
      await createTestPlayer({ first_name: 'Test', last_name: 'Player' });
      await createOtherTeamPlayer({ first_name: 'Other', last_name: 'Player' });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].first_name).toBe('Test');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/recruits')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

describe('Recruits API - Preference Lists', () => {
  let testPlayer;
  let otherTeamPlayer;

  beforeEach(async () => {
    // Create test players for preference lists
    testPlayer = await createTestPlayer({
      first_name: 'John',
      last_name: 'Smith',
      position: 'SS'
    });

    otherTeamPlayer = await createOtherTeamPlayer({
      first_name: 'Other',
      last_name: 'Player',
      position: 'CF'
    });
  });

  describe('GET /api/recruits/preference-lists', () => {
    it('should return empty array when no preference lists exist', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return preference lists with Player associations', async () => {
      await createPreferenceList(testPlayer.id, {
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active'
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].Player).toBeDefined();
      expect(response.body.data[0].Player.first_name).toBe('John');
      expect(response.body.data[0].list_type).toBe('hs_pref_list');
    });

    it('should only return preference lists for user team (team isolation)', async () => {
      // Create preference list for test team
      await createPreferenceList(testPlayer.id, {
        list_type: 'hs_pref_list'
      });

      // Create preference list for other team
      await PreferenceList.create({
        player_id: otherTeamPlayer.id,
        team_id: global.otherTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: global.otherUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].Player.first_name).toBe('John');
    });

    it('should filter by list_type', async () => {
      await createPreferenceList(testPlayer.id, {
        list_type: 'hs_pref_list'
      });

      const player2 = await createTestPlayer({
        first_name: 'College',
        last_name: 'Player',
        school_type: 'COLL'
      });

      await createPreferenceList(player2.id, {
        list_type: 'college_transfers'
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=hs_pref_list')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].list_type).toBe('hs_pref_list');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
