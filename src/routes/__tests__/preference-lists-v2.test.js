'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Player, Prospect, PreferenceList } = require('../../models');

let team, user, authToken, prospect, pitcher, player;
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

  // Create prospects for board and pref list tests
  prospect = await Prospect.create({
    first_name: 'John',
    last_name: 'Smith',
    primary_position: 'SS',
    school_type: 'HS',
    school_name: 'Lincoln High',
    city: 'Austin',
    state: 'TX',
    team_id: team.id,
    created_by: user.id
  });

  // Create a pitcher prospect (should now appear on recruiting board -- no more P/DH exclusion)
  pitcher = await Prospect.create({
    first_name: 'Tom',
    last_name: 'Pitcher',
    primary_position: 'P',
    school_type: 'JUCO',
    school_name: 'Juco College',
    city: 'Dallas',
    state: 'TX',
    team_id: team.id,
    created_by: user.id
  });

  // Create a player for backward-compatibility test
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

describe('Preference Lists V2 - Prospect Support + Pitchers Pref List', () => {
  describe('GET /api/v1/recruits (Recruiting Board)', () => {
    it('should return prospects (not players)', async () => {
      const res = await agent
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should have 2 prospects (John Smith SS + Tom Pitcher P)
      expect(res.body.data.length).toBe(2);
      // Data should have Prospect fields, not Player fields
      const names = res.body.data.map((p) => p.last_name);
      expect(names).toContain('Smith');
      expect(names).toContain('Pitcher');
      // Should use Prospect field names
      const firstResult = res.body.data[0];
      expect(firstResult).toHaveProperty('primary_position');
      expect(firstResult).toHaveProperty('school_name');
      // Player (Mike Jones) should NOT be in the results
      expect(names).not.toContain('Jones');
    });

    it('should include all positions (no P/DH exclusion)', async () => {
      const res = await agent
        .get('/api/v1/recruits')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Pitcher prospect should be included (no more P/DH exclusion)
      const positions = res.body.data.map((p) => p.primary_position);
      expect(positions).toContain('P');
      expect(positions).toContain('SS');
    });
  });

  describe('POST /api/v1/recruits/preference-lists', () => {
    it('should accept prospect_id', async () => {
      const res = await agent
        .post('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          prospect_id: prospect.id,
          list_type: 'hs_pref_list',
          priority: 1,
          interest_level: 'High'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      expect(res.body.data.player_id).toBeNull();
      expect(res.body.data.Prospect).toBeDefined();
      expect(res.body.data.Prospect.first_name).toBe('John');
    });

    it('should reject if both player_id and prospect_id provided', async () => {
      const res = await agent
        .post('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          prospect_id: prospect.id,
          list_type: 'overall_pref_list',
          priority: 1
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject if neither player_id nor prospect_id provided', async () => {
      const res = await agent
        .post('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          list_type: 'overall_pref_list',
          priority: 1
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should accept pitchers_pref_list list_type', async () => {
      const res = await agent
        .post('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          prospect_id: pitcher.id,
          list_type: 'pitchers_pref_list',
          priority: 1,
          interest_level: 'High'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.list_type).toBe('pitchers_pref_list');
      expect(res.body.data.prospect_id).toBe(pitcher.id);
    });

    it('should still accept player_id for backward compatibility', async () => {
      const res = await agent
        .post('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          player_id: player.id,
          list_type: 'new_players',
          priority: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.player_id).toBe(player.id);
      expect(res.body.data.prospect_id).toBeNull();
      expect(res.body.data.Player).toBeDefined();
      expect(res.body.data.Player.first_name).toBe('Mike');
    });
  });

  describe('GET /api/v1/recruits/preference-lists', () => {
    it('should return entries with Prospect association', async () => {
      const res = await agent
        .get('/api/v1/recruits/preference-lists')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Find a prospect-based entry
      const prospectEntry = res.body.data.find((e) => e.prospect_id !== null);
      expect(prospectEntry).toBeDefined();
      expect(prospectEntry.Prospect).toBeDefined();
      expect(prospectEntry.Prospect.first_name).toBeDefined();
      expect(prospectEntry.Prospect.primary_position).toBeDefined();

      // Find a player-based entry (backward compat)
      const playerEntry = res.body.data.find((e) => e.player_id !== null);
      expect(playerEntry).toBeDefined();
      expect(playerEntry.Player).toBeDefined();
      expect(playerEntry.Player.first_name).toBeDefined();
    });

    it('should filter by pitchers_pref_list list_type', async () => {
      const res = await agent
        .get('/api/v1/recruits/preference-lists?list_type=pitchers_pref_list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.every((e) => e.list_type === 'pitchers_pref_list')).toBe(true);
    });
  });
});
