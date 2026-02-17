'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, Game, GameStatistic, Roster, RosterEntry } = require('../../models');

let team, team2, user, user2, authToken, authToken2;
let player1, player2, player3;
let game1, game2;

const agent = request.agent(app);
const agent2 = request.agent(app);
let csrfToken, csrfToken2;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  // Team 1 — primary test team
  team = await Team.create({
    name: 'Test University',
    program_name: 'Test Baseball',
    division: 'D1'
  });

  user = await User.create({
    email: 'coach@test.com',
    password: 'TestPass123!',
    first_name: 'Test',
    last_name: 'Coach',
    role: 'head_coach',
    team_id: team.id
  });

  authToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Team 2 — for isolation tests
  team2 = await Team.create({
    name: 'Other University',
    program_name: 'Other Baseball',
    division: 'D2'
  });

  user2 = await User.create({
    email: 'coach2@test.com',
    password: 'TestPass123!',
    first_name: 'Other',
    last_name: 'Coach',
    role: 'head_coach',
    team_id: team2.id
  });

  authToken2 = jwt.sign({ id: user2.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Create test players
  player1 = await Player.create({
    first_name: 'Marcus', last_name: 'Rivera', position: 'P',
    jersey_number: 21, team_id: team.id, created_by: user.id
  });
  player2 = await Player.create({
    first_name: 'Jake', last_name: 'Wilson', position: 'C',
    jersey_number: 7, team_id: team.id, created_by: user.id
  });
  player3 = await Player.create({
    first_name: 'Tom', last_name: 'Adams', position: 'SS',
    jersey_number: 2, team_id: team.id, created_by: user.id
  });

  // Create test games
  game1 = await Game.create({
    opponent: 'Florida State', game_date: '2026-02-14', home_away: 'home',
    team_id: team.id, created_by: user.id
  });
  game2 = await Game.create({
    opponent: 'UCF', game_date: '2026-02-15', home_away: 'away',
    team_id: team.id, created_by: user.id
  });

  // Create game statistics for backfill testing
  await GameStatistic.bulkCreate([
    { game_id: game1.id, player_id: player1.id, team_id: team.id, position_played: 'P' },
    { game_id: game1.id, player_id: player2.id, team_id: team.id, position_played: 'C' },
    { game_id: game1.id, player_id: player3.id, team_id: team.id, position_played: 'SS' }
  ]);

  // Get CSRF tokens
  const csrfRes = await agent
    .get('/api/v1/auth/csrf-token')
    .set('Authorization', `Bearer ${authToken}`);
  csrfToken = csrfRes.body.token;

  const csrfRes2 = await agent2
    .get('/api/v1/auth/csrf-token')
    .set('Authorization', `Bearer ${authToken2}`);
  csrfToken2 = csrfRes2.body.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Rosters API', () => {
  let rosterId;

  // ─── Roster CRUD ────────────────────────────────────────

  describe('POST /api/v1/rosters', () => {
    it('should create a roster with required fields', async () => {
      const res = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Opening Day 2026',
          roster_type: 'game_day'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Opening Day 2026');
      expect(res.body.data.roster_type).toBe('game_day');
      expect(res.body.data.source).toBe('manual');
      expect(res.body.data.team_id).toBe(team.id);
      expect(res.body.data.created_by).toBe(user.id);
      expect(res.body.data.is_active).toBe(true);
      expect(res.body.data.entries).toEqual([]);
      rosterId = res.body.data.id;
    });

    it('should create a roster with game_id', async () => {
      const res = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'vs FSU - Feb 14',
          roster_type: 'game_day',
          game_id: game1.id,
          effective_date: '2026-02-14',
          description: 'Friday night roster'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.game_id).toBe(game1.id);
      expect(res.body.data.effective_date).toBe('2026-02-14');
      expect(res.body.data.description).toBe('Friday night roster');
    });

    it('should fail without required name', async () => {
      const res = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ roster_type: 'custom' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without required roster_type', async () => {
      const res = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Test Roster' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid game_id (wrong team)', async () => {
      // Create a game for team2
      const otherGame = await Game.create({
        opponent: 'Rival', game_date: '2026-03-01', home_away: 'home',
        team_id: team2.id, created_by: user2.id
      });

      const res = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Bad game ref',
          roster_type: 'game_day',
          game_id: otherGame.id
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Game not found/);
    });

    it('should fail without authentication', async () => {
      const res = await agent
        .post('/api/v1/rosters')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'No Auth', roster_type: 'custom' });

      expect(res.status).toBe(401);
    });

    it('should fail without CSRF token on POST', async () => {
      const res = await request(app)
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'No CSRF', roster_type: 'custom' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/rosters', () => {
    it('should list rosters for team', async () => {
      const res = await agent
        .get('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by roster_type', async () => {
      const res = await agent
        .get('/api/v1/rosters?roster_type=game_day')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((r) => r.roster_type === 'game_day')).toBe(true);
    });

    it('should filter by is_active', async () => {
      const res = await agent
        .get('/api/v1/rosters?is_active=true')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((r) => r.is_active === true)).toBe(true);
    });

    it('should include entry_count', async () => {
      const res = await agent
        .get('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // entry_count should be present (as string or number from sequelize literal)
      res.body.data.forEach((r) => {
        expect(r.entry_count).toBeDefined();
      });
    });

    it('should paginate results', async () => {
      const res = await agent
        .get('/api/v1/rosters?page=1&limit=1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.pagination.limit).toBe(1);
    });
  });

  describe('GET /api/v1/rosters/:id', () => {
    it('should get roster with entries and associations', async () => {
      const res = await agent
        .get(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(rosterId);
      expect(res.body.data.name).toBe('Opening Day 2026');
      expect(res.body.data.entries).toBeDefined();
      expect(res.body.data.Creator).toBeDefined();
      expect(res.body.data.Creator.id).toBe(user.id);
      expect(res.body.data.total_entries).toBeDefined();
    });

    it('should return 404 for non-existent roster', async () => {
      const res = await agent
        .get('/api/v1/rosters/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should not return another teams roster (team isolation)', async () => {
      const res = await agent2
        .get(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/rosters/:id', () => {
    it('should update roster metadata', async () => {
      const res = await agent
        .put(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          name: 'Opening Day 2026 (Updated)',
          description: 'Updated description',
          is_active: false
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Opening Day 2026 (Updated)');
      expect(res.body.data.description).toBe('Updated description');
      expect(res.body.data.is_active).toBe(false);
    });

    it('should not allow updating source', async () => {
      const res = await agent
        .put(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ source: 'presto' });

      expect(res.status).toBe(200);
      // source should still be manual (stripped from update)
      expect(res.body.data.source).toBe('manual');
    });
  });

  // ─── Entry Management ───────────────────────────────────

  describe('POST /api/v1/rosters/:id/players', () => {
    it('should add a single player to roster', async () => {
      const res = await agent
        .post(`/api/v1/rosters/${rosterId}/players`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          players: [{ player_id: player1.id, position: 'P', jersey_number: 21, order: 1 }]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.added).toBe(1);
      expect(res.body.data.entries[0].player_id).toBe(player1.id);
      expect(res.body.data.entries[0].position).toBe('P');
      expect(res.body.data.entries[0].Player).toBeDefined();
      expect(res.body.data.entries[0].Player.first_name).toBe('Marcus');
    });

    it('should add multiple players at once', async () => {
      const res = await agent
        .post(`/api/v1/rosters/${rosterId}/players`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          players: [
            { player_id: player2.id, position: 'C', order: 2 },
            { player_id: player3.id, position: 'SS', order: 3 }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.added).toBe(2);
    });

    it('should reject duplicate player in roster', async () => {
      const res = await agent
        .post(`/api/v1/rosters/${rosterId}/players`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          players: [{ player_id: player1.id }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already in roster/);
    });

    it('should reject player not on team', async () => {
      // Create a player on the other team
      const otherPlayer = await Player.create({
        first_name: 'Other', last_name: 'Guy', position: 'LF',
        team_id: team2.id, created_by: user2.id
      });

      const res = await agent
        .post(`/api/v1/rosters/${rosterId}/players`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          players: [{ player_id: otherPlayer.id }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not found on your team/);
    });
  });

  describe('PUT /api/v1/rosters/:id/players/:playerId', () => {
    it('should update entry position and status', async () => {
      const res = await agent
        .put(`/api/v1/rosters/${rosterId}/players/${player1.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'injured',
          notes: 'Hamstring, day-to-day'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('injured');
      expect(res.body.data.notes).toBe('Hamstring, day-to-day');
    });

    it('should return 404 for player not in roster', async () => {
      const res = await agent
        .put(`/api/v1/rosters/${rosterId}/players/99999`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ status: 'active' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/rosters/:id/players/:playerId', () => {
    it('should remove player from roster', async () => {
      const res = await agent
        .delete(`/api/v1/rosters/${rosterId}/players/${player3.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify removal
      const getRes = await agent
        .get(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const playerIds = getRes.body.data.entries.map((e) => e.player_id);
      expect(playerIds).not.toContain(player3.id);
    });
  });

  describe('GET /api/v1/rosters/:id (with entries)', () => {
    it('should reflect entry changes', async () => {
      const res = await agent
        .get(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // player1 (injured) and player2 should be present, player3 was removed
      expect(res.body.data.total_entries).toBe(2);
      const statuses = res.body.data.entries.map((e) => ({ id: e.player_id, status: e.status }));
      expect(statuses).toContainEqual({ id: player1.id, status: 'injured' });
      expect(statuses).toContainEqual({ id: player2.id, status: 'active' });
    });
  });

  // ─── Backfill ───────────────────────────────────────────

  describe('POST /api/v1/rosters/backfill', () => {
    it('should backfill specific game_ids', async () => {
      const res = await agent
        .post('/api/v1/rosters/backfill')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ game_ids: [game1.id] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.created).toBe(1);
      expect(res.body.data.rosters.length).toBe(1);
      expect(res.body.data.rosters[0].game_id).toBe(game1.id);
      expect(res.body.data.rosters[0].entries).toBe(3);
      expect(res.body.data.rosters[0].name).toMatch(/vs Florida State/);
      expect(res.body.data.rosters[0].name).toMatch(/PrestoSports/);
    });

    it('should skip already-backfilled games', async () => {
      const res = await agent
        .post('/api/v1/rosters/backfill')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ game_ids: [game1.id] });

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(0);
      expect(res.body.data.skipped).toBe(1);
    });

    it('should skip games without statistics', async () => {
      const res = await agent
        .post('/api/v1/rosters/backfill')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ game_ids: [game2.id] });

      expect(res.status).toBe(200);
      // game2 has no GameStatistic records
      expect(res.body.data.created).toBe(0);
      expect(res.body.data.skipped).toBe(1);
    });

    it('should use @ prefix for away games', async () => {
      // Add stats for game2 (away game) and backfill
      await GameStatistic.create({
        game_id: game2.id, player_id: player1.id, team_id: team.id, position_played: 'P'
      });

      const res = await agent
        .post('/api/v1/rosters/backfill')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ game_ids: [game2.id] });

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(1);
      expect(res.body.data.rosters[0].name).toMatch(/^@ UCF/);
    });

    it('should fail without game_ids or all flag', async () => {
      const res = await agent
        .post('/api/v1/rosters/backfill')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/game_ids.*all/);
    });
  });

  // ─── Delete Roster ──────────────────────────────────────

  describe('DELETE /api/v1/rosters/:id', () => {
    it('should delete roster and cascade entries', async () => {
      // Create a throwaway roster with an entry
      const createRes = await agent
        .post('/api/v1/rosters')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Delete Me', roster_type: 'custom' });

      const deleteId = createRes.body.data.id;

      // Add a player to it
      await agent
        .post(`/api/v1/rosters/${deleteId}/players`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({ players: [{ player_id: player1.id }] });

      // Delete
      const res = await agent
        .delete(`/api/v1/rosters/${deleteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify roster is gone
      const getRes = await agent
        .get(`/api/v1/rosters/${deleteId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(getRes.status).toBe(404);

      // Verify entries are gone too
      const entries = await RosterEntry.findAll({ where: { roster_id: deleteId } });
      expect(entries.length).toBe(0);
    });

    it('should not delete another teams roster', async () => {
      const res = await agent2
        .delete(`/api/v1/rosters/${rosterId}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .set('x-csrf-token', csrfToken2);

      expect(res.status).toBe(404);
    });
  });
});
