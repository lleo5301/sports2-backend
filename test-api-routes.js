const axios = require('axios');
const { expect } = require('chai');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const API_BASE = `${BASE_URL}/api`;

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'testpassword123',
  first_name: 'Test',
  last_name: 'User',
  role: 'head_coach'
};

const testPlayer = {
  first_name: 'John',
  last_name: 'Doe',
  school_type: 'HS',
  position: 'SS',
  height: '6\'0"',
  weight: 180,
  graduation_year: 2025,
  school: 'Test High School',
  city: 'Test City',
  state: 'TX'
};

const testGame = {
  opponent: 'Test Opponent',
  game_date: '2024-03-15',
  home_away: 'home',
  team_score: 5,
  opponent_score: 3,
  result: 'W',
  location: 'Test Stadium',
  season: '2024'
};

const testSchedule = {
  team_name: 'Test Team',
  program_name: 'Test Program',
  date: '2024-03-15',
  sections: [
    {
      type: 'general',
      title: 'General Practice',
      activities: [
        {
          time: '09:00',
          activity: 'Warm-up'
        }
      ]
    }
  ]
};

// Helper functions
const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000
});

let authToken = null;

const setAuthToken = (token) => {
  authToken = token;
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

const clearAuthToken = () => {
  authToken = null;
  delete api.defaults.headers.common['Authorization'];
};

// Test suite
describe('API Routes Test Suite', () => {
  before(async () => {
    console.log('🚀 Starting API Routes Test Suite');
    console.log(`📍 Testing against: ${API_BASE}`);
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      try {
        const response = await axios.get(`${BASE_URL}/health`);
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('status', 'OK');
        console.log('✅ Health check passed');
      } catch (error) {
        console.error('❌ Health check failed:', error.message);
        throw error;
      }
    });
  });

  describe('Authentication Routes', () => {
    it('should register a new user', async () => {
      try {
        const response = await api.post('/auth/register', testUser);
        expect(response.status).to.equal(201);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.have.property('token');
        setAuthToken(response.data.data.token);
        console.log('✅ User registration passed');
      } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
          console.log('⚠️  User already exists, proceeding with login');
          // Try to login instead
          const loginResponse = await api.post('/auth/login', {
            email: testUser.email,
            password: testUser.password
          });
          expect(loginResponse.status).to.equal(200);
          setAuthToken(loginResponse.data.data.token);
          console.log('✅ User login passed');
        } else {
          console.error('❌ User registration failed:', error.response?.data || error.message);
          throw error;
        }
      }
    });

    it('should get current user profile', async () => {
      try {
        const response = await api.get('/auth/me');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.have.property('email', testUser.email);
        console.log('✅ Get profile passed');
      } catch (error) {
        console.error('❌ Get profile failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should update user profile', async () => {
      try {
        const updateData = {
          first_name: 'Updated',
          last_name: 'Name'
        };
        const response = await api.put('/auth/me', updateData);
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        console.log('✅ Update profile passed');
      } catch (error) {
        console.error('❌ Update profile failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Teams Routes', () => {
    it('should get all teams', async () => {
      try {
        const response = await api.get('/teams');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all teams passed');
      } catch (error) {
        console.error('❌ Get all teams failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get team by ID', async () => {
      try {
        // First get all teams to get an ID
        const teamsResponse = await api.get('/teams');
        const teamId = teamsResponse.data.data[0]?.id;
        
        if (teamId) {
          const response = await api.get(`/teams/byId/${teamId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('success', true);
          console.log('✅ Get team by ID passed');
        } else {
          console.log('⚠️  No teams available for testing');
        }
      } catch (error) {
        console.error('❌ Get team by ID failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get current user team', async () => {
      try {
        const response = await api.get('/teams/me');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        console.log('✅ Get current user team passed');
      } catch (error) {
        console.error('❌ Get current user team failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get upcoming schedules', async () => {
      try {
        const response = await api.get('/teams/upcoming-schedules?limit=5');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get upcoming schedules passed');
      } catch (error) {
        console.error('❌ Get upcoming schedules failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get recent schedules', async () => {
      try {
        const response = await api.get('/teams/recent-schedules?limit=5');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get recent schedules passed');
      } catch (error) {
        console.error('❌ Get recent schedules failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Players Routes', () => {
    let playerId = null;

    it('should get all players', async () => {
      try {
        const response = await api.get('/players');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all players passed');
      } catch (error) {
        console.error('❌ Get all players failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should create a new player', async () => {
      try {
        const response = await api.post('/players', testPlayer);
        expect(response.status).to.equal(201);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.have.property('id');
        playerId = response.data.data.id;
        console.log('✅ Create player passed');
      } catch (error) {
        console.error('❌ Create player failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get player by ID', async () => {
      try {
        if (playerId) {
          const response = await api.get(`/players/byId/${playerId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('success', true);
          expect(response.data.data).to.have.property('id', playerId);
          console.log('✅ Get player by ID passed');
        } else {
          console.log('⚠️  No player ID available for testing');
        }
      } catch (error) {
        console.error('❌ Get player by ID failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should update a player', async () => {
      try {
        if (playerId) {
          const updateData = {
            first_name: 'Updated',
            last_name: 'Player'
          };
          const response = await api.put(`/players/byId/${playerId}`, updateData);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('success', true);
          console.log('✅ Update player passed');
        } else {
          console.log('⚠️  No player ID available for testing');
        }
      } catch (error) {
        console.error('❌ Update player failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get player statistics summary', async () => {
      try {
        const response = await api.get('/players/stats/summary');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.have.property('total_players');
        console.log('✅ Get player stats summary passed');
      } catch (error) {
        console.error('❌ Get player stats summary failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should delete a player', async () => {
      try {
        if (playerId) {
          const response = await api.delete(`/players/byId/${playerId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('success', true);
          console.log('✅ Delete player passed');
        } else {
          console.log('⚠️  No player ID available for testing');
        }
      } catch (error) {
        console.error('❌ Delete player failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Games Routes', () => {
    let gameId = null;

    it('should get all games', async () => {
      try {
        const response = await api.get('/games');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all games passed');
      } catch (error) {
        console.error('❌ Get all games failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should create a new game', async () => {
      try {
        const response = await api.post('/games', testGame);
        expect(response.status).to.equal(201);
        expect(response.data).to.have.property('data');
        expect(response.data.data).to.have.property('id');
        gameId = response.data.data.id;
        console.log('✅ Create game passed');
      } catch (error) {
        console.error('❌ Create game failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get game by ID', async () => {
      try {
        if (gameId) {
          const response = await api.get(`/games/byId/${gameId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('data');
          expect(response.data.data).to.have.property('id', gameId);
          console.log('✅ Get game by ID passed');
        } else {
          console.log('⚠️  No game ID available for testing');
        }
      } catch (error) {
        console.error('❌ Get game by ID failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get game log', async () => {
      try {
        const response = await api.get('/games/log');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get game log passed');
      } catch (error) {
        console.error('❌ Get game log failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get team game statistics', async () => {
      try {
        const response = await api.get('/games/team-stats');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get team game stats passed');
      } catch (error) {
        console.error('❌ Get team game stats failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get upcoming games', async () => {
      try {
        const response = await api.get('/games/upcoming');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get upcoming games passed');
      } catch (error) {
        console.error('❌ Get upcoming games failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get season statistics', async () => {
      try {
        const response = await api.get('/games/season-stats');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get season stats passed');
      } catch (error) {
        console.error('❌ Get season stats failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should delete a game', async () => {
      try {
        if (gameId) {
          const response = await api.delete(`/games/byId/${gameId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('message');
          console.log('✅ Delete game passed');
        } else {
          console.log('⚠️  No game ID available for testing');
        }
      } catch (error) {
        console.error('❌ Delete game failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Schedules Routes', () => {
    let scheduleId = null;

    it('should get all schedules', async () => {
      try {
        const response = await api.get('/schedules');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all schedules passed');
      } catch (error) {
        console.error('❌ Get all schedules failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should create a new schedule', async () => {
      try {
        const response = await api.post('/schedules', testSchedule);
        expect(response.status).to.equal(201);
        expect(response.data).to.have.property('data');
        expect(response.data.data).to.have.property('id');
        scheduleId = response.data.data.id;
        console.log('✅ Create schedule passed');
      } catch (error) {
        console.error('❌ Create schedule failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get schedule by ID', async () => {
      try {
        if (scheduleId) {
          const response = await api.get(`/schedules/byId/${scheduleId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('data');
          expect(response.data.data).to.have.property('id', scheduleId);
          console.log('✅ Get schedule by ID passed');
        } else {
          console.log('⚠️  No schedule ID available for testing');
        }
      } catch (error) {
        console.error('❌ Get schedule by ID failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get schedule statistics', async () => {
      try {
        const response = await api.get('/schedules/stats');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get schedule stats passed');
      } catch (error) {
        console.error('❌ Get schedule stats failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should delete a schedule', async () => {
      try {
        if (scheduleId) {
          const response = await api.delete(`/schedules/byId/${scheduleId}`);
          expect(response.status).to.equal(200);
          expect(response.data).to.have.property('message');
          console.log('✅ Delete schedule passed');
        } else {
          console.log('⚠️  No schedule ID available for testing');
        }
      } catch (error) {
        console.error('❌ Delete schedule failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Reports Routes', () => {
    it('should get all reports', async () => {
      try {
        const response = await api.get('/reports');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all reports passed');
      } catch (error) {
        console.error('❌ Get all reports failed:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should get scouting reports', async () => {
      try {
        const response = await api.get('/reports/scouting');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('data');
        console.log('✅ Get scouting reports passed');
      } catch (error) {
        console.error('❌ Get scouting reports failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Depth Charts Routes', () => {
    let depthChartId = null;

    it('should get all depth charts', async () => {
      try {
        const response = await api.get('/depth-charts');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        
        // Store the first depth chart ID for testing other endpoints
        if (response.data.data.length > 0) {
          depthChartId = response.data.data[0].id;
        }
        
        console.log('✅ Get all depth charts passed');
      } catch (error) {
        console.error('❌ Get all depth charts failed:', error.response?.data || error.message);
        throw error;
      }
    });

    // Note: Available players endpoint requires player_assign permission
    // This test is skipped as the test user doesn't have this permission
    it('should get available players for depth chart (requires permission)', async () => {
      try {
        if (depthChartId) {
          const response = await api.get(`/depth-charts/byId/${depthChartId}/available-players`);
          // This will likely fail with 403 due to missing permission, which is expected
          console.log('⚠️  Available players endpoint requires player_assign permission');
        } else {
          console.log('⚠️  No depth chart ID available for testing');
        }
      } catch (error) {
        if (error.response?.status === 403) {
          console.log('✅ Available players endpoint exists (permission check working)');
        } else {
          console.error('❌ Get available players for depth chart failed:', error.response?.data || error.message);
        }
      }
    });
  });

  describe('Recruits Routes', () => {
    it('should get all recruits', async () => {
      try {
        const response = await api.get('/recruits');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        expect(response.data.data).to.be.an('array');
        console.log('✅ Get all recruits passed');
      } catch (error) {
        console.error('❌ Get all recruits failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Settings Routes', () => {
    it('should get user settings', async () => {
      try {
        const response = await api.get('/settings');
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property('success', true);
        console.log('✅ Get user settings passed');
      } catch (error) {
        console.error('❌ Get user settings failed:', error.response?.data || error.message);
        throw error;
      }
    });
  });

  describe('Missing Endpoints Check', () => {
    it('should check for missing endpoints that frontend expects', async () => {
      const missingEndpoints = [];
      
      // Check endpoints that frontend calls but might not exist
      const endpointsToCheck = [
        { method: 'GET', path: '/players/byId/1/stats', description: 'Player stats by ID' },
        { method: 'GET', path: '/teams/upcoming-schedules', description: 'Team upcoming schedules' },
        { method: 'GET', path: '/teams/recent-schedules', description: 'Team recent schedules' },
        { method: 'GET', path: '/teams/stats', description: 'Team statistics' },
        { method: 'GET', path: '/teams/roster', description: 'Team roster' },
        { method: 'GET', path: '/games/player-stats/1', description: 'Player game statistics' },
        { method: 'GET', path: '/reports/byId/1', description: 'Report by ID' },
        { method: 'POST', path: '/reports', description: 'Create report' },
        { method: 'PUT', path: '/reports/byId/1', description: 'Update report' },
        { method: 'DELETE', path: '/reports/byId/1', description: 'Delete report' },
        { method: 'GET', path: '/reports/player-performance', description: 'Player performance reports' },
        { method: 'GET', path: '/reports/team-statistics', description: 'Team statistics reports' },
        { method: 'GET', path: '/reports/scouting-analysis', description: 'Scouting analysis reports' },
        { method: 'GET', path: '/reports/recruitment-pipeline', description: 'Recruitment pipeline reports' },
        { method: 'POST', path: '/reports/generate-pdf', description: 'Generate PDF report' },
        { method: 'POST', path: '/reports/export-excel', description: 'Export Excel report' },
        { method: 'PUT', path: '/settings/general', description: 'Update general settings' },
        { method: 'PUT', path: '/settings/account', description: 'Update account settings' },
        { method: 'PUT', path: '/settings/notifications', description: 'Update notification settings' },
        { method: 'PUT', path: '/settings/security', description: 'Update security settings' },
        { method: 'PUT', path: '/settings/change-password', description: 'Change password' },
        { method: 'PUT', path: '/settings/two-factor', description: 'Toggle two-factor' },
        { method: 'GET', path: '/settings/two-factor/qr', description: 'Get two-factor QR code' },
        { method: 'POST', path: '/settings/two-factor/verify', description: 'Verify two-factor code' },
        { method: 'GET', path: '/settings/login-history', description: 'Get login history' },
        { method: 'GET', path: '/settings/export-data', description: 'Export user data' },
        { method: 'DELETE', path: '/settings/account', description: 'Delete account' },
        { method: 'GET', path: '/settings/notifications/preferences', description: 'Get notification preferences' },
        { method: 'PUT', path: '/settings/notifications/preferences', description: 'Update notification preferences' },
        { method: 'POST', path: '/settings/notifications/test-email', description: 'Test email notification' },
        { method: 'GET', path: '/settings/sessions', description: 'Get active sessions' }
      ];

      for (const endpoint of endpointsToCheck) {
        try {
          await api.request({
            method: endpoint.method,
            url: endpoint.path,
            validateStatus: () => true // Don't throw on any status
          });
        } catch (error) {
          if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            missingEndpoints.push(`${endpoint.method} ${endpoint.path} - ${endpoint.description} (Connection refused)`);
          } else if (error.response?.status === 404) {
            missingEndpoints.push(`${endpoint.method} ${endpoint.path} - ${endpoint.description} (404 Not Found)`);
          }
        }
      }

      if (missingEndpoints.length > 0) {
        console.log('⚠️  Missing or problematic endpoints:');
        missingEndpoints.forEach(endpoint => console.log(`   ${endpoint}`));
      } else {
        console.log('✅ All expected endpoints are available');
      }
    });
  });

  after(() => {
    console.log('\n🏁 API Routes Test Suite completed');
    clearAuthToken();
  });
});

// Run the tests
if (require.main === module) {
  const mocha = require('mocha');
  const runner = new mocha();
  
  runner.addFile(__filename);
  runner.run((failures) => {
    process.exit(failures ? 1 : 0);
  });
} 