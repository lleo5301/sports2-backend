const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Report, UserPermission, ScoutingReport, Player } = require('../../models');
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

describe('Reports API - Scouting Reports', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;
  let testPlayer;
  let testPlayer2;
  let otherTeamPlayer;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Scouting Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Scouting Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Scouting',
      last_name: 'TestUser',
      email: 'scouting-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'OtherScouting',
      last_name: 'User',
      email: 'other-scouting-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');

    // Create test players
    testPlayer = await Player.create({
      first_name: 'John',
      last_name: 'Doe',
      position: 'P',
      school: 'Test High School',
      team_id: testTeam.id
    });

    testPlayer2 = await Player.create({
      first_name: 'Jane',
      last_name: 'Smith',
      position: 'C',
      school: 'Test High School',
      team_id: testTeam.id
    });

    otherTeamPlayer = await Player.create({
      first_name: 'Other',
      last_name: 'Player',
      position: 'SS',
      school: 'Other High School',
      team_id: otherTeam.id
    });
  });

  afterAll(async () => {
    // Clean up test data
    await ScoutingReport.destroy({ where: {}, force: true });
    await Player.destroy({ where: { id: [testPlayer.id, testPlayer2.id, otherTeamPlayer.id] } });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up scouting reports before each test
    await ScoutingReport.destroy({ where: {}, force: true });
  });

  describe('GET /api/reports/scouting', () => {
    it('should return empty array when no scouting reports exist', async () => {
      const response = await request(app)
        .get('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return list of scouting reports for authenticated user team', async () => {
      // Create test scouting reports
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A',
        hitting_grade: 'A-',
        pitching_grade: 'B+',
        fielding_grade: 'A',
        speed_grade: 'B'
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B+',
        hitting_grade: 'A',
        fielding_grade: 'B'
      });

      const response = await request(app)
        .get('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
      expect(response.body.data[0].Player).toBeDefined();
      expect(response.body.data[0].Player.first_name).toBeDefined();
    });

    it('should return reports sorted by date (newest first)', async () => {
      const report1 = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-10',
        overall_grade: 'B'
      });

      const report2 = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].id).toBe(report2.id); // Newest first
      expect(response.body.data[1].id).toBe(report1.id);
    });

    it('should support pagination with page and limit parameters', async () => {
      // Create 25 reports to test pagination
      for (let i = 0; i < 25; i++) {
        await ScoutingReport.create({
          player_id: testPlayer.id,
          created_by: testUser.id,
          report_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          overall_grade: 'B'
        });
      }

      const response = await request(app)
        .get('/api/reports/scouting?page=2&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(10);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.total).toBe(25);
      expect(response.body.pagination.pages).toBe(3);
    });

    it('should filter by player_id', async () => {
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-16',
        overall_grade: 'B'
      });

      const response = await request(app)
        .get(`/api/reports/scouting?player_id=${testPlayer.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].player_id).toBe(testPlayer.id);
      expect(response.body.data[0].Player.first_name).toBe('John');
    });

    it('should filter by date range', async () => {
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-10',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B'
      });

      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-02-05',
        overall_grade: 'A-'
      });

      const response = await request(app)
        .get('/api/reports/scouting?start_date=2024-01-15&end_date=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].report_date).toBe('2024-01-20');
    });

    it('should only return reports for user team (team isolation)', async () => {
      // Create report for test team
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      // Create report for other team
      await ScoutingReport.create({
        player_id: otherTeamPlayer.id,
        created_by: otherUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B'
      });

      const response = await request(app)
        .get('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].Player.team_id).toBe(testTeam.id);
    });

    it('should include player information in response', async () => {
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].Player).toBeDefined();
      expect(response.body.data[0].Player.id).toBe(testPlayer.id);
      expect(response.body.data[0].Player.first_name).toBe('John');
      expect(response.body.data[0].Player.last_name).toBe('Doe');
      expect(response.body.data[0].Player.position).toBe('P');
      expect(response.body.data[0].Player.school).toBe('Test High School');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports/scouting')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/scouting', () => {
    it('should create a new scouting report', async () => {
      const reportData = {
        player_id: testPlayer.id,
        report_date: '2024-01-15',
        overall_grade: 'A',
        hitting_grade: 'A-',
        pitching_grade: 'B+',
        fielding_grade: 'A',
        speed_grade: 'B',
        overall_notes: 'Excellent prospect with great potential'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Scouting report created successfully');
      expect(response.body.data.player_id).toBe(testPlayer.id);
      expect(response.body.data.overall_grade).toBe('A');
      expect(response.body.data.hitting_grade).toBe('A-');
      expect(response.body.data.pitching_grade).toBe('B+');
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.User).toBeDefined();

      // Verify in database
      const dbReport = await ScoutingReport.findByPk(response.body.data.id);
      expect(dbReport).toBeDefined();
      expect(dbReport.player_id).toBe(testPlayer.id);
    });

    it('should create report with minimal required fields', async () => {
      const reportData = {
        player_id: testPlayer.id,
        report_date: '2024-01-15'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.player_id).toBe(testPlayer.id);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should automatically assign created_by from authenticated user', async () => {
      const reportData = {
        player_id: testPlayer.id,
        report_date: '2024-01-15',
        overall_grade: 'B+'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.User).toBeDefined();
      expect(response.body.data.User.id).toBe(testUser.id);
    });

    it('should return 404 when player does not exist', async () => {
      const reportData = {
        player_id: 999999,
        report_date: '2024-01-15',
        overall_grade: 'A'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Player not found');
    });

    it('should return 404 when player belongs to different team (team isolation)', async () => {
      const reportData = {
        player_id: otherTeamPlayer.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Player not found');
    });

    it('should include player and creator information in response', async () => {
      const reportData = {
        player_id: testPlayer.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.Player.first_name).toBe('John');
      expect(response.body.data.Player.last_name).toBe('Doe');
      expect(response.body.data.User).toBeDefined();
      expect(response.body.data.User.first_name).toBe('Scouting');
      expect(response.body.data.User.last_name).toBe('TestUser');
    });

    it('should require authentication', async () => {
      const reportData = {
        player_id: testPlayer.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      };

      const response = await request(app)
        .post('/api/reports/scouting')
        .send(reportData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/scouting/:id', () => {
    it('should return scouting report by ID', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A',
        hitting_grade: 'A-',
        pitching_grade: 'B+',
        overall_notes: 'Excellent prospect'
      });

      const response = await request(app)
        .get(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(report.id);
      expect(response.body.data.overall_grade).toBe('A');
      expect(response.body.data.hitting_grade).toBe('A-');
      expect(response.body.data.pitching_grade).toBe('B+');
      expect(response.body.data.overall_notes).toBe('Excellent prospect');
    });

    it('should include player information', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.Player.id).toBe(testPlayer.id);
      expect(response.body.data.Player.first_name).toBe('John');
      expect(response.body.data.Player.last_name).toBe('Doe');
      expect(response.body.data.Player.position).toBe('P');
      expect(response.body.data.Player.school).toBe('Test High School');
    });

    it('should include creator information', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.User).toBeDefined();
      expect(response.body.data.User.id).toBe(testUser.id);
      expect(response.body.data.User.first_name).toBe('Scouting');
      expect(response.body.data.User.last_name).toBe('TestUser');
    });

    it('should return 404 for non-existent report', async () => {
      const response = await request(app)
        .get('/api/reports/scouting/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Scouting report not found');
    });

    it('should not allow access to other team report (team isolation)', async () => {
      const otherTeamReport = await ScoutingReport.create({
        player_id: otherTeamPlayer.id,
        created_by: otherUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get(`/api/reports/scouting/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Scouting report not found');
    });

    it('should require authentication', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const response = await request(app)
        .get(`/api/reports/scouting/${report.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/reports/scouting/:id', () => {
    it('should update scouting report', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B',
        hitting_grade: 'B',
        overall_notes: 'Original notes'
      });

      const updateData = {
        overall_grade: 'A',
        hitting_grade: 'A-',
        overall_notes: 'Updated notes - showing improvement'
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Scouting report updated successfully');
      expect(response.body.data.overall_grade).toBe('A');
      expect(response.body.data.hitting_grade).toBe('A-');
      expect(response.body.data.overall_notes).toBe('Updated notes - showing improvement');

      // Verify in database
      const dbReport = await ScoutingReport.findByPk(report.id);
      expect(dbReport.overall_grade).toBe('A');
      expect(dbReport.overall_notes).toBe('Updated notes - showing improvement');
    });

    it('should support partial updates', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B',
        hitting_grade: 'B',
        pitching_grade: 'A'
      });

      const updateData = {
        overall_grade: 'A'
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overall_grade).toBe('A');
      expect(response.body.data.hitting_grade).toBe('B'); // Unchanged
      expect(response.body.data.pitching_grade).toBe('A'); // Unchanged
    });

    it('should allow changing player_id to another team player', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const updateData = {
        player_id: testPlayer2.id
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.player_id).toBe(testPlayer2.id);
      expect(response.body.data.Player.first_name).toBe('Jane');
    });

    it('should not allow changing player_id to other team player (team isolation)', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      const updateData = {
        player_id: otherTeamPlayer.id
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Player not found');
    });

    it('should return 404 for non-existent report', async () => {
      const updateData = {
        overall_grade: 'A'
      };

      const response = await request(app)
        .put('/api/reports/scouting/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Scouting report not found');
    });

    it('should not allow updating other team report (team isolation)', async () => {
      const otherTeamReport = await ScoutingReport.create({
        player_id: otherTeamPlayer.id,
        created_by: otherUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B'
      });

      const updateData = {
        overall_grade: 'A'
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Scouting report not found');

      // Verify report was not updated
      const dbReport = await ScoutingReport.findByPk(otherTeamReport.id);
      expect(dbReport.overall_grade).toBe('B');
    });

    it('should include player and creator information in response', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B'
      });

      const updateData = {
        overall_grade: 'A'
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Player).toBeDefined();
      expect(response.body.data.Player.first_name).toBe('John');
      expect(response.body.data.User).toBeDefined();
      expect(response.body.data.User.first_name).toBe('Scouting');
    });

    it('should require authentication', async () => {
      const report = await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B'
      });

      const updateData = {
        overall_grade: 'A'
      };

      const response = await request(app)
        .put(`/api/reports/scouting/${report.id}`)
        .send(updateData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/custom/:id', () => {
    it('should return custom report by ID', async () => {
      const report = await Report.create({
        title: 'Custom Report Test',
        description: 'Test description',
        type: 'player-performance',
        status: 'published',
        team_id: testTeam.id,
        created_by: testUser.id,
        data_sources: ['source1'],
        sections: [{ name: 'Section 1' }],
        filters: { position: 'P' }
      });

      const response = await request(app)
        .get(`/api/reports/custom/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(report.id);
      expect(response.body.data.title).toBe('Custom Report Test');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.type).toBe('player-performance');
      expect(response.body.data.status).toBe('published');
    });

    it('should include creator information', async () => {
      const report = await Report.create({
        title: 'Custom Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/custom/${report.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by_user).toBeDefined();
      expect(response.body.data.created_by_user.id).toBe(testUser.id);
      expect(response.body.data.created_by_user.first_name).toBe('Scouting');
      expect(response.body.data.created_by_user.last_name).toBe('TestUser');
      expect(response.body.data.created_by_user.email).toBe('scouting-test@example.com');
    });

    it('should return 404 for non-existent report', async () => {
      const response = await request(app)
        .get('/api/reports/custom/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should not allow access to other team report (team isolation)', async () => {
      const otherTeamReport = await Report.create({
        title: 'Other Team Custom Report',
        type: 'custom',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/reports/custom/${otherTeamReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Report not found');
    });

    it('should require authentication', async () => {
      const report = await Report.create({
        title: 'Custom Report',
        type: 'custom',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/reports/custom/${report.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

describe('Reports API - Analytics and Export Endpoints', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let userWithoutPermissions;
  let userWithoutPermissionsToken;
  let testPlayer1;
  let testPlayer2;
  let testPlayer3;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Analytics Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Analytics Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Analytics',
      last_name: 'TestUser',
      email: 'analytics-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'OtherAnalytics',
      last_name: 'User',
      email: 'other-analytics-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    userWithoutPermissions = await User.create({
      first_name: 'NoPermAnalytics',
      last_name: 'User',
      email: 'noperm-analytics-test@example.com',
      password: 'TestP@ss1',
      role: 'assistant_coach',
      team_id: testTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    userWithoutPermissionsToken = jwt.sign({ id: userWithoutPermissions.id }, process.env.JWT_SECRET || 'test_secret');

    // Grant reports_view permission to test user for scouting-analysis endpoint
    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'reports_view',
      is_granted: true
    });

    // Create test players with performance statistics
    testPlayer1 = await Player.create({
      first_name: 'Test',
      last_name: 'Pitcher',
      position: 'P',
      school: 'Test High School',
      team_id: testTeam.id,
      batting_avg: 0.250,
      home_runs: 2,
      rbi: 10,
      era: 3.45,
      wins: 5,
      losses: 3,
      strikeouts: 45
    });

    testPlayer2 = await Player.create({
      first_name: 'Test',
      last_name: 'Catcher',
      position: 'C',
      school: 'Test High School',
      team_id: testTeam.id,
      batting_avg: 0.320,
      home_runs: 8,
      rbi: 32,
      era: null,
      wins: null,
      losses: null,
      strikeouts: null
    });

    testPlayer3 = await Player.create({
      first_name: 'Test',
      last_name: 'Outfielder',
      position: 'OF',
      school: 'Test High School',
      team_id: testTeam.id,
      batting_avg: 0.280,
      home_runs: 5,
      rbi: 20,
      era: null,
      wins: null,
      losses: null,
      strikeouts: null
    });
  });

  afterAll(async () => {
    // Clean up test data
    await ScoutingReport.destroy({ where: {}, force: true });
    await Player.destroy({ where: { id: [testPlayer1.id, testPlayer2.id, testPlayer3.id] } });
    await UserPermission.destroy({ where: { user_id: [testUser.id, userWithoutPermissions.id] } });
    await userWithoutPermissions.destroy();
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up scouting reports before each test
    await ScoutingReport.destroy({ where: {}, force: true });
  });

  describe('GET /api/reports/player-performance', () => {
    it('should return player performance data for authenticated user team', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.players).toBeDefined();
      expect(Array.isArray(response.body.data.players)).toBe(true);
      expect(response.body.data.players.length).toBe(3);
      expect(response.body.data.filters).toBeDefined();
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should return players sorted alphabetically by name', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.players.length).toBe(3);
      expect(response.body.data.players[0].last_name).toBe('Catcher');
      expect(response.body.data.players[1].last_name).toBe('Outfielder');
      expect(response.body.data.players[2].last_name).toBe('Pitcher');
    });

    it('should include performance statistics in response', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const player = response.body.data.players.find(p => p.position === 'P');
      expect(player).toBeDefined();
      expect(player.batting_avg).toBe(0.250);
      expect(player.home_runs).toBe(2);
      expect(player.rbi).toBe(10);
      expect(player.era).toBe(3.45);
      expect(player.wins).toBe(5);
      expect(player.losses).toBe(3);
      expect(player.strikeouts).toBe(45);
    });

    it('should filter by position', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance?position=C')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.players.length).toBe(1);
      expect(response.body.data.players[0].position).toBe('C');
      expect(response.body.data.players[0].first_name).toBe('Test');
      expect(response.body.data.players[0].last_name).toBe('Catcher');
    });

    it('should filter by date range', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance?start_date=2024-01-01&end_date=2024-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.players).toBeDefined();
      expect(response.body.data.filters.start_date).toBe('2024-01-01');
      expect(response.body.data.filters.end_date).toBe('2024-12-31');
    });

    it('should only return team players (team isolation)', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.players.length).toBe(3);
      response.body.data.players.forEach(player => {
        expect([testPlayer1.id, testPlayer2.id, testPlayer3.id]).toContain(player.id);
      });
    });

    it('should return 400 when user has no team_id', async () => {
      // Create a user without a team
      const userWithoutTeam = await User.create({
        first_name: 'NoTeam',
        last_name: 'User',
        email: 'noteam-analytics@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: null
      });

      const noTeamToken = jwt.sign({ id: userWithoutTeam.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .get('/api/reports/player-performance')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is not associated with a team');

      // Cleanup
      await userWithoutTeam.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports/player-performance')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/team-statistics', () => {
    it('should return team statistics for authenticated user team', async () => {
      const response = await request(app)
        .get('/api/reports/team-statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.team_name).toBe('Analytics Test Team');
      expect(response.body.data.total_players).toBe(3);
      expect(response.body.data.team_batting_avg).toBeDefined();
      expect(response.body.data.team_era).toBeDefined();
      expect(response.body.data.wins).toBeDefined();
      expect(response.body.data.losses).toBeDefined();
      expect(response.body.data.win_percentage).toBeDefined();
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should calculate team batting average correctly', async () => {
      const response = await request(app)
        .get('/api/reports/team-statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Average of 0.250, 0.320, 0.280 = 0.850 / 3 = 0.283
      expect(response.body.data.team_batting_avg).toBe('0.283');
    });

    it('should calculate team ERA correctly', async () => {
      const response = await request(app)
        .get('/api/reports/team-statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Only pitcher has ERA of 3.45
      expect(response.body.data.team_era).toBe('3.45');
    });

    it('should calculate win/loss record correctly', async () => {
      const response = await request(app)
        .get('/api/reports/team-statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.wins).toBe(5);
      expect(response.body.data.losses).toBe(3);
      // Win percentage: 5 / (5 + 3) * 100 = 62.5
      expect(response.body.data.win_percentage).toBe('62.5');
    });

    it('should return 404 when team not found', async () => {
      // Create user with invalid team_id
      const invalidTeam = await Team.create({
        name: 'Temp Team',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      const tempUser = await User.create({
        first_name: 'Temp',
        last_name: 'User',
        email: 'temp-analytics@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: invalidTeam.id
      });

      const tempToken = jwt.sign({ id: tempUser.id }, process.env.JWT_SECRET || 'test_secret');

      // Delete the team
      await invalidTeam.destroy();

      const response = await request(app)
        .get('/api/reports/team-statistics')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Cleanup
      await tempUser.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports/team-statistics')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/scouting-analysis', () => {
    it('should return scouting analysis with reports_view permission', async () => {
      // Create scouting reports
      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B+'
      });

      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.total_reports).toBe(2);
      expect(response.body.data.average_grade).toBeDefined();
      expect(response.body.data.reports_by_position).toBeDefined();
      expect(response.body.data.recent_reports).toBeDefined();
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should calculate average grade correctly', async () => {
      // Create scouting reports
      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A' // 93
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B' // 83
      });

      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Average: (93 + 83) / 2 = 88.0
      expect(response.body.data.average_grade).toBe('88.0');
    });

    it('should group reports by position', async () => {
      // Create scouting reports
      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B'
      });

      await ScoutingReport.create({
        player_id: testPlayer2.id,
        created_by: testUser.id,
        report_date: '2024-01-25',
        overall_grade: 'A-'
      });

      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reports_by_position).toBeDefined();
      expect(response.body.data.reports_by_position['P']).toBe(1);
      expect(response.body.data.reports_by_position['C']).toBe(2);
    });

    it('should limit recent reports to 10', async () => {
      // Create 15 scouting reports
      for (let i = 0; i < 15; i++) {
        await ScoutingReport.create({
          player_id: testPlayer1.id,
          created_by: testUser.id,
          report_date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          overall_grade: 'B'
        });
      }

      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_reports).toBe(15);
      expect(response.body.data.recent_reports.length).toBe(10);
    });

    it('should filter by date range', async () => {
      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-10',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-20',
        overall_grade: 'B'
      });

      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-02-05',
        overall_grade: 'A-'
      });

      const response = await request(app)
        .get('/api/reports/scouting-analysis?start_date=2024-01-15&end_date=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_reports).toBe(1);
      expect(response.body.data.date_range.start_date).toBe('2024-01-15');
      expect(response.body.data.date_range.end_date).toBe('2024-01-31');
    });

    it('should only include team reports (team isolation)', async () => {
      // Create player for other team
      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'SS',
        team_id: otherTeam.id
      });

      // Create scouting reports for both teams
      await ScoutingReport.create({
        player_id: testPlayer1.id,
        created_by: testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A'
      });

      await ScoutingReport.create({
        player_id: otherPlayer.id,
        created_by: otherUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B'
      });

      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_reports).toBe(1);

      // Cleanup
      await ScoutingReport.destroy({ where: { player_id: otherPlayer.id } });
      await otherPlayer.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require reports_view permission', async () => {
      const response = await request(app)
        .get('/api/reports/scouting-analysis')
        .set('Authorization', `Bearer ${userWithoutPermissionsToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });
  });

  describe('GET /api/reports/recruitment-pipeline', () => {
    it('should return recruitment pipeline data', async () => {
      const response = await request(app)
        .get('/api/reports/recruitment-pipeline')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.pipeline).toBeDefined();
      expect(Array.isArray(response.body.data.pipeline)).toBe(true);
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should return mock pipeline stages', async () => {
      const response = await request(app)
        .get('/api/reports/recruitment-pipeline')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pipeline.length).toBe(5);

      const stages = response.body.data.pipeline.map(s => s.stage_name);
      expect(stages).toContain('Prospects');
      expect(stages).toContain('Evaluated');
      expect(stages).toContain('Offered');
      expect(stages).toContain('Committed');
      expect(stages).toContain('Enrolled');
    });

    it('should include player counts and grades for each stage', async () => {
      const response = await request(app)
        .get('/api/reports/recruitment-pipeline')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const stage = response.body.data.pipeline[0];
      expect(stage.stage_name).toBeDefined();
      expect(stage.player_count).toBeDefined();
      expect(stage.avg_grade).toBeDefined();
      expect(stage.next_action).toBeDefined();
    });

    it('should include filters in response', async () => {
      const response = await request(app)
        .get('/api/reports/recruitment-pipeline?year=2024')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.filters).toBeDefined();
      expect(response.body.data.filters.year).toBe('2024');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/reports/recruitment-pipeline')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/generate-pdf', () => {
    it('should accept PDF generation request', async () => {
      const requestData = {
        type: 'player-performance',
        data: { players: [] },
        options: { format: 'A4' }
      };

      const response = await request(app)
        .post('/api/reports/generate-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('PDF generation endpoint');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.type).toBe('player-performance');
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should accept different report types', async () => {
      const types = ['player-performance', 'team-statistics', 'scouting-analysis', 'custom'];

      for (const type of types) {
        const requestData = { type };

        const response = await request(app)
          .post('/api/reports/generate-pdf')
          .set('Authorization', `Bearer ${authToken}`)
          .send(requestData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.type).toBe(type);
      }
    });

    it('should accept request with minimal data', async () => {
      const requestData = {
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports/generate-pdf')
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('custom');
    });

    it('should require authentication', async () => {
      const requestData = {
        type: 'player-performance'
      };

      const response = await request(app)
        .post('/api/reports/generate-pdf')
        .send(requestData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/export-excel', () => {
    it('should accept Excel export request', async () => {
      const requestData = {
        type: 'team-statistics',
        data: { stats: {} },
        options: { includeCharts: true }
      };

      const response = await request(app)
        .post('/api/reports/export-excel')
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Excel export endpoint');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.type).toBe('team-statistics');
      expect(response.body.data.generated_at).toBeDefined();
    });

    it('should accept different report types', async () => {
      const types = ['player-performance', 'team-statistics', 'scouting-analysis', 'recruitment-pipeline'];

      for (const type of types) {
        const requestData = { type };

        const response = await request(app)
          .post('/api/reports/export-excel')
          .set('Authorization', `Bearer ${authToken}`)
          .send(requestData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.type).toBe(type);
      }
    });

    it('should accept request with minimal data', async () => {
      const requestData = {
        type: 'custom'
      };

      const response = await request(app)
        .post('/api/reports/export-excel')
        .set('Authorization', `Bearer ${authToken}`)
        .send(requestData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('custom');
    });

    it('should require authentication', async () => {
      const requestData = {
        type: 'team-statistics'
      };

      const response = await request(app)
        .post('/api/reports/export-excel')
        .send(requestData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
