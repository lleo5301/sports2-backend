const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, DepthChart, DepthChartPosition, UserPermission } = require('../../models');
const jwt = require('jsonwebtoken');

describe('DepthCharts API - Core CRUD Operations', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'DepthChart Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'DepthChart',
      last_name: 'TestUser',
      email: 'depthchart-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-depthchart-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');

    // Grant necessary permissions to test user
    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'depth_chart_view',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'depth_chart_create',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'depth_chart_edit',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'depth_chart_delete',
      is_granted: true
    });

    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'depth_chart_manage_positions',
      is_granted: true
    });

    // Grant permissions to other user for their team
    await UserPermission.create({
      user_id: otherUser.id,
      team_id: otherTeam.id,
      permission_type: 'depth_chart_view',
      is_granted: true
    });

    await UserPermission.create({
      user_id: otherUser.id,
      team_id: otherTeam.id,
      permission_type: 'depth_chart_create',
      is_granted: true
    });
  });

  afterAll(async () => {
    // Clean up test data
    await DepthChartPosition.destroy({ where: {}, force: true });
    await DepthChart.destroy({ where: {}, force: true });
    await UserPermission.destroy({ where: { user_id: [testUser.id, otherUser.id] } });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up depth charts before each test
    await DepthChartPosition.destroy({ where: {}, force: true });
    await DepthChart.destroy({ where: {}, force: true });
  });

  describe('GET /api/depth-charts', () => {
    it('should return empty array when no depth charts exist', async () => {
      const response = await request(app)
        .get('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return user team depth charts only (team isolation)', async () => {
      // Create depth chart for test team
      await DepthChart.create({
        name: 'Test Depth Chart',
        description: 'Test description',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: false,
        is_active: true
      });

      // Create depth chart for other team
      await DepthChart.create({
        name: 'Other Team Depth Chart',
        description: 'Other description',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_default: false,
        is_active: true
      });

      const response = await request(app)
        .get('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Depth Chart');
      expect(response.body.data[0].team_id).toBe(testTeam.id);
    });

    it('should only return active depth charts (not soft-deleted)', async () => {
      // Create active depth chart
      await DepthChart.create({
        name: 'Active Depth Chart',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      // Create inactive (soft-deleted) depth chart
      await DepthChart.create({
        name: 'Deleted Depth Chart',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const response = await request(app)
        .get('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Active Depth Chart');
    });

    it('should return depth charts with default charts first', async () => {
      // Create non-default chart first
      await DepthChart.create({
        name: 'Regular Chart',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: false,
        is_active: true
      });

      // Create default chart second
      await DepthChart.create({
        name: 'Default Chart',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: true,
        is_active: true
      });

      const response = await request(app)
        .get('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      // Default chart should be first
      expect(response.body.data[0].name).toBe('Default Chart');
      expect(response.body.data[0].is_default).toBe(true);
      expect(response.body.data[1].name).toBe('Regular Chart');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/depth-charts')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/depth-charts')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/depth-charts/byId/:id', () => {
    let testDepthChart;

    beforeEach(async () => {
      testDepthChart = await DepthChart.create({
        name: 'Test Chart',
        description: 'Test description',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });

      // Add a position with players would be tested in later subtasks
    });

    it('should return a specific depth chart by ID', async () => {
      const response = await request(app)
        .get(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testDepthChart.id);
      expect(response.body.data.name).toBe('Test Chart');
      expect(response.body.data.description).toBe('Test description');
      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should return 404 for non-existent depth chart', async () => {
      const response = await request(app)
        .get('/api/depth-charts/byId/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should return 404 when trying to access another team\'s depth chart (team isolation)', async () => {
      const otherTeamChart = await DepthChart.create({
        name: 'Other Team Chart',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .get(`/api/depth-charts/byId/${otherTeamChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should return 404 for soft-deleted depth chart', async () => {
      const deletedChart = await DepthChart.create({
        name: 'Deleted Chart',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: false
      });

      const response = await request(app)
        .get(`/api/depth-charts/byId/${deletedChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/depth-charts/byId/${testDepthChart.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });
  });

  describe('POST /api/depth-charts', () => {
    const validDepthChartData = {
      name: 'New Depth Chart',
      description: 'A new depth chart for testing',
      is_default: false,
      notes: 'Test notes'
    };

    it('should create a new depth chart with valid data', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validDepthChartData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(validDepthChartData.name);
      expect(response.body.data.description).toBe(validDepthChartData.description);
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
      expect(response.body.data.is_default).toBe(false);
      expect(response.body.data.is_active).toBe(true);
    });

    it('should create depth chart with minimal required fields', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Minimal Chart' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Minimal Chart');
    });

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'name'
          })
        ])
      );
    });

    it('should reject name that is too long (>100 characters)', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should reject description that is too long (>1000 characters)', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Chart',
          description: 'a'.repeat(1001)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should reject invalid is_default type', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Chart',
          is_default: 'not a boolean'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should reject invalid effective_date format', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Chart',
          effective_date: 'not-a-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should accept valid effective_date in ISO8601 format', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Chart',
          effective_date: '2024-05-15T00:00:00.000Z'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Chart');
    });

    it('should unset other default charts when creating a new default chart', async () => {
      // Create an existing default chart
      const existingDefault = await DepthChart.create({
        name: 'Existing Default',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: true,
        is_active: true
      });

      // Create a new default chart
      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Default Chart',
          is_default: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_default).toBe(true);

      // Check that the old default is no longer default
      const updatedExistingDefault = await DepthChart.findByPk(existingDefault.id);
      expect(updatedExistingDefault.is_default).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/depth-charts')
        .send(validDepthChartData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should require depth_chart_create permission', async () => {
      // Create a user without create permission
      const noPermUser = await User.create({
        first_name: 'No',
        last_name: 'Permission',
        email: 'no-perm-depthchart@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .post('/api/depth-charts')
        .set('Authorization', `Bearer ${noPermToken}`)
        .send(validDepthChartData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('depth_chart_create');

      // Cleanup
      await noPermUser.destroy();
    });
  });

  describe('PUT /api/depth-charts/byId/:id', () => {
    let testDepthChart;

    beforeEach(async () => {
      testDepthChart = await DepthChart.create({
        name: 'Original Name',
        description: 'Original description',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: false,
        is_active: true,
        version: 1
      });
    });

    it('should update an existing depth chart', async () => {
      const updateData = {
        name: 'Updated Name',
        description: 'Updated description',
        notes: 'Updated notes'
      };

      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.version).toBe(2); // Version should increment
    });

    it('should increment version on each update', async () => {
      // First update
      await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Update 1' })
        .expect(200);

      // Second update
      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Update 2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.version).toBe(3); // Started at 1, incremented twice
    });

    it('should return 404 for non-existent depth chart', async () => {
      const response = await request(app)
        .put('/api/depth-charts/byId/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should return 404 when trying to update another team\'s depth chart (team isolation)', async () => {
      const otherTeamChart = await DepthChart.create({
        name: 'Other Team Chart',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .put(`/api/depth-charts/byId/${otherTeamChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Hacked Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');

      // Verify it wasn't updated
      const unchangedChart = await DepthChart.findByPk(otherTeamChart.id);
      expect(unchangedChart.name).toBe('Other Team Chart');
    });

    it('should unset other default charts when setting a chart as default', async () => {
      // Create an existing default chart
      const existingDefault = await DepthChart.create({
        name: 'Existing Default',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_default: true,
        is_active: true
      });

      // Update testDepthChart to be the new default
      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Default', is_default: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_default).toBe(true);

      // Check that the old default is no longer default
      const updatedExistingDefault = await DepthChart.findByPk(existingDefault.id);
      expect(updatedExistingDefault.is_default).toBe(false);
    });

    it('should reject invalid ID parameter', async () => {
      const response = await request(app)
        .put('/api/depth-charts/byId/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should reject invalid name (too long)', async () => {
      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'a'.repeat(101) })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .send({ name: 'Updated Name' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should require depth_chart_edit permission', async () => {
      // Create a user without edit permission
      const noPermUser = await User.create({
        first_name: 'No',
        last_name: 'EditPerm',
        email: 'no-edit-perm-depthchart@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .put(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({ name: 'Updated Name' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('depth_chart_edit');

      // Cleanup
      await noPermUser.destroy();
    });
  });

  describe('DELETE /api/depth-charts/byId/:id', () => {
    let testDepthChart;

    beforeEach(async () => {
      testDepthChart = await DepthChart.create({
        name: 'Chart to Delete',
        description: 'Will be deleted',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });
    });

    it('should soft-delete a depth chart', async () => {
      const response = await request(app)
        .delete(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Depth chart deleted successfully');

      // Verify it's soft-deleted (is_active = false)
      const deletedChart = await DepthChart.findByPk(testDepthChart.id);
      expect(deletedChart).not.toBeNull(); // Still exists in DB
      expect(deletedChart.is_active).toBe(false); // But marked as inactive
    });

    it('should return 404 for non-existent depth chart', async () => {
      const response = await request(app)
        .delete('/api/depth-charts/byId/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should return 404 when trying to delete another team\'s depth chart (team isolation)', async () => {
      const otherTeamChart = await DepthChart.create({
        name: 'Other Team Chart',
        team_id: otherTeam.id,
        created_by: otherUser.id,
        is_active: true
      });

      const response = await request(app)
        .delete(`/api/depth-charts/byId/${otherTeamChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');

      // Verify it wasn't deleted
      const unchangedChart = await DepthChart.findByPk(otherTeamChart.id);
      expect(unchangedChart.is_active).toBe(true);
    });

    it('should return 404 for already deleted depth chart', async () => {
      // First delete
      await request(app)
        .delete(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Try to delete again
      const response = await request(app)
        .delete(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Depth chart not found');
    });

    it('should reject invalid ID parameter', async () => {
      const response = await request(app)
        .delete('/api/depth-charts/byId/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/depth-charts/byId/${testDepthChart.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should require depth_chart_delete permission', async () => {
      // Create a user without delete permission
      const noPermUser = await User.create({
        first_name: 'No',
        last_name: 'DeletePerm',
        email: 'no-delete-perm-depthchart@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .delete(`/api/depth-charts/byId/${testDepthChart.id}`)
        .set('Authorization', `Bearer ${noPermToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('depth_chart_delete');

      // Cleanup
      await noPermUser.destroy();
    });
  });

  describe('Position Management - POST /:id/positions, PUT /positions/:positionId, DELETE /positions/:positionId', () => {
    let testDepthChart;

    beforeEach(async () => {
      testDepthChart = await DepthChart.create({
        name: 'Position Test Chart',
        description: 'Chart for testing positions',
        team_id: testTeam.id,
        created_by: testUser.id,
        is_active: true
      });
    });

    describe('POST /api/depth-charts/:id/positions', () => {
      const validPositionData = {
        position_code: 'P',
        position_name: 'Pitcher',
        color: '#EF4444',
        icon: 'Shield',
        sort_order: 1,
        max_players: 5,
        description: 'Starting and relief pitchers'
      };

      it('should create a new position with all fields', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(validPositionData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.position_code).toBe('P');
        expect(response.body.data.position_name).toBe('Pitcher');
        expect(response.body.data.color).toBe('#EF4444');
        expect(response.body.data.icon).toBe('Shield');
        expect(response.body.data.sort_order).toBe(1);
        expect(response.body.data.max_players).toBe(5);
        expect(response.body.data.description).toBe('Starting and relief pitchers');
        expect(response.body.data.depth_chart_id).toBe(testDepthChart.id);
        expect(response.body.data.is_active).toBe(true);
      });

      it('should create a position with minimal required fields', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'C',
            position_name: 'Catcher'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.position_code).toBe('C');
        expect(response.body.data.position_name).toBe('Catcher');
      });

      it('should reject empty position_code', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: '',
            position_name: 'Pitcher'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'position_code'
            })
          ])
        );
      });

      it('should reject position_code that is too long (>10 characters)', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'VERYLONGPOS',
            position_name: 'Pitcher'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject empty position_name', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: ''
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
        expect(response.body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'position_name'
            })
          ])
        );
      });

      it('should reject position_name that is too long (>50 characters)', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'a'.repeat(51)
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject invalid color format (not hex)', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            color: 'red'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject invalid color format (incomplete hex)', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            color: '#EF44'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should accept valid hex color in uppercase', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            color: '#EF4444'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.color).toBe('#EF4444');
      });

      it('should accept valid hex color in lowercase', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            color: '#ef4444'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.color).toBe('#ef4444');
      });

      it('should reject negative sort_order', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            sort_order: -1
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should accept zero as sort_order', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            sort_order: 0
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sort_order).toBe(0);
      });

      it('should reject zero or negative max_players', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            max_players: 0
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject description that is too long (>500 characters)', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            description: 'a'.repeat(501)
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should return 404 for non-existent depth chart', async () => {
        const response = await request(app)
          .post('/api/depth-charts/99999/positions')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validPositionData)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Depth chart not found');
      });

      it('should return 404 when trying to add position to another team\'s depth chart (team isolation)', async () => {
        const otherTeamChart = await DepthChart.create({
          name: 'Other Team Chart',
          team_id: otherTeam.id,
          created_by: otherUser.id,
          is_active: true
        });

        const response = await request(app)
          .post(`/api/depth-charts/${otherTeamChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(validPositionData)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Depth chart not found');
      });

      it('should reject invalid depth chart ID parameter', async () => {
        const response = await request(app)
          .post('/api/depth-charts/invalid/positions')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validPositionData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .send(validPositionData)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should require depth_chart_manage_positions permission', async () => {
        // Create a user without position management permission
        const noPermUser = await User.create({
          first_name: 'No',
          last_name: 'PositionPerm',
          email: 'no-position-perm-depthchart@example.com',
          password: 'TestP@ss1',
          role: 'assistant_coach',
          team_id: testTeam.id
        });

        const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

        const response = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${noPermToken}`)
          .send(validPositionData)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('depth_chart_manage_positions');

        // Cleanup
        await noPermUser.destroy();
      });
    });

    describe('PUT /api/depth-charts/positions/:positionId', () => {
      let testPosition;

      beforeEach(async () => {
        testPosition = await DepthChartPosition.create({
          depth_chart_id: testDepthChart.id,
          position_code: 'P',
          position_name: 'Pitcher',
          color: '#EF4444',
          icon: 'Shield',
          sort_order: 1,
          is_active: true
        });
      });

      it('should update an existing position', async () => {
        const updateData = {
          position_code: 'SP',
          position_name: 'Starting Pitcher',
          color: '#3B82F6',
          icon: 'Star',
          sort_order: 2,
          max_players: 10,
          description: 'Rotation pitchers'
        };

        const response = await request(app)
          .put(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.position_code).toBe('SP');
        expect(response.body.data.position_name).toBe('Starting Pitcher');
        expect(response.body.data.color).toBe('#3B82F6');
        expect(response.body.data.icon).toBe('Star');
        expect(response.body.data.sort_order).toBe(2);
        expect(response.body.data.max_players).toBe(10);
        expect(response.body.data.description).toBe('Rotation pitchers');
      });

      it('should update only specific fields', async () => {
        const response = await request(app)
          .put(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'SP',
            position_name: 'Starting Pitcher',
            color: '#3B82F6'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.color).toBe('#3B82F6');
        // Original icon should remain
        expect(response.body.data.icon).toBe('Shield');
      });

      it('should return 404 for non-existent position', async () => {
        const response = await request(app)
          .put('/api/depth-charts/positions/99999')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher'
          })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Position not found');
      });

      it('should return 404 when trying to update position from another team\'s chart (team isolation)', async () => {
        const otherTeamChart = await DepthChart.create({
          name: 'Other Team Chart',
          team_id: otherTeam.id,
          created_by: otherUser.id,
          is_active: true
        });

        const otherPosition = await DepthChartPosition.create({
          depth_chart_id: otherTeamChart.id,
          position_code: 'C',
          position_name: 'Catcher',
          is_active: true
        });

        const response = await request(app)
          .put(`/api/depth-charts/positions/${otherPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'C',
            position_name: 'Modified Catcher'
          })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Position not found');

        // Verify it wasn't updated
        const unchangedPosition = await DepthChartPosition.findByPk(otherPosition.id);
        expect(unchangedPosition.position_name).toBe('Catcher');
      });

      it('should reject invalid position ID parameter', async () => {
        const response = await request(app)
          .put('/api/depth-charts/positions/invalid')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should reject invalid color format', async () => {
        const response = await request(app)
          .put(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            color: 'not-a-hex'
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .put(`/api/depth-charts/positions/${testPosition.id}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher'
          })
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should require depth_chart_manage_positions permission', async () => {
        // Create a user without position management permission
        const noPermUser = await User.create({
          first_name: 'No',
          last_name: 'UpdatePositionPerm',
          email: 'no-update-position-perm@example.com',
          password: 'TestP@ss1',
          role: 'assistant_coach',
          team_id: testTeam.id
        });

        const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

        const response = await request(app)
          .put(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${noPermToken}`)
          .send({
            position_code: 'SP',
            position_name: 'Starting Pitcher'
          })
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('depth_chart_manage_positions');

        // Cleanup
        await noPermUser.destroy();
      });
    });

    describe('DELETE /api/depth-charts/positions/:positionId', () => {
      let testPosition;

      beforeEach(async () => {
        testPosition = await DepthChartPosition.create({
          depth_chart_id: testDepthChart.id,
          position_code: 'P',
          position_name: 'Pitcher',
          is_active: true
        });
      });

      it('should soft-delete a position', async () => {
        const response = await request(app)
          .delete(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Position deleted successfully');

        // Verify it's soft-deleted (is_active = false)
        const deletedPosition = await DepthChartPosition.findByPk(testPosition.id);
        expect(deletedPosition).not.toBeNull(); // Still exists in DB
        expect(deletedPosition.is_active).toBe(false); // But marked as inactive
      });

      it('should return 404 for non-existent position', async () => {
        const response = await request(app)
          .delete('/api/depth-charts/positions/99999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Position not found');
      });

      it('should return 404 when trying to delete position from another team\'s chart (team isolation)', async () => {
        const otherTeamChart = await DepthChart.create({
          name: 'Other Team Chart',
          team_id: otherTeam.id,
          created_by: otherUser.id,
          is_active: true
        });

        const otherPosition = await DepthChartPosition.create({
          depth_chart_id: otherTeamChart.id,
          position_code: 'C',
          position_name: 'Catcher',
          is_active: true
        });

        const response = await request(app)
          .delete(`/api/depth-charts/positions/${otherPosition.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Position not found');

        // Verify it wasn't deleted
        const unchangedPosition = await DepthChartPosition.findByPk(otherPosition.id);
        expect(unchangedPosition.is_active).toBe(true);
      });

      it('should reject invalid position ID parameter', async () => {
        const response = await request(app)
          .delete('/api/depth-charts/positions/invalid')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .delete(`/api/depth-charts/positions/${testPosition.id}`)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should require depth_chart_manage_positions permission', async () => {
        // Create a user without position management permission
        const noPermUser = await User.create({
          first_name: 'No',
          last_name: 'DeletePositionPerm',
          email: 'no-delete-position-perm@example.com',
          password: 'TestP@ss1',
          role: 'assistant_coach',
          team_id: testTeam.id
        });

        const noPermToken = jwt.sign({ id: noPermUser.id }, process.env.JWT_SECRET || 'test_secret');

        const response = await request(app)
          .delete(`/api/depth-charts/positions/${testPosition.id}`)
          .set('Authorization', `Bearer ${noPermToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('depth_chart_manage_positions');

        // Cleanup
        await noPermUser.destroy();
      });
    });

    describe('Position sort_order handling', () => {
      it('should allow creating positions with different sort orders', async () => {
        // Create positions with different sort orders
        const pos1 = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            sort_order: 1
          })
          .expect(201);

        const pos2 = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'C',
            position_name: 'Catcher',
            sort_order: 2
          })
          .expect(201);

        const pos3 = await request(app)
          .post(`/api/depth-charts/${testDepthChart.id}/positions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: '1B',
            position_name: 'First Base',
            sort_order: 3
          })
          .expect(201);

        expect(pos1.body.data.sort_order).toBe(1);
        expect(pos2.body.data.sort_order).toBe(2);
        expect(pos3.body.data.sort_order).toBe(3);
      });

      it('should allow updating sort_order to reorder positions', async () => {
        const position = await DepthChartPosition.create({
          depth_chart_id: testDepthChart.id,
          position_code: 'P',
          position_name: 'Pitcher',
          sort_order: 1,
          is_active: true
        });

        const response = await request(app)
          .put(`/api/depth-charts/positions/${position.id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            position_code: 'P',
            position_name: 'Pitcher',
            sort_order: 10
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.sort_order).toBe(10);
      });
    });
  });
});
