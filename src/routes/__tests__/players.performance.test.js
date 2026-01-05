const request = require('supertest');
const app = require('../../server');
const { Player, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
const jwt = require('jsonwebtoken');

describe('Player Performance API', () => {
  let authToken;
  let testUser;
  let testTeam;
  const testPlayers = [];

  beforeAll(async () => {
    // Ensure we're using the test database
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

    // Sync database
    await sequelize.sync({ force: true });

    // Create test team
    testTeam = await Team.create({
      name: 'Test Team',
      program_name: 'Test Program',
      school: 'Test University',
      division: 'D1',
      conference: 'Test Conference',
      city: 'Test City',
      state: 'TS'
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Test',
      last_name: 'Coach',
      email: 'test@example.com',
      password: 'password123',
      role: 'coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign(
      {
        id: testUser.id,
        email: testUser.email,
        role: testUser.role,
        team_id: testUser.team_id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Create test players with various statistics
    const playersData = [
      {
        first_name: 'John',
        last_name: 'Slugger',
        position: '1B',
        school_type: 'COLL',
        status: 'active',
        batting_avg: 0.325,
        home_runs: 15,
        rbi: 45,
        stolen_bases: 5,
        era: null,
        wins: null,
        losses: null,
        strikeouts: null,
        innings_pitched: null,
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Mike',
        last_name: 'Fastball',
        position: 'P',
        school_type: 'COLL',
        status: 'active',
        batting_avg: 0.180,
        home_runs: 0,
        rbi: 2,
        stolen_bases: 0,
        era: 2.45,
        wins: 8,
        losses: 3,
        strikeouts: 95,
        innings_pitched: 85.1,
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Tony',
        last_name: 'Speedster',
        position: 'CF',
        school_type: 'HS',
        status: 'active',
        batting_avg: 0.298,
        home_runs: 3,
        rbi: 22,
        stolen_bases: 25,
        era: null,
        wins: null,
        losses: null,
        strikeouts: null,
        innings_pitched: null,
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Sam',
        last_name: 'Benchwarmer',
        position: 'OF',
        school_type: 'HS',
        status: 'inactive',
        batting_avg: 0.195,
        home_runs: 1,
        rbi: 5,
        stolen_bases: 2,
        era: null,
        wins: null,
        losses: null,
        strikeouts: null,
        innings_pitched: null,
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        first_name: 'Rick',
        last_name: 'Closer',
        position: 'P',
        school_type: 'COLL',
        status: 'active',
        batting_avg: 0.000,
        home_runs: 0,
        rbi: 0,
        stolen_bases: 0,
        era: 1.85,
        wins: 3,
        losses: 1,
        strikeouts: 45,
        innings_pitched: 35.0,
        team_id: testTeam.id,
        created_by: testUser.id
      }
    ];

    for (const playerData of playersData) {
      const player = await Player.create(playerData);
      testPlayers.push(player);
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /api/players/performance', () => {
    it('should return performance data for all active players by default', async () => {
      const response = await request(app)
        .get('/api/players/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(4); // 4 active players
      expect(response.body.summary).toHaveProperty('total_players', 4);
      expect(response.body.summary).toHaveProperty('team_batting_avg');
      expect(response.body.summary).toHaveProperty('team_era');

      // Check that each player has required fields
      const player = response.body.data[0];
      expect(player).toHaveProperty('id');
      expect(player).toHaveProperty('first_name');
      expect(player).toHaveProperty('last_name');
      expect(player).toHaveProperty('position');
      expect(player).toHaveProperty('rank');
      expect(player).toHaveProperty('calculated_stats');
      expect(player).toHaveProperty('display_stats');
      expect(player.calculated_stats).toHaveProperty('performance_score');
      expect(player.display_stats).toHaveProperty('batting_avg');
    });

    it('should filter by position', async () => {
      const response = await request(app)
        .get('/api/players/performance?position=P')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2); // 2 active pitchers
      response.body.data.forEach(player => {
        expect(player.position).toBe('P');
      });
    });

    it('should filter by school type', async () => {
      const response = await request(app)
        .get('/api/players/performance?school_type=COLL')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3); // 3 active college players
      response.body.data.forEach(player => {
        expect(player.school_type).toBe('COLL');
      });
    });

    it('should include inactive players when status filter is set', async () => {
      const response = await request(app)
        .get('/api/players/performance?status=inactive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1); // 1 inactive player
      expect(response.body.data[0].status).toBe('inactive');
    });

    it('should sort by batting average in descending order by default', async () => {
      const response = await request(app)
        .get('/api/players/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const battingAvgs = response.body.data.map(p => parseFloat(p.display_stats.batting_avg));

      // Check that batting averages are in descending order
      for (let i = 1; i < battingAvgs.length; i++) {
        expect(battingAvgs[i]).toBeLessThanOrEqual(battingAvgs[i - 1]);
      }
    });

    it('should sort by home runs when specified', async () => {
      const response = await request(app)
        .get('/api/players/performance?sort_by=home_runs&order=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const homeRuns = response.body.data.map(p => p.home_runs || 0);

      // Check that home runs are in descending order
      for (let i = 1; i < homeRuns.length; i++) {
        expect(homeRuns[i]).toBeLessThanOrEqual(homeRuns[i - 1]);
      }
    });

    it('should sort by ERA when specified', async () => {
      const response = await request(app)
        .get('/api/players/performance?sort_by=era&order=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Filter only pitchers (those with ERA values)
      const pitchers = response.body.data.filter(p => p.position === 'P');
      const eras = pitchers.map(p => parseFloat(p.display_stats.era));

      // Check that ERAs are in ascending order
      for (let i = 1; i < eras.length; i++) {
        expect(eras[i]).toBeGreaterThanOrEqual(eras[i - 1]);
      }
    });

    it('should calculate performance scores correctly', async () => {
      const response = await request(app)
        .get('/api/players/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Find John Slugger (position player)
      const slugger = response.body.data.find(p => p.first_name === 'John');
      expect(slugger).toBeDefined();
      expect(slugger.calculated_stats.performance_score).toBeGreaterThan(0);

      // Find Mike Fastball (pitcher)
      const pitcher = response.body.data.find(p => p.first_name === 'Mike');
      expect(pitcher).toBeDefined();
      expect(pitcher.calculated_stats.performance_score).toBeGreaterThan(0);
      expect(pitcher.calculated_stats.k9).toBeGreaterThan(0);
    });

    it('should limit results when limit parameter is provided', async () => {
      const response = await request(app)
        .get('/api/players/performance?limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should assign proper rankings', async () => {
      const response = await request(app)
        .get('/api/players/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Check that rankings are sequential starting from 1
      const ranks = response.body.data.map(p => p.rank);
      expect(ranks[0]).toBe(1);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i]).toBe(ranks[i - 1] + 1);
      }
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/players/performance')
        .expect(401);
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/players/performance?position=INVALID&sort_by=invalid_stat')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toBeDefined();
    });

    it('should handle empty results gracefully', async () => {
      const response = await request(app)
        .get('/api/players/performance?position=DH') // No DH players in test data
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.summary.total_players).toBe(0);
    });

    it('should only return players from the user\'s team', async () => {
      // Create another team and player
      const otherTeam = await Team.create({
        name: 'Other Team',
        program_name: 'Other Program',
        school: 'Other University',
        division: 'D1',
        conference: 'Other Conference',
        city: 'Other City',
        state: 'OT'
      });

      await Player.create({
        first_name: 'Other',
        last_name: 'Player',
        position: 'SS',
        school_type: 'COLL',
        status: 'active',
        batting_avg: 0.400,
        home_runs: 20,
        rbi: 50,
        stolen_bases: 10,
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/players/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should still only return players from testUser's team
      expect(response.body.data).toHaveLength(4);
      response.body.data.forEach(player => {
        expect(player.team_id).toBe(testTeam.id);
      });
    });
  });
});
