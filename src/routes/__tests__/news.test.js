'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, NewsRelease } = require('../../models');

let team, team2, user, user2, authToken, authToken2;
let player1;
let newsIds = [];

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

  player1 = await Player.create({
    first_name: 'Marcus', last_name: 'Rivera', position: 'P',
    jersey_number: 21, team_id: team.id, created_by: user.id
  });

  // Seed 5 news releases: 2 with player_id, varied categories
  const releases = await NewsRelease.bulkCreate([
    {
      team_id: team.id, title: 'Rivera Named Player of the Week',
      content: 'Full content here...', summary: 'Rivera earned the honor after a 3-HR game.',
      category: 'awards', player_id: player1.id,
      publish_date: '2026-02-15', source_system: 'presto'
    },
    {
      team_id: team.id, title: 'Rivera Pitches Complete Game Shutout',
      content: 'Detailed game recap...', summary: 'Rivera tossed 9 scoreless innings.',
      category: 'recap', player_id: player1.id,
      publish_date: '2026-02-12', source_system: 'presto'
    },
    {
      team_id: team.id, title: 'Team Wins Championship',
      content: 'Championship details...', summary: 'Test University claims title.',
      category: 'recap',
      publish_date: '2026-02-10', source_system: 'presto'
    },
    {
      team_id: team.id, title: 'New Facility Announced',
      content: 'Building plans...', summary: 'State-of-the-art baseball facility coming.',
      category: 'announcement',
      publish_date: '2026-02-08', source_system: 'presto'
    },
    {
      team_id: team.id, title: 'Season Preview 2026',
      content: 'Preview article...', summary: 'What to expect this season.',
      category: 'preview',
      publish_date: '2026-02-05', source_system: 'presto'
    }
  ]);
  newsIds = releases.map(r => r.id);

  // News for team2 (isolation)
  await NewsRelease.create({
    team_id: team2.id, title: 'Other Team News',
    content: 'Private content', summary: 'Not visible to team 1.',
    category: 'recap',
    publish_date: '2026-02-14', source_system: 'presto'
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/news', () => {
  it('should return paginated news releases', async () => {
    const res = await request(app)
      .get('/api/v1/news')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.total).toBe(5);
    // Ordered by publish_date DESC
    expect(res.body.data[0].title).toBe('Rivera Named Player of the Week');
    // Content should be excluded from list view
    expect(res.body.data[0].content).toBeUndefined();
  });

  it('should filter by category', async () => {
    const res = await request(app)
      .get('/api/v1/news?category=recap')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    res.body.data.forEach(item => {
      expect(item.category).toBe('recap');
    });
  });

  it('should filter by player_id', async () => {
    const res = await request(app)
      .get(`/api/v1/news?player_id=${player1.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    res.body.data.forEach(item => {
      expect(item.player_id).toBe(player1.id);
    });
  });

  it('should search by title and summary (ILIKE)', async () => {
    const res = await request(app)
      .get('/api/v1/news?search=championship')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Team Wins Championship');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/v1/news');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/news/byId/:id', () => {
  it('should return a single news release with full content', async () => {
    const res = await request(app)
      .get(`/api/v1/news/byId/${newsIds[0]}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Rivera Named Player of the Week');
    expect(res.body.data.content).toBe('Full content here...');
    expect(res.body.data.player.first_name).toBe('Marcus');
  });

  it('should return 404 for other team\'s news', async () => {
    // Get the team2 news ID
    const otherNews = await NewsRelease.findOne({ where: { team_id: team2.id } });
    const res = await request(app)
      .get(`/api/v1/news/byId/${otherNews.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
