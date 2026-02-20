const { sequelize, User, Team, Player, Game, GameStatistic, PlayerSeasonStats } = require('../../models');
const app = require('../../server');
const request = require('supertest');
const jwt = require('jsonwebtoken');

let token, team, player;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({
    name: 'Miami Dade',
    program_name: 'Miami Dade Baseball',
    sport: 'baseball',
    wins: 15,
    losses: 8,
    conference_wins: 8,
    conference_losses: 4,
    team_batting_stats: { avg: '.272', ops: '.714', r: '83', hr: '7' },
    team_pitching_stats: { era: '3.57', whip: '1.30', pk: '115' },
    team_fielding_stats: { fpct: '.952', e: '24' },
    stats_last_synced_at: new Date()
  });

  const user = await User.create({
    email: 'coach@test.com',
    password: 'Test1234!',
    first_name: 'Coach',
    last_name: 'Test',
    role: 'head_coach',
    team_id: team.id
  });

  token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  player = await Player.create({
    first_name: 'Jendy',
    last_name: 'Gonzalez',
    position: 'SS',
    school_type: 'COLL',
    status: 'active',
    team_id: team.id,
    created_by: user.id
  });

  await PlayerSeasonStats.create({
    player_id: player.id,
    team_id: team.id,
    season: 'current',
    at_bats: 50,
    hits: 15,
    batting_average: 0.300,
    home_runs: 1,
    rbi: 8,
    source_system: 'presto',
    raw_stats: { avg: '.300', ops: '.788' }
  });

  const game = await Game.create({
    opponent: 'FSW',
    game_date: new Date('2026-02-15'),
    home_away: 'away',
    result: 'W',
    team_score: 5,
    opponent_score: 3,
    team_id: team.id,
    created_by: user.id,
    game_status: 'completed',
    team_stats: { avg: '.280', hr: '2', era: '2.00' },
    game_summary: 'W, 5-3',
    running_record: '15-8',
    running_conference_record: '8-4'
  });

  await GameStatistic.create({
    game_id: game.id,
    player_id: player.id,
    team_id: team.id,
    at_bats: 4,
    hits: 2,
    runs: 1,
    rbi: 1,
    position_played: 'SS'
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/teams/dashboard', () => {
  it('should return full coach dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/teams/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.record.wins).toBe(15);
    expect(res.body.data.team_batting.avg).toBe('.272');
    expect(res.body.data.team_pitching.era).toBe('3.57');
    expect(res.body.data.recent_games).toHaveLength(1);
    expect(res.body.data.recent_games[0].game_summary).toBe('W, 5-3');
  });
});

describe('GET /api/v1/teams/game-log', () => {
  it('should return team game log', async () => {
    const res = await request(app)
      .get('/api/v1/teams/game-log')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.games).toHaveLength(1);
    expect(res.body.data.games[0].team_stats).toBeDefined();
    expect(res.body.data.games[0].running_record).toBe('15-8');
  });
});

describe('GET /api/v1/teams/aggregate-stats', () => {
  it('should return team aggregate stats', async () => {
    const res = await request(app)
      .get('/api/v1/teams/aggregate-stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.batting.avg).toBe('.272');
    expect(res.body.data.pitching.era).toBe('3.57');
  });
});

describe('GET /api/v1/teams/lineup', () => {
  it('should return lineup from most recent game', async () => {
    const res = await request(app)
      .get('/api/v1/teams/lineup')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.players.length).toBeGreaterThan(0);
    expect(res.body.data.players[0].position).toBe('SS');
  });
});
