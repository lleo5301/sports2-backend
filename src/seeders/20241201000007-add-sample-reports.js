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

    const reports = [
      {
        title: 'Spring Training Evaluation Report',
        type: 'scouting-analysis',
        description: 'Comprehensive evaluation of all players during spring training sessions. Key findings include improved pitching depth and strong defensive fundamentals.',
        status: 'published',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        title: 'Opponent Analysis: Texas A&M',
        type: 'scouting-analysis',
        description: 'Detailed analysis of Texas A&M\'s strengths and weaknesses. Their pitching staff has been dominant this season, but their offense has struggled with left-handed pitching.',
        status: 'published',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        title: 'Player Performance Review - March 2024',
        type: 'player-performance',
        description: 'Monthly performance review for all players. Notable improvements in batting averages and reduced ERA for pitching staff.',
        status: 'published',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        title: 'Recruitment Pipeline Update',
        type: 'recruitment-pipeline',
        description: 'Current status of recruitment efforts for the 2025 class. Several top prospects showing strong interest in the program.',
        status: 'draft',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      },
      {
        title: 'Team Statistics Summary - Q1 2024',
        type: 'team-statistics',
        description: 'Quarterly statistical analysis including team batting average, ERA, fielding percentage, and other key metrics.',
        status: 'published',
        team_id: teamId,
        created_by: 1,
        created_at: now,
        updated_at: now
      }
    ];

    await queryInterface.bulkInsert('reports', reports, {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('reports', null, {});
  }
}; 