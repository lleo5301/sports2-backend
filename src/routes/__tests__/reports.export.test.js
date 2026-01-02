const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Player } = require('../../models');
const jwt = require('jsonwebtoken');

describe('Reports Export API - Player CSV Export', () => {
  let authToken;
  let testUser;
  let testTeam;
  let otherTeam;

  beforeAll(async () => {
    // Ensure database connection
    await sequelize.authenticate();

    // Create test team
    testTeam = await Team.create({
      name: 'Export Test Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create other team for isolation testing
    otherTeam = await Team.create({
      name: 'Other Export Team',
      sport: 'baseball',
      season: 'spring',
      year: 2024
    });

    // Create test user
    testUser = await User.create({
      first_name: 'Export',
      last_name: 'TestUser',
      email: 'export-test@example.com',
      password: 'Test123!',
      role: 'head_coach',
      team_id: testTeam.id
    });

    // Generate auth token
    authToken = jwt.sign({ id: testUser.id }, process.env.JWT_SECRET || 'test_secret');
  });

  afterAll(async () => {
    // Clean up test data
    await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await testUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up players before each test
    await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
  });

  describe('GET /api/reports/export/players', () => {
    describe('Authentication', () => {
      it('should require authentication (401 without token)', async () => {
        const response = await request(app)
          .get('/api/reports/export/players')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should reject invalid token', async () => {
        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Successful CSV Download', () => {
      it('should return CSV with proper headers', async () => {
        // Create test player
        await Player.create({
          first_name: 'John',
          last_name: 'Doe',
          position: 'P',
          school_type: 'HS',
          school: 'Test High School',
          city: 'Boston',
          state: 'MA',
          email: 'john@example.com',
          phone: '555-1234',
          status: 'active',
          graduation_year: 2025,
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check Content-Type header
        expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');

        // Check Content-Disposition header
        expect(response.headers['content-disposition']).toMatch(/^attachment; filename="players_\d{4}-\d{2}-\d{2}\.csv"$/);
      });

      it('should return valid CSV format with header row', async () => {
        // Create test player
        await Player.create({
          first_name: 'Jane',
          last_name: 'Smith',
          position: 'C',
          school_type: 'COLL',
          school: 'Test College',
          city: 'Cambridge',
          state: 'MA',
          email: 'jane@example.com',
          phone: '555-5678',
          status: 'active',
          graduation_year: 2026,
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check header row
        expect(csvLines[0]).toBe('First Name,Last Name,Position,School Type,School,City,State,Email,Phone,Status,Graduation Year');

        // Check data row
        expect(csvLines[1]).toBe('Jane,Smith,C,COLL,Test College,Cambridge,MA,jane@example.com,555-5678,active,2026');
      });

      it('should handle empty result set', async () => {
        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Should have header row only
        expect(csvLines[0]).toBe('First Name,Last Name,Position,School Type,School,City,State,Email,Phone,Status,Graduation Year');
        expect(csvLines[1]).toBe(''); // Empty second line
      });

      it('should export multiple players sorted by name', async () => {
        // Create multiple players
        await Player.create({
          first_name: 'Charlie',
          last_name: 'Brown',
          position: 'SS',
          school_type: 'HS',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'Alice',
          last_name: 'Anderson',
          position: '1B',
          school_type: 'HS',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'Bob',
          last_name: 'Baker',
          position: '2B',
          school_type: 'COLL',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 data rows
        expect(csvLines.length).toBe(4);

        // Check alphabetical ordering (Anderson, Baker, Brown)
        expect(csvLines[1]).toContain('Alice,Anderson');
        expect(csvLines[2]).toContain('Bob,Baker');
        expect(csvLines[3]).toContain('Charlie,Brown');
      });

      it('should properly escape CSV special characters', async () => {
        // Create player with special characters
        await Player.create({
          first_name: 'John',
          last_name: 'O\'Brien',
          position: 'P',
          school_type: 'HS',
          school: 'St. Mary\'s High School, Boston',
          city: 'Boston',
          state: 'MA',
          email: 'john@example.com',
          phone: '555-1234',
          status: 'active',
          graduation_year: 2025,
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // School name with comma should be quoted
        expect(csvLines[1]).toContain('"St. Mary\'s High School, Boston"');
      });

      it('should handle null values in optional fields', async () => {
        // Create player with minimal data
        await Player.create({
          first_name: 'Minimal',
          last_name: 'Player',
          position: 'OF',
          school_type: 'HS',
          team_id: testTeam.id
          // All optional fields null/undefined
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check that null values are exported as empty strings
        expect(csvLines[1]).toMatch(/^Minimal,Player,OF,HS,,,,,,$/);
      });
    });

    describe('Filtering', () => {
      beforeEach(async () => {
        // Create diverse set of players for filtering tests
        await Player.create({
          first_name: 'High',
          last_name: 'School1',
          position: 'P',
          school_type: 'HS',
          status: 'active',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'High',
          last_name: 'School2',
          position: 'C',
          school_type: 'HS',
          status: 'inactive',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'College',
          last_name: 'Player1',
          position: 'P',
          school_type: 'COLL',
          status: 'active',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'College',
          last_name: 'Player2',
          position: '1B',
          school_type: 'COLL',
          status: 'active',
          school: 'Harvard University',
          city: 'Cambridge',
          state: 'MA',
          team_id: testTeam.id
        });
      });

      it('should filter by school_type', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?school_type=HS')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 HS players
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('School1');
        expect(csvLines[2]).toContain('School2');
      });

      it('should filter by position', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?position=P')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 pitchers
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain(',P,');
        expect(csvLines[2]).toContain(',P,');
      });

      it('should filter by status', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 active players
        expect(csvLines.length).toBe(4);
        expect(csvLines.every(line => !line.includes('inactive') || line.includes('Status'))).toBe(true);
      });

      it('should filter by search term (first name)', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?search=College')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 college players
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('College');
        expect(csvLines[2]).toContain('College');
      });

      it('should filter by search term (school)', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?search=Harvard')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from Harvard
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Harvard University');
      });

      it('should filter by search term (city)', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?search=Cambridge')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from Cambridge
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Cambridge');
      });

      it('should filter by search term (state)', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?search=MA')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from MA
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain(',MA,');
      });

      it('should support multiple filters combined', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?school_type=COLL&position=P&status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player (College + Pitcher + Active)
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('College,Player1');
        expect(csvLines[1]).toContain(',P,COLL,');
      });

      it('should return empty result for non-matching filters', async () => {
        const response = await request(app)
          .get('/api/reports/export/players?school_type=HS&position=1B')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header only (no HS players with position 1B)
        expect(csvLines.length).toBe(1);
      });
    });

    describe('Team Isolation', () => {
      it('should only export players from user\'s team', async () => {
        // Create players for test team
        await Player.create({
          first_name: 'Team1',
          last_name: 'Player1',
          position: 'P',
          school_type: 'HS',
          team_id: testTeam.id
        });

        await Player.create({
          first_name: 'Team1',
          last_name: 'Player2',
          position: 'C',
          school_type: 'HS',
          team_id: testTeam.id
        });

        // Create players for other team (should not appear)
        await Player.create({
          first_name: 'Team2',
          last_name: 'Player1',
          position: 'P',
          school_type: 'HS',
          team_id: otherTeam.id
        });

        await Player.create({
          first_name: 'Team2',
          last_name: 'Player2',
          position: 'C',
          school_type: 'HS',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 players from testTeam only
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Team1,Player1');
        expect(csvLines[2]).toContain('Team1,Player2');
        expect(response.text).not.toContain('Team2');
      });

      it('should respect team isolation even with filters', async () => {
        // Create player for test team
        await Player.create({
          first_name: 'Team1',
          last_name: 'Pitcher',
          position: 'P',
          school_type: 'HS',
          team_id: testTeam.id
        });

        // Create player for other team with same filter criteria
        await Player.create({
          first_name: 'Team2',
          last_name: 'Pitcher',
          position: 'P',
          school_type: 'HS',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players?position=P&school_type=HS')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from testTeam only
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Team1,Pitcher');
        expect(response.text).not.toContain('Team2');
      });
    });

    describe('CSV Format Validation', () => {
      it('should include all required columns in order', async () => {
        await Player.create({
          first_name: 'Test',
          last_name: 'Player',
          position: 'P',
          school_type: 'HS',
          school: 'Test School',
          city: 'Boston',
          state: 'MA',
          email: 'test@example.com',
          phone: '555-1234',
          status: 'active',
          graduation_year: 2025,
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');
        const headerColumns = csvLines[0].split(',');

        // Verify column order and names
        expect(headerColumns).toEqual([
          'First Name',
          'Last Name',
          'Position',
          'School Type',
          'School',
          'City',
          'State',
          'Email',
          'Phone',
          'Status',
          'Graduation Year'
        ]);
      });

      it('should have matching number of columns in header and data rows', async () => {
        await Player.create({
          first_name: 'Test',
          last_name: 'Player',
          position: 'P',
          school_type: 'HS',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());
        const headerColumns = csvLines[0].split(',').length;
        const dataColumns = csvLines[1].split(',').length;

        expect(dataColumns).toBe(headerColumns);
      });

      it('should export large datasets without pagination', async () => {
        // Create many players to test no pagination
        const players = [];
        for (let i = 1; i <= 50; i++) {
          players.push({
            first_name: `Player${i}`,
            last_name: `Test${i}`,
            position: 'P',
            school_type: 'HS',
            team_id: testTeam.id
          });
        }
        await Player.bulkCreate(players);

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 50 data rows (all players, no pagination)
        expect(csvLines.length).toBe(51);
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        // Close the connection to simulate database error
        await sequelize.close();

        const response = await request(app)
          .get('/api/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Error exporting players to CSV');

        // Reconnect for other tests
        await sequelize.authenticate();
      });
    });
  });
});
