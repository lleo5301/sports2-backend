'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('schedule_events', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      event_type: {
        type: Sequelize.ENUM(
          'practice',
          'game',
          'scrimmage',
          'tournament',
          'meeting',
          'training',
          'conditioning',
          'team_building',
          'other'
        ),
        allowNull: false,
        defaultValue: 'practice'
      },
      schedule_template_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'schedule_templates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      location_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'locations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      start_time: {
        type: Sequelize.TIME,
        allowNull: true
      },
      end_time: {
        type: Sequelize.TIME,
        allowNull: true
      },
      duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      recurring_pattern: {
        type: Sequelize.JSON,
        allowNull: true
      },
      required_equipment: {
        type: Sequelize.JSON,
        allowNull: true
      },
      max_participants: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      target_groups: {
        type: Sequelize.JSON,
        allowNull: true
      },
      preparation_notes: {
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
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'medium'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('schedule_events', ['schedule_template_id']);
    await queryInterface.addIndex('schedule_events', ['location_id']);
    await queryInterface.addIndex('schedule_events', ['team_id']);
    await queryInterface.addIndex('schedule_events', ['created_by']);
    await queryInterface.addIndex('schedule_events', ['event_type']);
    await queryInterface.addIndex('schedule_events', ['is_active']);
    await queryInterface.addIndex('schedule_events', ['start_time']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('schedule_events');
  }
};
