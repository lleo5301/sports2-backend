'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if teams already exist to prevent duplicates
    const [existingTeams] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM teams'
    );

    if (existingTeams[0].count > 0) {
      console.log('Teams already exist, skipping seed');
      return;
    }

    const teams = [
      {
        name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        conference: 'Big 12',
        division: 'D1',
        city: 'Austin',
        state: 'TX',
        primary_color: '#BF5700',
        secondary_color: '#FFFFFF',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Texas A&M Aggies',
        program_name: 'Texas A&M University Baseball',
        conference: 'SEC',
        division: 'D1',
        city: 'College Station',
        state: 'TX',
        primary_color: '#500000',
        secondary_color: '#FFFFFF',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Baylor Bears',
        program_name: 'Baylor University Baseball',
        conference: 'Big 12',
        division: 'D1',
        city: 'Waco',
        state: 'TX',
        primary_color: '#1D428A',
        secondary_color: '#00A3E0',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'TCU Horned Frogs',
        program_name: 'Texas Christian University Baseball',
        conference: 'Big 12',
        division: 'D1',
        city: 'Fort Worth',
        state: 'TX',
        primary_color: '#4D1979',
        secondary_color: '#000000',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Houston Cougars',
        program_name: 'University of Houston Baseball',
        conference: 'Big 12',
        division: 'D1',
        city: 'Houston',
        state: 'TX',
        primary_color: '#C8102E',
        secondary_color: '#FFFFFF',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('teams', teams, {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('teams', null, {});
  }
}; 