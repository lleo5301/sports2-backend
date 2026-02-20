'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('opponent_game_stats', {
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
      // Opponent identification
      opponent_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Opponent team name from box score'
      },
      opponent_presto_team_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Presto team ID for linking to league-teams'
      },
      player_name: {
        type: Sequelize.STRING(150),
        allowNull: true,
        comment: 'Opponent player name from box score'
      },
      jersey_number: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'Uniform number'
      },
      is_starter: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      batting_order: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Spot in the batting order (1-9)'
      },
      position_played: {
        type: Sequelize.STRING(10),
        allowNull: true
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'presto'
      },
      last_synced_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('opponent_game_stats', ['game_id']);
    await queryInterface.addIndex('opponent_game_stats', ['team_id']);
    await queryInterface.addIndex('opponent_game_stats', ['opponent_name']);
    await queryInterface.addIndex('opponent_game_stats', ['opponent_presto_team_id']);
    await queryInterface.addIndex('opponent_game_stats', ['opponent_name', 'jersey_number']);
    await queryInterface.addIndex('opponent_game_stats', ['game_id', 'opponent_name', 'jersey_number'], {
      unique: true,
      name: 'opponent_game_stats_unique_player'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opponent_game_stats');
  }
};
