// Unit-level tests for players route handlers internal logic
// We mock Express req/res and Sequelize models to verify behavior
const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Player, ScoutingReport } = require('../../models');
const jwt = require('jsonwebtoken');

describe('players routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../players');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});
describe('Players List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  const testPlayers = [];
  describe('GET /api/players/stats/summary', () => {
    let authToken;
    let testUser;
    let testTeam;
    let otherTeam;

    beforeAll(async () => {
    // Ensure database connection
      await sequelize.authenticate();

      // Create test team
      testTeam = await Team.create({
        name: 'Stats Test Team',
        program_name: 'Stats Test Team Program',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      // Create other team for isolation testing
      otherTeam = await Team.create({
        name: 'Other Stats Team',
        program_name: 'Other Stats Team Program',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      // Create test user
      testUser = await User.create({
        first_name: 'Stats',
        last_name: 'TestUser',
        email: 'stats-test@example.com',
        password: 'password123',
        role: 'head_coach',
        team_id: testTeam.id
      });

      // Generate auth token
      authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    });

    afterAll(async () => {
    // Clean up test data
      await ScoutingReport.destroy({
        where: {
          player_id: (await Player.findAll({
            where: {
              team_id: [testTeam.id, otherTeam.id]
            },
            attributes: ['id']
          })).map(p => p.id)
        }
      });
      await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
      await testUser.destroy();
      await testTeam.destroy();
      await otherTeam.destroy();
    });

    beforeEach(async () => {
    // Clean up players and reports before each test
      await ScoutingReport.destroy({
        where: {
          player_id: (await Player.findAll({
            where: {
              team_id: [testTeam.id, otherTeam.id]
            },
            attributes: ['id']
          })).map(p => p.id)
        }
      });
      await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    it('should return correct data structure with all 4 fields', async () => {
      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_players');
      expect(response.body.data).toHaveProperty('active_recruits');
      expect(response.body.data).toHaveProperty('recent_reports');
      expect(response.body.data).toHaveProperty('team_avg');
      expect(typeof response.body.data.total_players).toBe('number');
      expect(typeof response.body.data.active_recruits).toBe('number');
      expect(typeof response.body.data.recent_reports).toBe('number');
      expect(typeof response.body.data.team_avg).toBe('number');
    });

    it('should handle empty data gracefully (return 0s, not errors)', async () => {
      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_players).toBe(0);
      expect(response.body.data.active_recruits).toBe(0);
      expect(response.body.data.recent_reports).toBe(0);
      expect(response.body.data.team_avg).toBe(0);
    });

    it('should return correct counts based on test data', async () => {
    // Create players with different school types and statuses
      const player1 = await Player.create({
        first_name: 'Active',
        last_name: 'HSRecruit',
        school_type: 'HS',
        position: 'P',
        status: 'active',
        batting_avg: 0.300,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const player2 = await Player.create({
        first_name: 'Inactive',
        last_name: 'HSRecruit',
        school_type: 'HS',
        position: 'C',
        status: 'inactive',
        batting_avg: 0.250,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const player3 = await Player.create({
        first_name: 'College',
        last_name: 'Player',
        school_type: 'COLL',
        position: '1B',
        status: 'active',
        batting_avg: 0.320,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create recent scouting report (within last 30 days)
      await ScoutingReport.create({
        player_id: player1.id,
        report_date: new Date(),
        overall_rating: 85,
        notes: 'Great potential',
        created_by: testUser.id
      });

      // Create old scouting report (older than 30 days - should not be counted)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      await ScoutingReport.create({
        player_id: player2.id,
        report_date: oldDate,
        overall_rating: 75,
        notes: 'Old report',
        created_by: testUser.id,
        created_at: oldDate
      });

      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_players).toBe(3); // All 3 players
      expect(response.body.data.active_recruits).toBe(1); // Only player1 is HS + active
      expect(response.body.data.recent_reports).toBe(1); // Only 1 report in last 30 days
      // Average: (0.300 + 0.250 + 0.320) / 3 = 0.29
      expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
    });

    it('should enforce team isolation (only count players from user team)', async () => {
    // Create players for test team
      await Player.create({
        first_name: 'Test',
        last_name: 'Player1',
        school_type: 'HS',
        position: 'P',
        status: 'active',
        batting_avg: 0.300,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Player.create({
        first_name: 'Test',
        last_name: 'Player2',
        school_type: 'HS',
        position: 'C',
        status: 'active',
        batting_avg: 0.280,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create players for other team (should NOT be counted)
      const otherPlayer = await Player.create({
        first_name: 'Other',
        last_name: 'Player1',
        school_type: 'HS',
        position: 'P',
        status: 'active',
        batting_avg: 0.350,
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      // Create scouting report for other team player
      await ScoutingReport.create({
        player_id: otherPlayer.id,
        report_date: new Date(),
        overall_rating: 90,
        notes: 'Other team report',
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should only count test team players, not other team
      expect(response.body.data.total_players).toBe(2);
      expect(response.body.data.active_recruits).toBe(2);
      expect(response.body.data.recent_reports).toBe(0); // No reports for test team
      // Average should only include test team: (0.300 + 0.280) / 2 = 0.29
      expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
    });

    it('should calculate team_avg correctly when some players have no batting_avg', async () => {
    // Create players with and without batting averages
      await Player.create({
        first_name: 'With',
        last_name: 'Avg',
        school_type: 'HS',
        position: 'P',
        status: 'active',
        batting_avg: 0.300,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Player.create({
        first_name: 'No',
        last_name: 'Avg',
        school_type: 'HS',
        position: 'C',
        status: 'active',
        batting_avg: null, // No batting average
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Player.create({
        first_name: 'Also',
        last_name: 'WithAvg',
        school_type: 'COLL',
        position: '1B',
        status: 'active',
        batting_avg: 0.280,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/v1/players/stats/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.total_players).toBe(3);
      // Average should only include non-null values: (0.300 + 0.280) / 2 = 0.29
      expect(response.body.data.team_avg).toBeCloseTo(0.29, 2);
    });
  });
});
