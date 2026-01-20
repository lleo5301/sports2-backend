const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Location, Permission, ScheduleEvent } = require('../../models');
const jwt = require('jsonwebtoken');
const { getCsrfToken } = require('../../test/helpers');

describe('Locations API - Complete CRUD Tests', () => {
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
      name: 'Locations Test Team',
      program_name: 'Locations Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    otherTeam = await Team.create({
      name: 'Other Locations Test Team',
      program_name: 'Other Locations Test Team Program',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test users
    testUser = await User.create({
      first_name: 'Locations',
      last_name: 'TestUser',
      email: 'locations-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: testTeam.id
    });

    otherUser = await User.create({
      first_name: 'Other',
      last_name: 'User',
      email: 'other-locations-test@example.com',
      password: 'TestP@ss1',
      role: 'head_coach',
      team_id: otherTeam.id
    });

    // Grant schedule permissions to test user
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_create'
    });
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_edit'
    });
    await Permission.create({
      user_id: testUser.id,
      team_id: testTeam.id,
      permission_type: 'schedule_delete'
    });

    // Generate auth tokens
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
    otherAuthToken = jwt.sign({ id: otherUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await Location.destroy({ where: {}, force: true });
    await Permission.destroy({ where: {}, force: true });
    await testUser.destroy();
    await otherUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up locations before each test
    await Location.destroy({ where: {}, force: true });
  });

  describe('GET /api/locations', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/locations')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no locations exist', async () => {
      const response = await request(app)
        .get('/api/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return list of locations for authenticated user team', async () => {
      // Create test locations
      await Location.create({
        name: 'Home Stadium',
        address: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
        location_type: 'stadium',
        capacity: 5000,
        is_active: true,
        is_home_venue: true,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Practice Field',
        location_type: 'practice_field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should enforce team isolation', async () => {
      // Create location for other team
      await Location.create({
        name: 'Other Team Stadium',
        location_type: 'stadium',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      // Create location for test team
      await Location.create({
        name: 'Test Team Field',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Test Team Field');
    });

    it('should include Creator information', async () => {
      await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].Creator).toBeDefined();
      expect(response.body.data[0].Creator.first_name).toBe('Locations');
      expect(response.body.data[0].Creator.last_name).toBe('TestUser');
    });

    it('should filter by location_type', async () => {
      await Location.create({
        name: 'Field 1',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Stadium 1',
        location_type: 'stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Gym 1',
        location_type: 'gym',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?location_type=stadium')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].location_type).toBe('stadium');
    });

    it('should filter by is_active', async () => {
      await Location.create({
        name: 'Active Location',
        location_type: 'field',
        is_active: true,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Inactive Location',
        location_type: 'field',
        is_active: false,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?is_active=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Active Location');
    });

    it('should filter by is_home_venue', async () => {
      await Location.create({
        name: 'Home Venue',
        location_type: 'stadium',
        is_home_venue: true,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Away Venue',
        location_type: 'stadium',
        is_home_venue: false,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?is_home_venue=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Home Venue');
    });

    it('should search by name', async () => {
      await Location.create({
        name: 'Lincoln Stadium',
        location_type: 'stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Washington Field',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?search=Lincoln')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Lincoln Stadium');
    });

    it('should search by address', async () => {
      await Location.create({
        name: 'Test Location',
        address: '123 Oak Street',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Another Location',
        address: '456 Maple Avenue',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?search=Oak')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].address).toContain('Oak');
    });

    it('should search by city', async () => {
      await Location.create({
        name: 'Location 1',
        city: 'Springfield',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Location 2',
        city: 'Shelbyville',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations?search=Springfield')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].city).toBe('Springfield');
    });

    it('should support pagination', async () => {
      // Create 15 locations
      for (let i = 1; i <= 15; i++) {
        await Location.create({
          name: `Location ${i}`,
          location_type: 'field',
          team_id: testTeam.id,
          created_by: testUser.id
        });
      }

      const response = await request(app)
        .get('/api/locations?page=2&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(5);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.total).toBe(15);
      expect(response.body.pagination.pages).toBe(3);
    });

    it('should sort locations alphabetically by name', async () => {
      await Location.create({
        name: 'Zebra Field',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Alpha Stadium',
        location_type: 'stadium',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      await Location.create({
        name: 'Beta Gym',
        location_type: 'gym',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get('/api/locations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].name).toBe('Alpha Stadium');
      expect(response.body.data[1].name).toBe('Beta Gym');
      expect(response.body.data[2].name).toBe('Zebra Field');
    });
  });

  describe('GET /api/locations/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/locations/1')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should get a location by ID with all fields', async () => {
      const location = await Location.create({
        name: 'Complete Location',
        address: '789 Complete St',
        city: 'Fulltown',
        state: 'CA',
        zip_code: '90210',
        location_type: 'facility',
        capacity: 2500,
        notes: 'Complete facility with all amenities',
        contact_info: { name: 'John Doe', phone: '555-9876' },
        amenities: ['parking', 'concessions', 'restrooms'],
        is_active: true,
        is_home_venue: false,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/locations/${location.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Complete Location');
      expect(response.body.data.address).toBe('789 Complete St');
      expect(response.body.data.city).toBe('Fulltown');
      expect(response.body.data.state).toBe('CA');
      expect(response.body.data.zip_code).toBe('90210');
      expect(response.body.data.location_type).toBe('facility');
      expect(response.body.data.capacity).toBe(2500);
      expect(response.body.data.notes).toBe('Complete facility with all amenities');
      expect(response.body.data.contact_info).toEqual({ name: 'John Doe', phone: '555-9876' });
      expect(response.body.data.amenities).toEqual(['parking', 'concessions', 'restrooms']);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data.is_home_venue).toBe(false);
    });

    it('should include Creator information', async () => {
      const location = await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const response = await request(app)
        .get(`/api/locations/${location.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Locations');
      expect(response.body.data.Creator.last_name).toBe('TestUser');
      expect(response.body.data.Creator.email).toBe('locations-test@example.com');
    });

    it('should return 404 for non-existent location', async () => {
      const response = await request(app)
        .get('/api/locations/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');
    });

    it('should enforce team isolation', async () => {
      // Create location for other team
      const otherLocation = await Location.create({
        name: 'Other Team Location',
        location_type: 'field',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const response = await request(app)
        .get(`/api/locations/${otherLocation.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');
    });

    it('should return 400 for invalid ID format', async () => {
      const response = await request(app)
        .get('/api/locations/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/locations', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          name: 'Test Location',
          location_type: 'field'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_create permission', async () => {
      // Create user without schedule_create permission
      const userWithoutPermission = await User.create({
        first_name: 'No',
        last_name: 'Permission',
        email: 'no-permission-locations@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noPermToken = jwt.sign({ id: userWithoutPermission.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${noPermToken}`)
        .send({
          name: 'Test Location',
          location_type: 'field'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');

      await userWithoutPermission.destroy();
    });

    it('should create location with required fields only', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Simple Field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Location created successfully');
      expect(response.body.data.name).toBe('Simple Field');
      expect(response.body.data.location_type).toBe('field'); // Default value
      expect(response.body.data.team_id).toBe(testTeam.id);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should create location with all fields', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Complete Stadium',
          address: '100 Sports Way',
          city: 'Metropolis',
          state: 'NY',
          zip_code: '10001',
          location_type: 'stadium',
          capacity: 10000,
          notes: 'Premier sports venue',
          contact_info: { manager: 'Jane Smith', phone: '555-1111' },
          amenities: ['parking', 'concessions', 'wifi', 'press_box'],
          is_active: true,
          is_home_venue: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Complete Stadium');
      expect(response.body.data.address).toBe('100 Sports Way');
      expect(response.body.data.city).toBe('Metropolis');
      expect(response.body.data.state).toBe('NY');
      expect(response.body.data.zip_code).toBe('10001');
      expect(response.body.data.location_type).toBe('stadium');
      expect(response.body.data.capacity).toBe(10000);
      expect(response.body.data.notes).toBe('Premier sports venue');
      expect(response.body.data.contact_info).toEqual({ manager: 'Jane Smith', phone: '555-1111' });
      expect(response.body.data.amenities).toEqual(['parking', 'concessions', 'wifi', 'press_box']);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data.is_home_venue).toBe(true);
    });

    it('should validate required name field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate name length (max 200 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'a'.repeat(201),
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate address length (max 500 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Location',
          address: 'a'.repeat(501),
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate city length (max 100 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Location',
          city: 'a'.repeat(101),
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate state length (max 50 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Location',
          state: 'a'.repeat(51),
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate zip_code length (max 20 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Location',
          zip_code: '1'.repeat(21),
          location_type: 'field'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate location_type enum - field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Field Test',
          location_type: 'field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('field');
    });

    it('should validate location_type enum - gym', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Gym Test',
          location_type: 'gym'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('gym');
    });

    it('should validate location_type enum - facility', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Facility Test',
          location_type: 'facility'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('facility');
    });

    it('should validate location_type enum - stadium', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Stadium Test',
          location_type: 'stadium'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('stadium');
    });

    it('should validate location_type enum - practice_field', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Practice Field Test',
          location_type: 'practice_field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('practice_field');
    });

    it('should validate location_type enum - batting_cage', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Batting Cage Test',
          location_type: 'batting_cage'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('batting_cage');
    });

    it('should validate location_type enum - weight_room', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Weight Room Test',
          location_type: 'weight_room'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('weight_room');
    });

    it('should validate location_type enum - classroom', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Classroom Test',
          location_type: 'classroom'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('classroom');
    });

    it('should validate location_type enum - other', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Other Test',
          location_type: 'other'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.location_type).toBe('other');
    });

    it('should reject invalid location_type', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Type',
          location_type: 'invalid_type'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should validate capacity is positive integer', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Negative Capacity',
          location_type: 'field',
          capacity: -100
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate notes length (max 1000 characters)', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Long Notes',
          location_type: 'field',
          notes: 'a'.repeat(1001)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate contact_info is object', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Contact Info',
          location_type: 'field',
          contact_info: 'not an object'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate amenities is array', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Amenities',
          location_type: 'field',
          amenities: 'not an array'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate is_active is boolean', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Active',
          location_type: 'field',
          is_active: 'yes'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate is_home_venue is boolean', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Home Venue',
          location_type: 'field',
          is_home_venue: 'yes'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should prevent duplicate location names within same team', async () => {
      // Create first location
      await Location.create({
        name: 'Duplicate Name',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Try to create second location with same name
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Duplicate Name',
          location_type: 'stadium'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should allow same location name across different teams', async () => {
      // Create location for test team
      await Location.create({
        name: 'Common Name',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Grant schedule_create permission to other user
      await Permission.create({
        user_id: otherUser.id,
        team_id: otherTeam.id,
        permission_type: 'schedule_create'
      });

      // Create location with same name for other team should succeed
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${otherAuthToken}`)
        .send({
          name: 'Common Name',
          location_type: 'field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Common Name');
      expect(response.body.data.team_id).toBe(otherTeam.id);
    });

    it('should auto-assign team_id from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Auto Team ID',
          location_type: 'field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.team_id).toBe(testTeam.id);
    });

    it('should auto-assign created_by from authenticated user', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Auto Created By',
          location_type: 'field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created_by).toBe(testUser.id);
    });

    it('should include Creator information in response', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .post('/api/locations')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Creator Info',
          location_type: 'field'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Locations');
      expect(response.body.data.Creator.last_name).toBe('TestUser');
    });
  });

  describe('PUT /api/locations/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/locations/1')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .send({
          name: 'Updated Name'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_edit permission', async () => {
      const location = await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create user without schedule_edit permission
      const userWithoutPermission = await User.create({
        first_name: 'No',
        last_name: 'EditPermission',
        email: 'no-edit-permission-locations@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noEditToken = jwt.sign({ id: userWithoutPermission.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${noEditToken}`)
        .send({
          name: 'Updated Name'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');

      await userWithoutPermission.destroy();
    });

    it('should update location with partial fields', async () => {
      const location = await Location.create({
        name: 'Original Name',
        location_type: 'field',
        capacity: 1000,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          capacity: 1500
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Location updated successfully');
      expect(response.body.data.name).toBe('Original Name'); // Unchanged
      expect(response.body.data.capacity).toBe(1500); // Updated
    });

    it('should update location with all fields', async () => {
      const location = await Location.create({
        name: 'Old Name',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Name',
          address: '999 New St',
          city: 'Newville',
          state: 'TX',
          zip_code: '75001',
          location_type: 'stadium',
          capacity: 8000,
          notes: 'Updated notes',
          contact_info: { updated: true },
          amenities: ['new', 'amenities'],
          is_active: false,
          is_home_venue: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Name');
      expect(response.body.data.address).toBe('999 New St');
      expect(response.body.data.city).toBe('Newville');
      expect(response.body.data.state).toBe('TX');
      expect(response.body.data.zip_code).toBe('75001');
      expect(response.body.data.location_type).toBe('stadium');
      expect(response.body.data.capacity).toBe(8000);
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.contact_info).toEqual({ updated: true });
      expect(response.body.data.amenities).toEqual(['new', 'amenities']);
      expect(response.body.data.is_active).toBe(false);
      expect(response.body.data.is_home_venue).toBe(true);
    });

    it('should validate location_type enum', async () => {
      const location = await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location_type: 'invalid_type'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should prevent duplicate location names within same team', async () => {
      // Create two locations
      await Location.create({
        name: 'Existing Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const location2 = await Location.create({
        name: 'Location 2',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Try to update location2 to have the same name as existing location
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location2.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Existing Location'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should allow updating location name to same name', async () => {
      const location = await Location.create({
        name: 'Same Name',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Same Name',
          capacity: 5000
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Same Name');
      expect(response.body.data.capacity).toBe(5000);
    });

    it('should return 404 for non-existent location', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/locations/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');
    });

    it('should enforce team isolation', async () => {
      // Create location for other team
      const otherLocation = await Location.create({
        name: 'Other Team Location',
        location_type: 'field',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${otherLocation.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Hacked Name'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');

      // Verify location was not updated
      const unchangedLocation = await Location.findByPk(otherLocation.id);
      expect(unchangedLocation.name).toBe('Other Team Location');
    });

    it('should return 400 for invalid ID format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put('/api/locations/invalid-id')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should include Creator information in response', async () => {
      const location = await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .put(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          capacity: 2000
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.Creator).toBeDefined();
      expect(response.body.data.Creator.first_name).toBe('Locations');
      expect(response.body.data.Creator.last_name).toBe('TestUser');
    });
  });

  describe('DELETE /api/locations/:id', () => {
    it('should require authentication', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/locations/1')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require schedule_delete permission', async () => {
      const location = await Location.create({
        name: 'Test Location',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create user without schedule_delete permission
      const userWithoutPermission = await User.create({
        first_name: 'No',
        last_name: 'DeletePermission',
        email: 'no-delete-permission-locations@example.com',
        password: 'TestP@ss1',
        role: 'assistant_coach',
        team_id: testTeam.id
      });

      const noDeleteToken = jwt.sign({ id: userWithoutPermission.id }, process.env.JWT_SECRET || 'test_secret');

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${noDeleteToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');

      await userWithoutPermission.destroy();
    });

    it('should successfully delete a location', async () => {
      const location = await Location.create({
        name: 'To Delete',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Location deleted successfully');

      // Verify location was hard deleted
      const deletedLocation = await Location.findByPk(location.id);
      expect(deletedLocation).toBeNull();
    });

    it('should hard delete (not soft delete)', async () => {
      const location = await Location.create({
        name: 'Hard Delete Test',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      await request(app)
        .delete(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify location is completely removed from database
      const deletedLocation = await Location.findByPk(location.id);
      expect(deletedLocation).toBeNull();
    });

    it('should return 404 for non-existent location', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/locations/99999')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');
    });

    it('should enforce team isolation', async () => {
      // Create location for other team
      const otherLocation = await Location.create({
        name: 'Other Team Location',
        location_type: 'field',
        team_id: otherTeam.id,
        created_by: otherUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/locations/${otherLocation.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Location not found');

      // Verify location was not deleted
      const unchangedLocation = await Location.findByPk(otherLocation.id);
      expect(unchangedLocation).not.toBeNull();
    });

    it('should return 400 for invalid ID format', async () => {
      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete('/api/locations/invalid-id')
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should prevent deletion if location is used in schedule events', async () => {
      const location = await Location.create({
        name: 'Location In Use',
        location_type: 'field',
        team_id: testTeam.id,
        created_by: testUser.id
      });

      // Create a schedule event that uses this location
      await ScheduleEvent.create({
        event_type: 'game',
        opponent_name: 'Test Opponent',
        date: new Date(),
        location_id: location.id,
        team_id: testTeam.id,
        created_by: testUser.id
      });

      const { token, cookies } = await getCsrfToken(app);
      const response = await request(app)
        .delete(`/api/locations/${location.id}`)
        .set('Cookie', cookies)
        .set('x-csrf-token', token)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('being used');
      expect(response.body.message).toContain('schedule event');

      // Verify location was not deleted
      const unchangedLocation = await Location.findByPk(location.id);
      expect(unchangedLocation).not.toBeNull();

      // Clean up schedule event
      await ScheduleEvent.destroy({ where: { location_id: location.id }, force: true });
    });
  });
});
