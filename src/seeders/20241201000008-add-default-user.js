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

    const now = new Date();
    const salt = await bcrypt.genSalt(10);

    // =========================================================================
    // Create Super Admin User (for system administration)
    // =========================================================================
    const existingAdmin = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'admin@sports2.com'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existingAdmin.length === 0) {
      const adminPassword = await bcrypt.hash('Admin123!', salt);

      const adminUser = {
        email: 'admin@sports2.com',
        password: adminPassword,
        oauth_provider: 'local',
        oauth_id: null,
        avatar_url: null,
        first_name: 'System',
        last_name: 'Admin',
        role: 'super_admin',
        phone: '+1-555-0000',
        is_active: true,
        last_login: null,
        team_id: teamId,
        created_at: now,
        updated_at: now
      };

      await queryInterface.bulkInsert('users', [adminUser], {});
      console.log('✅ Super Admin user created');
    } else {
      console.log('✅ Super Admin user already exists');
    }

    // =========================================================================
    // Create Demo User (Head Coach for testing)
    // =========================================================================
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
    } else {
      const hashedPassword = await bcrypt.hash('password', salt);

      const defaultUser = {
        email: 'user@example.com',
        password: hashedPassword,
        oauth_provider: 'local',
        oauth_id: null,
        avatar_url: null,
        first_name: 'Demo',
        last_name: 'User',
        role: 'head_coach',
        phone: '+1-555-0123',
        is_active: true,
        last_login: null,
        team_id: teamId,
        created_at: now,
        updated_at: now
      };

      await queryInterface.bulkInsert('users', [defaultUser], {});
      console.log('✅ Default demo user created');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔐 DEFAULT LOGIN CREDENTIALS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('👑 SUPER ADMIN (Full System Access):');
    console.log('   📧 Email: admin@sports2.com');
    console.log('   🔑 Password: Admin123!');
    console.log('   🛡️  Role: super_admin');
    console.log('   ⚡ Can: Manage users, unlock accounts, full system control');
    console.log('');
    console.log('🏈 DEMO USER (Team Head Coach):');
    console.log('   📧 Email: user@example.com');
    console.log('   🔑 Password: password');
    console.log('   👔 Role: head_coach');
    console.log('   ⚡ Can: Manage team data, players, schedules, reports');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🏛️  Team: ${teamId} (Texas Longhorns)`);
    console.log(`👥 Players: ${players[0].count} sample players`);
    console.log(`📋 Reports: ${reports[0].count} sample reports`);
    console.log(`🗓️  Schedules: ${schedules[0].count} sample schedules`);
    console.log(`📈 Depth Charts: ${depthCharts[0].count} sample depth charts`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🚀 Ready to login at http://localhost:3000');
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.bulkDelete('users', {
      email: ['user@example.com', 'admin@sports2.com']
    }, {});
    console.log('❌ Default users removed');
  }
};
