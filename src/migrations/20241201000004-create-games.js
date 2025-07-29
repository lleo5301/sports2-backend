'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('games', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      opponent: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      game_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      home_away: {
        type: Sequelize.ENUM('home', 'away'),
        allowNull: false
      },
      team_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      opponent_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      result: {
        type: Sequelize.ENUM('W', 'L', 'T'),
        allowNull: true,
        comment: 'W = Win, L = Loss, T = Tie'
      },
      location: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      season: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      notes: {
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
    await queryInterface.addIndex('games', ['team_id']);
    await queryInterface.addIndex('games', ['game_date']);
    await queryInterface.addIndex('games', ['season']);
    await queryInterface.addIndex('games', ['result']);
    await queryInterface.addIndex('games', ['created_by']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('games');
  }
}; 