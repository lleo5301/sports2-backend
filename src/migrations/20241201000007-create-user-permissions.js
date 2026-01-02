'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.sequelize.query(
      "SELECT to_regclass('public.user_permissions') as exists",
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (tables[0] && tables[0].exists) {
      return;
    }
    await queryInterface.createTable('user_permissions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      permission_type: {
        type: Sequelize.ENUM(
          'depth_chart_view',
          'depth_chart_create',
          'depth_chart_edit',
          'depth_chart_delete',
          'depth_chart_manage_positions',
          'player_assign',
          'player_unassign',
          'schedule_view',
          'schedule_create',
          'schedule_edit',
          'schedule_delete',
          'reports_view',
          'reports_create',
          'reports_edit',
          'reports_delete',
          'team_settings',
          'user_management'
        ),
        allowNull: false
      },
      is_granted: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      granted_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      granted_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expires_at: {
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

    // Add indexes
    try {
      await queryInterface.addIndex('user_permissions', ['user_id']);
    } catch (e) {}
    await queryInterface.addIndex('user_permissions', ['team_id']);
    await queryInterface.addIndex('user_permissions', ['permission_type']);
    await queryInterface.addIndex('user_permissions', ['is_granted']);

    // Add unique constraint
    await queryInterface.addConstraint('user_permissions', {
      fields: ['user_id', 'team_id', 'permission_type'],
      type: 'unique',
      name: 'unique_user_team_permission'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('user_permissions');
  }
};
