'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('depth_chart_players', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      depth_chart_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'depth_charts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'depth_chart_positions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'players',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      depth_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      assigned_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('depth_chart_players', ['depth_chart_id']);
    await queryInterface.addIndex('depth_chart_players', ['position_id']);
    await queryInterface.addIndex('depth_chart_players', ['player_id']);
    await queryInterface.addIndex('depth_chart_players', ['depth_order']);
    
    // Add unique constraint
    await queryInterface.addConstraint('depth_chart_players', {
      fields: ['depth_chart_id', 'position_id', 'player_id'],
      type: 'unique',
      name: 'unique_depth_chart_player_position'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('depth_chart_players');
  }
}; 