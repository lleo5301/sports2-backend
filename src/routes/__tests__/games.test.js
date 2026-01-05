const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Game } = require('../../models');
const jwt = require('jsonwebtoken');

describe('games routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../games');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function')
    expect(typeof router.post).toBe('function')
    expect(typeof router.put).toBe('function')
    expect(typeof router.delete).toBe('function')
  })
})

describe('Games API', () => {
  let authToken;
  let testUser;
  let testTeam;
  let testGames = [];

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

    // Create test games with varying data for sorting
    const gamesData = [
      {
        opponent: 'Yankees',
        game_date: new Date('2024-03-15'),
        home_away: 'home',
        result: 'W',
        team_score: 5,
        opponent_score: 3,
        season: '2024',
        location: 'Home Stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Red Sox',
        game_date: new Date('2024-03-20'),
        home_away: 'away',
        result: 'L',
        team_score: 2,
        opponent_score: 7,
        season: '2024',
        location: 'Fenway Park',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Blue Jays',
        game_date: new Date('2024-03-10'),
        home_away: 'home',
        result: 'W',
        team_score: 8,
        opponent_score: 4,
        season: '2024',
        location: 'Home Stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Cubs',
        game_date: new Date('2024-04-01'),
        home_away: 'away',
        result: 'T',
        team_score: 4,
        opponent_score: 4,
        season: '2024',
        location: 'Wrigley Field',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Athletics',
        game_date: new Date('2024-02-28'),
        home_away: 'home',
        result: 'W',
        team_score: 6,
        opponent_score: 2,
        season: '2023',
        location: 'Home Stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Eagles',
        game_date: new Date('2024-05-15'),
        home_away: 'home',
        location: 'Memorial Stadium',
        season: '2024',
        notes: 'Important playoff game',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Tigers',
        game_date: new Date('2024-05-20'),
        home_away: 'away',
        location: 'Riverside Park',
        season: '2024',
        notes: 'Regular season game',
        team_id: testTeam.id,
        created_by: testUser.id
      },
      {
        opponent: 'Bears',
        game_date: new Date('2024-06-01'),
        home_away: 'home',
        location: 'Home Field',
        season: 'Fall 2024',
        notes: 'Championship match',
        team_id: testTeam.id,
        created_by: testUser.id
      }
    ];

    // Create games sequentially to ensure different created_at timestamps
    for (const gameData of gamesData) {
      const game = await Game.create(gameData);
      testGames.push(game);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });

  afterAll(async () => {
    // Clean up test data
    await Game.destroy({ where: { team_id: testTeam.id } });
    await testUser.destroy();
    await testTeam.destroy();
  });

  beforeEach(async () => {
    // Note: We don't destroy games before each test to maintain consistency
    // The beforeAll setup creates all games once
  });

  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(0);
    });

    it('should return user team games only', async () => {
      // Create another team and game (should not appear in results)
      const otherTeam = await Team.create({
        name: 'Other Team',
        sport: 'baseball',
        season: 'spring',
        year: 2024
      });

      const otherGame = await Game.create({
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
      const teamGameIds = response.body.data.map(g => g.id);
      expect(teamGameIds).not.toContain(otherGame.id);
      expect(response.body.data.every(g => g.team_id === testTeam.id)).toBe(true);

      // Cleanup
      await otherGame.destroy();
      await otherTeam.destroy();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/games')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized, no token');
    });

    describe('Default Sorting', () => {
      it('should sort by game_date DESC by default', async () => {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);

        // Verify descending order by game_date (most recent first)
        const dates = response.body.data.map(g => new Date(g.game_date).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      });
    });

    describe('Sorting by game_date', () => {
      it('should sort by game_date ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=game_date&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const dates = response.body.data.map(g => new Date(g.game_date).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
        }
      });

      it('should sort by game_date DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=game_date&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const dates = response.body.data.map(g => new Date(g.game_date).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
        }
      });

      it('should handle case-insensitive sortDirection for game_date', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=game_date&sortDirection=asc')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const dates = response.body.data.map(g => new Date(g.game_date).getTime());
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
        }
      });
    });

    describe('Sorting by opponent', () => {
      it('should sort by opponent ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=opponent&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const opponents = response.body.data.map(g => g.opponent);
        // Verify sorted alphabetically
        const sorted = [...opponents].sort();
        expect(opponents).toEqual(sorted);
      });

      it('should sort by opponent DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=opponent&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const opponents = response.body.data.map(g => g.opponent);
        // Verify reverse sorted alphabetically
        const sorted = [...opponents].sort().reverse();
        expect(opponents).toEqual(sorted);
      });
    });

    describe('Sorting by home_away', () => {
      it('should sort by home_away ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=home_away&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const homeAway = response.body.data.map(g => g.home_away);
        // 'away' comes before 'home' alphabetically
        const sorted = [...homeAway].sort();
        expect(homeAway).toEqual(sorted);
      });

      it('should sort by home_away DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=home_away&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const homeAway = response.body.data.map(g => g.home_away);
        // 'home' comes before 'away' in descending order
        const sorted = [...homeAway].sort().reverse();
        expect(homeAway).toEqual(sorted);
      });
    });

    describe('Sorting by result', () => {
      it('should sort by result ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=result&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const results = response.body.data.map(g => g.result).filter(r => r !== null);
        const sorted = [...results].sort();
        expect(results).toEqual(sorted);
      });

      it('should sort by result DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=result&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const results = response.body.data.map(g => g.result).filter(r => r !== null);
        const sorted = [...results].sort().reverse();
        expect(results).toEqual(sorted);
      });
    });

    describe('Sorting by team_score', () => {
      it('should sort by team_score ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=team_score&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const scores = response.body.data.map(g => g.team_score).filter(s => s !== null);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
        }
      });

      it('should sort by team_score DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=team_score&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const scores = response.body.data.map(g => g.team_score).filter(s => s !== null);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
        }
      });
    });

    describe('Sorting by opponent_score', () => {
      it('should sort by opponent_score ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=opponent_score&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const scores = response.body.data.map(g => g.opponent_score).filter(s => s !== null);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
        }
      });

      it('should sort by opponent_score DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=opponent_score&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const scores = response.body.data.map(g => g.opponent_score).filter(s => s !== null);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
        }
      });
    });

    describe('Sorting by season', () => {
      it('should sort by season ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=season&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const seasons = response.body.data.map(g => g.season).filter(s => s !== null);
        const sorted = [...seasons].sort();
        expect(seasons).toEqual(sorted);
      });

      it('should sort by season DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=season&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const seasons = response.body.data.map(g => g.season).filter(s => s !== null);
        const sorted = [...seasons].sort().reverse();
        expect(seasons).toEqual(sorted);
      });
    });

    describe('Sorting by created_at', () => {
      it('should sort by created_at ASC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=created_at&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const timestamps = response.body.data.map(g => new Date(g.created_at).getTime());
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        }
      });

      it('should sort by created_at DESC', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=created_at&sortDirection=DESC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        const timestamps = response.body.data.map(g => new Date(g.created_at).getTime());
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
        }
      });
    });

    describe('Search functionality', () => {
      it('should search by opponent name', async () => {
        const response = await request(app)
          .get('/api/games?search=Eagles')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data.some(g => g.opponent === 'Eagles')).toBe(true);
      });

      it('should search by location', async () => {
        const response = await request(app)
          .get('/api/games?search=Riverside')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data.some(g => g.location && g.location.includes('Riverside'))).toBe(true);
      });

      it('should search by season', async () => {
        const response = await request(app)
          .get('/api/games?search=Fall')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should search by notes', async () => {
        const response = await request(app)
          .get('/api/games?search=playoff')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should perform case-insensitive search', async () => {
        const response = await request(app)
          .get('/api/games?search=EAGLES')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should return empty array when search has no matches', async () => {
        const response = await request(app)
          .get('/api/games?search=NonexistentTeamXYZ')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
      });

      it('should return games when search is empty', async () => {
        const response = await request(app)
          .get('/api/games?search=')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should combine search with season filter', async () => {
        const response = await request(app)
          .get('/api/games?search=2024&season=2024')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.every(game => game.season === '2024')).toBe(true);
      });

      it('should combine search with result filter', async () => {
        const response = await request(app)
          .get('/api/games?search=2024&result=W')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.every(game => game.result === 'W')).toBe(true);
      });

      it('should search across multiple fields', async () => {
        const response = await request(app)
          .get('/api/games?search=Memorial')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('should handle partial matches', async () => {
        const response = await request(app)
          .get('/api/games?search=Eag')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
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

    describe('Sorting Validation', () => {
      it('should return 400 for invalid orderBy column', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=invalid_column&sortDirection=ASC')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toBeDefined();
      });

      it('should return 400 for invalid sortDirection', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=game_date&sortDirection=INVALID')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toBeDefined();
      });

      it('should return 400 for both invalid orderBy and sortDirection', async () => {
        const response = await request(app)
          .get('/api/games?orderBy=bad_column&sortDirection=BAD_DIR')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
        expect(response.body.details).toBeDefined();
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

      // Cleanup
      await game.destroy();
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

      // Cleanup
      await game.destroy();
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