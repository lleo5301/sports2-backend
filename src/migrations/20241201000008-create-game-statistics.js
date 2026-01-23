'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_statistics', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      game_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'games',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'manual'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      position_played: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      // Batting statistics
      at_bats: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      runs: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      hits: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      doubles: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      triples: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
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
      walks: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      strikeouts_batting: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      stolen_bases: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      caught_stealing: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      hit_by_pitch: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      sacrifice_flies: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      sacrifice_bunts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      // Pitching statistics
      innings_pitched: {
        type: Sequelize.DECIMAL(4, 1),
        allowNull: true,
        defaultValue: 0
      },
      hits_allowed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      runs_allowed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      earned_runs: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      walks_allowed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      strikeouts_pitching: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      home_runs_allowed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      batters_faced: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      pitches_thrown: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      strikes_thrown: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      win: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      loss: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      save: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      hold: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      // Fielding statistics
      putouts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      assists: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      errors: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
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

    await queryInterface.addIndex('game_statistics', ['game_id']);
    await queryInterface.addIndex('game_statistics', ['player_id']);
    await queryInterface.addIndex('game_statistics', ['team_id']);
    await queryInterface.addIndex('game_statistics', ['game_id', 'player_id'], { unique: true });
    await queryInterface.addIndex('game_statistics', ['external_id']);
    await queryInterface.addIndex('game_statistics', ['source_system']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('game_statistics');
  }
};
