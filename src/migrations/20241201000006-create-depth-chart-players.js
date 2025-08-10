'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.depth_chart_players') as exists",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (tables[0] && tables[0].exists) {
      return;
    }
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

    // Add indexes (guarded)
    try { await queryInterface.addIndex('depth_chart_players', ['depth_chart_id']); } catch (e) {}
    try { await queryInterface.addIndex('depth_chart_players', ['position_id']); } catch (e) {}
    try { await queryInterface.addIndex('depth_chart_players', ['player_id']); } catch (e) {}
    try { await queryInterface.addIndex('depth_chart_players', ['depth_order']); } catch (e) {}
    
    // Add unique constraint
    try {
      await queryInterface.addConstraint('depth_chart_players', {
        fields: ['depth_chart_id', 'position_id', 'player_id'],
        type: 'unique',
        name: 'unique_depth_chart_player_position'
      });
    } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('depth_chart_players');
  }
}; 