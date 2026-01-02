'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Guard if table already exists (e.g., created by sync in dev)
    const tables = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.depth_charts') as exists",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (tables[0] && tables[0].exists) {
      return;
    }
    await queryInterface.createTable('depth_charts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'teams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      version: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      effective_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
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

    // Add indexes (with guards)
    try {
      await queryInterface.addIndex('depth_charts', ['team_id']);
    } catch (e) {}
    try {
      await queryInterface.addIndex('depth_charts', ['created_by']);
    } catch (e) {}
    try {
      await queryInterface.addIndex('depth_charts', ['is_active']);
    } catch (e) {}
    try {
      await queryInterface.addIndex('depth_charts', ['effective_date']);
    } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('depth_charts');
  }
};
