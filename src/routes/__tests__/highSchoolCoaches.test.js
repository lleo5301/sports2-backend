const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, HighSchoolCoach } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('High School Coaches API - Complete CRUD Tests', () => {
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
      name: 'HS Coaches Test Team',
      program_name: 'HS Coaches Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other HS Coaches Test Team',
      program_name: 'Other HS Coaches Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'HSCoaches',
      last_name: 'TestUser',
      email: 'hs-coaches-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-hs-coaches-test@example.com',
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
    await HighSchoolCoach.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up high school coaches before each test
    await HighSchoolCoach.destroy({ where: {}, force: true });
  });

  describe('GET /api/high-school-coaches', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no high school coaches exist', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of high school coaches for authenticated user team', async () => {
      // Create test high school coaches
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        school_district: 'Lincoln ISD',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        phone: '555-1234',
        state: 'TX',
        city: 'Austin',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        school_district: 'Central ISD',
        position: 'Assistant Coach',
        email: 'mjohnson@central.edu',
        phone: '555-5678',
        state: 'TX',
        city: 'Dallas',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(2);
    });

    it('should only return high school coaches for user team (team isolation)', async () => {
      // Create high school coaches for different teams
      await HighSchoolCoach.create({
        first_name: 'My',
        last_name: 'Coach',
        school_name: 'My School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Other',
        last_name: 'Coach',
        school_name: 'Other School',
        position: 'Head Coach',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('My');
    });

    it('should filter high school coaches by status (active)', async () => {
      // Create high school coaches with different statuses
      await HighSchoolCoach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?status=active')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should filter high school coaches by status (inactive)', async () => {
      // Create high school coaches with different statuses
      await HighSchoolCoach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?status=inactive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('inactive');
    });

    it('should default to active status filter', async () => {
      // Create high school coaches with different statuses
      await HighSchoolCoach.create({
        first_name: 'Active',
        last_name: 'Coach',
        school_name: 'Active School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Inactive',
        last_name: 'Coach',
        school_name: 'Inactive School',
        position: 'Head Coach',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should filter high school coaches by position (Head Coach)', async () => {
      // Create high school coaches with different positions
      await HighSchoolCoach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Assistant',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Assistant Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=Head Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Head Coach');
    });

    it('should filter high school coaches by position (Assistant Coach)', async () => {
      // Create high school coaches with different positions
      await HighSchoolCoach.create({
        first_name: 'Assistant',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Assistant Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Head',
        last_name: 'Coach',
        school_name: 'School B',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=Assistant Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Assistant Coach');
    });

    it('should filter high school coaches by position (JV Coach)', async () => {
      await HighSchoolCoach.create({
        first_name: 'JV',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'JV Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=JV Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('JV Coach');
    });

    it('should filter high school coaches by position (Freshman Coach)', async () => {
      await HighSchoolCoach.create({
        first_name: 'Freshman',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Freshman Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=Freshman Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Freshman Coach');
    });

    it('should filter high school coaches by position (Pitching Coach)', async () => {
      await HighSchoolCoach.create({
        first_name: 'Pitching',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Pitching Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=Pitching Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Pitching Coach');
    });

    it('should filter high school coaches by position (Hitting Coach)', async () => {
      await HighSchoolCoach.create({
        first_name: 'Hitting',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Hitting Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?position=Hitting Coach')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Hitting Coach');
    });

    it('should filter high school coaches by state', async () => {
      await HighSchoolCoach.create({
        first_name: 'Texas',
        last_name: 'Coach',
        school_name: 'Texas School',
        position: 'Head Coach',
        state: 'TX',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'California',
        last_name: 'Coach',
        school_name: 'California School',
        position: 'Head Coach',
        state: 'CA',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?state=TX')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].state).toBe('TX');
    });

    it('should filter high school coaches by relationship_type (Recruiting Contact)', async () => {
      await HighSchoolCoach.create({
        first_name: 'Recruiting',
        last_name: 'Coach',
        school_name: 'School A',
        position: 'Head Coach',
        relationship_type: 'Recruiting Contact',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Former',
        last_name: 'Player',
        school_name: 'School B',
        position: 'Head Coach',
        relationship_type: 'Former Player',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?relationship_type=Recruiting Contact')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].relationship_type).toBe('Recruiting Contact');
    });

    it('should filter high school coaches by relationship_type (Former Player)', async () => {
      await HighSchoolCoach.create({
        first_name: 'Former',
        last_name: 'Player',
        school_name: 'School A',
        position: 'Head Coach',
        relationship_type: 'Former Player',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?relationship_type=Former Player')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].relationship_type).toBe('Former Player');
    });

    it('should search high school coaches by first name', async () => {
      // Create test high school coaches
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
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
        .get('/api/high-school-coaches?search=john')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('John');
    });

    it('should search high school coaches by last name', async () => {
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?search=johnson')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].last_name).toBe('Johnson');
    });

    it('should search high school coaches by school name', async () => {
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?search=lincoln')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].school_name).toBe('Lincoln High School');
    });

    it('should search high school coaches by school district', async () => {
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        school_district: 'Lincoln ISD',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        school_district: 'Central ISD',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?search=lincoln isd')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].school_district).toBe('Lincoln ISD');
    });

    it('should search high school coaches by email', async () => {
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
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
        .get('/api/high-school-coaches?search=mjohnson')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].email).toBe('mjohnson@central.edu');
    });

    it('should search high school coaches by city', async () => {
      await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        city: 'Austin',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await HighSchoolCoach.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        school_name: 'Central High School',
        position: 'Head Coach',
        city: 'Dallas',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches?search=austin')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].city).toBe('Austin');
    });

    it('should support pagination with page and limit', async () => {
      // Create multiple high school coaches
      for (let i = 1; i <= 25; i++) {
        await HighSchoolCoach.create({
          first_name: `Coach`,
          last_name: `Number${i}`,
          school_name: `School ${i}`,
          position: 'Head Coach',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      }

      const response = await request(app)
        .get('/api/high-school-coaches?page=2&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(10);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.total).toBe(25);
      expect(response.body.pagination.pages).toBe(3);
    });

    it('should include Creator information in response', async () => {
      await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].Creator).toBeDefined();
      expect(response.body.data[0].Creator.id).toBe(testUser.id);
      expect(response.body.data[0].Creator.first_name).toBe('HSCoaches');
    });

    it('should sort high school coaches by created_at DESC (newest first)', async () => {
      // Create high school coaches with slight delays to ensure different timestamps
      const coach1 = await HighSchoolCoach.create({
        first_name: 'First',
        last_name: 'Coach',
        school_name: 'School 1',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const coach2 = await HighSchoolCoach.create({
        first_name: 'Second',
        last_name: 'Coach',
        school_name: 'School 2',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/high-school-coaches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].first_name).toBe('Second');
      expect(response.body.data[1].first_name).toBe('First');
    });

    it('should reject invalid status values', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches?status=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid position values', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches?position=Invalid Position')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid relationship_type values', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches?relationship_type=Invalid Type')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/high-school-coaches/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches/123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should get a single high school coach by ID', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        school_district: 'Lincoln ISD',
        position: 'Head Coach',
        email: 'jsmith@lincoln.edu',
        phone: '555-1234',
        city: 'Austin',
        state: 'TX',
        region: 'Central Texas',
        years_coaching: 15,
        conference: 'District 5-5A',
        school_classification: '5A',
        relationship_type: 'Recruiting Contact',
        notes: 'Great contact for recruiting',
        last_contact_date: '2024-01-15',
        next_contact_date: '2024-02-01',
        contact_notes: 'Follow up on spring recruiting',
        players_sent_count: 3,
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/high-school-coaches/${coach.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(coach.id);
      expect(response.body.data.first_name).toBe('John');
      expect(response.body.data.last_name).toBe('Smith');
      expect(response.body.data.school_name).toBe('Lincoln High School');
      expect(response.body.data.school_district).toBe('Lincoln ISD');
      expect(response.body.data.position).toBe('Head Coach');
      expect(response.body.data.email).toBe('jsmith@lincoln.edu');
      expect(response.body.data.phone).toBe('555-1234');
      expect(response.body.data.city).toBe('Austin');
      expect(response.body.data.state).toBe('TX');
      expect(response.body.data.region).toBe('Central Texas');
      expect(response.body.data.years_coaching).toBe(15);
      expect(response.body.data.conference).toBe('District 5-5A');
      expect(response.body.data.school_classification).toBe('5A');
      expect(response.body.data.relationship_type).toBe('Recruiting Contact');
      expect(response.body.data.notes).toBe('Great contact for recruiting');
      expect(response.body.data.contact_notes).toBe('Follow up on spring recruiting');
      expect(response.body.data.players_sent_count).toBe(3);
      expect(response.body.data.status).toBe('active');
    });

    it('should include Creator information in response', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/high-school-coaches/${coach.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.id).toBe(testUser.id);
      expect(response.body.data.Creator.first_name).toBe('HSCoaches');
    });

    it('should return 404 for non-existent high school coach', async () => {
      const response = await request(app)
        .get('/api/high-school-coaches/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');
    });

    it('should enforce team isolation (cannot access other team coach)', async () => {
      // Create high school coach for other team
      const otherCoach = await HighSchoolCoach.create({
        first_name: 'Other',
        last_name: 'Coach',
        school_name: 'Other School',
        position: 'Head Coach',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/high-school-coaches/${otherCoach.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');
    });
  });

  describe('POST /api/high-school-coaches', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a high school coach with required fields only', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'John',
          last_name: 'Smith',
          school_name: 'Lincoln High School',
          position: 'Head Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('John');
      expect(response.body.data.last_name).toBe('Smith');
      expect(response.body.data.school_name).toBe('Lincoln High School');
      expect(response.body.data.position).toBe('Head Coach');
      expect(response.body.data.status).toBe('active'); // Default value

      // Verify in database
      const coach = await HighSchoolCoach.findByPk(response.body.data.id);
      expect(coach).toBeDefined();
      expect(coach.first_name).toBe('John');
    });

    it('should create a high school coach with all fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          school_name: 'Central High School',
          school_district: 'Central ISD',
          position: 'Assistant Coach',
          email: 'mjohnson@central.edu',
          phone: '555-5678',
          city: 'Dallas',
          state: 'TX',
          region: 'North Texas',
          years_coaching: 10,
          conference: 'District 6-6A',
          school_classification: '6A',
          relationship_type: 'Former Player',
          notes: 'Strong recruiting relationship',
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-02-01',
          contact_notes: 'Follow up on spring recruiting',
          players_sent_count: 5
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Mike');
      expect(response.body.data.last_name).toBe('Johnson');
      expect(response.body.data.school_name).toBe('Central High School');
      expect(response.body.data.school_district).toBe('Central ISD');
      expect(response.body.data.position).toBe('Assistant Coach');
      expect(response.body.data.email).toBe('mjohnson@central.edu');
      expect(response.body.data.phone).toBe('555-5678');
      expect(response.body.data.city).toBe('Dallas');
      expect(response.body.data.state).toBe('TX');
      expect(response.body.data.region).toBe('North Texas');
      expect(response.body.data.years_coaching).toBe(10);
      expect(response.body.data.conference).toBe('District 6-6A');
      expect(response.body.data.school_classification).toBe('6A');
      expect(response.body.data.relationship_type).toBe('Former Player');
      expect(response.body.data.notes).toBe('Strong recruiting relationship');
      expect(response.body.data.contact_notes).toBe('Follow up on spring recruiting');
      expect(response.body.data.players_sent_count).toBe(5);
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify in database
      const coach = await HighSchoolCoach.findByPk(response.body.data.id);
      expect(coach.team_id).toBe(testTeam.id);
    });

    it('should auto-assign created_by from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify in database
      const coach = await HighSchoolCoach.findByPk(response.body.data.id);
      expect(coach.created_by).toBe(testUser.id);
    });

    it('should include Creator information in response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.id).toBe(testUser.id);
      expect(response.body.data.Creator.first_name).toBe('HSCoaches');
    });

    it('should require first_name', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          last_name: 'Smith',
          school_name: 'Lincoln High School',
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require last_name', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'John',
          school_name: 'Lincoln High School',
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require school_name', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'John',
          last_name: 'Smith',
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require position', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'John',
          last_name: 'Smith',
          school_name: 'Lincoln High School'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate position enum (Head Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Head Coach');
    });

    it('should validate position enum (Assistant Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Assistant Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Assistant Coach');
    });

    it('should validate position enum (JV Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'JV Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('JV Coach');
    });

    it('should validate position enum (Freshman Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Freshman Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Freshman Coach');
    });

    it('should validate position enum (Pitching Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Pitching Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Pitching Coach');
    });

    it('should validate position enum (Hitting Coach)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Hitting Coach'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Hitting Coach');
    });

    it('should reject invalid position values', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Invalid Position'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate school_classification enum (1A)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          school_classification: '1A'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.school_classification).toBe('1A');
    });

    it('should validate school_classification enum (6A)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          school_classification: '6A'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.school_classification).toBe('6A');
    });

    it('should validate school_classification enum (Private)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          school_classification: 'Private'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.school_classification).toBe('Private');
    });

    it('should reject invalid school_classification values', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          school_classification: '7A'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate relationship_type enum (Recruiting Contact)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Recruiting Contact'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Recruiting Contact');
    });

    it('should validate relationship_type enum (Former Player)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Former Player'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Former Player');
    });

    it('should validate relationship_type enum (Coaching Connection)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Coaching Connection'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Coaching Connection');
    });

    it('should validate relationship_type enum (Tournament Contact)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Tournament Contact'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Tournament Contact');
    });

    it('should validate relationship_type enum (Camp Contact)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Camp Contact'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Camp Contact');
    });

    it('should validate relationship_type enum (Other)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Other'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.relationship_type).toBe('Other');
    });

    it('should reject invalid relationship_type values', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          relationship_type: 'Invalid Type'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate years_coaching range (0-50)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          years_coaching: 51
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate players_sent_count is non-negative', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          players_sent_count: -1
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate first_name max length (100 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'a'.repeat(101),
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate last_name max length (100 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'a'.repeat(101),
          school_name: 'Test School',
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate school_name max length (200 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'a'.repeat(201),
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate school_district max length (200 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          school_district: 'a'.repeat(201),
          position: 'Head Coach'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate phone max length (20 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          phone: '1'.repeat(21)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email max length (255 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          email: 'a'.repeat(250) + '@test.com'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate city max length (100 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          city: 'a'.repeat(101)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate state max length (50 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          state: 'a'.repeat(51)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate region max length (100 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          region: 'a'.repeat(101)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate conference max length (100 chars)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          conference: 'a'.repeat(101)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate last_contact_date ISO8601 format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          last_contact_date: 'invalid-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate next_contact_date ISO8601 format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/high-school-coaches')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          next_contact_date: 'invalid-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('PUT /api/high-school-coaches/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/high-school-coaches/123')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({ first_name: 'Updated' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update a high school coach with partial fields', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-02-01',
          contact_notes: 'Follow up scheduled',
          players_sent_count: 2
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('John'); // Unchanged
      expect(response.body.data.last_name).toBe('Smith'); // Unchanged
      expect(response.body.data.contact_notes).toBe('Follow up scheduled');
      expect(response.body.data.players_sent_count).toBe(2);

      // Verify in database
      const updatedCoach = await HighSchoolCoach.findByPk(coach.id);
      expect(updatedCoach.contact_notes).toBe('Follow up scheduled');
      expect(updatedCoach.players_sent_count).toBe(2);
    });

    it('should update a high school coach with all fields', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'John',
        last_name: 'Smith',
        school_name: 'Lincoln High School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          school_name: 'Central High School',
          school_district: 'Central ISD',
          position: 'Assistant Coach',
          email: 'mjohnson@central.edu',
          phone: '555-9999',
          city: 'Dallas',
          state: 'TX',
          region: 'North Texas',
          years_coaching: 12,
          conference: 'District 5-5A',
          school_classification: '5A',
          relationship_type: 'Coaching Connection',
          notes: 'Updated notes',
          last_contact_date: '2024-01-20',
          next_contact_date: '2024-02-15',
          contact_notes: 'New contact plan',
          players_sent_count: 8,
          status: 'inactive'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Mike');
      expect(response.body.data.last_name).toBe('Johnson');
      expect(response.body.data.school_name).toBe('Central High School');
      expect(response.body.data.school_district).toBe('Central ISD');
      expect(response.body.data.position).toBe('Assistant Coach');
      expect(response.body.data.email).toBe('mjohnson@central.edu');
      expect(response.body.data.phone).toBe('555-9999');
      expect(response.body.data.city).toBe('Dallas');
      expect(response.body.data.state).toBe('TX');
      expect(response.body.data.region).toBe('North Texas');
      expect(response.body.data.years_coaching).toBe(12);
      expect(response.body.data.conference).toBe('District 5-5A');
      expect(response.body.data.school_classification).toBe('5A');
      expect(response.body.data.relationship_type).toBe('Coaching Connection');
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.contact_notes).toBe('New contact plan');
      expect(response.body.data.players_sent_count).toBe(8);
      expect(response.body.data.status).toBe('inactive');

      // Verify in database
      const updatedCoach = await HighSchoolCoach.findByPk(coach.id);
      expect(updatedCoach.first_name).toBe('Mike');
      expect(updatedCoach.status).toBe('inactive');
    });

    it('should update status to inactive', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('inactive');

      // Verify in database
      const updatedCoach = await HighSchoolCoach.findByPk(coach.id);
      expect(updatedCoach.status).toBe('inactive');
    });

    it('should validate position enum when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ position: 'Invalid Position' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate status enum when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate school_classification enum when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ school_classification: '7A' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate relationship_type enum when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ relationship_type: 'Invalid Type' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate years_coaching range when updating', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ years_coaching: 60 })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent high school coach', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/high-school-coaches/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');
    });

    it('should enforce team isolation (cannot update other team coach)', async () => {
      const otherCoach = await HighSchoolCoach.create({
        first_name: 'Other',
        last_name: 'Coach',
        school_name: 'Other School',
        position: 'Head Coach',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${otherCoach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Hacked' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');

      // Verify coach was not updated
      const coach = await HighSchoolCoach.findByPk(otherCoach.id);
      expect(coach.first_name).toBe('Other');
    });

    it('should include Creator information in response', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Updated notes' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.id).toBe(testUser.id);
    });
  });

  describe('DELETE /api/high-school-coaches/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/high-school-coaches/123')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete a high school coach successfully', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('High school coach deleted successfully');

      // Verify coach was deleted from database (hard delete)
      const deletedCoach = await HighSchoolCoach.findByPk(coach.id);
      expect(deletedCoach).toBeNull();
    });

    it('should perform hard delete (remove from database)', async () => {
      const coach = await HighSchoolCoach.create({
        first_name: 'Test',
        last_name: 'Coach',
        school_name: 'Test School',
        position: 'Head Coach',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/high-school-coaches/${coach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify coach is completely removed from database
      const deletedCoach = await HighSchoolCoach.findByPk(coach.id);
      expect(deletedCoach).toBeNull();
    });

    it('should return 404 for non-existent high school coach', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/high-school-coaches/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');
    });

    it('should enforce team isolation (cannot delete other team coach)', async () => {
      const otherCoach = await HighSchoolCoach.create({
        first_name: 'Other',
        last_name: 'Coach',
        school_name: 'Other School',
        position: 'Head Coach',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/high-school-coaches/${otherCoach.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('High school coach not found');

      // Verify coach was not deleted
      const coach = await HighSchoolCoach.findByPk(otherCoach.id);
      expect(coach).toBeDefined();
      expect(coach.first_name).toBe('Other');
    });
  });
});
