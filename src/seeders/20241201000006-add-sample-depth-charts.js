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

    // Create depth charts
    const depthCharts = [
      {
        name: 'Opening Day Roster',
        description: 'Starting lineup for the 2024 season opener',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        is_default: true,
        version: 1,
        effective_date: new Date('2024-02-15'),
        notes: 'Primary depth chart for the season',
        created_at: now,
        updated_at: now
      },
      {
        name: 'Weekend Series Roster',
        description: 'Depth chart for weekend series against Texas A&M',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        is_default: false,
        version: 1,
        effective_date: new Date('2024-03-16'),
        notes: 'Special lineup for rivalry series',
        created_at: now,
        updated_at: now
      }
    ];

    const createdDepthCharts = await queryInterface.bulkInsert('depth_charts', depthCharts, { returning: true });

    // Create depth chart positions
    const positions = [
      // Opening Day Roster positions
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'P',
        position_name: 'Pitcher',
        color: '#FF6B6B',
        icon: '⚾',
        sort_order: 1,
        max_players: 3,
        description: 'Starting pitchers',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'C',
        position_name: 'Catcher',
        color: '#4ECDC4',
        icon: '🟦',
        sort_order: 2,
        max_players: 2,
        description: 'Catchers',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: '1B',
        position_name: 'First Base',
        color: '#45B7D1',
        icon: '🟨',
        sort_order: 3,
        max_players: 2,
        description: 'First basemen',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: '2B',
        position_name: 'Second Base',
        color: '#96CEB4',
        icon: '🟩',
        sort_order: 4,
        max_players: 2,
        description: 'Second basemen',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: '3B',
        position_name: 'Third Base',
        color: '#FFEAA7',
        icon: '🟧',
        sort_order: 5,
        max_players: 2,
        description: 'Third basemen',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'SS',
        position_name: 'Shortstop',
        color: '#DDA0DD',
        icon: '🟪',
        sort_order: 6,
        max_players: 2,
        description: 'Shortstops',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'LF',
        position_name: 'Left Field',
        color: '#98D8C8',
        icon: '🟢',
        sort_order: 7,
        max_players: 2,
        description: 'Left fielders',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'CF',
        position_name: 'Center Field',
        color: '#F7DC6F',
        icon: '🟡',
        sort_order: 8,
        max_players: 2,
        description: 'Center fielders',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        depth_chart_id: createdDepthCharts[0].id,
        position_code: 'RF',
        position_name: 'Right Field',
        color: '#BB8FCE',
        icon: '🟣',
        sort_order: 9,
        max_players: 2,
        description: 'Right fielders',
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ];

    const createdPositions = await queryInterface.bulkInsert('depth_chart_positions', positions, { returning: true });

    // Get player IDs for assignment
    const players = await queryInterface.sequelize.query(
      'SELECT id, position FROM players WHERE team_id = ? AND status = ? ORDER BY id',
      { 
        replacements: [teamId, 'active'],
        type: Sequelize.QueryTypes.SELECT 
      }
    );

    // Create player assignments
    const playerAssignments = [];

    createdPositions.forEach((position, posIndex) => {
      // Find players that match this position
      const matchingPlayers = players.filter(player => {
        if (position.position_code === 'P') {
          return player.position === 'P';
        }
        return player.position === position.position_code;
      });

      // Assign up to max_players for this position
      const maxAssignments = Math.min(position.max_players, matchingPlayers.length);
      for (let i = 0; i < maxAssignments; i++) {
        if (matchingPlayers[i]) {
          playerAssignments.push({
            depth_chart_id: position.depth_chart_id,
            position_id: position.id,
            player_id: matchingPlayers[i].id,
            depth_order: i + 1,
            assigned_by: 1,
            notes: `Depth ${i + 1} at ${position.position_name}`,
            is_active: true,
            created_at: now,
            updated_at: now
          });
        }
      }
    });

    if (playerAssignments.length > 0) {
      await queryInterface.bulkInsert('depth_chart_players', playerAssignments, {});
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('depth_chart_players', null, {});
    await queryInterface.bulkDelete('depth_chart_positions', null, {});
    await queryInterface.bulkDelete('depth_charts', null, {});
  }
}; 