const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Report, UserPermission } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Reports API - Custom Reports CRUD', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;
  let userWithoutPermissions;
  let userWithoutPermissionsToken;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Reports Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Reports Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Reports',
      last_name: 'TestUser',
      email: 'reports-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-reports-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    userWithoutPermissions = await User.create({
      first_name: 'NoPerm',
      last_name: 'User',
      email: 'noperm-reports-test@example.com',
      password: 'TestP@ss1',
      role: 'assistant_coach',
      team_id: testTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
    userWithoutPermissionsToken = jwt.sign({ id: userWithoutPermissions.id }, process.env.JWT_SECRET || 'test_secret');

    // Grant necessary permissions to test user
    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'reports_view',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'reports_create',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'reports_edit',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'reports_delete',
      is_granted: true
    });

    // Grant permissions to other user
    await UserPermission.create({
      user_id: otherUser.id,
      team_id: otherTeam.id,
      permission_type: 'reports_view',
      is_granted: true
    });

    await UserPermission.create({
      user_id: otherUser.id,
      team_id: otherTeam.id,
      permission_type: 'reports_create',
      is_granted: true
    });
  });

  afterAll(async () => {
    // Clean up test data
    await Report.destroy({ where: {}, force: true });
    await UserPermission.destroy({ where: { user_id: [testUser.id, otherUser.id, userWithoutPermissions.id] } });
    await userWithoutPermissions.destroy();
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up reports before each test
    await Report.destroy({ where: {}, force: true });
  });

  describe('GET /api/reports', () => {
    it('should return empty array when no reports exist', async () => {
      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of reports for authenticated user team', async () => {
      // Create test reports
      await Report.create({
        title: 'Test Report 1',
        description: 'First test report',
        type: 'player-performance',
        status: 'draft',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Report.create({
        title: 'Test Report 2',
        description: 'Second test report',
        type: 'team-statistics',
        status: 'published',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].title).toBe('Test Report 2'); // Newest first
      expect(response.body.data[1].title).toBe('Test Report 1');
    });

    it('should return reports sorted by creation date (newest first)', async () => {
      // Create reports with slight delays to ensure different timestamps
      const report1 = await Report.create({
        title: 'Report A',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const report2 = await Report.create({
        title: 'Report B',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].id).toBe(report2.id); // Newest first
      expect(response.body.data[1].id).toBe(report1.id);
    });

    it('should include creator information in response', async () => {
      await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].created_by_user).toBeDefined();
      expect(response.body.data[0].created_by_user.id).toBe(testUser.id);
      expect(response.body.data[0].created_by_user.first_name).toBe('Reports');
      expect(response.body.data[0].created_by_user.last_name).toBe('TestUser');
      expect(response.body.data[0].created_by_user.email).toBe('reports-test@example.com');
    });

    it('should only return reports for user team (team isolation)', async () => {
      // Create reports for both teams
      await Report.create({
        title: 'Test Team Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Report.create({
        title: 'Other Team Report',
        type: 'custom',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Test Team Report');
      expect(response.body.data[0].team_id).toBe(testTeam.id);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/byId/:id', () => {
    it('should return report by ID with reports_view permission', async () => {
      const report = await Report.create({
        title: 'Test Report',
        description: 'Test description',
        type: 'player-performance',
        status: 'published',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(report.id);
      expect(response.body.data.title).toBe('Test Report');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.type).toBe('player-performance');
      expect(response.body.data.status).toBe('published');
    });

    it('should include creator information', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by_user).toBeDefined();
      expect(response.body.data.created_by_user.id).toBe(testUser.id);
      expect(response.body.data.created_by_user.first_name).toBe('Reports');
      expect(response.body.data.created_by_user.last_name).toBe('TestUser');
    });

    it('should return 404 for non-existent report', async () => {
      const response = await request(app)
        .get('/api/reports/byId/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should not allow access to other team report (team isolation)', async () => {
      const otherTeamReport = await Report.create({
        title: 'Other Team Report',
        type: 'custom',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/reports/byId/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should require authentication', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/byId/${report.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require reports_view permission', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${userWithoutPermissionsToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });
  });

  describe('POST /api/reports', () => {
    it('should create a new report with reports_create permission', async () => {
      const reportData = {
        title: 'New Report',
        description: 'Test description',
        type: 'player-performance',
        status: 'draft',
        data_sources: ['source1', 'source2'],
        sections: [{ name: 'Section 1', type: 'table' }],
        filters: { position: 'pitcher' }
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Report created successfully');
      expect(response.body.data.title).toBe('New Report');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.type).toBe('player-performance');
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.data_sources).toEqual(['source1', 'source2']);
      expect(response.body.data.sections).toEqual([{ name: 'Section 1', type: 'table' }]);
      expect(response.body.data.filters).toEqual({ position: 'pitcher' });

      // Verify in database
      const dbReport = await Report.findByPk(response.body.data.id);
      expect(dbReport).toBeDefined();
      expect(dbReport.title).toBe('New Report');
    });

    it('should create report with minimal required fields', async () => {
      const reportData = {
        title: 'Minimal Report',
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Minimal Report');
      expect(response.body.data.type).toBe('custom');
      expect(response.body.data.status).toBe('draft'); // Default status
      expect(response.body.data.team_id).toBe(testTeam.id); // Auto-assigned
      expect(response.body.data.created_by).toBe(testUser.id); // Auto-assigned
    });

    it('should default status to draft if not provided', async () => {
      const reportData = {
        title: 'Report without status',
        type: 'team-statistics'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('draft');
    });

    it('should validate required title field', async () => {
      const reportData = {
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate required type field', async () => {
      const reportData = {
        title: 'Test Report'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate title length (max 200 characters)', async () => {
      const reportData = {
        title: 'a'.repeat(201),
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate description length (max 1000 characters)', async () => {
      const reportData = {
        title: 'Test Report',
        description: 'a'.repeat(1001),
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate report type enum', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'invalid-type'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should accept all valid report types', async () => {
      const validTypes = [
        'player-performance',
        'team-statistics',
        'scouting-analysis',
        'recruitment-pipeline',
        'custom'
      ];

      for (const type of validTypes) {
        const reportData = {
          title: `Test ${type}`,
          type: type
        };

        const response = await request(app)
          .post('/api/reports')
          .set('Authorization', `Bearer ${authToken}`)
          .send(reportData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.type).toBe(type);
      }
    });

    it('should validate data_sources is array', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom',
        data_sources: 'not-an-array'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate sections is array', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom',
        sections: 'not-an-array'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate filters is object', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom',
        filters: 'not-an-object'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate schedule is object', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom',
        schedule: 'not-an-object'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .send(reportData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require reports_create permission', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${userWithoutPermissionsToken}`)
        .send(reportData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });

    it('should automatically assign team_id from authenticated user', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should automatically assign created_by from authenticated user', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by).toBe(testUser.id);
    });
  });

  describe('PUT /api/reports/byId/:id', () => {
    it('should update report with reports_edit permission', async () => {
      const report = await Report.create({
        title: 'Original Title',
        description: 'Original description',
        type: 'custom',
        status: 'draft',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        title: 'Updated Title',
        description: 'Updated description',
        status: 'published'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Report updated successfully');
      expect(response.body.data.title).toBe('Updated Title');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.status).toBe('published');

      // Verify in database
      const dbReport = await Report.findByPk(report.id);
      expect(dbReport.title).toBe('Updated Title');
      expect(dbReport.description).toBe('Updated description');
      expect(dbReport.status).toBe('published');
    });

    it('should support partial updates', async () => {
      const report = await Report.create({
        title: 'Original Title',
        description: 'Original description',
        type: 'custom',
        status: 'draft',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        title: 'Only Title Updated'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Only Title Updated');
      expect(response.body.data.description).toBe('Original description'); // Unchanged
      expect(response.body.data.status).toBe('draft'); // Unchanged
    });

    it('should update status field', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        status: 'draft',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        status: 'published'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('published');
    });

    it('should update data_sources field', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        data_sources: ['new-source-1', 'new-source-2']
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data_sources).toEqual(['new-source-1', 'new-source-2']);
    });

    it('should update sections field', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        sections: [{ name: 'New Section', type: 'chart' }]
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sections).toEqual([{ name: 'New Section', type: 'chart' }]);
    });

    it('should update filters field', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        filters: { position: 'catcher', year: 2024 }
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters).toEqual({ position: 'catcher', year: 2024 });
    });

    it('should validate title length on update', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        title: 'a'.repeat(201)
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate description length on update', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        description: 'a'.repeat(1001)
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate status enum on update', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        status: 'draft',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        status: 'invalid-status'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 404 for non-existent report', async () => {
      const updateData = {
        title: 'Updated Title'
      };

      const response = await request(app)
        .put('/api/reports/byId/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should not allow updating other team report (team isolation)', async () => {
      const otherTeamReport = await Report.create({
        title: 'Other Team Report',
        type: 'custom',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const updateData = {
        title: 'Malicious Update'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');

      // Verify report was not updated
      const dbReport = await Report.findByPk(otherTeamReport.id);
      expect(dbReport.title).toBe('Other Team Report');
    });

    it('should require authentication', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        title: 'Updated Title'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .send(updateData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require reports_edit permission', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        title: 'Updated Title'
      };

      const response = await request(app)
        .put(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${userWithoutPermissionsToken}`)
        .send(updateData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });
  });

  describe('DELETE /api/reports/byId/:id', () => {
    it('should delete report with reports_delete permission', async () => {
      const report = await Report.create({
        title: 'Report to Delete',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Report deleted successfully');

      // Verify report is deleted from database
      const dbReport = await Report.findByPk(report.id);
      expect(dbReport).toBeNull();
    });

    it('should return 404 for non-existent report', async () => {
      const response = await request(app)
        .delete('/api/reports/byId/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should not allow deleting other team report (team isolation)', async () => {
      const otherTeamReport = await Report.create({
        title: 'Other Team Report',
        type: 'custom',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .delete(`/api/reports/byId/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');

      // Verify report still exists
      const dbReport = await Report.findByPk(otherTeamReport.id);
      expect(dbReport).toBeDefined();
      expect(dbReport.title).toBe('Other Team Report');
    });

    it('should require authentication', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/reports/byId/${report.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);

      // Verify report still exists
      const dbReport = await Report.findByPk(report.id);
      expect(dbReport).toBeDefined();
    });

    it('should require reports_delete permission', async () => {
      const report = await Report.create({
        title: 'Test Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/reports/byId/${report.id}`)
        .set('Authorization', `Bearer ${userWithoutPermissionsToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');

      // Verify report still exists
      const dbReport = await Report.findByPk(report.id);
      expect(dbReport).toBeDefined();
    });
  });
});
