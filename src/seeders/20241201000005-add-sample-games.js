'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get the first team ID for association
    const teams = await queryInterface.sequelize.query(
      'SELECT id FROM teams LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    const teamId = teams[0]?.id || 1;
    const now = new Date();

    const games = [
      {
        opponent: 'Texas A&M Aggies',
        game_date: new Date('2024-03-16'),
        home_away: 'home',
        team_score: 8,
        opponent_score: 5,
        result: 'W',
        location: 'Disch-Falk Field',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'Baylor Bears',
        game_date: new Date('2024-03-09'),
        home_away: 'away',
        team_score: 6,
        opponent_score: 7,
        result: 'L',
        location: 'Baylor Ballpark',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'TCU Horned Frogs',
        game_date: new Date('2024-03-02'),
        home_away: 'home',
        team_score: 12,
        opponent_score: 3,
        result: 'W',
        location: 'Disch-Falk Field',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'Houston Cougars',
        game_date: new Date('2024-02-24'),
        home_away: 'away',
        team_score: 4,
        opponent_score: 2,
        result: 'W',
        location: 'Schroeder Park',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'Oklahoma Sooners',
        game_date: new Date('2024-02-17'),
        home_away: 'home',
        team_score: 9,
        opponent_score: 11,
        result: 'L',
        location: 'Disch-Falk Field',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'Texas Tech Red Raiders',
        game_date: new Date('2024-03-23'),
        home_away: 'away',
        team_score: null,
        opponent_score: null,
        result: null,
        location: 'Rip Griffin Park',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        opponent: 'Kansas State Wildcats',
        game_date: new Date('2024-03-30'),
        home_away: 'home',
        team_score: null,
        opponent_score: null,
        result: null,
        location: 'Disch-Falk Field',
        season: '2024',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      }
    ];

    await queryInterface.bulkInsert('games', games, {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('games', null, {});
  }
}; 