'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, PlayerSeasonStats } = require('../../models');

let team, team2, user, user2, authToken, authToken2;

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

  // Create 5 players on team 1
  const players = await Player.bulkCreate([
    { first_name: 'Alex', last_name: 'Smith', position: 'SS', jersey_number: 1, team_id: team.id, created_by: user.id },
    { first_name: 'Ben', last_name: 'Jones', position: 'CF', jersey_number: 2, team_id: team.id, created_by: user.id },
    { first_name: 'Carlos', last_name: 'Garcia', position: '1B', jersey_number: 3, team_id: team.id, created_by: user.id },
    { first_name: 'Derek', last_name: 'Brown', position: 'P', jersey_number: 4, team_id: team.id, created_by: user.id },
    { first_name: 'Evan', last_name: 'White', position: 'P', jersey_number: 5, team_id: team.id, created_by: user.id }
  ]);

  // Seed season stats with varied batting averages and ERAs
  await PlayerSeasonStats.bulkCreate([
    {
      player_id: players[0].id, team_id: team.id, season: '2025-26',
      at_bats: 200, hits: 77, batting_average: 0.385, home_runs: 15, rbi: 45,
      doubles: 10, triples: 2, stolen_bases: 12,
      on_base_percentage: 0.450, slugging_percentage: 0.600, ops: 1.050,
      source_system: 'presto'
    },
    {
      player_id: players[1].id, team_id: team.id, season: '2025-26',
      at_bats: 180, hits: 63, batting_average: 0.350, home_runs: 10, rbi: 38,
      doubles: 8, triples: 5, stolen_bases: 20,
      on_base_percentage: 0.410, slugging_percentage: 0.540, ops: 0.950,
      source_system: 'presto'
    },
    {
      player_id: players[2].id, team_id: team.id, season: '2025-26',
      at_bats: 190, hits: 57, batting_average: 0.300, home_runs: 20, rbi: 55,
      doubles: 12, triples: 0, stolen_bases: 3,
      on_base_percentage: 0.370, slugging_percentage: 0.580, ops: 0.950,
      source_system: 'presto'
    },
    {
      player_id: players[3].id, team_id: team.id, season: '2025-26',
      at_bats: 30, hits: 6, batting_average: 0.200, home_runs: 0, rbi: 3,
      innings_pitched: 80.0, pitching_wins: 8, pitching_losses: 2,
      earned_runs: 20, era: 2.25, whip: 1.05, k_per_9: 10.50, bb_per_9: 2.50,
      strikeouts_pitching: 95, saves: 0,
      source_system: 'presto'
    },
    {
      player_id: players[4].id, team_id: team.id, season: '2025-26',
      at_bats: 15, hits: 3, batting_average: 0.200, home_runs: 0, rbi: 1,
      innings_pitched: 60.0, pitching_wins: 5, pitching_losses: 4,
      earned_runs: 25, era: 3.75, whip: 1.30, k_per_9: 8.00, bb_per_9: 3.50,
      strikeouts_pitching: 55, saves: 5,
      source_system: 'presto'
    }
  ]);

  // Create a player + stats on team 2 for isolation tests
  const otherPlayer = await Player.create({
    first_name: 'Rival', last_name: 'Player', position: '2B',
    jersey_number: 99, team_id: team2.id, created_by: user2.id
  });
  await PlayerSeasonStats.create({
    player_id: otherPlayer.id, team_id: team2.id, season: '2025-26',
    at_bats: 200, hits: 80, batting_average: 0.400, home_runs: 25, rbi: 60,
    source_system: 'presto'
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/games/leaderboard', () => {
  it('should return ranked batting average leaders DESC', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=batting_average')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stat).toBe('batting_average');
    expect(res.body.data.season).toBe('2025-26');
    expect(res.body.data.leaders.length).toBeGreaterThanOrEqual(1);
    // First leader should have highest batting average
    expect(res.body.data.leaders[0].rank).toBe(1);
    expect(Number(res.body.data.leaders[0].value)).toBeCloseTo(0.385, 2);
    expect(res.body.data.leaders[0].player.first_name).toBe('Alex');
  });

  it('should return ERA leaders in ASC order', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=era')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // ERA is ASC — lower is better
    const leaders = res.body.data.leaders;
    expect(leaders.length).toBeGreaterThanOrEqual(2);
    expect(Number(leaders[0].value)).toBeLessThanOrEqual(Number(leaders[1].value));
  });

  it('should apply min_qualifier filter', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=batting_average&min_qualifier=195')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // Only players with at_bats >= 195 should appear (Alex at 200, Carlos at 190 excluded)
    const leaders = res.body.data.leaders;
    expect(leaders.length).toBe(1);
    expect(leaders[0].player.first_name).toBe('Alex');
  });

  it('should respect limit parameter', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=home_runs&limit=3')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.leaders.length).toBeLessThanOrEqual(3);
  });

  it('should return 400 without stat parameter', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it('should return 400 for unsupported stat', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=invalid_stat')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it('should exclude other team\'s stats (team isolation)', async () => {
    const res = await request(app)
      .get('/api/v1/games/leaderboard?stat=batting_average')
      .set('Authorization', `Bearer ${authToken}`);

    // The other team's 0.400 BA player should NOT appear
    const playerNames = res.body.data.leaders.map(l => l.player.first_name);
    expect(playerNames).not.toContain('Rival');
  });
});
