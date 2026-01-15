const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Scout } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Scouts API - Complete CRUD Tests', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;
  let otherUser;
  let otherAuthToken;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test teams
    testTeam = await Team.create({
      name: 'Scouts Test Team',
      program_name: 'Scouts Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Scouts Test Team',
      program_name: 'Other Scouts Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Scouts',
      last_name: 'TestUser',
      email: 'scouts-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-scouts-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await Scout.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up scouts before each test
    await Scout.destroy({ where: {}, force: true });
  });

  describe('GET /api/scouts', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/scouts')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no scouts exist', async () => {
      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of scouts for authenticated user team', async () => {
      // Create test scouts
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        email: 'mjohnson@braves.com',
        phone: '555-1234',
        coverage_area: 'Georgia/Alabama',
        specialization: 'High School',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        email: 'swilliams@redsox.com',
        phone: '555-5678',
        coverage_area: 'Northeast',
        specialization: 'Pitching',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0]).toHaveProperty('Creator');
    });

    it('should enforce team isolation - users only see their team scouts', async () => {
      // Create scout for testTeam
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create scout for otherTeam
      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('Mike');
    });

    it('should return scouts ordered by created_at DESC', async () => {
      const scout1 = await Scout.create({
        first_name: 'First',
        last_name: 'Scout',
        organization_name: 'First Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const scout2 = await Scout.create({
        first_name: 'Second',
        last_name: 'Scout',
        organization_name: 'Second Org',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      // Most recent should be first
      expect(response.body.data[0].first_name).toBe('Second');
      expect(response.body.data[1].first_name).toBe('First');
    });

    it('should filter scouts by status - active (default)', async () => {
      await Scout.create({
        first_name: 'Active',
        last_name: 'Scout',
        organization_name: 'Active Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Inactive',
        last_name: 'Scout',
        organization_name: 'Inactive Org',
        position: 'Cross Checker',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('active');
    });

    it('should filter scouts by status - inactive', async () => {
      await Scout.create({
        first_name: 'Active',
        last_name: 'Scout',
        organization_name: 'Active Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Inactive',
        last_name: 'Scout',
        organization_name: 'Inactive Org',
        position: 'Cross Checker',
        status: 'inactive',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?status=inactive')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].status).toBe('inactive');
    });

    it('should filter scouts by position - Area Scout', async () => {
      await Scout.create({
        first_name: 'Area',
        last_name: 'Scout',
        organization_name: 'Test Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Cross',
        last_name: 'Checker',
        organization_name: 'Test Org',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?position=Area Scout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Area Scout');
    });

    it('should filter scouts by position - Cross Checker', async () => {
      await Scout.create({
        first_name: 'Area',
        last_name: 'Scout',
        organization_name: 'Test Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Cross',
        last_name: 'Checker',
        organization_name: 'Test Org',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?position=Cross Checker')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Cross Checker');
    });

    it('should filter scouts by position - National Cross Checker', async () => {
      await Scout.create({
        first_name: 'National',
        last_name: 'CrossChecker',
        organization_name: 'Test Org',
        position: 'National Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Cross',
        last_name: 'Checker',
        organization_name: 'Test Org',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?position=National Cross Checker')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('National Cross Checker');
    });

    it('should filter scouts by position - Scouting Director', async () => {
      await Scout.create({
        first_name: 'Scouting',
        last_name: 'Director',
        organization_name: 'Test Org',
        position: 'Scouting Director',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Area',
        last_name: 'Scout',
        organization_name: 'Test Org',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?position=Scouting Director')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].position).toBe('Scouting Director');
    });

    it('should search scouts by first name', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=Mike')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].first_name).toBe('Mike');
    });

    it('should search scouts by last name', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=Williams')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].last_name).toBe('Williams');
    });

    it('should search scouts by organization name', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=Braves')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].organization_name).toBe('Atlanta Braves');
    });

    it('should search scouts by email', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        email: 'mjohnson@braves.com',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        email: 'swilliams@redsox.com',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=mjohnson')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].email).toBe('mjohnson@braves.com');
    });

    it('should search scouts by coverage area', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        coverage_area: 'Georgia/Alabama',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        coverage_area: 'Northeast',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=Georgia')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].coverage_area).toBe('Georgia/Alabama');
    });

    it('should search scouts by specialization', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        specialization: 'High School',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Scout.create({
        first_name: 'Sarah',
        last_name: 'Williams',
        organization_name: 'Boston Red Sox',
        position: 'Cross Checker',
        specialization: 'Pitching',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts?search=Pitching')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].specialization).toBe('Pitching');
    });

    it('should support pagination', async () => {
      // Create 5 scouts
      for (let i = 1; i <= 5; i++) {
        await Scout.create({
          first_name: `Scout${i}`,
          last_name: 'Test',
          organization_name: `Org ${i}`,
          position: 'Area Scout',
          status: 'active',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      }

      const response = await request(app)
        .get('/api/scouts?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3
      });
    });

    it('should reject invalid status value', async () => {
      const response = await request(app)
        .get('/api/scouts?status=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid position value', async () => {
      const response = await request(app)
        .get('/api/scouts?position=InvalidPosition')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should include Creator information in response', async () => {
      await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].Creator).toHaveProperty('id');
      expect(response.body.data[0].Creator).toHaveProperty('first_name');
      expect(response.body.data[0].Creator).toHaveProperty('last_name');
      expect(response.body.data[0].Creator.id).toBe(testUser.id);
    });
  });

  describe('GET /api/scouts/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/scouts/123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return a single scout by ID', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        email: 'mjohnson@braves.com',
        phone: '555-1234',
        coverage_area: 'Georgia/Alabama',
        specialization: 'High School',
        notes: 'Excellent contact',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(scout.id);
      expect(response.body.data.first_name).toBe('Mike');
      expect(response.body.data.last_name).toBe('Johnson');
      expect(response.body.data.organization_name).toBe('Atlanta Braves');
      expect(response.body.data.position).toBe('Area Scout');
    });

    it('should return 404 for non-existent scout', async () => {
      const response = await request(app)
        .get('/api/scouts/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');
    });

    it('should enforce team isolation - cannot access other team scout', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');
    });

    it('should include Creator information in response', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toHaveProperty('id');
      expect(response.body.data.Creator).toHaveProperty('first_name');
      expect(response.body.data.Creator).toHaveProperty('last_name');
      expect(response.body.data.Creator.id).toBe(testUser.id);
    });
  });

  describe('POST /api/scouts', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a scout with required fields only', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.first_name).toBe('Mike');
      expect(response.body.data.last_name).toBe('Johnson');
      expect(response.body.data.organization_name).toBe('Atlanta Braves');
      expect(response.body.data.position).toBe('Area Scout');
      expect(response.body.data.status).toBe('active');
    });

    it('should create a scout with all fields', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          email: 'mjohnson@braves.com',
          phone: '555-1234',
          coverage_area: 'Georgia/Alabama',
          specialization: 'High School',
          notes: 'Excellent contact for Georgia area',
          last_contact_date: '2024-01-01',
          next_contact_date: '2024-02-01',
          contact_notes: 'Follow up on spring showcase'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Mike');
      expect(response.body.data.email).toBe('mjohnson@braves.com');
      expect(response.body.data.phone).toBe('555-1234');
      expect(response.body.data.coverage_area).toBe('Georgia/Alabama');
      expect(response.body.data.specialization).toBe('High School');
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify in database
      const scout = await Scout.findByPk(response.body.data.id);
      expect(scout.team_id).toBe(testTeam.id);
    });

    it('should auto-assign created_by from authenticated user', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify in database
      const scout = await Scout.findByPk(response.body.data.id);
      expect(scout.created_by).toBe(testUser.id);
    });

    it('should require first_name', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require last_name', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require organization_name', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require position', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept position: Area Scout', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Area Scout');
    });

    it('should accept position: Cross Checker', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Cross Checker'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Cross Checker');
    });

    it('should accept position: National Cross Checker', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'National Cross Checker'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('National Cross Checker');
    });

    it('should accept position: Scouting Director', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Scouting Director'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.position).toBe('Scouting Director');
    });

    it('should reject invalid position', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Invalid Position'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          email: 'invalid-email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate first_name max length (100 chars)', async () => {
      const longName = 'A'.repeat(101);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: longName,
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate last_name max length (100 chars)', async () => {
      const longName = 'A'.repeat(101);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: longName,
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate organization_name max length (200 chars)', async () => {
      const longOrgName = 'A'.repeat(201);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: longOrgName,
          position: 'Area Scout'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate phone max length (20 chars)', async () => {
      const longPhone = '1'.repeat(21);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          phone: longPhone
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email max length (255 chars)', async () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          email: longEmail
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate coverage_area max length (500 chars)', async () => {
      const longCoverage = 'A'.repeat(501);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          coverage_area: longCoverage
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate specialization max length (200 chars)', async () => {
      const longSpecialization = 'A'.repeat(201);
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          specialization: longSpecialization
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate last_contact_date ISO8601 format', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          last_contact_date: 'invalid-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate next_contact_date ISO8601 format', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout',
          next_contact_date: 'invalid-date'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should include Creator information in response', async () => {
      const response = await request(app)
        .post('/api/scouts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Mike',
          last_name: 'Johnson',
          organization_name: 'Atlanta Braves',
          position: 'Area Scout'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toHaveProperty('id');
      expect(response.body.data.Creator).toHaveProperty('first_name');
      expect(response.body.data.Creator).toHaveProperty('last_name');
      expect(response.body.data.Creator.id).toBe(testUser.id);
    });
  });

  describe('PUT /api/scouts/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/scouts/123')
        .send({ first_name: 'Updated' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update scout with partial fields', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Michael'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Michael');
      expect(response.body.data.last_name).toBe('Johnson');
    });

    it('should update scout with all fields', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          first_name: 'Michael',
          last_name: 'Johnston',
          organization_name: 'Boston Red Sox',
          position: 'Cross Checker',
          email: 'mjohnston@redsox.com',
          phone: '555-9999',
          coverage_area: 'New England',
          specialization: 'Pitching',
          status: 'inactive'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Michael');
      expect(response.body.data.last_name).toBe('Johnston');
      expect(response.body.data.organization_name).toBe('Boston Red Sox');
      expect(response.body.data.position).toBe('Cross Checker');
      expect(response.body.data.status).toBe('inactive');
    });

    it('should update scout status', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('inactive');
    });

    it('should validate position enum on update', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ position: 'Invalid Position' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate status enum on update', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format on update', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent scout', async () => {
      const response = await request(app)
        .put('/api/scouts/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');
    });

    it('should enforce team isolation - cannot update other team scout', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Updated' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');
    });

    it('should include Creator information in response', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .put(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ first_name: 'Michael' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toHaveProperty('id');
      expect(response.body.data.Creator).toHaveProperty('first_name');
      expect(response.body.data.Creator).toHaveProperty('last_name');
      expect(response.body.data.Creator.id).toBe(testUser.id);
    });
  });

  describe('DELETE /api/scouts/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/scouts/123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete a scout', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .delete(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Scout deleted successfully');
    });

    it('should hard delete the scout from database', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await request(app)
        .delete(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify scout is actually deleted
      const deletedScout = await Scout.findByPk(scout.id);
      expect(deletedScout).toBeNull();
    });

    it('should return 404 for non-existent scout', async () => {
      const response = await request(app)
        .delete('/api/scouts/999999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');
    });

    it('should enforce team isolation - cannot delete other team scout', async () => {
      const scout = await Scout.create({
        first_name: 'Mike',
        last_name: 'Johnson',
        organization_name: 'Atlanta Braves',
        position: 'Area Scout',
        status: 'active',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .delete(`/api/scouts/${scout.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Scout not found');

      // Verify scout still exists
      const existingScout = await Scout.findByPk(scout.id);
      expect(existingScout).not.toBeNull();
    });
  });
});
