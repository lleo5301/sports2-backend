'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('schedule_event_dates', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      schedule_event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'schedule_events',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      event_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      start_time_override: {
        type: Sequelize.TIME,
        allowNull: true
      },
      end_time_override: {
        type: Sequelize.TIME,
        allowNull: true
      },
      location_id_override: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'locations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'confirmed', 'cancelled', 'postponed', 'completed'),
        defaultValue: 'scheduled'
      },
      cancellation_reason: {
        type: Sequelize.STRING,
        allowNull: true
      },
      weather_conditions: {
        type: Sequelize.STRING,
        allowNull: true
      },
      attendance_count: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('schedule_event_dates', ['schedule_event_id']);
    await queryInterface.addIndex('schedule_event_dates', ['event_date']);
    await queryInterface.addIndex('schedule_event_dates', ['location_id_override']);
    await queryInterface.addIndex('schedule_event_dates', ['team_id']);
    await queryInterface.addIndex('schedule_event_dates', ['status']);
    await queryInterface.addIndex('schedule_event_dates', ['event_date', 'schedule_event_id'], {
      unique: true,
      name: 'unique_event_date_per_schedule_event'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('schedule_event_dates');
  }
};
