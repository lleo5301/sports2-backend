'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, ScoutingReport } = require('../../models');

let team, user, authToken, player;
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
    email: 'scout@test.com',
    password: 'TestPass123!',
    first_name: 'Test',
    last_name: 'Scout',
    role: 'head_coach',
    team_id: team.id
  });

  player = await Player.create({
    first_name: 'Jake',
    last_name: 'Wilson',
    position: 'SS',
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

describe('Scouting Reports - Tool Grades', () => {
  let reportId;

  const fullToolGrades = {
    body: { grade: 60, projection: 'Positive Projection', description: 'Athletic frame' },
    athleticism: { grade: 80, description: 'Quick twitch athlete' },
    bat: {
      hit: { present: 30, future: 50, description: 'Developing approach' },
      power: { present: 30, future: 40 },
      raw_power: { present: 40, future: 50 },
      bat_speed: { present: 55, future: 55 },
      contact: 'Above Average',
      swing_decisions: 'Average',
      contact_quality: 'Below Average'
    },
    field: {
      arm_strength: { present: 55, future: 55, description: 'Has carry' },
      arm_accuracy: { present: 70, future: 70 },
      current_position: 'SS',
      defense_present: 50,
      future_positions: [
        { position: 'SS', pct: 60, grade: 60, description: 'Can stay at SS' },
        { position: 'CF', pct: 40, grade: 60, description: 'Plus CF if needed' }
      ]
    },
    run: {
      speed: { grade: 80 },
      times_to_first: '4.26',
      baserunning: { grade: 60, description: 'Needs to cut corners' },
      instincts: { grade: 55 },
      compete: { grade: 70, description: 'Football mentality' }
    }
  };

  describe('POST /api/v1/reports/scouting - new fields', () => {
    it('should create a report with tool_grades and metadata', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-10',
          event_type: 'game',
          report_type: 'hitter',
          role: 4,
          round_would_take: '5th-7th',
          money_save: false,
          overpay: false,
          dollar_amount: '400k',
          report_confidence: 'High',
          impact_statement: 'HS SS all arrows pointing up',
          summary: 'Athletic shortstop with plus speed and arm strength.',
          look_recommendation: 50,
          look_recommendation_desc: 'Worth a look',
          player_comparison: 'Trea Turner',
          date_seen_start: '2026-03-10',
          date_seen_end: '2026-03-10',
          video_report: false,
          tool_grades: fullToolGrades
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      reportId = data.id;

      expect(data.report_type).toBe('hitter');
      expect(data.role).toBe(4);
      expect(data.round_would_take).toBe('5th-7th');
      expect(data.money_save).toBe(false);
      expect(data.report_confidence).toBe('High');
      expect(data.impact_statement).toBe('HS SS all arrows pointing up');
      expect(data.summary).toContain('Athletic shortstop');
      expect(data.look_recommendation).toBe(50);
      expect(data.player_comparison).toBe('Trea Turner');
      expect(data.date_seen_start).toBe('2026-03-10');
      expect(data.video_report).toBe(false);

      // tool_grades roundtrip
      expect(data.tool_grades).toBeDefined();
      expect(data.tool_grades.body.grade).toBe(60);
      expect(data.tool_grades.bat.hit.present).toBe(30);
      expect(data.tool_grades.bat.contact).toBe('Above Average');
      expect(data.tool_grades.field.future_positions).toHaveLength(2);
      expect(data.tool_grades.run.speed.grade).toBe(80);
    });

    it('should create a report with only metadata, no tool_grades', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-11',
          report_type: 'hitter',
          role: 3,
          report_confidence: 'Medium',
          summary: 'Quick look report.'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.report_type).toBe('hitter');
      expect(res.body.data.role).toBe(3);
      expect(res.body.data.tool_grades).toBeNull();
    });
  });

  describe('Validation - 422 errors', () => {
    it('should reject invalid grade value in tool_grades', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-11',
          tool_grades: {
            body: { grade: 33 }
          }
        });

      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0]).toContain('body.grade');
    });

    it('should reject invalid enum in tool_grades', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-11',
          tool_grades: {
            bat: { contact: 'Terrible' }
          }
        });

      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toContain('bat.contact');
    });

    it('should reject invalid position code', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-11',
          tool_grades: {
            field: { current_position: 'SHORTSTOP' }
          }
        });

      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toContain('field.current_position');
    });
  });

  describe('GET /api/v1/reports/scouting/:id - new fields', () => {
    it('should return tool_grades as parsed JSON object', async () => {
      const res = await agent
        .get(`/api/v1/reports/scouting/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tool_grades).toBeDefined();
      expect(typeof res.body.data.tool_grades).toBe('object');
      expect(res.body.data.tool_grades.body.grade).toBe(60);
      expect(res.body.data.report_type).toBe('hitter');
      expect(res.body.data.player_comparison).toBe('Trea Turner');
    });
  });

  describe('PUT /api/v1/reports/scouting/:id - new fields', () => {
    it('should update tool_grades and metadata fields', async () => {
      const res = await agent
        .put(`/api/v1/reports/scouting/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          role: 5,
          report_confidence: 'Low',
          tool_grades: {
            body: { grade: 65, projection: 'Positive Projection' },
            run: { speed: { grade: 75 } }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe(5);
      expect(res.body.data.report_confidence).toBe('Low');
      expect(res.body.data.tool_grades.body.grade).toBe(65);
      expect(res.body.data.tool_grades.run.speed.grade).toBe(75);
    });

    it('should reject invalid tool_grades on update', async () => {
      const res = await agent
        .put(`/api/v1/reports/scouting/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          tool_grades: { body: { grade: 99 } }
        });

      expect(res.status).toBe(422);
    });
  });

  describe('Backward compatibility', () => {
    it('should create a legacy report without new fields', async () => {
      const res = await agent
        .post('/api/v1/reports/scouting')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          report_date: '2026-03-09',
          event_type: 'game',
          overall_present: 55,
          overall_future: 60,
          hitting_present: 50,
          overall_notes: 'Legacy style report'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.report_type).toBeNull();
      expect(res.body.data.tool_grades).toBeNull();
      expect(res.body.data.overall_notes).toBe('Legacy style report');
    });

    it('should list both legacy and new-style reports', async () => {
      const res = await agent
        .get(`/api/v1/reports/scouting?player_id=${player.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const hasLegacy = res.body.data.some(r => r.tool_grades === null);
      const hasNew = res.body.data.some(r => r.tool_grades !== null);
      expect(hasLegacy).toBe(true);
      expect(hasNew).toBe(true);
    });
  });
});
