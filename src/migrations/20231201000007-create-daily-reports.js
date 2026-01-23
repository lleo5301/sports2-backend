'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('daily_reports', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
      report_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      report_type: {
        type: Sequelize.ENUM('practice', 'game', 'scrimmage', 'workout'),
        allowNull: false,
        defaultValue: 'practice'
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      weather: {
        type: Sequelize.STRING,
        allowNull: true
      },
      temperature: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      opponent: {
        type: Sequelize.STRING,
        allowNull: true
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true
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
      home_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      away_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      innings: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      activities: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      highlights: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      concerns: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      next_steps: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      players_present: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      players_absent: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      equipment_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      facility_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_complete: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_approved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('daily_reports');
  }
};
