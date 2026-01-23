'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const gradeEnum = Sequelize.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F');
    const ratingEnum = Sequelize.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor');

    await queryInterface.createTable('scouting_reports', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
      game_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      opponent: {
        type: Sequelize.STRING,
        allowNull: true
      },
      overall_grade: {
        type: gradeEnum,
        allowNull: true
      },
      overall_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      hitting_grade: {
        type: gradeEnum,
        allowNull: true
      },
      hitting_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      bat_speed: {
        type: ratingEnum,
        allowNull: true
      },
      power_potential: {
        type: ratingEnum,
        allowNull: true
      },
      plate_discipline: {
        type: ratingEnum,
        allowNull: true
      },
      pitching_grade: {
        type: gradeEnum,
        allowNull: true
      },
      pitching_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      fastball_velocity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      fastball_grade: {
        type: gradeEnum,
        allowNull: true
      },
      breaking_ball_grade: {
        type: gradeEnum,
        allowNull: true
      },
      command: {
        type: ratingEnum,
        allowNull: true
      },
      fielding_grade: {
        type: gradeEnum,
        allowNull: true
      },
      fielding_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      arm_strength: {
        type: ratingEnum,
        allowNull: true
      },
      arm_accuracy: {
        type: ratingEnum,
        allowNull: true
      },
      range: {
        type: ratingEnum,
        allowNull: true
      },
      speed_grade: {
        type: gradeEnum,
        allowNull: true
      },
      speed_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      home_to_first: {
        type: Sequelize.DECIMAL(3, 1),
        allowNull: true
      },
      intangibles_grade: {
        type: gradeEnum,
        allowNull: true
      },
      intangibles_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      work_ethic: {
        type: ratingEnum,
        allowNull: true
      },
      coachability: {
        type: ratingEnum,
        allowNull: true
      },
      projection: {
        type: Sequelize.ENUM('MLB', 'AAA', 'AA', 'A+', 'A', 'A-', 'College', 'High School'),
        allowNull: true
      },
      projection_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_draft: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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
    await queryInterface.dropTable('scouting_reports');
  }
};
