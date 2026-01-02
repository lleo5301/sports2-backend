'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Setting up comprehensive user data...');

    // Verify all required data exists
    const teams = await queryInterface.sequelize.query(
      'SELECT id FROM teams LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (teams.length === 0) {
      console.log('❌ No teams found. All previous seeders should run first.');
      throw new Error('Teams must exist before creating users. Run seeders in order.');
    }

    const teamId = teams[0].id;

    // Verify we have players
    const players = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM players WHERE team_id = ?',
      {
        replacements: [teamId],
        type: Sequelize.QueryTypes.SELECT
      }
    );

    console.log(`📊 Found ${players[0].count} players for team ${teamId}`);

    // Verify we have reports
    const reports = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM reports WHERE team_id = ?',
      {
        replacements: [teamId],
        type: Sequelize.QueryTypes.SELECT
      }
    );

    console.log(`📋 Found ${reports[0].count} reports for team ${teamId}`);

    // Verify we have schedules
    const schedules = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM schedules WHERE team_id = ?',
      {
        replacements: [teamId],
        type: Sequelize.QueryTypes.SELECT
      }
    );

    console.log(`🗓️ Found ${schedules[0].count} schedules for team ${teamId}`);

    // Verify we have depth charts
    const depthCharts = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM depth_charts WHERE team_id = ?',
      {
        replacements: [teamId],
        type: Sequelize.QueryTypes.SELECT
      }
    );

    console.log(`📈 Found ${depthCharts[0].count} depth charts for team ${teamId}`);

    // Check if default user already exists
    const existingUsers = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'user@example.com'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existingUsers.length > 0) {
      console.log('✅ Default user already exists - verifying relationships...');

      const userId = existingUsers[0].id;

      // Check user permissions
      const permissions = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_permissions WHERE user_id = ?',
        {
          replacements: [userId],
          type: Sequelize.QueryTypes.SELECT
        }
      );

      console.log(`🔐 User has ${permissions[0].count} permissions assigned`);

      // Verify the user can access all the seeded data
      console.log('✅ Default user has access to:');
      console.log(`   - Team: ${teamId} (Texas Longhorns)`);
      console.log(`   - Players: ${players[0].count} players`);
      console.log(`   - Reports: ${reports[0].count} reports`);
      console.log(`   - Schedules: ${schedules[0].count} schedules`);
      console.log(`   - Depth Charts: ${depthCharts[0].count} depth charts`);
      console.log(`   - Permissions: ${permissions[0].count} permissions`);

      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password', salt);

    const now = new Date();
    const defaultUser = {
      email: 'user@example.com',
      password: hashedPassword,
      oauth_provider: 'local',
      oauth_id: null,
      avatar_url: null,
      first_name: 'Demo',
      last_name: 'User',
      role: 'head_coach', // Give them full permissions
      phone: '+1-555-0123',
      is_active: true,
      last_login: null,
      team_id: teamId,
      created_at: now,
      updated_at: now
    };

    await queryInterface.bulkInsert('users', [defaultUser], {});

    // Get the created user ID
    const createdUsers = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'user@example.com'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    const userId = createdUsers[0].id;

    console.log('✅ Default user created successfully!');
    console.log('');
    console.log('🔐 LOGIN CREDENTIALS:');
    console.log('   📧 Email: user@example.com');
    console.log('   🔑 Password: password');
    console.log('   👑 Role: Head Coach (Full Access)');
    console.log('');
    console.log('📊 USER HAS ACCESS TO:');
    console.log(`   🏛️  Team: ${teamId} (Texas Longhorns)`);
    console.log(`   👥 Players: ${players[0].count} sample players`);
    console.log(`   📋 Reports: ${reports[0].count} sample reports`);
    console.log(`   🗓️  Schedules: ${schedules[0].count} sample schedules`);
    console.log(`   📈 Depth Charts: ${depthCharts[0].count} sample depth charts`);
    console.log('   🔐 Permissions: Will be assigned by next seeder');
    console.log('');
    console.log('🚀 Ready to login at http://localhost:3000');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('users', {
      email: 'user@example.com'
    }, {});
    console.log('❌ Default user removed');
  }
};
