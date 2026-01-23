const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, ScheduleEvent, ScheduleEventDate, Location, ScheduleTemplate, Permission } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Schedule Events API - Complete CRUD Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let _otherAuthToken;
  let testTemplate;
  let testLocation;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'ScheduleEvents Test Team',
      program_name: 'ScheduleEvents Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other ScheduleEvents Test Team',
      program_name: 'Other ScheduleEvents Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'ScheduleEvents',
      last_name: 'TestUser',
      email: 'scheduleevents-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-scheduleevents-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Grant schedule permissions to test user
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_create'
    });
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_edit'
    });
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_delete'
    });

    // Create test schedule template
    testTemplate = await ScheduleTemplate.create({
      name: 'Test Template',
      description: 'Template for testing events',
      template_data: { sections: [] },
      team_id: testTeam.id,
      created_by: testUser.id
    });

    // Create test location
    testLocation = await Location.create({
      name: 'Test Field',
      location_type: 'field',
      team_id: testTeam.id,
      created_by: testUser.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    _otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await ScheduleEventDate.destroy({ where: {}, force: true });
    await ScheduleEvent.destroy({ where: {}, force: true });
    await Location.destroy({ where: {}, force: true });
    await ScheduleTemplate.destroy({ where: {}, force: true });
    await Permission.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up schedule events and dates before each test
    await ScheduleEventDate.destroy({ where: {}, force: true });
    await ScheduleEvent.destroy({ where: {}, force: true });
  });

  describe('GET /api/schedule-events', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedule-events')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no events exist', async () => {
      const response = await request(app)
        .get('/api/schedule-events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return schedule events for user team only (team isolation)', async () => {
      // Create event for test team
      const event = await ScheduleEvent.create({
        title: 'Team Practice',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create event for other team
      const otherTemplate = await ScheduleTemplate.create({
        name: 'Other Template',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const otherEvent = await ScheduleEvent.create({
        title: 'Other Team Practice',
        event_type: 'practice',
        schedule_template_id: otherTemplate.id,
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: otherEvent.id,
        event_date: '2024-06-01',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/schedule-events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Team Practice');
      expect(response.body.data[0].team_id).toBe(testTeam.id);

      // Cleanup
      await otherTemplate.destroy();
    });

    it('should include all associations (ScheduleTemplate, Location, EventDates, Creator)', async () => {
      const event = await ScheduleEvent.create({
        title: 'Practice with Associations',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        location_id: testLocation.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/schedule-events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);

      const eventData = response.body.data[0];
      expect(eventData.ScheduleTemplate).toBeDefined();
      expect(eventData.ScheduleTemplate.name).toBe('Test Template');
      expect(eventData.Location).toBeDefined();
      expect(eventData.Location.name).toBe('Test Field');
      expect(eventData.EventDates).toBeDefined();
      expect(eventData.EventDates).toHaveLength(1);
      expect(eventData.Creator).toBeDefined();
      expect(eventData.Creator.first_name).toBe('ScheduleEvents');
    });

    it('should filter by schedule_template_id', async () => {
      const template2 = await ScheduleTemplate.create({
        name: 'Test Template 2',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const event1 = await ScheduleEvent.create({
        title: 'Event 1',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event1.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const event2 = await ScheduleEvent.create({
        title: 'Event 2',
        event_type: 'practice',
        schedule_template_id: template2.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event2.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-events?schedule_template_id=${testTemplate.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Event 1');
      expect(response.body.data[0].schedule_template_id).toBe(testTemplate.id);

      // Cleanup
      await template2.destroy();
    });

    it('should filter by event_type', async () => {
      const practiceEvent = await ScheduleEvent.create({
        title: 'Practice Event',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: practiceEvent.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const gameEvent = await ScheduleEvent.create({
        title: 'Game Event',
        event_type: 'game',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: gameEvent.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/schedule-events?event_type=game')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Game Event');
      expect(response.body.data[0].event_type).toBe('game');
    });

    it('should filter by location_id', async () => {
      const location2 = await Location.create({
        name: 'Other Field',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const event1 = await ScheduleEvent.create({
        title: 'Event at Test Field',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        location_id: testLocation.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event1.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const event2 = await ScheduleEvent.create({
        title: 'Event at Other Field',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        location_id: location2.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event2.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-events?location_id=${testLocation.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Event at Test Field');
      expect(response.body.data[0].location_id).toBe(testLocation.id);

      // Cleanup
      await location2.destroy();
    });

    it('should filter by date range (start_date and end_date)', async () => {
      const event = await ScheduleEvent.create({
        title: 'Multi-Date Event',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create dates: June 1, June 15, July 1
      await ScheduleEventDate.bulkCreate([
        {
          schedule_event_id: event.id,
          event_date: '2024-06-01',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          schedule_event_id: event.id,
          event_date: '2024-06-15',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          schedule_event_id: event.id,
          event_date: '2024-07-01',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ]);

      // Filter for June only
      const response = await request(app)
        .get('/api/schedule-events?start_date=2024-06-01&end_date=2024-06-30')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].EventDates).toHaveLength(2); // Only June dates
      expect(response.body.data[0].EventDates[0].event_date).toContain('2024-06');
      expect(response.body.data[0].EventDates[1].event_date).toContain('2024-06');
    });

    it('should support pagination with page and limit parameters', async () => {
      // Create 5 events
      for (let i = 1; i <= 5; i++) {
        const event = await ScheduleEvent.create({
          title: `Event ${i}`,
          event_type: 'practice',
          schedule_template_id: testTemplate.id,
          team_id: testTeam.id,
          created_by: testUser.id
        });

        await ScheduleEventDate.create({
          schedule_event_id: event.id,
          event_date: '2024-06-01',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      }

      // Get page 1 with limit 2
      const response = await request(app)
        .get('/api/schedule-events?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3
      });
    });

    it('should sort events by created_at DESC (newest first)', async () => {
      const event1 = await ScheduleEvent.create({
        title: 'First Event',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event1.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const event2 = await ScheduleEvent.create({
        title: 'Second Event',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event2.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/schedule-events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].title).toBe('Second Event');
      expect(response.body.data[1].title).toBe('First Event');
    });
  });

  describe('GET /api/schedule-events/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedule-events/1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return a single schedule event with all associations', async () => {
      const event = await ScheduleEvent.create({
        title: 'Detailed Event',
        description: 'Event with all details',
        event_type: 'game',
        schedule_template_id: testTemplate.id,
        location_id: testLocation.id,
        start_time: '14:00',
        end_time: '16:00',
        duration_minutes: 120,
        priority: 'high',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-events/${event.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe('Detailed Event');
      expect(response.body.data.description).toBe('Event with all details');
      expect(response.body.data.event_type).toBe('game');
      expect(response.body.data.priority).toBe('high');
      expect(response.body.data.ScheduleTemplate).toBeDefined();
      expect(response.body.data.ScheduleTemplate.name).toBe('Test Template');
      expect(response.body.data.Location).toBeDefined();
      expect(response.body.data.Location.name).toBe('Test Field');
      expect(response.body.data.EventDates).toHaveLength(1);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('ScheduleEvents');
    });

    it('should return 404 for non-existent event', async () => {
      const response = await request(app)
        .get('/api/schedule-events/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');
    });

    it('should return 400 for invalid event ID format', async () => {
      const response = await request(app)
        .get('/api/schedule-events/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid event ID');
    });

    it('should enforce team isolation (cannot access other team events)', async () => {
      const otherTemplate = await ScheduleTemplate.create({
        name: 'Other Template',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const otherEvent = await ScheduleEvent.create({
        title: 'Other Team Event',
        event_type: 'practice',
        schedule_template_id: otherTemplate.id,
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: otherEvent.id,
        event_date: '2024-06-01',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-events/${otherEvent.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');

      // Cleanup
      await otherTemplate.destroy();
    });

    it('should include event dates with override locations', async () => {
      const overrideLocation = await Location.create({
        name: 'Override Field',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const event = await ScheduleEvent.create({
        title: 'Event with Overrides',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        location_id: testLocation.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        location_id_override: overrideLocation.id,
        start_time_override: '15:00',
        end_time_override: '17:00',
        notes: 'Special time and location',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-events/${event.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.EventDates).toHaveLength(1);
      expect(response.body.data.EventDates[0].OverrideLocation).toBeDefined();
      expect(response.body.data.EventDates[0].OverrideLocation.name).toBe('Override Field');
      expect(response.body.data.EventDates[0].notes).toBe('Special time and location');

      // Cleanup
      await overrideLocation.destroy();
    });
  });

  describe('POST /api/schedule-events', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_create permission', async () => {
      // Create user without permissions
      const userWithoutPerms = await User.create({
        first_name: 'No',
        last_name: 'Permissions',
        email: 'no-perms-scheduleevents@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const tokenWithoutPerms = jwt.sign({ id: userWithoutPerms.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${tokenWithoutPerms}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized to perform this action');

      // Cleanup
      await userWithoutPerms.destroy();
    });

    it('should create a schedule event with minimal required fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Minimal Event',
          schedule_template_id: testTemplate.id,
          event_dates: [
            { event_date: '2024-06-01' }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Schedule event created successfully');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe('Minimal Event');
      expect(response.body.data.event_type).toBe('practice'); // default
      expect(response.body.data.priority).toBe('medium'); // default
      expect(response.body.data.EventDates).toHaveLength(1);

      // Verify database
      const dbEvent = await ScheduleEvent.findByPk(response.body.data.id);
      expect(dbEvent).toBeDefined();
      expect(dbEvent.team_id).toBe(testTeam.id);
      expect(dbEvent.created_by).toBe(testUser.id);
    });

    it('should create a schedule event with all optional fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Complete Event',
          description: 'Event with all fields',
          event_type: 'game',
          schedule_template_id: testTemplate.id,
          location_id: testLocation.id,
          start_time: '14:00',
          end_time: '16:00',
          duration_minutes: 120,
          recurring_pattern: { frequency: 'weekly', days: [1, 3, 5] },
          required_equipment: ['bats', 'balls', 'helmets'],
          max_participants: 25,
          target_groups: ['varsity', 'infield'],
          preparation_notes: 'Prepare field early',
          priority: 'high',
          event_dates: [
            {
              event_date: '2024-06-01',
              start_time_override: '15:00',
              end_time_override: '17:00',
              notes: 'Late start for this date'
            }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Complete Event');
      expect(response.body.data.description).toBe('Event with all fields');
      expect(response.body.data.event_type).toBe('game');
      expect(response.body.data.priority).toBe('high');
      expect(response.body.data.duration_minutes).toBe(120);
      expect(response.body.data.recurring_pattern).toEqual({ frequency: 'weekly', days: [1, 3, 5] });
      expect(response.body.data.required_equipment).toEqual(['bats', 'balls', 'helmets']);
      expect(response.body.data.max_participants).toBe(25);
      expect(response.body.data.target_groups).toEqual(['varsity', 'infield']);
      expect(response.body.data.preparation_notes).toBe('Prepare field early');
    });

    it('should create event with multiple event dates', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Multi-Date Event',
          schedule_template_id: testTemplate.id,
          event_dates: [
            { event_date: '2024-06-01' },
            { event_date: '2024-06-08' },
            { event_date: '2024-06-15' }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.EventDates).toHaveLength(3);

      // Verify all dates are created
      const dbDates = await ScheduleEventDate.findAll({
        where: { schedule_event_id: response.body.data.id }
      });
      expect(dbDates).toHaveLength(3);
    });

    it('should validate title is required', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate title length (1-200 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'a'.repeat(201),
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate description length (max 1000 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          description: 'a'.repeat(1001),
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate event_type enum (practice, game, scrimmage, tournament, meeting, training, conditioning, team_building, other)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          event_type: 'invalid_type',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should allow all valid event_type values', async () => {
      const validTypes = ['practice', 'game', 'scrimmage', 'tournament', 'meeting', 'training', 'conditioning', 'team_building', 'other'];

      for (const type of validTypes) {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/schedule-events')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `${type} Event`,
            event_type: type,
            schedule_template_id: testTemplate.id,
            event_dates: [{ event_date: '2024-06-01' }]
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.event_type).toBe(type);
      }
    });

    it('should validate priority enum (low, medium, high, critical)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          priority: 'invalid_priority',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should allow all valid priority values', async () => {
      const validPriorities = ['low', 'medium', 'high', 'critical'];

      for (const priority of validPriorities) {
        const { token, cookies } = await getCsrfToken(app);
        const response = await request(app)
          .post('/api/schedule-events')
          .set('Cookie', cookies)
          .set('x-csrf-token', token)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `${priority} Priority Event`,
            priority,
            schedule_template_id: testTemplate.id,
            event_dates: [{ event_date: '2024-06-01' }]
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.priority).toBe(priority);
      }
    });

    it('should validate schedule_template_id is required', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate schedule_template_id is a positive integer', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: -1,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate event_dates array is required', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate event_dates array has at least one date', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          event_dates: []
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate event_date is a valid ISO8601 date', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: 'invalid-date' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate start_time format (HH:MM)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          start_time: '25:00', // invalid hour
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate end_time format (HH:MM)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          end_time: '14:99', // invalid minutes
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate duration_minutes range (1-1440)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          duration_minutes: 2000, // exceeds max
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate max_participants is a positive integer', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          max_participants: -5,
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate required_equipment is an array', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          required_equipment: 'not an array',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate target_groups is an array', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          target_groups: 'not an array',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate recurring_pattern is an object', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          recurring_pattern: 'not an object',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate preparation_notes length (max 1000 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          preparation_notes: 'a'.repeat(1001),
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 404 if schedule template does not exist', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: 99999,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule template not found or does not belong to your team');
    });

    it('should return 404 if schedule template belongs to other team', async () => {
      const otherTemplate = await ScheduleTemplate.create({
        name: 'Other Template',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: otherTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule template not found or does not belong to your team');

      // Cleanup
      await otherTemplate.destroy();
    });

    it('should return 404 if location does not exist', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          location_id: 99999,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found or does not belong to your team');
    });

    it('should return 404 if location belongs to other team', async () => {
      const otherLocation = await Location.create({
        name: 'Other Team Field',
        location_type: 'field',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          schedule_template_id: testTemplate.id,
          location_id: otherLocation.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found or does not belong to your team');

      // Cleanup
      await otherLocation.destroy();
    });

    it('should auto-assign team_id and created_by from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/schedule-events')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Auto-assigned Event',
          schedule_template_id: testTemplate.id,
          event_dates: [{ event_date: '2024-06-01' }]
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      const dbEvent = await ScheduleEvent.findByPk(response.body.data.id);
      expect(dbEvent.team_id).toBe(testTeam.id);
      expect(dbEvent.created_by).toBe(testUser.id);

      const dbDate = await ScheduleEventDate.findOne({
        where: { schedule_event_id: dbEvent.id }
      });
      expect(dbDate.team_id).toBe(testTeam.id);
      expect(dbDate.created_by).toBe(testUser.id);
    });
  });

  describe('PUT /api/schedule-events/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/schedule-events/1')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({ title: 'Updated Event' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_edit permission', async () => {
      const event = await ScheduleEvent.create({
        title: 'Test Event',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const userWithoutPerms = await User.create({
        first_name: 'No',
        last_name: 'Edit',
        email: 'no-edit-scheduleevents@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const tokenWithoutPerms = jwt.sign({ id: userWithoutPerms.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${tokenWithoutPerms}`)
        .send({ title: 'Updated Event' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized to perform this action');

      // Cleanup
      await userWithoutPerms.destroy();
    });

    it('should update event fields (partial update)', async () => {
      const event = await ScheduleEvent.create({
        title: 'Original Title',
        description: 'Original Description',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Schedule event updated successfully');
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.description).toBe('Original Description'); // unchanged
      expect(response.body.data.event_type).toBe('practice'); // unchanged
    });

    it('should update all event fields', async () => {
      const event = await ScheduleEvent.create({
        title: 'Original Event',
        event_type: 'practice',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Completely Updated Event',
          description: 'New description',
          event_type: 'game',
          location_id: testLocation.id,
          start_time: '15:00',
          end_time: '17:00',
          duration_minutes: 120,
          priority: 'critical',
          required_equipment: ['new', 'equipment'],
          max_participants: 30,
          target_groups: ['updated', 'groups'],
          preparation_notes: 'New notes'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Completely Updated Event');
      expect(response.body.data.description).toBe('New description');
      expect(response.body.data.event_type).toBe('game');
      expect(response.body.data.priority).toBe('critical');
      expect(response.body.data.duration_minutes).toBe(120);
    });

    it('should replace event_dates when provided (full replacement)', async () => {
      const event = await ScheduleEvent.create({
        title: 'Event with Dates',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create initial dates
      await ScheduleEventDate.bulkCreate([
        {
          schedule_event_id: event.id,
          event_date: '2024-06-01',
          team_id: testTeam.id,
          created_by: testUser.id
        },
        {
          schedule_event_id: event.id,
          event_date: '2024-06-02',
          team_id: testTeam.id,
          created_by: testUser.id
        }
      ]);

      // Update with new dates
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          event_dates: [
            { event_date: '2024-06-15' },
            { event_date: '2024-06-16' },
            { event_date: '2024-06-17' }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.EventDates).toHaveLength(3);

      // Verify old dates are deleted
      const oldDates = await ScheduleEventDate.findAll({
        where: {
          schedule_event_id: event.id,
          event_date: ['2024-06-01', '2024-06-02']
        }
      });
      expect(oldDates).toHaveLength(0);
    });

    it('should preserve existing event_dates when not provided in update', async () => {
      const event = await ScheduleEvent.create({
        title: 'Event with Dates',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Title'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.EventDates).toHaveLength(1); // preserved
      expect(response.body.data.EventDates[0].event_date).toContain('2024-06-01');
    });

    it('should return 404 for non-existent event', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/schedule-events/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Event' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');
    });

    it('should enforce team isolation (cannot update other team events)', async () => {
      const otherTemplate = await ScheduleTemplate.create({
        name: 'Other Template',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const otherEvent = await ScheduleEvent.create({
        title: 'Other Team Event',
        schedule_template_id: otherTemplate.id,
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: otherEvent.id,
        event_date: '2024-06-01',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/schedule-events/${otherEvent.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Hacked Event' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');

      // Cleanup
      await otherTemplate.destroy();
    });
  });

  describe('DELETE /api/schedule-events/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/schedule-events/1')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_delete permission', async () => {
      const event = await ScheduleEvent.create({
        title: 'Test Event',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const userWithoutPerms = await User.create({
        first_name: 'No',
        last_name: 'Delete',
        email: 'no-delete-scheduleevents@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const tokenWithoutPerms = jwt.sign({ id: userWithoutPerms.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${tokenWithoutPerms}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized to perform this action');

      // Cleanup
      await userWithoutPerms.destroy();
    });

    it('should delete schedule event successfully', async () => {
      const event = await ScheduleEvent.create({
        title: 'Event to Delete',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Schedule event deleted successfully');

      // Verify hard delete
      const dbEvent = await ScheduleEvent.findByPk(event.id);
      expect(dbEvent).toBeNull();
    });

    it('should cascade delete all associated event dates', async () => {
      const event = await ScheduleEvent.create({
        title: 'Event with Multiple Dates',
        schedule_template_id: testTemplate.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const date1 = await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-01',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const date2 = await ScheduleEventDate.create({
        schedule_event_id: event.id,
        event_date: '2024-06-02',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedule-events/${event.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify event dates are deleted
      const dbDate1 = await ScheduleEventDate.findByPk(date1.id);
      const dbDate2 = await ScheduleEventDate.findByPk(date2.id);
      expect(dbDate1).toBeNull();
      expect(dbDate2).toBeNull();
    });

    it('should return 404 for non-existent event', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/schedule-events/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');
    });

    it('should return 400 for invalid event ID format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/schedule-events/invalid')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should enforce team isolation (cannot delete other team events)', async () => {
      const otherTemplate = await ScheduleTemplate.create({
        name: 'Other Template',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const otherEvent = await ScheduleEvent.create({
        title: 'Other Team Event',
        schedule_template_id: otherTemplate.id,
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      await ScheduleEventDate.create({
        schedule_event_id: otherEvent.id,
        event_date: '2024-06-01',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/schedule-events/${otherEvent.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');

      // Verify event still exists
      const dbEvent = await ScheduleEvent.findByPk(otherEvent.id);
      expect(dbEvent).not.toBeNull();

      // Cleanup
      await otherTemplate.destroy();
    });
  });
});
