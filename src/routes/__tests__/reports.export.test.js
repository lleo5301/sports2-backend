const request = require('supertest');
const app = require('../../server');
const { sequelize, User, Team, Player, Coach, HighSchoolCoach } = require('../../models');
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
      program_name: 'Export Test Team Program'
    });

    // Create other team for isolation testing
    otherTeam = await Team.create({
      name: 'Other Export Team',
      program_name: 'Other Export Team Program'
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
    await Coach.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await HighSchoolCoach.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await testUser.destroy();
    await testTeam.destroy();
    await otherTeam.destroy();
  });

  beforeEach(async () => {
    // Clean up players and coaches before each test
    await Player.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await Coach.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
    await HighSchoolCoach.destroy({ where: { team_id: [testTeam.id, otherTeam.id] } });
  });

  describe('GET /api/reports/export/players', () => {
    describe('Authentication', () => {
      it('should require authentication (401 without token)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should reject invalid token', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players?school_type=HS')
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
          .get('/api/v1/reports/export/players?position=P')
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
          .get('/api/v1/reports/export/players?status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 active players
        expect(csvLines.length).toBe(4);
        expect(csvLines.every(line => !line.includes('inactive') || line.includes('Status'))).toBe(true);
      });

      it('should filter by search term (first name)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players?search=College')
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
          .get('/api/v1/reports/export/players?search=Harvard')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from Harvard
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Harvard University');
      });

      it('should filter by search term (city)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players?search=Cambridge')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from Cambridge
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Cambridge');
      });

      it('should filter by search term (state)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players?search=MA')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 player from MA
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain(',MA,');
      });

      it('should support multiple filters combined', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/players?school_type=COLL&position=P&status=active')
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
          .get('/api/v1/reports/export/players?school_type=HS&position=1B')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players?position=P&school_type=HS')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
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
          .get('/api/v1/reports/export/players')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Error exporting players to CSV');

        // Reconnect for other tests
        await sequelize.authenticate();
      });
    });
  });

  describe('GET /api/reports/export/coaches', () => {
    describe('Authentication', () => {
      it('should require authentication (401 without token)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should reject invalid token', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Successful CSV Download', () => {
      it('should return CSV with proper headers', async () => {
        // Create test coach
        await Coach.create({
          first_name: 'John',
          last_name: 'Smith',
          school_name: 'University of Boston',
          position: 'Head Coach',
          email: 'jsmith@university.edu',
          phone: '555-1234',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check Content-Type header
        expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');

        // Check Content-Disposition header
        expect(response.headers['content-disposition']).toMatch(/^attachment; filename="coaches_\d{4}-\d{2}-\d{2}\.csv"$/);
      });

      it('should return valid CSV format with header row', async () => {
        // Create test coach
        await Coach.create({
          first_name: 'Jane',
          last_name: 'Doe',
          school_name: 'State College',
          position: 'Recruiting Coordinator',
          email: 'jdoe@college.edu',
          phone: '555-5678',
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-02-15',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check header row
        expect(csvLines[0]).toBe('First Name,Last Name,School Name,Position,Email,Phone,Last Contact Date,Next Contact Date,Status');

        // Check data row
        expect(csvLines[1]).toBe('Jane,Doe,State College,Recruiting Coordinator,jdoe@college.edu,555-5678,2024-01-15,2024-02-15,active');
      });

      it('should handle empty result set', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Should have header row only
        expect(csvLines[0]).toBe('First Name,Last Name,School Name,Position,Email,Phone,Last Contact Date,Next Contact Date,Status');
        expect(csvLines[1]).toBe(''); // Empty second line
      });

      it('should export multiple coaches sorted by name', async () => {
        // Create multiple coaches
        await Coach.create({
          first_name: 'Charlie',
          last_name: 'Brown',
          school_name: 'Brown University',
          position: 'Head Coach',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Alice',
          last_name: 'Anderson',
          school_name: 'Anderson College',
          position: 'Pitching Coach',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Bob',
          last_name: 'Baker',
          school_name: 'Baker State',
          position: 'Volunteer',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
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
        // Create coach with special characters
        await Coach.create({
          first_name: 'John',
          last_name: 'O\'Brien',
          school_name: 'St. Mary\'s College, Boston',
          position: 'Head Coach',
          email: 'jobrien@stmarys.edu',
          phone: '555-1234',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // School name with comma should be quoted
        expect(csvLines[1]).toContain('"St. Mary\'s College, Boston"');
      });

      it('should handle null values in optional fields', async () => {
        // Create coach with minimal data
        await Coach.create({
          first_name: 'Minimal',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          team_id: testTeam.id
          // All optional fields null/undefined
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check that null values are exported as empty strings
        expect(csvLines[1]).toMatch(/^Minimal,Coach,Test School,Head Coach,,,,$/);
      });
    });

    describe('Filtering', () => {
      beforeEach(async () => {
        // Create diverse set of coaches for filtering tests
        await Coach.create({
          first_name: 'Active',
          last_name: 'Head1',
          school_name: 'University A',
          position: 'Head Coach',
          status: 'active',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Inactive',
          last_name: 'Head2',
          school_name: 'University B',
          position: 'Head Coach',
          status: 'inactive',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Active',
          last_name: 'Recruiter1',
          school_name: 'University C',
          position: 'Recruiting Coordinator',
          status: 'active',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Active',
          last_name: 'Pitching1',
          school_name: 'Harvard University',
          position: 'Pitching Coach',
          email: 'coach@harvard.edu',
          status: 'active',
          team_id: testTeam.id
        });
      });

      it('should filter by status', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 active coaches
        expect(csvLines.length).toBe(4);
        expect(csvLines.every(line => !line.includes('inactive') || line.includes('Status'))).toBe(true);
      });

      it('should filter by position', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?position=Head Coach')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 head coaches
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Head Coach');
        expect(csvLines[2]).toContain('Head Coach');
      });

      it('should filter by search term (first name)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?search=Active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 coaches with "Active" in first name
        expect(csvLines.length).toBe(4);
      });

      it('should filter by search term (school name)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?search=Harvard')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach from Harvard
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Harvard University');
      });

      it('should filter by search term (email)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?search=harvard.edu')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach with harvard.edu email
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('coach@harvard.edu');
      });

      it('should support multiple filters combined', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?status=active&position=Head Coach')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach (Active + Head Coach)
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Active,Head1');
        expect(csvLines[1]).toContain('Head Coach');
      });

      it('should return empty result for non-matching filters', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/coaches?status=active&position=Volunteer')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header only (no active volunteers)
        expect(csvLines.length).toBe(1);
      });
    });

    describe('Team Isolation', () => {
      it('should only export coaches from user\'s team', async () => {
        // Create coaches for test team
        await Coach.create({
          first_name: 'Team1',
          last_name: 'Coach1',
          school_name: 'University A',
          position: 'Head Coach',
          team_id: testTeam.id
        });

        await Coach.create({
          first_name: 'Team1',
          last_name: 'Coach2',
          school_name: 'University B',
          position: 'Recruiting Coordinator',
          team_id: testTeam.id
        });

        // Create coaches for other team (should not appear)
        await Coach.create({
          first_name: 'Team2',
          last_name: 'Coach1',
          school_name: 'University C',
          position: 'Head Coach',
          team_id: otherTeam.id
        });

        await Coach.create({
          first_name: 'Team2',
          last_name: 'Coach2',
          school_name: 'University D',
          position: 'Pitching Coach',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 coaches from testTeam only
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Team1,Coach1');
        expect(csvLines[2]).toContain('Team1,Coach2');
        expect(response.text).not.toContain('Team2');
      });

      it('should respect team isolation even with filters', async () => {
        // Create coach for test team
        await Coach.create({
          first_name: 'Team1',
          last_name: 'Head',
          school_name: 'University A',
          position: 'Head Coach',
          status: 'active',
          team_id: testTeam.id
        });

        // Create coach for other team with same filter criteria
        await Coach.create({
          first_name: 'Team2',
          last_name: 'Head',
          school_name: 'University B',
          position: 'Head Coach',
          status: 'active',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches?position=Head Coach&status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach from testTeam only
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Team1,Head');
        expect(response.text).not.toContain('Team2');
      });
    });

    describe('CSV Format Validation', () => {
      it('should include all required columns in order', async () => {
        await Coach.create({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          email: 'test@school.edu',
          phone: '555-1234',
          last_contact_date: '2024-01-15',
          next_contact_date: '2024-02-15',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');
        const headerColumns = csvLines[0].split(',');

        // Verify column order and names
        expect(headerColumns).toEqual([
          'First Name',
          'Last Name',
          'School Name',
          'Position',
          'Email',
          'Phone',
          'Last Contact Date',
          'Next Contact Date',
          'Status'
        ]);
      });

      it('should have matching number of columns in header and data rows', async () => {
        await Coach.create({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test School',
          position: 'Head Coach',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());
        const headerColumns = csvLines[0].split(',').length;
        const dataColumns = csvLines[1].split(',').length;

        expect(dataColumns).toBe(headerColumns);
      });

      it('should export large datasets without pagination', async () => {
        // Create many coaches to test no pagination
        const coaches = [];
        for (let i = 1; i <= 50; i++) {
          coaches.push({
            first_name: `Coach${i}`,
            last_name: `Test${i}`,
            school_name: `University ${i}`,
            position: 'Head Coach',
            team_id: testTeam.id
          });
        }
        await Coach.bulkCreate(coaches);

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 50 data rows (all coaches, no pagination)
        expect(csvLines.length).toBe(51);
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        // Close the connection to simulate database error
        await sequelize.close();

        const response = await request(app)
          .get('/api/v1/reports/export/coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Error exporting coaches to CSV');

        // Reconnect for other tests
        await sequelize.authenticate();
      });
    });
  });

  describe('GET /api/reports/export/high-school-coaches', () => {
    describe('Authentication', () => {
      it('should require authentication (401 without token)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Not authorized, no token');
      });

      it('should reject invalid token', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('Successful CSV Download', () => {
      it('should return CSV with proper headers', async () => {
        // Create test high school coach
        await HighSchoolCoach.create({
          first_name: 'John',
          last_name: 'Smith',
          school_name: 'Lincoln High School',
          school_district: 'Boston Public Schools',
          position: 'Head Coach',
          city: 'Boston',
          state: 'MA',
          email: 'jsmith@lincoln.k12.ma.us',
          phone: '555-1234',
          years_coaching: 10,
          school_classification: '4A',
          relationship_type: 'Recruiting Contact',
          players_sent_count: 5,
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Check Content-Type header
        expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');

        // Check Content-Disposition header
        expect(response.headers['content-disposition']).toMatch(/^attachment; filename="high-school-coaches_\d{4}-\d{2}-\d{2}\.csv"$/);
      });

      it('should return valid CSV format with header row', async () => {
        // Create test high school coach
        await HighSchoolCoach.create({
          first_name: 'Jane',
          last_name: 'Doe',
          school_name: 'Washington High School',
          school_district: 'Cambridge Public Schools',
          position: 'Assistant Coach',
          city: 'Cambridge',
          state: 'MA',
          email: 'jdoe@washington.k12.ma.us',
          phone: '555-5678',
          years_coaching: 5,
          school_classification: '3A',
          relationship_type: 'Former Player',
          players_sent_count: 3,
          last_contact_date: '2024-01-15',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check header row
        expect(csvLines[0]).toBe('First Name,Last Name,School Name,School District,Position,City,State,Email,Phone,Years Coaching,Classification,Relationship Type,Players Sent,Last Contact Date,Status');

        // Check data row
        expect(csvLines[1]).toBe('Jane,Doe,Washington High School,Cambridge Public Schools,Assistant Coach,Cambridge,MA,jdoe@washington.k12.ma.us,555-5678,5,3A,Former Player,3,2024-01-15,active');
      });

      it('should handle empty result set', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Should have header row only
        expect(csvLines[0]).toBe('First Name,Last Name,School Name,School District,Position,City,State,Email,Phone,Years Coaching,Classification,Relationship Type,Players Sent,Last Contact Date,Status');
        expect(csvLines[1]).toBe(''); // Empty second line
      });

      it('should export multiple coaches sorted by name', async () => {
        // Create multiple high school coaches
        await HighSchoolCoach.create({
          first_name: 'Charlie',
          last_name: 'Brown',
          school_name: 'Brown High School',
          position: 'Head Coach',
          state: 'MA',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'Alice',
          last_name: 'Anderson',
          school_name: 'Anderson High School',
          position: 'JV Coach',
          state: 'MA',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'Bob',
          last_name: 'Baker',
          school_name: 'Baker High School',
          position: 'Assistant Coach',
          state: 'NY',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
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
        // Create coach with special characters
        await HighSchoolCoach.create({
          first_name: 'John',
          last_name: 'O\'Brien',
          school_name: 'St. Mary\'s High School, Boston',
          school_district: 'Catholic Schools, Archdiocese of Boston',
          position: 'Head Coach',
          city: 'Boston',
          state: 'MA',
          email: 'jobrien@stmarys.edu',
          phone: '555-1234',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Names with commas should be quoted
        expect(csvLines[1]).toContain('"St. Mary\'s High School, Boston"');
        expect(csvLines[1]).toContain('"Catholic Schools, Archdiocese of Boston"');
      });

      it('should handle null values in optional fields', async () => {
        // Create coach with minimal data
        await HighSchoolCoach.create({
          first_name: 'Minimal',
          last_name: 'Coach',
          school_name: 'Test High School',
          position: 'Head Coach',
          state: 'MA',
          team_id: testTeam.id
          // All optional fields null/undefined
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');

        // Check that null values are exported as empty strings
        expect(csvLines[1]).toMatch(/^Minimal,Coach,Test High School,,Head Coach,,MA,,,,,,,,$/);
      });
    });

    describe('Filtering', () => {
      beforeEach(async () => {
        // Create diverse set of high school coaches for filtering tests
        await HighSchoolCoach.create({
          first_name: 'MA',
          last_name: 'Head1',
          school_name: 'Boston High',
          position: 'Head Coach',
          city: 'Boston',
          state: 'MA',
          relationship_type: 'Recruiting Contact',
          status: 'active',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'MA',
          last_name: 'Assistant1',
          school_name: 'Cambridge High',
          position: 'Assistant Coach',
          city: 'Cambridge',
          state: 'MA',
          relationship_type: 'Former Player',
          status: 'inactive',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'NY',
          last_name: 'Head1',
          school_name: 'Brooklyn High',
          position: 'Head Coach',
          city: 'Brooklyn',
          state: 'NY',
          relationship_type: 'Recruiting Contact',
          status: 'active',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'MA',
          last_name: 'JV1',
          school_name: 'Harvard-Westlake',
          school_district: 'Cambridge District',
          position: 'JV Coach',
          city: 'Cambridge',
          state: 'MA',
          email: 'coach@hw.edu',
          relationship_type: 'Coaching Connection',
          status: 'active',
          team_id: testTeam.id
        });
      });

      it('should filter by state', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?state=MA')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 MA coaches
        expect(csvLines.length).toBe(4);
        expect(csvLines.every(line => line.includes(',MA,') || line.includes('State'))).toBe(true);
      });

      it('should filter by position', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?position=Head Coach')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 head coaches
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Head Coach');
        expect(csvLines[2]).toContain('Head Coach');
      });

      it('should filter by relationship_type', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?relationship_type=Recruiting Contact')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 recruiting contacts
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Recruiting Contact');
        expect(csvLines[2]).toContain('Recruiting Contact');
      });

      it('should filter by status', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 active coaches
        expect(csvLines.length).toBe(4);
        expect(csvLines.every(line => !line.includes('inactive') || line.includes('Status'))).toBe(true);
      });

      it('should filter by search term (first name)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?search=MA')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 3 coaches with "MA" in first name
        expect(csvLines.length).toBe(4);
      });

      it('should filter by search term (city)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?search=Cambridge')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 coaches from Cambridge
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Cambridge');
        expect(csvLines[2]).toContain('Cambridge');
      });

      it('should filter by search term (school district)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?search=Cambridge District')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach from Cambridge District
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Cambridge District');
      });

      it('should filter by search term (email)', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?search=hw.edu')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach with hw.edu email
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('coach@hw.edu');
      });

      it('should support multiple filters combined', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?state=MA&position=Head Coach&status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach (MA + Head Coach + Active)
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('MA,Head1');
        expect(csvLines[1]).toContain(',MA,');
      });

      it('should return empty result for non-matching filters', async () => {
        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?state=CA&position=Head Coach')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header only (no CA coaches)
        expect(csvLines.length).toBe(1);
      });
    });

    describe('Team Isolation', () => {
      it('should only export high school coaches from user\'s team', async () => {
        // Create coaches for test team
        await HighSchoolCoach.create({
          first_name: 'Team1',
          last_name: 'Coach1',
          school_name: 'Lincoln High',
          position: 'Head Coach',
          state: 'MA',
          team_id: testTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'Team1',
          last_name: 'Coach2',
          school_name: 'Washington High',
          position: 'Assistant Coach',
          state: 'MA',
          team_id: testTeam.id
        });

        // Create coaches for other team (should not appear)
        await HighSchoolCoach.create({
          first_name: 'Team2',
          last_name: 'Coach1',
          school_name: 'Jefferson High',
          position: 'Head Coach',
          state: 'NY',
          team_id: otherTeam.id
        });

        await HighSchoolCoach.create({
          first_name: 'Team2',
          last_name: 'Coach2',
          school_name: 'Madison High',
          position: 'JV Coach',
          state: 'NY',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 2 coaches from testTeam only
        expect(csvLines.length).toBe(3);
        expect(csvLines[1]).toContain('Team1,Coach1');
        expect(csvLines[2]).toContain('Team1,Coach2');
        expect(response.text).not.toContain('Team2');
      });

      it('should respect team isolation even with filters', async () => {
        // Create coach for test team
        await HighSchoolCoach.create({
          first_name: 'Team1',
          last_name: 'Head',
          school_name: 'Lincoln High',
          position: 'Head Coach',
          state: 'MA',
          status: 'active',
          team_id: testTeam.id
        });

        // Create coach for other team with same filter criteria
        await HighSchoolCoach.create({
          first_name: 'Team2',
          last_name: 'Head',
          school_name: 'Jefferson High',
          position: 'Head Coach',
          state: 'MA',
          status: 'active',
          team_id: otherTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches?state=MA&position=Head Coach&status=active')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 1 coach from testTeam only
        expect(csvLines.length).toBe(2);
        expect(csvLines[1]).toContain('Team1,Head');
        expect(response.text).not.toContain('Team2');
      });
    });

    describe('CSV Format Validation', () => {
      it('should include all required columns in order', async () => {
        await HighSchoolCoach.create({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test High School',
          school_district: 'Test District',
          position: 'Head Coach',
          city: 'Boston',
          state: 'MA',
          email: 'test@school.k12.ma.us',
          phone: '555-1234',
          years_coaching: 10,
          school_classification: '4A',
          relationship_type: 'Recruiting Contact',
          players_sent_count: 5,
          last_contact_date: '2024-01-15',
          status: 'active',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n');
        const headerColumns = csvLines[0].split(',');

        // Verify column order and names
        expect(headerColumns).toEqual([
          'First Name',
          'Last Name',
          'School Name',
          'School District',
          'Position',
          'City',
          'State',
          'Email',
          'Phone',
          'Years Coaching',
          'Classification',
          'Relationship Type',
          'Players Sent',
          'Last Contact Date',
          'Status'
        ]);
      });

      it('should have matching number of columns in header and data rows', async () => {
        await HighSchoolCoach.create({
          first_name: 'Test',
          last_name: 'Coach',
          school_name: 'Test High School',
          position: 'Head Coach',
          state: 'MA',
          team_id: testTeam.id
        });

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());
        const headerColumns = csvLines[0].split(',').length;
        const dataColumns = csvLines[1].split(',').length;

        expect(dataColumns).toBe(headerColumns);
      });

      it('should export large datasets without pagination', async () => {
        // Create many high school coaches to test no pagination
        const coaches = [];
        for (let i = 1; i <= 50; i++) {
          coaches.push({
            first_name: `Coach${i}`,
            last_name: `Test${i}`,
            school_name: `High School ${i}`,
            position: 'Head Coach',
            state: 'MA',
            team_id: testTeam.id
          });
        }
        await HighSchoolCoach.bulkCreate(coaches);

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const csvLines = response.text.split('\n').filter(line => line.trim());

        // Should have header + 50 data rows (all coaches, no pagination)
        expect(csvLines.length).toBe(51);
      });
    });

    describe('Error Handling', () => {
      it('should handle database errors gracefully', async () => {
        // Close the connection to simulate database error
        await sequelize.close();

        const response = await request(app)
          .get('/api/v1/reports/export/high-school-coaches')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Error exporting high school coaches to CSV');

        // Reconnect for other tests
        await sequelize.authenticate();
      });
    });
  });
});
