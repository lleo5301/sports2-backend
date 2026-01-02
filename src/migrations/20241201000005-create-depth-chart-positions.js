'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.depth_chart_positions') as exists",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (tables[0] && tables[0].exists) {
      return;
    }
    await queryInterface.createTable('depth_chart_positions', {
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
      position_code: {
        type: Sequelize.STRING,
        allowNull: false
      },
      position_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      color: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: '#6B7280'
      },
      icon: {
        type: Sequelize.STRING,
        allowNull: true
      },
      sort_order: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      max_players: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
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
    try {
      await queryInterface.addIndex('depth_chart_positions', ['depth_chart_id']);
    } catch (e) {
      // Index may already exist
    }
    await queryInterface.addIndex('depth_chart_positions', ['position_code']);
    await queryInterface.addIndex('depth_chart_positions', ['sort_order']);
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.dropTable('depth_chart_positions');
  }
};
