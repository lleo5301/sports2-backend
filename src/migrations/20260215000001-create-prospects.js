'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('prospects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      photo_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      school_type: {
        type: Sequelize.ENUM('HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent'),
        allowNull: false,
        defaultValue: 'HS'
      },
      school_name: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      graduation_year: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      class_year: {
        type: Sequelize.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
        allowNull: true
      },
      primary_position: {
        type: Sequelize.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
        allowNull: false
      },
      secondary_position: {
        type: Sequelize.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
        allowNull: true
      },
      bats: {
        type: Sequelize.ENUM('L', 'R', 'S'),
        allowNull: true
      },
      throws: {
        type: Sequelize.ENUM('L', 'R'),
        allowNull: true
      },
      height: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      weight: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      sixty_yard_dash: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true
      },
      home_to_first: {
        type: Sequelize.DECIMAL(3, 1),
        allowNull: true
      },
      fastball_velocity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      exit_velocity: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      pop_time: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      gpa: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      sat_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      act_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      academic_eligibility: {
        type: Sequelize.ENUM('eligible', 'pending', 'ineligible', 'unknown'),
        allowNull: true,
        defaultValue: 'unknown'
      },
      status: {
        type: Sequelize.ENUM('identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed'),
        allowNull: false,
        defaultValue: 'identified'
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      video_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      social_links: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      external_profile_url: {
        type: Sequelize.STRING(500),
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

    await queryInterface.addIndex('prospects', ['team_id'], {
      name: 'idx_prospects_team_id'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'status'], {
      name: 'idx_prospects_status'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'primary_position'], {
      name: 'idx_prospects_position'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'school_type'], {
      name: 'idx_prospects_school_type'
    });
    await queryInterface.addIndex('prospects', ['team_id', 'last_name', 'first_name'], {
      name: 'idx_prospects_name'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('prospects');
  }
};
