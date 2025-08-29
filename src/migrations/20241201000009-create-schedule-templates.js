'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('schedule_templates', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      template_data: {
        type: Sequelize.JSON,
        allowNull: false
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
        onDelete: 'RESTRICT'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add indexes
    await queryInterface.addIndex('schedule_templates', ['team_id'], { name: 'schedule_templates_team_id_idx' });
    await queryInterface.addIndex('schedule_templates', ['created_by'], { name: 'schedule_templates_created_by_idx' });
    await queryInterface.addIndex('schedule_templates', ['is_default'], { name: 'schedule_templates_is_default_idx' });
    await queryInterface.addIndex('schedule_templates', ['is_active'], { name: 'schedule_templates_is_active_idx' });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('schedule_templates', 'schedule_templates_is_active_idx');
    await queryInterface.removeIndex('schedule_templates', 'schedule_templates_is_default_idx');
    await queryInterface.removeIndex('schedule_templates', 'schedule_templates_created_by_idx');
    await queryInterface.removeIndex('schedule_templates', 'schedule_templates_team_id_idx');

    await queryInterface.dropTable('schedule_templates');
  }
};
