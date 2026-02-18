'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, PlayerSeasonStats, PlayerCareerStats, PlayerVideo } = require('../../models');

let team, team2, user, user2, authToken, authToken2;
let player1, player2;
let otherPlayer;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({ name: 'Test University', program_name: 'Test Baseball', division: 'D1' });
  user = await User.create({
    email: 'coach@test.com', password: 'TestPass123!',
    first_name: 'Test', last_name: 'Coach', role: 'head_coach', team_id: team.id
  });
  authToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  team2 = await Team.create({ name: 'Other University', program_name: 'Other Baseball', division: 'D2' });
  user2 = await User.create({
    email: 'coach2@test.com', password: 'TestPass123!',
    first_name: 'Other', last_name: 'Coach', role: 'head_coach', team_id: team2.id
  });
  authToken2 = jwt.sign({ id: user2.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // Players on team 1
  player1 = await Player.create({
    first_name: 'Marcus', last_name: 'Rivera', position: 'P',
    jersey_number: 21, team_id: team.id, created_by: user.id
  });
  player2 = await Player.create({
    first_name: 'Jake', last_name: 'Wilson', position: 'C',
    jersey_number: 7, team_id: team.id, created_by: user.id
  });

  // Player on team 2 (for isolation tests)
  otherPlayer = await Player.create({
    first_name: 'John', last_name: 'Doe', position: 'SS',
    jersey_number: 5, team_id: team2.id, created_by: user2.id
  });

  // Seed season stats for player1 (2 seasons)
  await PlayerSeasonStats.bulkCreate([
    {
      player_id: player1.id, team_id: team.id, season: '2024-25',
      games_played: 40, at_bats: 150, hits: 45, home_runs: 8, rbi: 30,
      batting_average: 0.300, on_base_percentage: 0.380,
      slugging_percentage: 0.520, ops: 0.900,
      innings_pitched: 60.0, pitching_wins: 5, pitching_losses: 2,
      era: 3.50, whip: 1.20, source_system: 'presto'
    },
    {
      player_id: player1.id, team_id: team.id, season: '2025-26',
      games_played: 30, at_bats: 110, hits: 38, home_runs: 10, rbi: 28,
      batting_average: 0.345, on_base_percentage: 0.410,
      slugging_percentage: 0.580, ops: 0.990,
      innings_pitched: 50.0, pitching_wins: 6, pitching_losses: 1,
      era: 2.80, whip: 1.05, source_system: 'presto'
    }
  ]);

  // Seed career stats for player1
  await PlayerCareerStats.create({
    player_id: player1.id,
    seasons_played: 2, career_games: 70, career_at_bats: 260,
    career_hits: 83, career_home_runs: 18, career_rbi: 58,
    career_batting_average: 0.319, career_era: 3.10,
    source_system: 'presto'
  });

  // Seed videos for player1
  await PlayerVideo.bulkCreate([
    {
      player_id: player1.id, team_id: team.id,
      title: 'Highlight Reel', url: 'https://example.com/v1',
      video_type: 'highlight', published_at: '2026-01-15', source_system: 'presto'
    },
    {
      player_id: player1.id, team_id: team.id,
      title: 'Game Footage', url: 'https://example.com/v2',
      video_type: 'game', published_at: '2026-01-10', source_system: 'presto'
    },
    {
      player_id: player1.id, team_id: team.id,
      title: 'Interview', url: 'https://example.com/v3',
      video_type: 'interview', published_at: '2026-01-05', source_system: 'presto'
    }
  ]);
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/players/byId/:id/stats', () => {
  it('should return season and career stats for a player', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player1.id}/stats`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.player.id).toBe(player1.id);
    expect(res.body.data.player.first_name).toBe('Marcus');
    expect(res.body.data.seasons).toHaveLength(2);
    // Most recent season first
    expect(res.body.data.current_season.season).toBe('2025-26');
    expect(res.body.data.career).not.toBeNull();
    expect(res.body.data.career.career_home_runs).toBe(18);
  });

  it('should filter by season query param', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player1.id}/stats?season=2024-25`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toHaveLength(1);
    expect(res.body.data.seasons[0].season).toBe('2024-25');
    expect(Number(res.body.data.seasons[0].batting_average)).toBeCloseTo(0.300, 2);
  });

  it('should return 404 for other team\'s player', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${otherPlayer.id}/stats`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('should return empty seasons when no stats synced', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player2.id}/stats`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toHaveLength(0);
    expect(res.body.data.current_season).toBeNull();
    expect(res.body.data.career).toBeNull();
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player1.id}/stats`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/players/byId/:id/videos', () => {
  it('should return paginated videos', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player1.id}/videos`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
    // Ordered by published_at DESC
    expect(res.body.data[0].title).toBe('Highlight Reel');
  });

  it('should filter by video_type', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player1.id}/videos?video_type=highlight`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].video_type).toBe('highlight');
  });

  it('should return empty array when no videos', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player2.id}/videos`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});
