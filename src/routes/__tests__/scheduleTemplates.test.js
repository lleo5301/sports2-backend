const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, ScheduleTemplate } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Schedule Templates API', () => {
  let authToken;
  let testUser;
  let testTeam;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();
    
    // Create test team
    testTeam = await Team.create({
      name: 'Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      password: 'password123',
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await ScheduleTemplate.destroy({ where: { team_id: testTeam.id } });
    await testUser.destroy();
    await testTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up templates before each test
    await ScheduleTemplate.destroy({ where: { team_id: testTeam.id } });
  });

  describe('GET /api/schedule-templates', () => {
    it('should return empty array when no templates exist', async () => {
      const response = await request(app)
        .get('/api/schedule-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return user team templates only', async () => {
      // Create templates for test team
      const template1 = await ScheduleTemplate.create({
        name: 'Test Template 1',
        description: 'First test template',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create another team and template (should not appear in results)
      const otherTeam = await Team.create({
        name: 'Other Team',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      await ScheduleTemplate.create({
        name: 'Other Team Template',
        description: 'Should not appear',
        template_data: { sections: [] },
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/schedule-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Template 1');
      expect(response.body.data[0].team_id).toBe(testTeam.id);

      // Cleanup
      await otherTeam.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/schedule-templates')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should filter by search parameter', async () => {
      await ScheduleTemplate.create({
        name: 'Baseball Practice Template',
        description: 'For baseball practices',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await ScheduleTemplate.create({
        name: 'Game Day Template',
        description: 'For game days',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/schedule-templates?search=baseball')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Baseball Practice Template');
    });
  });

  describe('POST /api/schedule-templates', () => {
    it('should create a new template', async () => {
      const templateData = {
        name: 'New Template',
        description: 'Test description',
        template_data: {
          sections: [
            {
              id: 'general',
              type: 'general',
              title: 'General Schedule',
              activities: []
            }
          ]
        }
      };

      const response = await request(app)
        .post('/api/schedule-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send(templateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Template');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should require name field', async () => {
      const templateData = {
        description: 'Test description',
        template_data: { sections: [] }
      };

      const response = await request(app)
        .post('/api/schedule-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send(templateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle default template setting', async () => {
      // Create first template as default
      await ScheduleTemplate.create({
        name: 'First Default',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: true
      });

      // Create second template as default (should unset first)
      const templateData = {
        name: 'New Default',
        template_data: { sections: [] },
        is_default: true
      };

      const response = await request(app)
        .post('/api/schedule-templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send(templateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_default).toBe(true);

      // Check that first template is no longer default
      const firstTemplate = await ScheduleTemplate.findOne({
        where: { name: 'First Default', team_id: testTeam.id }
      });
      expect(firstTemplate.is_default).toBe(false);
    });
  });

  describe('GET /api/schedule-templates/:id', () => {
    it('should return specific template', async () => {
      const template = await ScheduleTemplate.create({
        name: 'Specific Template',
        description: 'Specific description',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/schedule-templates/${template.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(template.id);
      expect(response.body.data.name).toBe('Specific Template');
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get('/api/schedule-templates/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Schedule template not found');
    });
  });

  describe('PUT /api/schedule-templates/:id', () => {
    it('should update template', async () => {
      const template = await ScheduleTemplate.create({
        name: 'Original Name',
        description: 'Original description',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        name: 'Updated Name',
        description: 'Updated description'
      };

      const response = await request(app)
        .put(`/api/schedule-templates/${template.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
    });
  });

  describe('DELETE /api/schedule-templates/:id', () => {
    it('should soft delete template', async () => {
      const template = await ScheduleTemplate.create({
        name: 'To Delete',
        template_data: { sections: [] },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/schedule-templates/${template.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Schedule template deleted successfully');

      // Verify soft delete
      const deletedTemplate = await ScheduleTemplate.findByPk(template.id);
      expect(deletedTemplate.is_active).toBe(false);
    });
  });

  describe('POST /api/schedule-templates/:id/duplicate', () => {
    it('should duplicate template', async () => {
      const originalTemplate = await ScheduleTemplate.create({
        name: 'Original Template',
        description: 'Original description',
        template_data: {
          sections: [
            {
              id: 'test',
              type: 'general',
              title: 'Test Section',
              activities: []
            }
          ]
        },
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const duplicateData = {
        name: 'Duplicated Template',
        description: 'Duplicated description'
      };

      const response = await request(app)
        .post(`/api/schedule-templates/${originalTemplate.id}/duplicate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(duplicateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Duplicated Template');
      expect(response.body.data.description).toBe('Duplicated description');
      expect(response.body.data.template_data).toEqual(originalTemplate.template_data);
      expect(response.body.data.is_default).toBe(false);
    });
  });
});
