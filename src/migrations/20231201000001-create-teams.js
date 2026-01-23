'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('teams', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      program_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      school_logo_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      conference: {
        type: Sequelize.STRING,
        allowNull: true
      },
      division: {
        type: Sequelize.ENUM('D1', 'D2', 'D3', 'NAIA', 'JUCO'),
        allowNull: false,
        defaultValue: 'D1'
      },
      city: {
        type: Sequelize.STRING,
        allowNull: true
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true
      },
      primary_color: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: '#000000'
      },
      secondary_color: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: '#FFFFFF'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      subscription_tier: {
        type: Sequelize.ENUM('basic', 'premium', 'enterprise'),
        defaultValue: 'basic'
      },
      subscription_expires: {
        type: Sequelize.DATE,
        allowNull: true
      },
      presto_credentials: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      presto_team_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      presto_season_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      presto_last_sync_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('teams');
  }
};
