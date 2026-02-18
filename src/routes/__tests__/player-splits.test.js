'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, User, Team, Player, PlayerSeasonStats } = require('../../models');

let token, team, player, seasonStats;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({ name: 'Test University', program_name: 'Test Baseball', division: 'D1' });
  const user = await User.create({
    email: 'test@test.com',
    password: 'Test1234!',
    first_name: 'Test',
    last_name: 'User',
    role: 'head_coach',
    team_id: team.id
  });

  token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  player = await Player.create({
    first_name: 'Jendy',
    last_name: 'Gonzalez',
    position: 'SS',
    school_type: 'COLL',
    team_id: team.id,
    created_by: user.id
  });

  seasonStats = await PlayerSeasonStats.create({
    player_id: player.id,
    team_id: team.id,
    season: 'current',
    at_bats: 50,
    hits: 15,
    batting_average: 0.300,
    source_system: 'presto',
    raw_stats: { ab: '50', h: '15', avg: '.300', ops: '.788', hr: '1' },
    split_stats: {
      home: { ab: '14', h: '2', avg: '.143', ops: '.476' },
      away: { ab: '26', h: '8', avg: '.308', ops: '.806' },
      conference: { ab: '11', h: '5', avg: '.500' },
      vs_lhp: { ab: '6', h: '1', pct: '.167' },
      vs_rhp: { ab: '19', h: '2', pct: '.105' },
      risp: { record: '2-8', pct: '.250' },
      two_outs: { ab: '10', h: '3', pct: '.300' },
      bases_loaded: { ab: '2', h: '1', pct: '.500' }
    }
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/players/byId/:id/splits', () => {
  it('should return all split stats for a player', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/splits`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.splits).toBeDefined();
    expect(res.body.data.splits.home.avg).toBe('.143');
    expect(res.body.data.splits.away.avg).toBe('.308');
    expect(res.body.data.splits.vs_lhp.pct).toBe('.167');
    expect(res.body.data.splits.overall).toBeDefined();
    expect(res.body.data.splits.overall.avg).toBe('.300');
  });

  it('should return 404 for non-existent player', async () => {
    const res = await request(app)
      .get('/api/v1/players/byId/99999/splits')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/splits`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/players/byId/:id/stats/raw', () => {
  it('should return full raw stats', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/stats/raw`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.raw_stats.avg).toBe('.300');
    expect(res.body.data.raw_stats.hr).toBe('1');
  });
});
