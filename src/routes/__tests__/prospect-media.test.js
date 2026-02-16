'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const { sequelize, Team, User, Prospect, ProspectMedia } = require('../../models');

let team, user, authToken, prospect;

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

  // Create a prospect for media tests
  prospect = await Prospect.create({
    first_name: 'John',
    last_name: 'Smith',
    primary_position: 'SS',
    school_type: 'HS',
    team_id: team.id,
    created_by: user.id
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Prospect Media API', () => {
  describe('POST /api/v1/prospects/:id/media', () => {
    it('should upload a file', async () => {
      const res = await agent
        .post(`/api/v1/prospects/${prospect.id}/media`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .attach('file', Buffer.from('fake video content'), {
          filename: 'test.mp4',
          contentType: 'video/mp4'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      expect(res.body.data.uploaded_by).toBe(user.id);
      expect(res.body.data.media_type).toBe('video');
      expect(res.body.data.file_path).toBeDefined();
      expect(res.body.data.title).toBe('test.mp4');
    });

    it('should add an external URL', async () => {
      const res = await agent
        .post(`/api/v1/prospects/${prospect.id}/media`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          url: 'https://www.youtube.com/watch?v=abc123',
          media_type: 'video',
          title: 'Highlight Reel',
          description: 'Fall 2025 showcase highlights'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.prospect_id).toBe(prospect.id);
      expect(res.body.data.url).toBe('https://www.youtube.com/watch?v=abc123');
      expect(res.body.data.media_type).toBe('video');
      expect(res.body.data.title).toBe('Highlight Reel');
      expect(res.body.data.description).toBe('Fall 2025 showcase highlights');
      expect(res.body.data.file_path).toBeNull();
    });

    it('should fail for non-existent prospect', async () => {
      const res = await agent
        .post('/api/v1/prospects/99999/media')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          url: 'https://example.com/video.mp4',
          media_type: 'video',
          title: 'Some Video'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Prospect not found');
    });
  });

  describe('DELETE /api/v1/prospects/:id/media/:mediaId', () => {
    it('should delete media', async () => {
      // Create media via API first
      const createRes = await agent
        .post(`/api/v1/prospects/${prospect.id}/media`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          url: 'https://example.com/delete-me.mp4',
          media_type: 'video',
          title: 'Delete Me'
        });

      expect(createRes.status).toBe(201);
      const mediaId = createRes.body.data.id;

      const deleteRes = await agent
        .delete(`/api/v1/prospects/${prospect.id}/media/${mediaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-csrf-token', csrfToken);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.message).toBe('Media deleted successfully');

      // Verify it's actually gone
      const media = await ProspectMedia.findByPk(mediaId);
      expect(media).toBeNull();
    });

    it('should return 404 for wrong team', async () => {
      // Create second team and user
      const team2 = await Team.create({
        name: 'Other University',
        program_name: 'Other Baseball',
        division: 'D2'
      });

      const user2 = await User.create({
        email: 'coach2@test.com',
        password: 'TestPass123!',
        first_name: 'Other',
        last_name: 'Coach',
        role: 'head_coach',
        team_id: team2.id
      });

      const authToken2 = jwt.sign({ id: user2.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

      // Create a second agent for the second user
      const agent2 = request.agent(app);
      const csrfRes2 = await agent2
        .get('/api/v1/auth/csrf-token')
        .set('Authorization', `Bearer ${authToken2}`);
      const csrfToken2 = csrfRes2.body.token;

      // Create media on team 1's prospect
      const media = await ProspectMedia.create({
        prospect_id: prospect.id,
        uploaded_by: user.id,
        media_type: 'video',
        url: 'https://example.com/team1-only.mp4',
        title: 'Team 1 Only'
      });

      // Try to delete from team 2's user — should 404
      const deleteRes = await agent2
        .delete(`/api/v1/prospects/${prospect.id}/media/${media.id}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .set('x-csrf-token', csrfToken2);

      expect(deleteRes.status).toBe(404);
      expect(deleteRes.body.success).toBe(false);

      // Verify the media still exists
      const stillExists = await ProspectMedia.findByPk(media.id);
      expect(stillExists).not.toBeNull();
    });
  });
});
