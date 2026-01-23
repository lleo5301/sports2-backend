const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Schedule, ScheduleSection, ScheduleActivity } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Schedules API - Core CRUD Operations', () => {
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
      name: 'Schedules Test Team',
      program_name: 'Schedules Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Schedules Test Team',
      program_name: 'Other Schedules Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Schedules',
      last_name: 'TestUser',
      email: 'schedules-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-schedules-test@example.com',
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
    await ScheduleActivity.destroy({ where: {}, force: true });
    await ScheduleSection.destroy({ where: {}, force: true });
    await Schedule.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up schedules before each test (cascade will clean sections and activities)
    await ScheduleActivity.destroy({ where: {}, force: true });
    await ScheduleSection.destroy({ where: {}, force: true });
    await Schedule.destroy({ where: {}, force: true });
  });

  describe('GET /api/schedules', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedules')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no schedules exist', async () => {
      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return list of schedules for authenticated user team', async () => {
      // Create test schedules
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        motto: 'Work hard, play harder',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-16',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.pages).toBe(1);
    });

    it('should enforce team isolation', async () => {
      // Create schedule for other team
      await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBe(0);
    });

    it('should filter schedules by date', async () => {
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-16',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules?date=2024-03-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].date).toBe('2024-03-15');
    });

    it('should support pagination', async () => {
      // Create 15 schedules
      for (let i = 1; i <= 15; i++) {
        await Schedule.create({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: `2024-03-${i.toString().padStart(2, '0')}`,
          team_id: testTeam.id,
          created_by: testUser.id,
          is_active: true
        });
      }

      const response = await request(app)
        .get('/api/schedules?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBe(10);
      expect(response.body.pagination.total).toBe(15);
      expect(response.body.pagination.pages).toBe(2);

      const response2 = await request(app)
        .get('/api/schedules?page=2&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response2.body.data.length).toBe(5);
    });

    it('should order schedules by date DESC then created_at DESC', async () => {
      const schedule1 = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const schedule2 = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-20',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data[0].id).toBe(schedule2.id);
      expect(response.body.data[1].id).toBe(schedule1.id);
    });

    it('should include Creator and Team information', async () => {
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data[0].Creator).toBeDefined();
      expect(response.body.data[0].Creator.first_name).toBe('Schedules');
      expect(response.body.data[0].Team).toBeDefined();
      expect(response.body.data[0].Team.name).toBe('Schedules Test Team');
    });

    it('should only return active schedules', async () => {
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-16',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const response = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].date).toBe('2024-03-15');
    });
  });

  describe('GET /api/schedules/stats', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedules/stats')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return statistics with zero values when no activities exist', async () => {
      const response = await request(app)
        .get('/api/schedules/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalEvents).toBe(0);
      expect(response.body.data.thisWeek).toBe(0);
      expect(response.body.data.thisMonth).toBe(0);
    });

    it('should count total events across all active schedules', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '10:00 AM',
        activity: 'Drills',
        sort_order: 1
      });

      const response = await request(app)
        .get('/api/schedules/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.totalEvents).toBe(2);
    });

    it('should only count events for user team', async () => {
      // Create schedule for test team
      const schedule1 = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section1 = await ScheduleSection.create({
        schedule_id: schedule1.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section1.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      // Create schedule for other team
      const schedule2 = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const section2 = await ScheduleSection.create({
        schedule_id: schedule2.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section2.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const response = await request(app)
        .get('/api/schedules/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.totalEvents).toBe(1);
    });

    it('should not count events from inactive schedules', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const response = await request(app)
        .get('/api/schedules/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.totalEvents).toBe(0);
    });
  });

  describe('GET /api/schedules/byId/:id', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return schedule with nested sections and activities', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        motto: 'Work hard',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        location: 'Field 1',
        staff: 'Coach Smith',
        group: 'All',
        notes: 'Bring water',
        sort_order: 0
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(schedule.id);
      expect(response.body.data.team_name).toBe('Test Team');
      expect(response.body.data.motto).toBe('Work hard');
      expect(response.body.data.ScheduleSections).toHaveLength(1);
      expect(response.body.data.ScheduleSections[0].title).toBe('Morning Practice');
      expect(response.body.data.ScheduleSections[0].ScheduleActivities).toHaveLength(1);
      expect(response.body.data.ScheduleSections[0].ScheduleActivities[0].activity).toBe('Warmup');
    });

    it('should include Creator and Team information', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Schedules');
      expect(response.body.data.Team).toBeDefined();
      expect(response.body.data.Team.name).toBe('Schedules Test Team');
    });

    it('should return 404 for non-existent schedule', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app)
        .get(`/api/schedules/byId/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should return 404 for inactive schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should order sections by sort_order', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Second Section',
        sort_order: 1
      });

      await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'pitchers',
        title: 'First Section',
        sort_order: 0
      });

      const response = await request(app)
        .get(`/api/schedules/byId/${schedule.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.ScheduleSections[0].title).toBe('First Section');
      expect(response.body.data.ScheduleSections[1].title).toBe('Second Section');
    });
  });

  describe('POST /api/schedules', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create schedule with minimal required fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(201);

      expect(response.body.message).toBe('Schedule created successfully');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.team_name).toBe('Test Team');
      expect(response.body.data.program_name).toBe('Baseball Program');
      expect(response.body.data.date).toBe('2024-03-15');
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.is_active).toBe(true);
    });

    it('should create schedule with all fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          motto: 'Champions are made in practice',
          sections: []
        })
        .expect(201);

      expect(response.body.data.motto).toBe('Champions are made in practice');
    });

    it('should create schedule with nested sections and activities', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          motto: 'Work hard',
          sections: [
            {
              type: 'general',
              title: 'Morning Warmup',
              activities: [
                {
                  time: '9:00 AM',
                  activity: 'Stretching',
                  location: 'Field 1',
                  staff: 'Coach Smith',
                  group: 'All',
                  notes: 'Focus on legs'
                },
                {
                  time: '9:30 AM',
                  activity: 'Running',
                  location: 'Track'
                }
              ]
            },
            {
              type: 'pitchers',
              title: 'Pitcher Practice',
              activities: [
                {
                  time: '10:00 AM',
                  activity: 'Bullpen Session'
                }
              ]
            }
          ]
        })
        .expect(201);

      expect(response.body.data.ScheduleSections).toHaveLength(2);
      expect(response.body.data.ScheduleSections[0].title).toBe('Morning Warmup');
      expect(response.body.data.ScheduleSections[0].sort_order).toBe(0);
      expect(response.body.data.ScheduleSections[0].ScheduleActivities).toHaveLength(2);
      expect(response.body.data.ScheduleSections[0].ScheduleActivities[0].activity).toBe('Stretching');
      expect(response.body.data.ScheduleSections[0].ScheduleActivities[0].sort_order).toBe(0);
      expect(response.body.data.ScheduleSections[1].title).toBe('Pitcher Practice');
      expect(response.body.data.ScheduleSections[1].sort_order).toBe(1);
    });

    it('should validate required team_name field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required program_name field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          date: '2024-03-15',
          sections: []
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required date field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          sections: []
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate date format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: 'invalid-date',
          sections: []
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate sections must be an array', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: 'not-an-array'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(201);

      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should auto-assign created_by from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(201);

      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should include Creator and Team in response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedules')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(201);

      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Schedules');
      expect(response.body.data.Team).toBeDefined();
      expect(response.body.data.Team.name).toBe('Schedules Test Team');
    });
  });

  describe('PUT /api/schedules/byId/:id', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          team_name: 'Updated Team',
          program_name: 'Updated Program',
          date: '2024-03-20',
          sections: []
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update schedule basic fields', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        motto: 'Old motto',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Updated Team',
          program_name: 'Updated Program',
          date: '2024-03-20',
          motto: 'New motto',
          sections: []
        })
        .expect(200);

      expect(response.body.message).toBe('Schedule updated successfully');
      expect(response.body.data.team_name).toBe('Updated Team');
      expect(response.body.data.program_name).toBe('Updated Program');
      expect(response.body.data.date).toBe('2024-03-20');
      expect(response.body.data.motto).toBe('New motto');
    });

    it('should replace all sections and activities', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const oldSection = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Old Section',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: oldSection.id,
        time: '9:00 AM',
        activity: 'Old Activity',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: [
            {
              type: 'pitchers',
              title: 'New Section',
              activities: [
                {
                  time: '10:00 AM',
                  activity: 'New Activity'
                }
              ]
            }
          ]
        })
        .expect(200);

      expect(response.body.data.ScheduleSections).toHaveLength(1);
      expect(response.body.data.ScheduleSections[0].title).toBe('New Section');
      expect(response.body.data.ScheduleSections[0].ScheduleActivities).toHaveLength(1);
      expect(response.body.data.ScheduleSections[0].ScheduleActivities[0].activity).toBe('New Activity');

      // Verify old section and activity are deleted
      const deletedSection = await ScheduleSection.findByPk(oldSection.id);
      expect(deletedSection).toBeNull();
    });

    it('should return 404 for non-existent schedule', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${fakeId}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Test Team',
          program_name: 'Baseball Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Hacked Team',
          program_name: 'Hacked Program',
          date: '2024-03-15',
          sections: []
        })
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');

      // Verify schedule was not modified
      await schedule.reload();
      expect(schedule.team_name).toBe('Other Team');
    });

    it('should validate required fields', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          program_name: 'Updated Program',
          date: '2024-03-20',
          sections: []
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should not allow updating inactive schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          team_name: 'Updated Team',
          program_name: 'Updated Program',
          date: '2024-03-20',
          sections: []
        })
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });
  });

  describe('DELETE /api/schedules/byId/:id', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should soft delete schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Schedule deleted successfully');

      // Verify schedule is soft deleted (is_active = false)
      await schedule.reload();
      expect(schedule.is_active).toBe(false);

      // Verify schedule still exists in database
      const stillExists = await Schedule.findByPk(schedule.id);
      expect(stillExists).not.toBeNull();
    });

    it('should preserve sections and activities on soft delete', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify section and activity still exist
      const sectionStillExists = await ScheduleSection.findByPk(section.id);
      const activityStillExists = await ScheduleActivity.findByPk(activity.id);
      expect(sectionStillExists).not.toBeNull();
      expect(activityStillExists).not.toBeNull();
    });

    it('should return 404 for non-existent schedule', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/byId/${fakeId}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');

      // Verify schedule was not deleted
      await schedule.reload();
      expect(schedule.is_active).toBe(true);
    });

    it('should return 404 when trying to delete already soft-deleted schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/byId/${schedule.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });
  });

  describe('POST /api/schedules/:id/sections', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          type: 'general',
          title: 'New Section'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should add section to schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'general',
          title: 'New Section'
        })
        .expect(201);

      expect(response.body.message).toBe('Section added successfully');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.schedule_id).toBe(schedule.id);
      expect(response.body.data.type).toBe('general');
      expect(response.body.data.title).toBe('New Section');
      expect(response.body.data.sort_order).toBe(0);
    });

    it('should assign correct sort_order for multiple sections', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'First Section',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'pitchers',
          title: 'Second Section'
        })
        .expect(201);

      expect(response.body.data.sort_order).toBe(1);
    });

    it('should validate section type', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'invalid_type',
          title: 'New Section'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required title field', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'general'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent schedule', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${fakeId}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'general',
          title: 'New Section'
        })
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/${schedule.id}/sections`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          type: 'general',
          title: 'Unauthorized Section'
        })
        .expect(404);

      expect(response.body.error).toBe('Schedule not found');
    });

    it('should accept all valid section types', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const validTypes = [
        'general', 'position_players', 'pitchers', 'grinder_performance',
        'grinder_hitting', 'grinder_defensive', 'bullpen', 'live_bp'
      ];

      for (const type of validTypes) {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post(`/api/schedules/${schedule.id}/sections`)
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            type,
            title: `${type} Section`
          })
          .expect(201);

        expect(response.body.data.type).toBe(type);
      }
    });
  });

  describe('POST /api/schedules/sections/:sectionId/activities', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          time: '9:00 AM',
          activity: 'Warmup'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should add activity to section with required fields', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '9:00 AM',
          activity: 'Warmup'
        })
        .expect(201);

      expect(response.body.message).toBe('Activity added successfully');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.section_id).toBe(section.id);
      expect(response.body.data.time).toBe('9:00 AM');
      expect(response.body.data.activity).toBe('Warmup');
      expect(response.body.data.sort_order).toBe(0);
    });

    it('should add activity with all optional fields', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '9:00 AM',
          activity: 'Warmup',
          location: 'Field 1',
          staff: 'Coach Smith',
          group: 'All Players',
          notes: 'Focus on dynamic stretches'
        })
        .expect(201);

      expect(response.body.data.location).toBe('Field 1');
      expect(response.body.data.staff).toBe('Coach Smith');
      expect(response.body.data.group).toBe('All Players');
      expect(response.body.data.notes).toBe('Focus on dynamic stretches');
    });

    it('should assign correct sort_order for multiple activities', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'First Activity',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '10:00 AM',
          activity: 'Second Activity'
        })
        .expect(201);

      expect(response.body.data.sort_order).toBe(1);
    });

    it('should validate required time field', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          activity: 'Warmup'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate required activity field', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '9:00 AM'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent section', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${fakeId}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '9:00 AM',
          activity: 'Warmup'
        })
        .expect(404);

      expect(response.body.error).toBe('Section not found');
    });

    it('should enforce team isolation through section schedule', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post(`/api/schedules/sections/${section.id}/activities`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          time: '9:00 AM',
          activity: 'Unauthorized Activity'
        })
        .expect(404);

      expect(response.body.error).toBe('Section not found');
    });
  });

  describe('DELETE /api/schedules/sections/:sectionId', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/sections/${section.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should hard delete section', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/sections/${section.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Section deleted successfully');

      // Verify section is hard deleted
      const deleted = await ScheduleSection.findByPk(section.id);
      expect(deleted).toBeNull();
    });

    it('should cascade delete all activities in section', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity1 = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const activity2 = await ScheduleActivity.create({
        section_id: section.id,
        time: '10:00 AM',
        activity: 'Drills',
        sort_order: 1
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/schedules/sections/${section.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify activities are cascade deleted
      const deletedActivity1 = await ScheduleActivity.findByPk(activity1.id);
      const deletedActivity2 = await ScheduleActivity.findByPk(activity2.id);
      expect(deletedActivity1).toBeNull();
      expect(deletedActivity2).toBeNull();
    });

    it('should return 404 for non-existent section', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/sections/${fakeId}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Section not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/sections/${section.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Section not found');

      // Verify section was not deleted
      const stillExists = await ScheduleSection.findByPk(section.id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('DELETE /api/schedules/activities/:activityId', () => {
    it('should require authentication', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/activities/${activity.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should hard delete activity', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/activities/${activity.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Activity deleted successfully');

      // Verify activity is hard deleted
      const deleted = await ScheduleActivity.findByPk(activity.id);
      expect(deleted).toBeNull();
    });

    it('should not delete section when activity is deleted', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/schedules/activities/${activity.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify section still exists
      const sectionStillExists = await ScheduleSection.findByPk(section.id);
      expect(sectionStillExists).not.toBeNull();
    });

    it('should return 404 for non-existent activity', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/activities/${fakeId}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Activity not found');
    });

    it('should enforce team isolation', async () => {
      const schedule = await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      const activity = await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        sort_order: 0
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedules/activities/${activity.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Activity not found');

      // Verify activity was not deleted
      const stillExists = await ScheduleActivity.findByPk(activity.id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('GET /api/schedules/export-pdf', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedules/export-pdf')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should export schedules as HTML', async () => {
      const schedule = await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        motto: 'Work hard',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      const section = await ScheduleSection.create({
        schedule_id: schedule.id,
        type: 'general',
        title: 'Morning Practice',
        sort_order: 0
      });

      await ScheduleActivity.create({
        section_id: section.id,
        time: '9:00 AM',
        activity: 'Warmup',
        location: 'Field 1',
        staff: 'Coach Smith',
        notes: 'Bring water',
        sort_order: 0
      });

      const response = await request(app)
        .get('/api/schedules/export-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.headers['content-disposition']).toBe('attachment; filename="team-schedules.html"');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Test Team');
      expect(response.text).toContain('Baseball Program');
      expect(response.text).toContain('Work hard');
      expect(response.text).toContain('Morning Practice');
      expect(response.text).toContain('Warmup');
    });

    it('should export only team schedules', async () => {
      // Create schedule for test team
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      // Create schedule for other team
      await Schedule.create({
        team_name: 'Other Team',
        program_name: 'Other Program',
        date: '2024-03-15',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .get('/api/schedules/export-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.text).toContain('Test Team');
      expect(response.text).not.toContain('Other Team');
    });

    it('should export both active and inactive schedules', async () => {
      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-15',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      await Schedule.create({
        team_name: 'Test Team',
        program_name: 'Baseball Program',
        date: '2024-03-16',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const response = await request(app)
        .get('/api/schedules/export-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Both dates should appear in HTML
      expect(response.text).toContain('2024-03-15');
      expect(response.text).toContain('2024-03-16');
    });

    it('should handle empty schedules', async () => {
      const response = await request(app)
        .get('/api/schedules/export-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Team Schedules');
    });
  });
});
