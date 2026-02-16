'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Prospect, ProspectMedia } = require('../../models');

let team, user, authToken;

// Use supertest agent to maintain cookies (required for CSRF)
const agent = request.agent(app);
let csrfToken;

beforeAll(async () => {
  await sequelize.sync({ force: true });

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

  // Get CSRF token for state-changing requests
  const csrfRes = await agent
    .get('/api/v1/auth/csrf-token')
    .set('Authorization', `Bearer ${authToken}`);
  csrfToken = csrfRes.body.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Prospects API', () => {
  let prospectId;

  describe('POST /api/v1/prospects', () => {
    it('should create a prospect with required fields', async () => {
      const res = await agent
        .post('/api/v1/prospects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          first_name: 'John',
          last_name: 'Smith',
          primary_position: 'SS',
          school_type: 'HS',
          school_name: 'Lincoln High',
          city: 'Austin',
          state: 'TX',
          graduation_year: 2027
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.first_name).toBe('John');
      expect(res.body.data.last_name).toBe('Smith');
      expect(res.body.data.primary_position).toBe('SS');
      expect(res.body.data.team_id).toBe(team.id);
      expect(res.body.data.created_by).toBe(user.id);
      expect(res.body.data.status).toBe('identified');
      prospectId = res.body.data.id;
    });

    it('should fail without first_name', async () => {
      const res = await agent
        .post('/api/v1/prospects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          last_name: 'Smith',
          primary_position: 'SS'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without primary_position', async () => {
      const res = await agent
        .post('/api/v1/prospects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          first_name: 'John',
          last_name: 'Smith'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail without authentication', async () => {
      const res = await agent
        .post('/api/v1/prospects')
        .set('x-csrf-token', csrfToken)
        .send({
          first_name: 'John',
          last_name: 'Smith',
          primary_position: 'SS'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/prospects', () => {
    beforeAll(async () => {
      // Create additional prospects for filtering/search tests
      await Prospect.bulkCreate([
        { first_name: 'Mike', last_name: 'Johnson', primary_position: 'P', school_type: 'JUCO', status: 'evaluating', team_id: team.id, created_by: user.id },
        { first_name: 'Jake', last_name: 'Williams', primary_position: 'CF', school_type: 'HS', status: 'contacted', team_id: team.id, created_by: user.id },
        { first_name: 'Tom', last_name: 'Brown', primary_position: 'C', school_type: 'D1', status: 'identified', team_id: team.id, created_by: user.id }
      ]);
    });

    it('should list prospects for team', async () => {
      const res = await agent
        .get('/api/v1/prospects')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(4);
    });

    it('should filter by school_type', async () => {
      const res = await agent
        .get('/api/v1/prospects?school_type=JUCO')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((p) => p.school_type === 'JUCO')).toBe(true);
    });

    it('should filter by primary_position', async () => {
      const res = await agent
        .get('/api/v1/prospects?primary_position=P')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((p) => p.primary_position === 'P')).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await agent
        .get('/api/v1/prospects?status=evaluating')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((p) => p.status === 'evaluating')).toBe(true);
    });

    it('should search by name', async () => {
      const res = await agent
        .get('/api/v1/prospects?search=smith')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((p) => p.last_name === 'Smith')).toBe(true);
    });

    it('should paginate results', async () => {
      const res = await agent
        .get('/api/v1/prospects?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.pages).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/prospects/:id', () => {
    it('should get prospect with associations', async () => {
      const res = await agent
        .get(`/api/v1/prospects/${prospectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(prospectId);
      expect(res.body.data.first_name).toBe('John');
    });

    it('should return 404 for non-existent prospect', async () => {
      const res = await agent
        .get('/api/v1/prospects/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/prospects/:id', () => {
    it('should update prospect', async () => {
      const res = await agent
        .put(`/api/v1/prospects/${prospectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          status: 'evaluating',
          notes: 'Strong bat, needs to work on defense'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('evaluating');
      expect(res.body.data.notes).toBe('Strong bat, needs to work on defense');
    });
  });

  describe('DELETE /api/v1/prospects/:id', () => {
    it('should delete prospect', async () => {
      // Create a throwaway prospect to delete
      const createRes = await agent
        .post('/api/v1/prospects')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          first_name: 'Delete',
          last_name: 'Me',
          primary_position: 'RF'
        });

      const deleteId = createRes.body.data.id;

      const res = await agent
        .delete(`/api/v1/prospects/${deleteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's deleted
      const getRes = await agent
        .get(`/api/v1/prospects/${deleteId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getRes.status).toBe(404);
    });
  });
});
