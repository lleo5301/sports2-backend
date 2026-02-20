'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tournaments', {
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
        onDelete: 'RESTRICT'
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      season: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      season_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      tournament_type: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'tournament | invitational | scrimmage'
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

    await queryInterface.addIndex('tournaments', ['team_id']);
    await queryInterface.addIndex('tournaments', ['season']);
    await queryInterface.addIndex('tournaments', ['team_id', 'name', 'season'], {
      unique: true,
      name: 'tournaments_team_name_season_unique'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tournaments');
  }
};
