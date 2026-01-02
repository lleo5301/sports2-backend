const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Game } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Games API', () => {
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
      email: 'games-test@example.com',
      password: 'password123',
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await Game.destroy({ where: { team_id: testTeam.id } });
    await testUser.destroy();
    await testTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up games before each test
    await Game.destroy({ where: { team_id: testTeam.id } });
  });

  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return user team games only', async () => {
      // Create game for test team
      await Game.create({
        opponent: 'Test Opponent',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create another team and game (should not appear in results)
      const otherTeam = await Team.create({
        name: 'Other Team',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      await Game.create({
        opponent: 'Other Team Opponent',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        team_id: otherTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].opponent).toBe('Test Opponent');
      expect(response.body.data[0].team_id).toBe(testTeam.id);

      // Cleanup
      await otherTeam.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/games')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    describe('Search functionality', () => {
      beforeEach(async () => {
        // Create test games with different data
        await Game.create({
          opponent: 'Eagles',
          game_date: new Date('2024-05-15'),
          home_away: 'home',
          location: 'Memorial Stadium',
          season: '2024',
          notes: 'Important playoff game',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        await Game.create({
          opponent: 'Tigers',
          game_date: new Date('2024-05-20'),
          home_away: 'away',
          location: 'Riverside Park',
          season: '2024',
          notes: 'Regular season game',
          team_id: testTeam.id,
          created_by: testUser.id
        });

        await Game.create({
          opponent: 'Bears',
          game_date: new Date('2024-06-01'),
          home_away: 'home',
          location: 'Home Field',
          season: 'Fall 2024',
          notes: 'Championship match',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      });

      it('should search by opponent name', async () => {
        const response = await request(app)
          .get('/api/games?search=Eagles')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should search by location', async () => {
        const response = await request(app)
          .get('/api/games?search=Riverside')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].location).toBe('Riverside Park');
        expect(response.body.data[0].opponent).toBe('Tigers');
      });

      it('should search by season', async () => {
        const response = await request(app)
          .get('/api/games?search=Fall')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].season).toBe('Fall 2024');
        expect(response.body.data[0].opponent).toBe('Bears');
      });

      it('should search by notes', async () => {
        const response = await request(app)
          .get('/api/games?search=playoff')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].notes).toContain('playoff');
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should perform case-insensitive search', async () => {
        const response = await request(app)
          .get('/api/games?search=EAGLES')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should return empty array when search has no matches', async () => {
        const response = await request(app)
          .get('/api/games?search=NonexistentTeam')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.pagination.total).toBe(0);
      });

      it('should return all games when search is empty', async () => {
        const response = await request(app)
          .get('/api/games?search=')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(3);
      });

      it('should combine search with season filter', async () => {
        const response = await request(app)
          .get('/api/games?search=2024&season=2024')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data.every(game => game.season === '2024')).toBe(true);
      });

      it('should combine search with result filter', async () => {
        // Update one game to have a result
        await Game.update(
          { result: 'W', team_score: 5, opponent_score: 3 },
          { where: { opponent: 'Eagles', team_id: testTeam.id } }
        );

        await Game.update(
          { result: 'L', team_score: 2, opponent_score: 4 },
          { where: { opponent: 'Tigers', team_id: testTeam.id } }
        );

        const response = await request(app)
          .get('/api/games?search=2024&result=W')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].result).toBe('W');
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should search across multiple fields', async () => {
        // Search term that appears in multiple fields
        const response = await request(app)
          .get('/api/games?search=Memorial')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].location).toContain('Memorial');
      });

      it('should handle partial matches', async () => {
        const response = await request(app)
          .get('/api/games?search=Eag')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should validate search parameter type', async () => {
        const response = await request(app)
          .get('/api/games?search[]=invalid')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Validation failed');
      });
    });
  });

  describe('POST /api/games', () => {
    it('should create a new game', async () => {
      const gameData = {
        opponent: 'New Opponent',
        game_date: '2024-06-15T14:00:00.000Z',
        home_away: 'home',
        location: 'Test Stadium',
        season: '2024',
        notes: 'Test game'
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send(gameData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.opponent).toBe('New Opponent');
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should require opponent field', async () => {
      const gameData = {
        game_date: '2024-06-15T14:00:00.000Z',
        home_away: 'home'
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send(gameData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });
  });

  describe('GET /api/games/byId/:id', () => {
    it('should return specific game', async () => {
      const game = await Game.create({
        opponent: 'Specific Opponent',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        location: 'Test Location',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/games/byId/${game.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(game.id);
      expect(response.body.data.opponent).toBe('Specific Opponent');
    });

    it('should return 404 for non-existent game', async () => {
      const response = await request(app)
        .get('/api/games/byId/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Game not found');
    });
  });

  describe('PUT /api/games/byId/:id', () => {
    it('should update game', async () => {
      const game = await Game.create({
        opponent: 'Original Opponent',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const updateData = {
        opponent: 'Updated Opponent',
        game_date: '2024-05-15T14:00:00.000Z',
        home_away: 'away',
        team_score: 5,
        opponent_score: 3,
        result: 'W'
      };

      const response = await request(app)
        .put(`/api/games/byId/${game.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.opponent).toBe('Updated Opponent');
      expect(response.body.data.result).toBe('W');
    });
  });

  describe('DELETE /api/games/byId/:id', () => {
    it('should delete game', async () => {
      const game = await Game.create({
        opponent: 'To Delete',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/games/byId/${game.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Game deleted successfully');

      // Verify hard delete
      const deletedGame = await Game.findByPk(game.id);
      expect(deletedGame).toBeNull();
    });
  });
});
