const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, ScheduleEvent, ScheduleEventDate, Location, ScheduleTemplate, UserPermission } = require('../../models');
const jwt = require('jsonwebtoken');

// Helper functions for creating test data
const createScheduleEvent = (attrs = {}) => {
  return ScheduleEvent.create({
    title: 'Test Event',
    event_type: 'practice',
    schedule_template_id: global.testTemplate.id,
    team_id: global.testTeam.id,
    created_by: global.testUser.id,
    ...attrs
  });
};

const createScheduleEventDate = (scheduleEventId, attrs = {}) => {
  return ScheduleEventDate.create({
    schedule_event_id: scheduleEventId,
    event_date: '2024-06-01',
    team_id: global.testTeam.id,
    created_by: global.testUser.id,
    ...attrs
  });
};

const createOtherTeamEvent = (attrs = {}) => {
  return ScheduleEvent.create({
    title: 'Other Team Event',
    event_type: 'practice',
    schedule_template_id: global.otherTemplate.id,
    team_id: global.otherTeam.id,
    created_by: global.otherUser.id,
    ...attrs
  });
};

// Global test setup - runs once before all test suites
beforeAll(async () => {
  await sequelize.authenticate();

  // Create global test teams
  global.testTeam = await Team.create({
    name: 'ScheduleEvents Test Team',
    program_name: 'ScheduleEvents Test Team Program'
  });

  global.otherTeam = await Team.create({
    name: 'Other ScheduleEvents Test Team',
    program_name: 'Other ScheduleEvents Test Team Program'
  });

  // Create global test users with unique emails
  const timestamp = Date.now();
  global.testUser = await User.create({
    first_name: 'ScheduleEvents',
    last_name: 'TestUser',
    email: `scheduleevents-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.testTeam.id
  });

  global.otherUser = await User.create({
    first_name: 'Other',
    last_name: 'User',
    email: `other-scheduleevents-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.otherTeam.id
  });

  // Grant permissions to test user
  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'schedule_create',
    is_granted: true
  });

  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'schedule_edit',
    is_granted: true
  });

  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'schedule_delete',
    is_granted: true
  });

  // Create test schedule templates
  global.testTemplate = await ScheduleTemplate.create({
    name: 'Test Template',
    description: 'Template for testing events',
    template_data: { sections: [] },
    team_id: global.testTeam.id,
    created_by: global.testUser.id
  });

  global.otherTemplate = await ScheduleTemplate.create({
    name: 'Other Template',
    description: 'Template for other team',
    template_data: { sections: [] },
    team_id: global.otherTeam.id,
    created_by: global.otherUser.id
  });

  // Create test locations
  global.testLocation = await Location.create({
    name: 'Test Field',
    location_type: 'field',
    team_id: global.testTeam.id,
    created_by: global.testUser.id
  });

  global.otherLocation = await Location.create({
    name: 'Other Field',
    location_type: 'field',
    team_id: global.otherTeam.id,
    created_by: global.otherUser.id
  });

  // Generate auth tokens
  global.authToken = jwt.sign({ id: global.testUser.id }, process.env.JWT_SECRET || 'test_secret');
  global.otherAuthToken = jwt.sign({ id: global.otherUser.id }, process.env.JWT_SECRET || 'test_secret');
});

// Global test cleanup - runs once after all test suites
afterAll(async () => {
  await ScheduleEventDate.destroy({ where: {}, force: true });
  await ScheduleEvent.destroy({ where: {}, force: true });
  await Location.destroy({ where: {}, force: true });
  await ScheduleTemplate.destroy({ where: {}, force: true });
  await UserPermission.destroy({ where: {}, force: true });
  await global.testUser.destroy();
  await global.otherUser.destroy();
  await global.testTeam.destroy();
  await global.otherTeam.destroy();
  await sequelize.close();
});

// Clean up between tests
afterEach(async () => {
  await ScheduleEventDate.destroy({ where: {}, force: true });
  await ScheduleEvent.destroy({ where: {}, force: true });
  // Clean up any extra templates or locations created in tests
  await ScheduleTemplate.destroy({
    where: { id: { [require('sequelize').Op.not]: [global.testTemplate.id, global.otherTemplate.id] } },
    force: true
  });
  await Location.destroy({
    where: { id: { [require('sequelize').Op.not]: [global.testLocation.id, global.otherLocation.id] } },
    force: true
  });
});

