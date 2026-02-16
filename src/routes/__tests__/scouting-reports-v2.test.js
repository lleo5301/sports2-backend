'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, Prospect, ScoutingReport } = require('../../models');

let team, user, authToken, prospect, player;
const agent = request.agent(app);
let csrfToken;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({
    name: 'Test University',
    program_name: 'Test Baseball',
    division: 'D1',
    scouting_grade_scale: 'letter'
  });

  user = await User.create({
    email: 'coach@test.com',
    password: 'TestPass123!',
    first_name: 'Test',
    last_name: 'Coach',
    role: 'head_coach',
    team_id: team.id
  });

  prospect = await Prospect.create({
    first_name: 'John',
    last_name: 'Smith',
    primary_position: 'SS',
    school_type: 'HS',
    team_id: team.id,
    created_by: user.id
  });

  player = await Player.create({
    first_name: 'Mike',
    last_name: 'Jones',
    position: 'CF',
    team_id: team.id,
    created_by: user.id
  });

  authToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const csrfRes = await agent
    .get('/api/v1/auth/csrf-token')
    .set('Authorization', `Bearer ${authToken}`);
  csrfToken = csrfRes.body.token;
});

afterAll(async () => {
  await sequelize.close();
});

describe('Scouting Reports V2 - Prospect Support + Grade Conversion', () => {
  let prospectReportId;

  describe('POST /api/v1/prospects/:id/scouting-reports', () => {
    it('should create a scouting report for a prospect with numeric grades', async () => {
      const res = await agent
        .post(`/api/v1/prospects/${prospect.id}/scouting-reports`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          report_date: '2025-03-15',
          event_type: 'game',
          overall_present: 55,
          overall_future: 60,
          hitting_present: 50,
          hitting_future: 55,
          overall_notes: 'Strong hitter with good mechanics'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      expect(res.body.data.player_id).toBeNull();
      expect(res.body.data.created_by).toBe(user.id);
      // Grades returned in team's letter scale
      expect(res.body.data.overall_present).toBe('B');
      expect(res.body.data.overall_future).toBe('B+');
      expect(res.body.data.hitting_present).toBe('B-');
      expect(res.body.data.hitting_future).toBe('B');
      prospectReportId = res.body.data.id;
    });

    it('should create a scouting report with letter grades (auto-convert to numeric)', async () => {
      const res = await agent
        .post(`/api/v1/prospects/${prospect.id}/scouting-reports`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          report_date: '2025-03-20',
          event_type: 'showcase',
          overall_present: 'A',
          overall_future: 'A+',
          hitting_present: 'B+',
          hitting_future: 'A-',
          overall_notes: 'Elite bat speed'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      // Letter input auto-converted to numeric, then displayed in team scale (letter)
      expect(res.body.data.overall_present).toBe('A');
      expect(res.body.data.overall_future).toBe('A+');
      expect(res.body.data.hitting_present).toBe('B+');
      expect(res.body.data.hitting_future).toBe('A-');
    });

    it('should return 404 for non-existent prospect', async () => {
      const res = await agent
        .post('/api/v1/prospects/99999/scouting-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          report_date: '2025-03-15',
          event_type: 'game',
          overall_present: 55
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/prospects/:id/scouting-reports', () => {
    it('should list scouting reports for a prospect', async () => {
      const res = await agent
        .get(`/api/v1/prospects/${prospect.id}/scouting-reports`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      // All reports should be for this prospect
      expect(res.body.data.every((r) => r.prospect_id === prospect.id)).toBe(true);
    });

    it('should return grades in the team display scale (letter)', async () => {
      const res = await agent
        .get(`/api/v1/prospects/${prospect.id}/scouting-reports`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const report = res.body.data.find((r) => r.id === prospectReportId);
      expect(report).toBeDefined();
      // Verify grades are returned as letter grades (team scale is 'letter')
      expect(report.overall_present).toBe('B');
      expect(report.overall_future).toBe('B+');
    });
  });

  describe('PUT /api/v1/reports/scouting/:id', () => {
    it('should update a prospect scouting report', async () => {
      const res = await agent
        .put(`/api/v1/reports/scouting/${prospectReportId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          overall_present: 60,
          overall_notes: 'Updated evaluation - improved swing mechanics'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overall_notes).toBe('Updated evaluation - improved swing mechanics');
      // Grade converted to team display scale
      expect(res.body.data.overall_present).toBe('B+');
    });
  });

  describe('POST /api/v1/reports/scouting', () => {
    it('should still work with player_id flow', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2025-03-15',
          event_type: 'game',
          overall_present: 55,
          overall_future: 60,
          hitting_present: 50,
          overall_notes: 'Solid outfielder with good range'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.player_id).toBe(player.id);
      expect(res.body.data.prospect_id).toBeNull();
      // Grades returned in team display scale
      expect(res.body.data.overall_present).toBe('B');
      expect(res.body.data.overall_future).toBe('B+');
    });

    it('should work with prospect_id via reports endpoint', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          prospect_id: prospect.id,
          report_date: '2025-03-25',
          event_type: 'workout',
          overall_present: 'A-',
          overall_future: 'A',
          overall_notes: 'Impressive tools'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      expect(res.body.data.player_id).toBeNull();
      expect(res.body.data.overall_present).toBe('A-');
      expect(res.body.data.overall_future).toBe('A');
    });

    it('should reject when neither player_id nor prospect_id provided', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          report_date: '2025-03-15',
          event_type: 'game',
          overall_present: 55
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/reports/scouting', () => {
    it('should list scouting reports including prospect-based reports', async () => {
      const res = await agent
        .get('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should include both player-based and prospect-based reports
      const hasPlayerReport = res.body.data.some((r) => r.player_id !== null);
      const hasProspectReport = res.body.data.some((r) => r.prospect_id !== null);
      expect(hasPlayerReport).toBe(true);
      expect(hasProspectReport).toBe(true);
    });

    it('should filter by prospect_id query param', async () => {
      const res = await agent
        .get(`/api/v1/reports/scouting?prospect_id=${prospect.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.every((r) => r.prospect_id === prospect.id)).toBe(true);
    });

    it('should return grades in team display scale', async () => {
      const res = await agent
        .get('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Find a report with numeric grades set
      const reportWithGrades = res.body.data.find((r) => r.overall_present !== null);
      expect(reportWithGrades).toBeDefined();
      // Team is set to letter scale, so grades should be letter strings
      expect(typeof reportWithGrades.overall_present).toBe('string');
    });
  });

  describe('GET /api/v1/reports/scouting/:id', () => {
    it('should get a prospect-based scouting report by id', async () => {
      const res = await agent
        .get(`/api/v1/reports/scouting/${prospectReportId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(prospectReportId);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      // Grades in display scale
      expect(res.body.data.overall_present).toBe('B+');
    });
  });
});
