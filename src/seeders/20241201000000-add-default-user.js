'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, check if we have teams (we need a team_id for the user)
    const teams = await queryInterface.sequelize.query(
      'SELECT id FROM teams LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (teams.length === 0) {
      console.log('No teams found. Please run team seeder first.');
      return;
    }

    const teamId = teams[0].id;

    // Check if default user already exists
    const existingUsers = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'user@example.com'",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existingUsers.length > 0) {
      console.log('Default user already exists.');
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password', salt);

    const defaultUser = {
      email: 'user@example.com',
      password: hashedPassword,
      oauth_provider: 'local',
      oauth_id: null,
      avatar_url: null,
      first_name: 'Demo',
      last_name: 'User',
      role: 'head_coach', // Give them full permissions
      phone: null,
      is_active: true,
      last_login: null,
      team_id: teamId,
      created_at: new Date(),
      updated_at: new Date()
    };

    await queryInterface.bulkInsert('users', [defaultUser], {});
    
    console.log('✅ Default user created:');
    console.log('   Email: user@example.com');
    console.log('   Password: password');
    console.log('   Role: head_coach');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('users', {
      email: 'user@example.com'
    }, {});
  }
};
