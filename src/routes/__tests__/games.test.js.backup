// Integration tests for games route handlers
// We use supertest for integration testing with the full app stack
const request = require('supertest');
const app = require('../../server');
const { Game, User, Team } = require('../../models');
const { sequelize } = require('../../config/database');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('games routes basic structure', () => {
  it('router has standard HTTP methods', () => {
    const router = require('../games');
    // sanity check to ensure router is created; Express router attaches methods
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});

describe('Games List Sorting API', () => {
  let authToken;
  let testUser;
  let testTeam;
  const testGames = [];

  beforeAll(async () => {
    // Ensure we're using the test database
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }

    // Sync database
    await sequelize.sync({ force: true });

    // Create test team
    testTeam = await Team.create({
      name: 'Games Test Team',
      program_name: 'Games Test Program'
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Games',
      last_name: 'TestUser',
      email: 'games-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
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
    await sequelize.close();
  });

  describe('GET /api/games - Default Sorting', () => {
    it('should sort by game_date DESC by default', async () => {
      const response = await request(app)
        .get('/api/v1/games')
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

  describe('GET /api/games - Sorting by game_date', () => {
    it('should sort by game_date ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=game_date&sortDirection=ASC')
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
        .get('/api/v1/games?orderBy=game_date&sortDirection=DESC')
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
        .get('/api/v1/games?orderBy=game_date&sortDirection=asc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const dates = response.body.data.map(g => new Date(g.game_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/games - Sorting by opponent', () => {
    it('should sort by opponent ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const opponents = response.body.data.map(g => g.opponent);
      expect(opponents).toEqual(['Athletics', 'Blue Jays', 'Cubs', 'Red Sox', 'Yankees']);
    });

    it('should sort by opponent DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const opponents = response.body.data.map(g => g.opponent);
      expect(opponents).toEqual(['Yankees', 'Red Sox', 'Cubs', 'Blue Jays', 'Athletics']);
    });
  });

  describe('GET /api/games - Sorting by home_away', () => {
    it('should sort by home_away ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=home_away&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const homeAway = response.body.data.map(g => g.home_away);
      // 'away' comes before 'home' alphabetically
      const awayCount = homeAway.filter(h => h === 'away').length;
      const homeCount = homeAway.filter(h => h === 'home').length;
      expect(awayCount).toBe(2);
      expect(homeCount).toBe(3);
      // Verify 'away' entries come first
      expect(homeAway[0]).toBe('away');
      expect(homeAway[1]).toBe('away');
    });

    it('should sort by home_away DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=home_away&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const homeAway = response.body.data.map(g => g.home_away);
      // 'home' comes before 'away' in descending order
      expect(homeAway[0]).toBe('home');
      expect(homeAway[1]).toBe('home');
      expect(homeAway[2]).toBe('home');
    });
  });

  describe('GET /api/games - Sorting by result', () => {
    it('should sort by result ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=result&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.map(g => g.result);
      // Alphabetical order: L, T, W
      expect(results[0]).toBe('L');
      expect(results[results.length - 1]).toBe('W');
    });

    it('should sort by result DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=result&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.map(g => g.result);
      // Reverse alphabetical order: W, T, L
      expect(results[0]).toBe('W');
      expect(results[results.length - 1]).toBe('L');
    });
  });

  describe('GET /api/games - Sorting by team_score', () => {
    it('should sort by team_score ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=team_score&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const scores = response.body.data.map(g => g.team_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });

    it('should sort by team_score DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=team_score&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const scores = response.body.data.map(g => g.team_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });
  });

  describe('GET /api/games - Sorting by opponent_score', () => {
    it('should sort by opponent_score ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent_score&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const scores = response.body.data.map(g => g.opponent_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });

    it('should sort by opponent_score DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent_score&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const scores = response.body.data.map(g => g.opponent_score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });
  });

  describe('GET /api/games - Sorting by season', () => {
    it('should sort by season ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=season&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const seasons = response.body.data.map(g => g.season);
      // '2023' should come before '2024'
      expect(seasons[0]).toBe('2023');
      expect(seasons[seasons.length - 1]).toBe('2024');
    });

    it('should sort by season DESC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=season&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const seasons = response.body.data.map(g => g.season);
      // '2024' should come before '2023'
      expect(seasons[0]).toBe('2024');
      expect(seasons[seasons.length - 1]).toBe('2023');
    });
  });

  describe('GET /api/games - Sorting by created_at', () => {
    it('should sort by created_at ASC', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=created_at&sortDirection=ASC')
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
        .get('/api/v1/games?orderBy=created_at&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const timestamps = response.body.data.map(g => new Date(g.created_at).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }
    });
  });

  describe('GET /api/games - Validation', () => {
    it('should return 400 for invalid orderBy column', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=invalid_column&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should return 400 for invalid sortDirection', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=game_date&sortDirection=INVALID')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for both invalid orderBy and sortDirection', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=bad_column&sortDirection=BAD_DIR')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/games - Sorting with Filters', () => {
    it('should sort filtered results by opponent (filter by season)', async () => {
      const response = await request(app)
        .get('/api/v1/games?season=2024&orderBy=opponent&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(4); // 4 games in 2024 season
      const opponents = response.body.data.map(g => g.opponent);
      expect(opponents).toEqual(['Blue Jays', 'Cubs', 'Red Sox', 'Yankees']);
    });

    it('should sort filtered results by game_date (filter by result)', async () => {
      const response = await request(app)
        .get('/api/v1/games?result=W&orderBy=game_date&sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(3); // 3 wins
      const dates = response.body.data.map(g => new Date(g.game_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });

    it('should sort filtered results with multiple filters', async () => {
      const response = await request(app)
        .get('/api/v1/games?season=2024&result=W&orderBy=team_score&sortDirection=DESC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2); // 2 wins in 2024
      const scores = response.body.data.map(g => g.team_score);
      expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    });
  });

  describe('GET /api/games - Sorting with Pagination', () => {
    it('should sort and paginate correctly', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent&sortDirection=ASC&page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.total).toBe(5);

      // First page should have Athletics and Blue Jays
      const opponents = response.body.data.map(g => g.opponent);
      expect(opponents).toEqual(['Athletics', 'Blue Jays']);
    });

    it('should maintain sort order across pages', async () => {
      const page1Response = await request(app)
        .get('/api/v1/games?orderBy=game_date&sortDirection=ASC&page=1&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const page2Response = await request(app)
        .get('/api/v1/games?orderBy=game_date&sortDirection=ASC&page=2&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(page1Response.body.success).toBe(true);
      expect(page2Response.body.success).toBe(true);

      const page1Dates = page1Response.body.data.map(g => new Date(g.game_date).getTime());
      const page2Dates = page2Response.body.data.map(g => new Date(g.game_date).getTime());

      // Last date on page 1 should be <= first date on page 2
      if (page2Dates.length > 0) {
        expect(page1Dates[page1Dates.length - 1]).toBeLessThanOrEqual(page2Dates[0]);
      }
    });
  });

  describe('GET /api/games - Edge Cases', () => {
    it('should use default sorting when only orderBy is provided', async () => {
      const response = await request(app)
        .get('/api/v1/games?orderBy=opponent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const opponents = response.body.data.map(g => g.opponent);
      // Should use DESC by default
      expect(opponents).toEqual(['Yankees', 'Red Sox', 'Cubs', 'Blue Jays', 'Athletics']);
    });

    it('should ignore sortDirection when orderBy is not provided', async () => {
      const response = await request(app)
        .get('/api/v1/games?sortDirection=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should fall back to default game_date DESC
      const dates = response.body.data.map(g => new Date(g.game_date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/games - Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/games')
        .expect(401);

      expect(response.body.success).toBe(false);
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
          .get('/api/v1/games?search=Eagles')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should search by location', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=Riverside')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].location).toBe('Riverside Park');
        expect(response.body.data[0].opponent).toBe('Tigers');
      });

      it('should search by season', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=Fall')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].season).toBe('Fall 2024');
        expect(response.body.data[0].opponent).toBe('Bears');
      });

      it('should search by notes', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=playoff')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].notes).toContain('playoff');
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should perform case-insensitive search', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=EAGLES')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should return empty array when search has no matches', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=NonexistentTeam')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(response.body.pagination.total).toBe(0);
      });

      it('should return all games when search is empty', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(3);
      });

      it('should combine search with season filter', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=2024&season=2024')
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
          .get('/api/v1/games?search=2024&result=W')
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
          .get('/api/v1/games?search=Memorial')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].location).toContain('Memorial');
      });

      it('should handle partial matches', async () => {
        const response = await request(app)
          .get('/api/v1/games?search=Eag')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].opponent).toBe('Eagles');
      });

      it('should validate search parameter type', async () => {
        const response = await request(app)
          .get('/api/v1/games?search[]=invalid')
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

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/games')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
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

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/v1/games')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
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
        .get(`/api/v1/games/byId/${game.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.opponent).toBe('Specific Opponent');
    });

    it('should only return games for user\'s team', async () => {
      // Create another team and game
      const otherTeam = await Team.create({
        name: 'Other Games Test Team',
        program_name: 'Other Games Test Program'
      });

      const otherUser = await User.create({
        first_name: 'Other',
        last_name: 'GamesUser',
        email: 'other-games-test@example.com',
        password: 'TestP@ss1',
        role: 'head_coach',
        team_id: otherTeam.id
      });

      const otherGame = await Game.create({
        opponent: 'Other Opponent',
        game_date: new Date('2024-05-01'),
        home_away: 'home',
        result: 'W',
        team_score: 10,
        opponent_score: 0,
        season: '2024',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      // Should not be able to access other team's game
      const response = await request(app)
        .get(`/api/v1/games/byId/${otherGame.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/games/byId/:id', () => {
    it('should delete a game', async () => {
      const game = await Game.create({
        opponent: 'Game To Delete',
        game_date: new Date('2024-07-01'),
        home_away: 'home',
        location: 'Test Location',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/v1/games/byId/${game.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
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
