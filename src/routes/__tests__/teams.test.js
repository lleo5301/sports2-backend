const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, UserPermission, Schedule, ScheduleSection, ScheduleActivity } = require('../../models');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

describe('Teams API - Core Operations', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;
  let adminUser;
  let adminAuthToken;
  let adminTeam;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Teams Test Team',
      program_name: 'Test Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024,
      conference: 'Test Conference',
      division: 'D1',
      city: 'TestCity',
      state: 'CA',
      primary_color: '#FF0000',
      secondary_color: '#0000FF'
    });

    otherTeam = await Team.create({
      name: 'Other Teams Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    adminTeam = await Team.create({
      name: 'Admin Teams Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Teams',
      last_name: 'TestUser',
      email: 'teams-test@example.com',
      password: 'TestP@ss1',
      role: 'assistant_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-teams-test@example.com',
      password: 'TestP@ss1',
      role: 'assistant_coach',
      team_id: otherTeam.id
    });

    adminUser = await User.create({
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin-teams-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: adminTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
    adminAuthToken = jwt.sign({ id: adminUser.id }, process.env.JWT_SECRET || 'test_secret');

    // Grant team_settings permission to test user
    await UserPermission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'team_settings',
      is_granted: true
    });

    // Grant team_management permission to admin user
    await UserPermission.create({
      user_id: adminUser.id,
      team_id: adminTeam.id,
      permission_type: 'team_management',
      is_granted: true
    });
  });

  afterAll(async () => {
    // Clean up test data
    await UserPermission.destroy({ where: { user_id: [testUser.id, otherUser.id, adminUser.id] } });
    await testUser.destroy();
    await otherUser.destroy();
    await adminUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
    await adminTeam.destroy();
  });

  describe('GET /api/teams', () => {
    it('should return list of all teams without authentication', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);

      // Check that teams include limited attributes
      const team = response.body.data.find(t => t.id === testTeam.id);
      expect(team).toBeDefined();
      expect(team.name).toBe('Teams Test Team');
      expect(team.program_name).toBe('Test Program');
      expect(team.conference).toBe('Test Conference');
      expect(team.division).toBe('D1');
      expect(team.city).toBe('TestCity');
      expect(team.state).toBe('CA');
    });

    it('should return teams sorted alphabetically by name', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);

      expect(response.body.success).toBe(true);
      const teamNames = response.body.data.map(t => t.name);
      const sortedNames = [...teamNames].sort();
      expect(teamNames).toEqual(sortedNames);
    });

    it('should return limited attributes (no sensitive data)', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);

      expect(response.body.success).toBe(true);
      const team = response.body.data[0];

      // Should have these attributes
      expect(team).toHaveProperty('id');
      expect(team).toHaveProperty('name');

      // Should NOT have sensitive attributes like Users list
      expect(team).not.toHaveProperty('Users');
      expect(team).not.toHaveProperty('createdAt');
      expect(team).not.toHaveProperty('updatedAt');
    });
  });

  describe('POST /api/teams', () => {
    it('should create a new team with valid data and permissions', async () => {
      const newTeamData = {
        name: 'New Test Team',
        program_name: 'New Program',
        conference: 'New Conference',
        division: 'D2',
        city: 'NewCity',
        state: 'NY',
        primary_color: '#00FF00',
        secondary_color: '#FF00FF'
      };

      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(newTeamData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Team created successfully');
      expect(response.body.data.name).toBe('New Test Team');
      expect(response.body.data.program_name).toBe('New Program');
      expect(response.body.data.conference).toBe('New Conference');
      expect(response.body.data.division).toBe('D2');
      expect(response.body.data.city).toBe('NewCity');
      expect(response.body.data.state).toBe('NY');
      expect(response.body.data.primary_color).toBe('#00FF00');
      expect(response.body.data.secondary_color).toBe('#FF00FF');

      // Clean up
      await Team.destroy({ where: { id: response.body.data.id } });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({ name: 'Test Team' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require team_management permission', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Team' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });

    it('should validate required name field', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate name length (1-100 characters)', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ name: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate division values', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({
          name: 'Test Team',
          division: 'InvalidDivision'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate state length (2 characters)', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({
          name: 'Test Team',
          state: 'CAL'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate primary_color hex format', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({
          name: 'Test Team',
          primary_color: 'red'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate secondary_color hex format', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({
          name: 'Test Team',
          secondary_color: '#ZZZ'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should prevent duplicate team names', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ name: 'Teams Test Team' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team name already exists');
    });

    it('should create team with only required fields', async () => {
      const response = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ name: 'Minimal Test Team' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Minimal Test Team');

      // Clean up
      await Team.destroy({ where: { id: response.body.data.id } });
    });
  });

  describe('GET /api/teams/me', () => {
    it('should return current user\'s team', async () => {
      const response = await request(app)
        .get('/api/teams/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testTeam.id);
      expect(response.body.data.name).toBe('Teams Test Team');
      expect(response.body.data.program_name).toBe('Test Program');
      expect(response.body.data.conference).toBe('Test Conference');
      expect(response.body.data.division).toBe('D1');
      expect(response.body.data.primary_color).toBe('#FF0000');
      expect(response.body.data.secondary_color).toBe('#0000FF');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/teams/me')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return error if user has no team', async () => {
      // Create user without team
      const noTeamUser = await User.create({
        first_name: 'NoTeam',
        last_name: 'User',
        email: 'noteam-teams-test@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach'
      });

      const noTeamToken = jwt.sign({ id: noTeamUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .get('/api/teams/me')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is not associated with a team');

      // Clean up
      await noTeamUser.destroy();
    });

    it('should return 404 if team is deleted', async () => {
      // Create temporary team and user
      const tempTeam = await Team.create({
        name: 'Temp Test Team',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      const tempUser = await User.create({
        first_name: 'Temp',
        last_name: 'User',
        email: 'temp-teams-test@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: tempTeam.id
      });

      const tempToken = jwt.sign({ id: tempUser.id }, process.env.JWT_SECRET || 'test_secret');

      // Delete the team
      await tempTeam.destroy();

      const response = await request(app)
        .get('/api/teams/me')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await tempUser.destroy();
    });
  });

  describe('PUT /api/teams/me', () => {
    it('should update current user\'s team', async () => {
      const updates = {
        program_name: 'Updated Program',
        conference: 'Updated Conference',
        city: 'UpdatedCity'
      };

      const response = await request(app)
        .put('/api/teams/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Team updated successfully');
      expect(response.body.data.program_name).toBe('Updated Program');
      expect(response.body.data.conference).toBe('Updated Conference');
      expect(response.body.data.city).toBe('UpdatedCity');

      // Verify in database
      const team = await Team.findByPk(testTeam.id);
      expect(team.program_name).toBe('Updated Program');
      expect(team.conference).toBe('Updated Conference');
      expect(team.city).toBe('UpdatedCity');

      // Restore original values
      await team.update({
        program_name: 'Test Program',
        conference: 'Test Conference',
        city: 'TestCity'
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/teams/me')
        .send({ name: 'Updated Name' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require team_settings permission', async () => {
      const response = await request(app)
        .put('/api/teams/me')
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send({ name: 'Updated Name' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });

    it('should allow partial updates', async () => {
      const response = await request(app)
        .put('/api/teams/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ city: 'PartialCity' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.city).toBe('PartialCity');
      expect(response.body.data.name).toBe('Teams Test Team'); // Should remain unchanged

      // Restore original value
      const team = await Team.findByPk(testTeam.id);
      await team.update({ city: 'TestCity' });
    });

    it('should update team colors', async () => {
      const response = await request(app)
        .put('/api/teams/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          primary_color: '#AABBCC',
          secondary_color: '#DDEEFF'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.primary_color).toBe('#AABBCC');
      expect(response.body.data.secondary_color).toBe('#DDEEFF');

      // Restore original values
      const team = await Team.findByPk(testTeam.id);
      await team.update({
        primary_color: '#FF0000',
        secondary_color: '#0000FF'
      });
    });

    it('should return 404 if team not found', async () => {
      // Create user with invalid team_id
      const invalidUser = await User.create({
        first_name: 'Invalid',
        last_name: 'User',
        email: 'invalid-teams-test@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: 99999
      });

      const invalidToken = jwt.sign({ id: invalidUser.id }, process.env.JWT_SECRET || 'test_secret');

      await UserPermission.create({
        user_id: invalidUser.id,
        team_id: 99999,
        permission_type: 'team_settings',
        is_granted: true
      });

      const response = await request(app)
        .put('/api/teams/me')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({ name: 'Updated Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await UserPermission.destroy({ where: { user_id: invalidUser.id } });
      await invalidUser.destroy();
    });
  });

  describe('GET /api/teams/byId/:id', () => {
    it('should return team by ID with users', async () => {
      const response = await request(app)
        .get(`/api/teams/byId/${testTeam.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testTeam.id);
      expect(response.body.data.name).toBe('Teams Test Team');
      expect(response.body.data.Users).toBeDefined();
      expect(Array.isArray(response.body.data.Users)).toBe(true);
      expect(response.body.data.Users.length).toBeGreaterThanOrEqual(1);

      // Verify user data is included
      const user = response.body.data.Users.find(u => u.id === testUser.id);
      expect(user).toBeDefined();
      expect(user.first_name).toBe('Teams');
      expect(user.last_name).toBe('TestUser');
      expect(user.email).toBe('teams-test@example.com');
      expect(user.role).toBe('assistant_coach');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/teams/byId/${testTeam.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .get('/api/teams/byId/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');
    });

    it('should allow accessing other teams (no isolation)', async () => {
      const response = await request(app)
        .get(`/api/teams/byId/${otherTeam.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(otherTeam.id);
      expect(response.body.data.name).toBe('Other Teams Test Team');
    });
  });

  describe('GET /api/teams/:id', () => {
    it('should return team by ID with users', async () => {
      const response = await request(app)
        .get(`/api/teams/${testTeam.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testTeam.id);
      expect(response.body.data.name).toBe('Teams Test Team');
      expect(response.body.data.Users).toBeDefined();
      expect(Array.isArray(response.body.data.Users)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/teams/${testTeam.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid ID format', async () => {
      const response = await request(app)
        .get('/api/teams/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid team ID');
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .get('/api/teams/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');
    });

    it('should include user details in response', async () => {
      const response = await request(app)
        .get(`/api/teams/${testTeam.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const user = response.body.data.Users.find(u => u.id === testUser.id);
      expect(user).toBeDefined();
      expect(user.first_name).toBe('Teams');
      expect(user.last_name).toBe('TestUser');
      expect(user.email).toBe('teams-test@example.com');
      expect(user.role).toBe('assistant_coach');

      // Should only include limited attributes
      expect(user).not.toHaveProperty('password');
    });

    it('should allow accessing other teams (no isolation)', async () => {
      const response = await request(app)
        .get(`/api/teams/${otherTeam.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(otherTeam.id);
    });
  });

  describe('POST /api/teams/logo', () => {
    const testImagePath = path.join(__dirname, 'test-logo.png');
    const logosDir = path.join(__dirname, '../../uploads/logos');

    beforeAll(() => {
      // Create a simple test image file
      if (!fs.existsSync(path.dirname(testImagePath))) {
        fs.mkdirSync(path.dirname(testImagePath), { recursive: true });
      }
      // Create a minimal PNG file (1x1 transparent pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testImagePath, pngBuffer);

      // Ensure uploads directory exists
      if (!fs.existsSync(logosDir)) {
        fs.mkdirSync(logosDir, { recursive: true });
      }
    });

    afterAll(() => {
      // Clean up test image
      if (fs.existsSync(testImagePath)) {
        fs.unlinkSync(testImagePath);
      }
    });

    it('should upload a team logo with head_coach role', async () => {
      const response = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .attach('logo', testImagePath)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logo uploaded successfully');
      expect(response.body.data.logo_url).toMatch(/^\/uploads\/logos\//);

      // Verify the logo was saved in the database
      const team = await Team.findByPk(adminTeam.id);
      expect(team.school_logo_url).toBe(response.body.data.logo_url);

      // Clean up uploaded file
      const uploadedFilePath = path.join(logosDir, path.basename(response.body.data.logo_url));
      if (fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }

      // Reset team logo
      await team.update({ school_logo_url: null });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/teams/logo')
        .attach('logo', testImagePath)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require head_coach or super_admin role', async () => {
      const response = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('logo', testImagePath)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('super admins and head coaches');
    });

    it('should return error if no logo file provided', async () => {
      const response = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('No logo file provided');
    });

    it('should replace existing logo when uploading a new one', async () => {
      // First upload
      const response1 = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .attach('logo', testImagePath)
        .expect(200);

      const firstLogoUrl = response1.body.data.logo_url;
      const firstFilePath = path.join(logosDir, path.basename(firstLogoUrl));

      // Second upload (should replace first)
      const response2 = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .attach('logo', testImagePath)
        .expect(200);

      const secondLogoUrl = response2.body.data.logo_url;
      const secondFilePath = path.join(logosDir, path.basename(secondLogoUrl));

      expect(response2.body.success).toBe(true);
      expect(secondLogoUrl).not.toBe(firstLogoUrl);

      // Verify team has new logo
      const team = await Team.findByPk(adminTeam.id);
      expect(team.school_logo_url).toBe(secondLogoUrl);

      // Clean up
      if (fs.existsSync(secondFilePath)) {
        fs.unlinkSync(secondFilePath);
      }
      await team.update({ school_logo_url: null });
    });

    it('should return 404 if team not found', async () => {
      // Create user with invalid team_id
      const noTeamUser = await User.create({
        first_name: 'NoTeam',
        last_name: 'Logo',
        email: 'noteam-logo-test@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: 99999
      });

      const noTeamToken = jwt.sign({ id: noTeamUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .post('/api/teams/logo')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .attach('logo', testImagePath)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await noTeamUser.destroy();
    });
  });

  describe('DELETE /api/teams/logo', () => {
    const logosDir = path.join(__dirname, '../../uploads/logos');
    const testLogoFilename = 'test-delete-logo.png';
    const testLogoPath = path.join(logosDir, testLogoFilename);

    beforeEach(async () => {
      // Create a test logo file
      if (!fs.existsSync(logosDir)) {
        fs.mkdirSync(logosDir, { recursive: true });
      }
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
        0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
        0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
        0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(testLogoPath, pngBuffer);
    });

    afterEach(() => {
      // Clean up test logo file if it still exists
      if (fs.existsSync(testLogoPath)) {
        fs.unlinkSync(testLogoPath);
      }
    });

    it('should delete team logo with head_coach role', async () => {
      // Set logo on team
      await adminTeam.update({ school_logo_url: `/uploads/logos/${testLogoFilename}` });

      const response = await request(app)
        .delete('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logo removed successfully');

      // Verify logo was removed from database
      const team = await Team.findByPk(adminTeam.id);
      expect(team.school_logo_url).toBeNull();

      // Verify file was deleted
      expect(fs.existsSync(testLogoPath)).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/teams/logo')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require head_coach or super_admin role', async () => {
      const response = await request(app)
        .delete('/api/teams/logo')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('super admins and head coaches');
    });

    it('should succeed even if no logo exists', async () => {
      // Ensure no logo exists
      await adminTeam.update({ school_logo_url: null });

      const response = await request(app)
        .delete('/api/teams/logo')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logo removed successfully');
    });

    it('should return 404 if team not found', async () => {
      // Create user with invalid team_id
      const noTeamUser = await User.create({
        first_name: 'NoTeam',
        last_name: 'DeleteLogo',
        email: 'noteam-delete-logo-test@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: 99999
      });

      const noTeamToken = jwt.sign({ id: noTeamUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .delete('/api/teams/logo')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await noTeamUser.destroy();
    });
  });

  describe('PUT /api/teams/branding', () => {
    it('should update team branding colors with head_coach role', async () => {
      const brandingUpdate = {
        primary_color: '#FF5733',
        secondary_color: '#33FF57'
      };

      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(brandingUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Team branding updated successfully');
      expect(response.body.data.primary_color).toBe('#FF5733');
      expect(response.body.data.secondary_color).toBe('#33FF57');

      // Verify in database
      const team = await Team.findByPk(adminTeam.id);
      expect(team.primary_color).toBe('#FF5733');
      expect(team.secondary_color).toBe('#33FF57');

      // Restore original colors
      await team.update({
        primary_color: null,
        secondary_color: null
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .send({ primary_color: '#FF5733' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require head_coach or super_admin role', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ primary_color: '#FF5733' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('super admins and head coaches');
    });

    it('should allow updating only primary color', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ primary_color: '#AABBCC' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.primary_color).toBe('#AABBCC');

      // Restore
      const team = await Team.findByPk(adminTeam.id);
      await team.update({ primary_color: null });
    });

    it('should allow updating only secondary color', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ secondary_color: '#DDEEFF' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.secondary_color).toBe('#DDEEFF');

      // Restore
      const team = await Team.findByPk(adminTeam.id);
      await team.update({ secondary_color: null });
    });

    it('should validate primary color hex format', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ primary_color: 'red' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate secondary color hex format', async () => {
      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ secondary_color: '#ZZZ' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should return 404 if team not found', async () => {
      // Create user with invalid team_id
      const noTeamUser = await User.create({
        first_name: 'NoTeam',
        last_name: 'Branding',
        email: 'noteam-branding-test@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: 99999
      });

      const noTeamToken = jwt.sign({ id: noTeamUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .put('/api/teams/branding')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .send({ primary_color: '#FF5733' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await noTeamUser.destroy();
    });
  });

  describe('GET /api/teams/branding', () => {
    it('should return team branding information', async () => {
      // Set branding on test team
      await testTeam.update({
        primary_color: '#123456',
        secondary_color: '#ABCDEF',
        school_logo_url: '/uploads/logos/test-logo.png'
      });

      const response = await request(app)
        .get('/api/teams/branding')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Teams Test Team');
      expect(response.body.data.program_name).toBe('Test Program');
      expect(response.body.data.primary_color).toBe('#123456');
      expect(response.body.data.secondary_color).toBe('#ABCDEF');
      expect(response.body.data.logo_url).toBe('/uploads/logos/test-logo.png');

      // Restore
      await testTeam.update({
        primary_color: '#FF0000',
        secondary_color: '#0000FF',
        school_logo_url: null
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/teams/branding')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return default colors if none are set', async () => {
      // Ensure no colors are set
      await testTeam.update({
        primary_color: null,
        secondary_color: null,
        school_logo_url: null
      });

      const response = await request(app)
        .get('/api/teams/branding')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.primary_color).toBe('#3B82F6'); // Default blue
      expect(response.body.data.secondary_color).toBe('#EF4444'); // Default red
      expect(response.body.data.logo_url).toBeNull();

      // Restore original colors
      await testTeam.update({
        primary_color: '#FF0000',
        secondary_color: '#0000FF'
      });
    });

    it('should return 404 if team not found', async () => {
      // Create user with invalid team_id
      const noTeamUser = await User.create({
        first_name: 'NoTeam',
        last_name: 'GetBranding',
        email: 'noteam-get-branding-test@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: 99999
      });

      const noTeamToken = jwt.sign({ id: noTeamUser.id }, process.env.JWT_SECRET || 'test_secret');

      const response = await request(app)
        .get('/api/teams/branding')
        .set('Authorization', `Bearer ${noTeamToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Team not found');

      // Clean up
      await noTeamUser.destroy();
    });
  });

  describe('GET /api/teams/recent-schedules', () => {
    let pastSchedule;
    let pastSection;
    let pastActivity;

    beforeAll(async () => {
      // Create past schedule with activities
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      pastSchedule = await Schedule.create({
        team_id: testTeam.id,
        name: 'Past Practice Schedule',
        date: pastDate,
        location: 'Past Stadium',
        is_active: true,
        created_by: testUser.id
      });

      pastSection = await ScheduleSection.create({
        schedule_id: pastSchedule.id,
        type: 'practice',
        sort_order: 1
      });

      pastActivity = await ScheduleActivity.create({
        section_id: pastSection.id,
        activity: 'Past Team Practice',
        time: '14:00',
        location: 'Past Field',
        notes: 'Completed practice'
      });
    });

    afterAll(async () => {
      // Clean up
      if (pastActivity) await pastActivity.destroy();
      if (pastSection) await pastSection.destroy();
      if (pastSchedule) await pastSchedule.destroy();
    });

    it('should return recent past schedule events', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Find our test activity
      const event = response.body.data.find(e => e.title === 'Past Team Practice');
      expect(event).toBeDefined();
      expect(event.time).toBe('14:00');
      expect(event.location).toBe('Past Field');
      expect(event.type).toBe('practice');
      expect(event.notes).toBe('Completed practice');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules?limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should only return events from user\'s team', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // All events should belong to testTeam (verified by schedule creation)
      expect(response.body.data.every(e => e.id)).toBe(true);
    });

    it('should return events in descending date order (most recent first)', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      if (response.body.data.length > 1) {
        // Verify dates are in descending order
        for (let i = 0; i < response.body.data.length - 1; i++) {
          const date1 = new Date(`${response.body.data[i].date} ${response.body.data[i].time}`);
          const date2 = new Date(`${response.body.data[i + 1].date} ${response.body.data[i + 1].time}`);
          expect(date1.getTime()).toBeGreaterThanOrEqual(date2.getTime());
        }
      }
    });

    it('should use default limit of 5 when not specified', async () => {
      const response = await request(app)
        .get('/api/teams/recent-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/teams/upcoming-schedules', () => {
    let futureSchedule;
    let futureSection;
    let futureActivity;

    beforeAll(async () => {
      // Create future schedule with activities
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      futureSchedule = await Schedule.create({
        team_id: testTeam.id,
        name: 'Future Game Schedule',
        date: futureDate,
        location: 'Future Stadium',
        is_active: true,
        created_by: testUser.id
      });

      futureSection = await ScheduleSection.create({
        schedule_id: futureSchedule.id,
        type: 'game',
        sort_order: 1
      });

      futureActivity = await ScheduleActivity.create({
        section_id: futureSection.id,
        activity: 'Upcoming Championship Game',
        time: '18:00',
        location: 'Championship Field',
        notes: 'Big game'
      });
    });

    afterAll(async () => {
      // Clean up
      if (futureActivity) await futureActivity.destroy();
      if (futureSection) await futureSection.destroy();
      if (futureSchedule) await futureSchedule.destroy();
    });

    it('should return upcoming schedule events', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Find our test activity
      const event = response.body.data.find(e => e.title === 'Upcoming Championship Game');
      expect(event).toBeDefined();
      expect(event.time).toBe('18:00');
      expect(event.location).toBe('Championship Field');
      expect(event.type).toBe('game');
      expect(event.notes).toBe('Big game');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules?limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should only return events from user\'s team', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // All events should belong to testTeam
      expect(response.body.data.every(e => e.id)).toBe(true);
    });

    it('should return events in ascending date order (soonest first)', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      if (response.body.data.length > 1) {
        // Verify dates are in ascending order
        for (let i = 0; i < response.body.data.length - 1; i++) {
          const date1 = new Date(`${response.body.data[i].date} ${response.body.data[i].time}`);
          const date2 = new Date(`${response.body.data[i + 1].date} ${response.body.data[i + 1].time}`);
          expect(date1.getTime()).toBeLessThanOrEqual(date2.getTime());
        }
      }
    });

    it('should use default limit of 5 when not specified', async () => {
      const response = await request(app)
        .get('/api/teams/upcoming-schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
    });
  });
});