describe('Schedule Events API - GET Endpoints', () => {
  describe('GET /api/schedule-events', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/schedule-events')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no events exist', async () => {
      const response = await request(app)
        .get('/api/v1/schedule-events')
        .set('Authorization', `Bearer ${global.authToken}`);

      if (response.status !== 200) {
        console.error('Error response:', response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return schedule events for authenticated user team', async () => {
      const event = await createScheduleEvent({ title: 'Team Practice' });
      await createScheduleEventDate(event.id);

      const response = await request(app)
        .get('/api/v1/schedule-events')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Team Practice');
    });

    it('should only return events for user team (team isolation)', async () => {
      // Create event for test team
      const event = await createScheduleEvent({ title: 'Test Team Event' });
      await createScheduleEventDate(event.id);

      // Create event for other team
      const otherEvent = await createOtherTeamEvent({ title: 'Other Team Event' });
      await createScheduleEventDate(otherEvent.id, {
        team_id: global.otherTeam.id,
        created_by: global.otherUser.id
      });

      const response = await request(app)
        .get('/api/v1/schedule-events')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Test Team Event');
      expect(response.body.data[0].team_id).toBe(global.testTeam.id);
    });

    it('should include all associations (ScheduleTemplate, Location, EventDates, Creator)', async () => {
      const event = await createScheduleEvent({
        title: 'Practice with Associations',
        location_id: global.testLocation.id
      });
      await createScheduleEventDate(event.id);

      const response = await request(app)
        .get('/api/v1/schedule-events')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);

      const eventData = response.body.data[0];
      expect(eventData.ScheduleTemplate).toBeDefined();
      expect(eventData.ScheduleTemplate.name).toBe('Test Template');
      expect(eventData.Location).toBeDefined();
      expect(eventData.Location.name).toBe('Test Field');
      expect(eventData.EventDates).toBeDefined();
      expect(eventData.EventDates.length).toBeGreaterThan(0);
      expect(eventData.Creator).toBeDefined();
      expect(eventData.Creator.first_name).toBe('ScheduleEvents');
    });

    it('should filter by schedule_template_id', async () => {
      // Create another template
      const template2 = await ScheduleTemplate.create({
        name: 'Test Template 2',
        template_data: { sections: [] },
        team_id: global.testTeam.id,
        created_by: global.testUser.id
      });

      const event1 = await createScheduleEvent({
        title: 'Event 1',
        schedule_template_id: global.testTemplate.id
      });
      await createScheduleEventDate(event1.id);

      const event2 = await createScheduleEvent({
        title: 'Event 2',
        schedule_template_id: template2.id
      });
      await createScheduleEventDate(event2.id);

      const response = await request(app)
        .get(`/api/v1/schedule-events?schedule_template_id=${global.testTemplate.id}`)
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Event 1');
    });

    it('should filter by event_type', async () => {
      const practiceEvent = await createScheduleEvent({
        title: 'Practice Event',
        event_type: 'practice'
      });
      await createScheduleEventDate(practiceEvent.id);

      const gameEvent = await createScheduleEvent({
        title: 'Game Event',
        event_type: 'game'
      });
      await createScheduleEventDate(gameEvent.id);

      const response = await request(app)
        .get('/api/v1/schedule-events?event_type=game')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Game Event');
      expect(response.body.data[0].event_type).toBe('game');
    });

    it('should support pagination', async () => {
      // Create 5 events
      for (let i = 1; i <= 5; i++) {
        const event = await createScheduleEvent({ title: `Event ${i}` });
        await createScheduleEventDate(event.id);
      }

      const response = await request(app)
        .get('/api/v1/schedule-events?page=1&limit=2')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3
      });
    });
  });

  describe('GET /api/schedule-events/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/schedule-events/1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return a single schedule event with all associations', async () => {
      const event = await createScheduleEvent({
        title: 'Detailed Event',
        description: 'Event with all details',
        event_type: 'game',
        location_id: global.testLocation.id,
        start_time: '14:00',
        end_time: '16:00',
        priority: 'high'
      });
      await createScheduleEventDate(event.id);

      const response = await request(app)
        .get(`/api/v1/schedule-events/${event.id}`)
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.title).toBe('Detailed Event');
      expect(response.body.data.description).toBe('Event with all details');
      expect(response.body.data.event_type).toBe('game');
      expect(response.body.data.priority).toBe('high');
      expect(response.body.data.ScheduleTemplate).toBeDefined();
      expect(response.body.data.Location).toBeDefined();
      expect(response.body.data.EventDates.length).toBeGreaterThan(0);
      expect(response.body.data.Creator).toBeDefined();
    });

    it('should return 404 for non-existent event', async () => {
      const response = await request(app)
        .get('/api/v1/schedule-events/99999')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');
    });

    it('should return 400 for invalid event ID format', async () => {
      const response = await request(app)
        .get('/api/v1/schedule-events/invalid')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid event ID');
    });

    it('should enforce team isolation (cannot access other team events)', async () => {
      const otherEvent = await createOtherTeamEvent({ title: 'Other Team Event' });
      await createScheduleEventDate(otherEvent.id, {
        team_id: global.otherTeam.id,
        created_by: global.otherUser.id
      });

      const response = await request(app)
        .get(`/api/v1/schedule-events/${otherEvent.id}`)
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule event not found');
    });
  });
});
