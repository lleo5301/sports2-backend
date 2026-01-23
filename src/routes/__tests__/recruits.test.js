const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Player, PreferenceList, Permission } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Recruits API - Complete CRUD Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let _otherAuthToken;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Recruits Test Team',
      program_name: 'Recruits Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Recruits Test Team',
      program_name: 'Other Recruits Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Recruits',
      last_name: 'TestUser',
      email: 'recruits-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-recruits-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    _otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await PreferenceList.destroy({ where: {}, force: true });
    await Player.destroy({ where: {}, force: true });
    await Permission.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up players and preference lists before each test
    await PreferenceList.destroy({ where: {}, force: true });
    await Player.destroy({ where: {}, force: true });
  });

  describe('GET /api/recruits', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/recruits')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no recruits exist', async () => {
      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        pages: 0
      });
    });

    it('should return position players (excludes pitchers and DH)', async () => {
      // Create various position players
      await Player.create({
        first_name: 'John',
        last_name: 'Catcher',
        position: 'C',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Mike',
        last_name: 'Pitcher',
        position: 'P',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Dave',
        last_name: 'DH',
        position: 'DH',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Tom',
        last_name: 'Shortstop',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].position).not.toBe('P');
      expect(response.body.data[0].position).not.toBe('DH');
      expect(response.body.data[1].position).not.toBe('P');
      expect(response.body.data[1].position).not.toBe('DH');
    });

    it('should enforce team isolation', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Jane',
        last_name: 'Doe',
        position: 'CF',
        school_type: 'HS',
        school: 'Other High School',
        city: 'Dallas',
        state: 'TX',
        team_id: otherTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].first_name).toBe('John');
    });

    it('should support pagination', async () => {
      // Create 3 position players
      for (let i = 1; i <= 3; i++) {
        await Player.create({
          first_name: `Player${i}`,
          last_name: `Test`,
          position: 'SS',
          school_type: 'HS',
          school: 'Test High School',
          city: 'Austin',
          state: 'TX',
          team_id: testTeam.id
        });
      }

      const response = await request(app)
        .get('/api/v1/recruits?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        pages: 2
      });
    });

    it('should filter by school_type (HS)', async () => {
      await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'College',
        last_name: 'Player',
        position: 'SS',
        school_type: 'COLL',
        school: 'Test University',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?school_type=HS')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].school_type).toBe('HS');
      expect(response.body.data[0].first_name).toBe('HS');
    });

    it('should filter by school_type (COLL)', async () => {
      await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'College',
        last_name: 'Player',
        position: 'SS',
        school_type: 'COLL',
        school: 'Test University',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?school_type=COLL')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].school_type).toBe('COLL');
      expect(response.body.data[0].first_name).toBe('College');
    });

    it('should filter by position', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Catcher',
        position: 'C',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Tom',
        last_name: 'Shortstop',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?position=SS')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].position).toBe('SS');
      expect(response.body.data[0].first_name).toBe('Tom');
    });

    it('should search by first name', async () => {
      await Player.create({
        first_name: 'Michael',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'John',
        last_name: 'Doe',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?search=mich')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].first_name).toBe('Michael');
    });

    it('should search by last name', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Johnson',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Mike',
        last_name: 'Smith',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?search=john')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].last_name).toBe('Johnson');
    });

    it('should search by school name', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Lincoln High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Mike',
        last_name: 'Jones',
        position: 'CF',
        school_type: 'HS',
        school: 'Washington High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?search=lincoln')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].school).toBe('Lincoln High School');
    });

    it('should search by city', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Houston',
        state: 'TX',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Mike',
        last_name: 'Jones',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Dallas',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?search=hous')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].city).toBe('Houston');
    });

    it('should search by state', async () => {
      await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'CA',
        team_id: testTeam.id
      });

      await Player.create({
        first_name: 'Mike',
        last_name: 'Jones',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Dallas',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits?search=CA')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].state).toBe('CA');
    });

    it('should include PreferenceList association', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        interest_level: 'High',
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].PreferenceLists).toHaveLength(1);
      expect(response.body.data[0].PreferenceLists[0].list_type).toBe('hs_pref_list');
      expect(response.body.data[0].PreferenceLists[0].priority).toBe(1);
      expect(response.body.data[0].PreferenceLists[0].status).toBe('active');
      expect(response.body.data[0].PreferenceLists[0].interest_level).toBe('High');
    });

    it('should validate invalid school_type', async () => {
      const response = await request(app)
        .get('/api/v1/recruits?school_type=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate invalid position', async () => {
      const response = await request(app)
        .get('/api/v1/recruits?position=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should order results by created_at DESC (newest first)', async () => {
      const player1 = await Player.create({
        first_name: 'First',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const player2 = await Player.create({
        first_name: 'Second',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const response = await request(app)
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].first_name).toBe('Second'); // Newest first
      expect(response.body.data[1].first_name).toBe('First');
    });
  });

  describe('GET /api/recruits/preference-lists', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no preference lists exist', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        pages: 0
      });
    });

    it('should return preference lists with Player and AddedBy associations', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        graduation_year: 2025,
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        interest_level: 'High',
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].Player).toBeDefined();
      expect(response.body.data[0].Player.first_name).toBe('John');
      expect(response.body.data[0].Player.last_name).toBe('Smith');
      expect(response.body.data[0].Player.position).toBe('SS');
      expect(response.body.data[0].Player.school_type).toBe('HS');
      expect(response.body.data[0].Player.graduation_year).toBe(2025);
      expect(response.body.data[0].AddedBy).toBeDefined();
      expect(response.body.data[0].AddedBy.first_name).toBe('Recruits');
      expect(response.body.data[0].AddedBy.last_name).toBe('TestUser');
    });

    it('should enforce team isolation', async () => {
      const testPlayer = await Player.create({
        first_name: 'Test',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Other High School',
        city: 'Dallas',
        state: 'TX',
        team_id: otherTeam.id
      });

      await PreferenceList.create({
        player_id: testPlayer.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: otherPlayer.id,
        team_id: otherTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].Player.first_name).toBe('Test');
    });

    it('should support pagination', async () => {
      const player1 = await Player.create({
        first_name: 'Player1',
        last_name: 'Test',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'Player2',
        last_name: 'Test',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player3 = await Player.create({
        first_name: 'Player3',
        last_name: 'Test',
        position: '2B',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 2,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player3.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 3,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        pages: 2
      });
    });

    it('should filter by list_type (new_players)', async () => {
      const player1 = await Player.create({
        first_name: 'New',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'new_players',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=new_players')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].list_type).toBe('new_players');
      expect(response.body.data[0].Player.first_name).toBe('New');
    });

    it('should filter by list_type (overall_pref_list)', async () => {
      const player1 = await Player.create({
        first_name: 'Overall',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'overall_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=overall_pref_list')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].list_type).toBe('overall_pref_list');
      expect(response.body.data[0].Player.first_name).toBe('Overall');
    });

    it('should filter by list_type (hs_pref_list)', async () => {
      const player1 = await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'College',
        last_name: 'Player',
        position: 'CF',
        school_type: 'COLL',
        school: 'Test University',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'college_transfers',
        priority: 1,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=hs_pref_list')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].list_type).toBe('hs_pref_list');
      expect(response.body.data[0].Player.first_name).toBe('HS');
    });

    it('should filter by list_type (college_transfers)', async () => {
      const player1 = await Player.create({
        first_name: 'College',
        last_name: 'Player',
        position: 'SS',
        school_type: 'COLL',
        school: 'Test University',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'HS',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'college_transfers',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=college_transfers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].list_type).toBe('college_transfers');
      expect(response.body.data[0].Player.first_name).toBe('College');
    });

    it('should filter by status (active)', async () => {
      const player1 = await Player.create({
        first_name: 'Active',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'Committed',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 2,
        status: 'committed',
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('active');
      expect(response.body.data[0].Player.first_name).toBe('Active');
    });

    it('should filter by status (committed)', async () => {
      const player1 = await Player.create({
        first_name: 'Committed',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'Active',
        last_name: 'Player',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'committed',
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 2,
        status: 'active',
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?status=committed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('committed');
      expect(response.body.data[0].Player.first_name).toBe('Committed');
    });

    it('should order by priority ASC then added_date DESC', async () => {
      const player1 = await Player.create({
        first_name: 'Player1',
        last_name: 'Test',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player2 = await Player.create({
        first_name: 'Player2',
        last_name: 'Test',
        position: 'CF',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const player3 = await Player.create({
        first_name: 'Player3',
        last_name: 'Test',
        position: '2B',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      await PreferenceList.create({
        player_id: player1.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 2,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player2.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      await PreferenceList.create({
        player_id: player3.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 3,
        added_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].priority).toBe(1); // Lowest priority number first
      expect(response.body.data[1].priority).toBe(2);
      expect(response.body.data[2].priority).toBe(3);
    });

    it('should validate invalid list_type', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?list_type=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate invalid status', async () => {
      const response = await request(app)
        .get('/api/v1/recruits/preference-lists?status=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/recruits/preference-lists', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          player_id: 1,
          list_type: 'hs_pref_list'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create preference list entry with required fields only', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.list_type).toBe('hs_pref_list');
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.Player.first_name).toBe('John');
      expect(response.body.data.AddedBy).toBeDefined();
      expect(response.body.data.AddedBy.first_name).toBe('Recruits');

      // Verify database state
      const pref = await PreferenceList.findByPk(response.body.data.id);
      expect(pref).toBeDefined();
      expect(pref.player_id).toBe(player.id);
      expect(pref.team_id).toBe(testTeam.id);
      expect(pref.added_by).toBe(testUser.id);
    });

    it('should create preference list entry with all fields', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          priority: 1,
          notes: 'Top SS prospect',
          interest_level: 'High',
          visit_scheduled: true,
          visit_date: '2025-06-15',
          scholarship_offered: true,
          scholarship_amount: 25000
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.list_type).toBe('hs_pref_list');
      expect(response.body.data.priority).toBe(1);
      expect(response.body.data.notes).toBe('Top SS prospect');
      expect(response.body.data.interest_level).toBe('High');
      expect(response.body.data.visit_scheduled).toBe(true);
      expect(response.body.data.scholarship_offered).toBe(true);

      // Verify database state
      const pref = await PreferenceList.findByPk(response.body.data.id);
      expect(pref.scholarship_amount).toBe('25000.00');
    });

    it('should require player_id', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          list_type: 'hs_pref_list'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require list_type', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate list_type enum', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'INVALID'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate interest_level enum', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          interest_level: 'INVALID'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate priority range (min)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          priority: 0
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate priority range (max)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          priority: 1000
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate scholarship_amount (non-negative)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          scholarship_amount: -1000
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate visit_date as ISO8601', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list',
          visit_date: 'not-a-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 if player not found', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: 99999,
          list_type: 'hs_pref_list'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Player not found');
    });

    it('should return 404 if player belongs to different team', async () => {
      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: otherTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: otherPlayer.id,
          list_type: 'hs_pref_list'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Player not found');
    });

    it('should prevent duplicate entries (same player, team, list_type)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      // Create first preference list entry
      await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      // Try to create duplicate
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Player is already in this preference list');
    });

    it('should allow same player on different list types', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      // Create first preference list entry
      await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      // Add to different list type - should succeed
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'overall_pref_list'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.list_type).toBe('overall_pref_list');
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify team_id in database
      const pref = await PreferenceList.findByPk(response.body.data.id);
      expect(pref.team_id).toBe(testTeam.id);
    });

    it('should auto-assign added_by from authenticated user', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/recruits/preference-lists')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          player_id: player.id,
          list_type: 'hs_pref_list'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify added_by in database
      const pref = await PreferenceList.findByPk(response.body.data.id);
      expect(pref.added_by).toBe(testUser.id);
    });
  });

  describe('PUT /api/recruits/preference-lists/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/v1/recruits/preference-lists/123')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          priority: 2
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update preference list entry with partial fields', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 2,
          notes: 'Updated notes'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe(2);
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.status).toBe('active'); // Unchanged

      // Verify database state
      await pref.reload();
      expect(pref.priority).toBe(2);
      expect(pref.notes).toBe('Updated notes');
    });

    it('should update preference list entry with all fields', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 2,
          notes: 'Verbal commitment received',
          status: 'committed',
          interest_level: 'High',
          visit_scheduled: true,
          visit_date: '2025-06-15',
          scholarship_offered: true,
          scholarship_amount: 30000,
          last_contact_date: '2025-05-01',
          next_contact_date: '2025-05-15',
          contact_notes: 'Called coach Smith'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.priority).toBe(2);
      expect(response.body.data.notes).toBe('Verbal commitment received');
      expect(response.body.data.status).toBe('committed');
      expect(response.body.data.interest_level).toBe('High');
      expect(response.body.data.visit_scheduled).toBe(true);
      expect(response.body.data.scholarship_offered).toBe(true);
      expect(response.body.data.contact_notes).toBe('Called coach Smith');
    });

    it('should update status to committed', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'committed'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('committed');
    });

    it('should update status to signed', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'committed',
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'signed'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('signed');
    });

    it('should update status to lost', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        status: 'active',
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'lost'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('lost');
    });

    it('should validate status enum', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'INVALID'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate interest_level enum', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          interest_level: 'INVALID'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate priority range', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 1000
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate scholarship_amount (non-negative)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scholarship_amount: -5000
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 if preference list entry not found', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/v1/recruits/preference-lists/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 2
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Preference list entry not found');
    });

    it('should enforce team isolation (cannot update other team entry)', async () => {
      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: otherTeam.id
      });

      const otherPref = await PreferenceList.create({
        player_id: otherPlayer.id,
        team_id: otherTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${otherPref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 2
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Preference list entry not found');
    });

    it('should return updated entry with Player and AddedBy associations', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priority: 2
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.Player.first_name).toBe('John');
      expect(response.body.data.AddedBy).toBeDefined();
      expect(response.body.data.AddedBy.first_name).toBe('Recruits');
    });
  });

  describe('DELETE /api/recruits/preference-lists/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/v1/recruits/preference-lists/123')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete preference list entry', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Player removed from preference list successfully');

      // Verify hard delete - entry should not exist
      const deleted = await PreferenceList.findByPk(pref.id);
      expect(deleted).toBeNull();
    });

    it('should hard delete (not soft delete)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const prefId = pref.id;

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/v1/recruits/preference-lists/${prefId}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify entry is completely removed from database
      const deleted = await PreferenceList.findByPk(prefId);
      expect(deleted).toBeNull();
    });

    it('should not delete player record (only preference list entry)', async () => {
      const player = await Player.create({
        first_name: 'John',
        last_name: 'Smith',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: testTeam.id
      });

      const pref = await PreferenceList.create({
        player_id: player.id,
        team_id: testTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/v1/recruits/preference-lists/${pref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify player still exists
      const playerStillExists = await Player.findByPk(player.id);
      expect(playerStillExists).not.toBeNull();
      expect(playerStillExists.first_name).toBe('John');
    });

    it('should return 404 if preference list entry not found', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/v1/recruits/preference-lists/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Preference list entry not found');
    });

    it('should enforce team isolation (cannot delete other team entry)', async () => {
      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'SS',
        school_type: 'HS',
        school: 'Test High School',
        city: 'Austin',
        state: 'TX',
        team_id: otherTeam.id
      });

      const otherPref = await PreferenceList.create({
        player_id: otherPlayer.id,
        team_id: otherTeam.id,
        list_type: 'hs_pref_list',
        priority: 1,
        added_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/v1/recruits/preference-lists/${otherPref.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Preference list entry not found');

      // Verify other team's entry was not deleted
      const stillExists = await PreferenceList.findByPk(otherPref.id);
      expect(stillExists).not.toBeNull();
    });
  });
});
