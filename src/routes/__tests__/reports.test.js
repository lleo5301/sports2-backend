const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Report, UserPermission, ScoutingReport, Player } = require('../../models');
const jwt = require('jsonwebtoken');

// Helper functions for creating test data
const createTestPlayer = (attrs = {}) => {
  return Player.create({
    team_id: global.testTeam.id,
    created_by: global.testUser.id,
    ...attrs
  });
};

const createOtherTeamPlayer = (attrs = {}) => {
  return Player.create({
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
    name: 'Reports Test Team',
    program_name: 'Reports Test Team Program'
  });

  global.otherTeam = await Team.create({
    name: 'Other Reports Test Team',
    program_name: 'Other Reports Test Team Program'
  });

  // Create global test users
  global.testUser = await User.create({
    first_name: 'Reports',
    last_name: 'TestUser',
    email: 'reports-test@example.com',
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.testTeam.id
  });

  global.otherUser = await User.create({
    first_name: 'Other',
    last_name: 'User',
    email: 'other-reports-test@example.com',
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.otherTeam.id
  });

  // Grant permissions to test user
  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'reports_view',
    is_granted: true
  });

  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'reports_create',
    is_granted: true
  });

  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'reports_edit',
    is_granted: true
  });

  await UserPermission.create({
    user_id: global.testUser.id,
    team_id: global.testTeam.id,
    permission_type: 'reports_delete',
    is_granted: true
  });

  // Grant permissions to other user
  await UserPermission.create({
    user_id: global.otherUser.id,
    team_id: global.otherTeam.id,
    permission_type: 'reports_view',
    is_granted: true
  });

  // Generate auth tokens
  global.authToken = jwt.sign({ id: global.testUser.id }, process.env.JWT_SECRET || 'test_secret');
  global.otherAuthToken = jwt.sign({ id: global.otherUser.id }, process.env.JWT_SECRET || 'test_secret');
});

// Global test cleanup - runs once after all test suites
afterAll(async () => {
  await Report.destroy({ where: {}, force: true });
  await ScoutingReport.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
  await UserPermission.destroy({ where: {}, force: true });
  await global.testUser.destroy();
  await global.otherUser.destroy();
  await global.testTeam.destroy();
  await global.otherTeam.destroy();
  await sequelize.close();
});

// Clean up between tests
afterEach(async () => {
  await Report.destroy({ where: {}, force: true });
  await ScoutingReport.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
});

describe('Reports API - Custom Reports CRUD', () => {
  describe('GET /api/reports', () => {
    it('should return empty array when no reports exist', async () => {
      const response = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of reports for authenticated user team', async () => {
      // Create test reports
      await Report.create({
        title: 'Test Report 1',
        type: 'custom',
        team_id: global.testTeam.id,
        created_by: global.testUser.id
      });

      await Report.create({
        title: 'Test Report 2',
        type: 'custom',
        team_id: global.testTeam.id,
        created_by: global.testUser.id
      });

      const response = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should only return reports for user team (team isolation)', async () => {
      // Create report for test team
      await Report.create({
        title: 'Test Team Report',
        type: 'custom',
        team_id: global.testTeam.id,
        created_by: global.testUser.id
      });

      // Create report for other team
      await Report.create({
        title: 'Other Team Report',
        type: 'custom',
        team_id: global.otherTeam.id,
        created_by: global.otherUser.id
      });

      const response = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].title).toBe('Test Team Report');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/reports')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

describe('Reports API - Scouting Reports', () => {
  let testPlayer;
  let otherTeamPlayer;

  beforeEach(async () => {
    // Create test players for scouting reports
    testPlayer = await createTestPlayer({
      first_name: 'John',
      last_name: 'Doe',
      position: 'P',
      school: 'Test High School'
    });

    otherTeamPlayer = await createOtherTeamPlayer({
      first_name: 'Other',
      last_name: 'Player',
      position: 'SS',
      school: 'Other High School'
    });
  });

  describe('GET /api/reports/scouting', () => {
    it('should return empty array when no scouting reports exist', async () => {
      const response = await request(app)
        .get('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of scouting reports for authenticated user team', async () => {
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: global.testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A',
        notes: 'Test notes'
      });

      const response = await request(app)
        .get('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
    });

    it('should only return reports for user team (team isolation)', async () => {
      // Create scouting report for test team player
      await ScoutingReport.create({
        player_id: testPlayer.id,
        created_by: global.testUser.id,
        report_date: '2024-01-15',
        overall_grade: 'A',
        notes: 'Test notes'
      });

      // Create scouting report for other team player
      await ScoutingReport.create({
        player_id: otherTeamPlayer.id,
        created_by: global.otherUser.id,
        report_date: '2024-01-15',
        overall_grade: 'B',
        notes: 'Other team notes'
      });

      const response = await request(app)
        .get('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].player_id).toBe(testPlayer.id);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/reports/scouting')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
