const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Game, Player } = require('../../models');
const jwt = require('jsonwebtoken');

// Helper function for creating test games
const createTestGame = (attrs = {}) => {
  return Game.create({
    opponent: 'Test Opponent',
    game_date: new Date('2024-03-15'),
    home_away: 'home',
    result: 'W',
    team_score: 5,
    opponent_score: 3,
    season: '2024',
    location: 'Test Stadium',
    team_id: global.testTeam.id,
    created_by: global.testUser.id,
    ...attrs
  });
};

const createOtherTeamGame = (attrs = {}) => {
  return Game.create({
    opponent: 'Other Opponent',
    game_date: new Date('2024-03-15'),
    home_away: 'away',
    result: 'L',
    team_score: 2,
    opponent_score: 5,
    season: '2024',
    location: 'Away Stadium',
    team_id: global.otherTeam.id,
    created_by: global.otherUser.id,
    ...attrs
  });
};

// Global test setup - runs once before all test suites
beforeAll(async () => {
  await sequelize.authenticate();

  // Use timestamp to ensure unique email addresses
  const timestamp = Date.now();

  // Create global test teams
  global.testTeam = await Team.create({
    name: `Games Test Team ${timestamp}`,
    program_name: 'Games Test Team Program'
  });

  global.otherTeam = await Team.create({
    name: `Other Games Test Team ${timestamp}`,
    program_name: 'Other Games Test Team Program'
  });

  // Create global test users
  global.testUser = await User.create({
    first_name: 'Games',
    last_name: 'TestUser',
    email: `games-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.testTeam.id
  });

  global.otherUser = await User.create({
    first_name: 'Other',
    last_name: 'User',
    email: `other-games-test-${timestamp}@example.com`,
    password: 'TestP@ss1',
    role: 'head_coach',
    team_id: global.otherTeam.id
  });

  // Generate auth tokens
  global.authToken = jwt.sign({ id: global.testUser.id }, process.env.JWT_SECRET || 'test_secret');
  global.otherAuthToken = jwt.sign({ id: global.otherUser.id }, process.env.JWT_SECRET || 'test_secret');
});

// Global test cleanup - runs once after all test suites
afterAll(async () => {
  await Game.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
  await global.testUser.destroy();
  await global.otherUser.destroy();
  await global.testTeam.destroy();
  await global.otherTeam.destroy();
  await sequelize.close();
});

// Clean up between tests
afterEach(async () => {
  await Game.destroy({ where: {}, force: true });
  await Player.destroy({ where: {}, force: true });
});

describe('Games API - Read Operations', () => {
  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      const response = await request(app)
        .get('/api/v1/games')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of games for authenticated user team', async () => {
      await createTestGame({ opponent: 'Yankees' });
      await createTestGame({ opponent: 'Red Sox' });

      const response = await request(app)
        .get('/api/v1/games')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
    });

    it('should only return games for user team (team isolation)', async () => {
      await createTestGame({ opponent: 'Test Team Game' });
      await createOtherTeamGame({ opponent: 'Other Team Game' });

      const response = await request(app)
        .get('/api/v1/games')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].opponent).toBe('Test Team Game');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/games')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should sort games by game_date DESC by default', async () => {
      await createTestGame({
        opponent: 'Oldest Game',
        game_date: new Date('2024-01-01')
      });
      await createTestGame({
        opponent: 'Newest Game',
        game_date: new Date('2024-03-01')
      });
      await createTestGame({
        opponent: 'Middle Game',
        game_date: new Date('2024-02-01')
      });

      const response = await request(app)
        .get('/api/v1/games')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(3);

      const dates = response.body.data.map(g => new Date(g.game_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/games/byId/:id', () => {
    it('should return specific game by id', async () => {
      const game = await createTestGame({ opponent: 'Specific Team' });

      const response = await request(app)
        .get(`/api/v1/games/byId/${game.id}`)
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.opponent).toBe('Specific Team');
      expect(response.body.data.id).toBe(game.id);
    });

    it('should not return games from other teams (team isolation)', async () => {
      const otherGame = await createOtherTeamGame({ opponent: 'Other Team Game' });

      const response = await request(app)
        .get(`/api/v1/games/byId/${otherGame.id}`)
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Game not found');
    });

    it('should return 404 for non-existent game', async () => {
      const response = await request(app)
        .get('/api/v1/games/byId/99999')
        .set('Authorization', `Bearer ${global.authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Game not found');
    });

    it('should require authentication', async () => {
      const game = await createTestGame();

      const response = await request(app)
        .get(`/api/v1/games/byId/${game.id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
