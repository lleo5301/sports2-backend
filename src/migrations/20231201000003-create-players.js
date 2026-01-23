'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('players', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      school_type: {
        type: Sequelize.ENUM('HS', 'COLL'),
        allowNull: false,
        defaultValue: 'HS'
      },
      position: {
        type: Sequelize.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH'),
        allowNull: false
      },
      height: {
        type: Sequelize.STRING,
        allowNull: true
      },
      weight: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      birth_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      graduation_year: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      school: {
        type: Sequelize.STRING,
        allowNull: true
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      batting_avg: {
        type: Sequelize.DECIMAL(4, 3),
        allowNull: true
      },
      home_runs: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      rbi: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      stolen_bases: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      era: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      wins: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      losses: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      strikeouts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      innings_pitched: {
        type: Sequelize.DECIMAL(4, 1),
        allowNull: true
      },
      has_medical_issues: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      injury_details: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      has_comparison: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      comparison_player: {
        type: Sequelize.STRING,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'graduated', 'transferred'),
        defaultValue: 'active'
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'teams',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
      video_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'manual'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      jersey_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      class_year: {
        type: Sequelize.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
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

    // Add indexes
    await queryInterface.addIndex('players', ['external_id'], { unique: true });
    await queryInterface.addIndex('players', ['source_system']);
    await queryInterface.addIndex('players', ['team_id']);
    await queryInterface.addIndex('players', ['position']);
    await queryInterface.addIndex('players', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('players');
  }
};
