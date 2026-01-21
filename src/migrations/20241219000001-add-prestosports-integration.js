'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Helper function to check if column exists
    const columnExists = async (tableName, columnName) => {
      const [results] = await queryInterface.sequelize.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' AND column_name = '${columnName}'
      `);
      return results.length > 0;
    };

    // Add PrestoSports fields to teams table (check if exists first)
    if (!(await columnExists('teams', 'presto_credentials'))) {
      await queryInterface.addColumn('teams', 'presto_credentials', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Encrypted PrestoSports API credentials and settings'
      });
    }

    if (!(await columnExists('teams', 'presto_team_id'))) {
      await queryInterface.addColumn('teams', 'presto_team_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'PrestoSports team ID for this team'
      });
    }

    if (!(await columnExists('teams', 'presto_season_id'))) {
      await queryInterface.addColumn('teams', 'presto_season_id', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'PrestoSports season ID currently syncing'
      });
    }

    if (!(await columnExists('teams', 'presto_last_sync_at'))) {
      await queryInterface.addColumn('teams', 'presto_last_sync_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last successful sync with PrestoSports'
      });
    }

    // Add sync metadata fields to games table (check if exists first)
    if (!(await columnExists('games', 'external_id'))) {
      await queryInterface.addColumn('games', 'external_id', {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
        comment: 'PrestoSports event ID'
      });
    }

    if (!(await columnExists('games', 'source_system'))) {
      await queryInterface.addColumn('games', 'source_system', {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'manual',
        comment: 'Source of this game record'
      });
    }

    if (!(await columnExists('games', 'last_synced_at'))) {
      await queryInterface.addColumn('games', 'last_synced_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last sync from PrestoSports'
      });
    }

    if (!(await columnExists('games', 'game_time'))) {
      await queryInterface.addColumn('games', 'game_time', {
        type: Sequelize.TIME,
        allowNull: true,
        comment: 'Game start time'
      });
    }

    if (!(await columnExists('games', 'game_status'))) {
      await queryInterface.addColumn('games', 'game_status', {
        type: Sequelize.ENUM('scheduled', 'completed', 'cancelled', 'postponed'),
        defaultValue: 'scheduled',
        comment: 'Game status'
      });
    }

    // Add indexes to games (check if exists first)
    const [gamesExternalIndex] = await queryInterface.sequelize.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'games' AND indexname = 'games_external_id_unique'
    `);
    if (gamesExternalIndex.length === 0) {
      await queryInterface.addIndex('games', ['external_id'], {
        unique: true,
        name: 'games_external_id_unique'
      });
    }

    const [gamesSourceIndex] = await queryInterface.sequelize.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'games' AND indexname = 'games_source_system_idx'
    `);
    if (gamesSourceIndex.length === 0) {
      await queryInterface.addIndex('games', ['source_system'], {
        name: 'games_source_system_idx'
      });
    }

    // Add sync metadata fields to players table (check if exists first)
    if (!(await columnExists('players', 'external_id'))) {
      await queryInterface.addColumn('players', 'external_id', {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
        comment: 'PrestoSports player ID'
      });
    }

    if (!(await columnExists('players', 'source_system'))) {
      await queryInterface.addColumn('players', 'source_system', {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'manual',
        comment: 'Source of this player record'
      });
    }

    if (!(await columnExists('players', 'last_synced_at'))) {
      await queryInterface.addColumn('players', 'last_synced_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last sync from PrestoSports'
      });
    }

    if (!(await columnExists('players', 'jersey_number'))) {
      await queryInterface.addColumn('players', 'jersey_number', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Player jersey number'
      });
    }

    if (!(await columnExists('players', 'class_year'))) {
      await queryInterface.addColumn('players', 'class_year', {
        type: Sequelize.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
        allowNull: true,
        comment: 'Academic class year'
      });
    }

    // Add indexes to players (check if exists first)
    const [playersExternalIndex] = await queryInterface.sequelize.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'players' AND indexname = 'players_external_id_unique'
    `);
    if (playersExternalIndex.length === 0) {
      await queryInterface.addIndex('players', ['external_id'], {
        unique: true,
        name: 'players_external_id_unique'
      });
    }

    const [playersSourceIndex] = await queryInterface.sequelize.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'players' AND indexname = 'players_source_system_idx'
    `);
    if (playersSourceIndex.length === 0) {
      await queryInterface.addIndex('players', ['source_system'], {
        name: 'players_source_system_idx'
      });
    }

    // Create game_statistics table (check if exists first)
    const [tables] = await queryInterface.sequelize.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'game_statistics'
    `);
    
    if (tables.length === 0) {
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
      // Sync fields
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'PrestoSports stat record ID'
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        defaultValue: 'manual',
        comment: 'Source of this stat record'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last sync from PrestoSports'
      },
      // Position played
      position_played: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'Position played in this game'
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
      // Timestamps
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

      // Add indexes to game_statistics (check if exists first)
      const [gameStatsGameIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_game_id_idx'
      `);
      if (gameStatsGameIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['game_id'], {
          name: 'game_statistics_game_id_idx'
        });
      }

      const [gameStatsPlayerIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_player_id_idx'
      `);
      if (gameStatsPlayerIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['player_id'], {
          name: 'game_statistics_player_id_idx'
        });
      }

      const [gameStatsTeamIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_team_id_idx'
      `);
      if (gameStatsTeamIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['team_id'], {
          name: 'game_statistics_team_id_idx'
        });
      }

      const [gameStatsUniqueIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_game_player_unique'
      `);
      if (gameStatsUniqueIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['game_id', 'player_id'], {
          unique: true,
          name: 'game_statistics_game_player_unique'
        });
      }

      const [gameStatsExternalIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_external_id_idx'
      `);
      if (gameStatsExternalIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['external_id'], {
          name: 'game_statistics_external_id_idx'
        });
      }

      const [gameStatsSourceIndex] = await queryInterface.sequelize.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'game_statistics' AND indexname = 'game_statistics_source_system_idx'
      `);
      if (gameStatsSourceIndex.length === 0) {
        await queryInterface.addIndex('game_statistics', ['source_system'], {
          name: 'game_statistics_source_system_idx'
        });
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Drop game_statistics table
    await queryInterface.dropTable('game_statistics');

    // Remove columns from players
    await queryInterface.removeIndex('players', 'players_external_id_unique');
    await queryInterface.removeIndex('players', 'players_source_system_idx');
    await queryInterface.removeColumn('players', 'class_year');
    await queryInterface.removeColumn('players', 'jersey_number');
    await queryInterface.removeColumn('players', 'last_synced_at');
    await queryInterface.removeColumn('players', 'source_system');
    await queryInterface.removeColumn('players', 'external_id');

    // Remove columns from games
    await queryInterface.removeIndex('games', 'games_external_id_unique');
    await queryInterface.removeIndex('games', 'games_source_system_idx');
    await queryInterface.removeColumn('games', 'game_status');
    await queryInterface.removeColumn('games', 'game_time');
    await queryInterface.removeColumn('games', 'last_synced_at');
    await queryInterface.removeColumn('games', 'source_system');
    await queryInterface.removeColumn('games', 'external_id');

    // Remove columns from teams
    await queryInterface.removeColumn('teams', 'presto_last_sync_at');
    await queryInterface.removeColumn('teams', 'presto_season_id');
    await queryInterface.removeColumn('teams', 'presto_team_id');
    await queryInterface.removeColumn('teams', 'presto_credentials');
  }
};
