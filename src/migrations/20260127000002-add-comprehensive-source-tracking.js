'use strict';

/**
 * Comprehensive migration for source tracking and extended PrestoSports sync
 *
 * Adds:
 * 1. Source tracking fields to Team model
 * 2. Team record fields (W-L tracking)
 * 3. Enhanced game detail fields
 * 4. Presto-specific player ID field
 * 5. PlayerSeasonStats table
 * 6. PlayerCareerStats table
 * 7. Unique constraint on GameStatistic.external_id
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add source tracking and record fields to teams table
    await queryInterface.addColumn('teams', 'external_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true
    });

    await queryInterface.addColumn('teams', 'source_system', {
      type: Sequelize.ENUM('manual', 'presto'),
      allowNull: false,
      defaultValue: 'manual'
    });

    await queryInterface.addColumn('teams', 'wins', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('teams', 'losses', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('teams', 'ties', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('teams', 'conference_wins', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('teams', 'conference_losses', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('teams', 'record_last_synced_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // 2. Add presto_player_id to players table (explicit external ID tracking)
    await queryInterface.addColumn('players', 'presto_player_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'PrestoSports player ID for explicit source tracking'
    });

    // 3. Add enhanced game detail fields
    await queryInterface.addColumn('games', 'attendance', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('games', 'weather', {
      type: Sequelize.STRING(200),
      allowNull: true
    });

    await queryInterface.addColumn('games', 'game_duration', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Game duration in format like "2:45"'
    });

    await queryInterface.addColumn('games', 'presto_event_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'PrestoSports event ID for explicit source tracking'
    });

    // 4. Create player_season_stats table
    await queryInterface.createTable('player_season_stats', {
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
      season: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Season identifier like "2024-25"'
      },
      presto_season_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'PrestoSports season ID'
      },

      // Batting stats (season aggregates)
      games_played: { type: Sequelize.INTEGER, defaultValue: 0 },
      games_started: { type: Sequelize.INTEGER, defaultValue: 0 },
      at_bats: { type: Sequelize.INTEGER, defaultValue: 0 },
      runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      hits: { type: Sequelize.INTEGER, defaultValue: 0 },
      doubles: { type: Sequelize.INTEGER, defaultValue: 0 },
      triples: { type: Sequelize.INTEGER, defaultValue: 0 },
      home_runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      rbi: { type: Sequelize.INTEGER, defaultValue: 0 },
      walks: { type: Sequelize.INTEGER, defaultValue: 0 },
      strikeouts: { type: Sequelize.INTEGER, defaultValue: 0 },
      stolen_bases: { type: Sequelize.INTEGER, defaultValue: 0 },
      caught_stealing: { type: Sequelize.INTEGER, defaultValue: 0 },
      hit_by_pitch: { type: Sequelize.INTEGER, defaultValue: 0 },
      sacrifice_flies: { type: Sequelize.INTEGER, defaultValue: 0 },
      sacrifice_bunts: { type: Sequelize.INTEGER, defaultValue: 0 },

      // Calculated batting stats
      batting_average: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      on_base_percentage: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      slugging_percentage: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      ops: { type: Sequelize.DECIMAL(4, 3), allowNull: true },

      // Pitching stats (season aggregates)
      pitching_appearances: { type: Sequelize.INTEGER, defaultValue: 0 },
      pitching_starts: { type: Sequelize.INTEGER, defaultValue: 0 },
      innings_pitched: { type: Sequelize.DECIMAL(5, 1), defaultValue: 0 },
      pitching_wins: { type: Sequelize.INTEGER, defaultValue: 0 },
      pitching_losses: { type: Sequelize.INTEGER, defaultValue: 0 },
      saves: { type: Sequelize.INTEGER, defaultValue: 0 },
      holds: { type: Sequelize.INTEGER, defaultValue: 0 },
      hits_allowed: { type: Sequelize.INTEGER, defaultValue: 0 },
      runs_allowed: { type: Sequelize.INTEGER, defaultValue: 0 },
      earned_runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      walks_allowed: { type: Sequelize.INTEGER, defaultValue: 0 },
      strikeouts_pitching: { type: Sequelize.INTEGER, defaultValue: 0 },
      home_runs_allowed: { type: Sequelize.INTEGER, defaultValue: 0 },

      // Calculated pitching stats
      era: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      whip: { type: Sequelize.DECIMAL(4, 2), allowNull: true },
      k_per_9: { type: Sequelize.DECIMAL(4, 2), allowNull: true },
      bb_per_9: { type: Sequelize.DECIMAL(4, 2), allowNull: true },

      // Fielding stats (season aggregates)
      fielding_games: { type: Sequelize.INTEGER, defaultValue: 0 },
      putouts: { type: Sequelize.INTEGER, defaultValue: 0 },
      assists: { type: Sequelize.INTEGER, defaultValue: 0 },
      errors: { type: Sequelize.INTEGER, defaultValue: 0 },
      fielding_percentage: { type: Sequelize.DECIMAL(4, 3), allowNull: true },

      // Source tracking
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        allowNull: false,
        defaultValue: 'manual'
      },
      last_synced_at: {
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

    // Add indexes for player_season_stats
    await queryInterface.addIndex('player_season_stats', ['player_id']);
    await queryInterface.addIndex('player_season_stats', ['team_id']);
    await queryInterface.addIndex('player_season_stats', ['season']);
    await queryInterface.addIndex('player_season_stats', ['player_id', 'season'], { unique: true });
    await queryInterface.addIndex('player_season_stats', ['source_system']);

    // 5. Create player_career_stats table
    await queryInterface.createTable('player_career_stats', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'players',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Career batting totals
      seasons_played: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_games: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_at_bats: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_hits: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_doubles: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_triples: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_home_runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_rbi: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_walks: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_strikeouts: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_stolen_bases: { type: Sequelize.INTEGER, defaultValue: 0 },

      // Career calculated stats
      career_batting_average: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      career_obp: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      career_slg: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
      career_ops: { type: Sequelize.DECIMAL(4, 3), allowNull: true },

      // Career pitching totals
      career_pitching_appearances: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_innings_pitched: { type: Sequelize.DECIMAL(6, 1), defaultValue: 0 },
      career_wins: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_losses: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_saves: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_earned_runs: { type: Sequelize.INTEGER, defaultValue: 0 },
      career_strikeouts_pitching: { type: Sequelize.INTEGER, defaultValue: 0 },

      // Career calculated pitching
      career_era: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      career_whip: { type: Sequelize.DECIMAL(4, 2), allowNull: true },

      // Source tracking
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true
      },
      source_system: {
        type: Sequelize.ENUM('manual', 'presto'),
        allowNull: false,
        defaultValue: 'manual'
      },
      last_synced_at: {
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

    // Add indexes for player_career_stats
    await queryInterface.addIndex('player_career_stats', ['source_system']);

    // 6. Add unique constraint to game_statistics.external_id (if not null)
    // First check if index exists, then create conditionally
    try {
      await queryInterface.addIndex('game_statistics', ['external_id'], {
        unique: true,
        where: { external_id: { [Sequelize.Op.ne]: null } },
        name: 'game_statistics_external_id_unique'
      });
    } catch (e) {
      console.log('Index may already exist or partial unique not supported, skipping');
    }

    // Add indexes for new team fields
    await queryInterface.addIndex('teams', ['source_system']);
    await queryInterface.addIndex('teams', ['external_id']);
  },

  async down(queryInterface, _Sequelize) {
    // Remove player_career_stats table
    await queryInterface.dropTable('player_career_stats');

    // Remove player_season_stats table
    await queryInterface.dropTable('player_season_stats');

    // Remove game_statistics unique index
    try {
      await queryInterface.removeIndex('game_statistics', 'game_statistics_external_id_unique');
    } catch (e) {
      console.log('Index may not exist, skipping removal');
    }

    // Remove game columns
    await queryInterface.removeColumn('games', 'presto_event_id');
    await queryInterface.removeColumn('games', 'game_duration');
    await queryInterface.removeColumn('games', 'weather');
    await queryInterface.removeColumn('games', 'attendance');

    // Remove player column
    await queryInterface.removeColumn('players', 'presto_player_id');

    // Remove team columns
    await queryInterface.removeIndex('teams', ['source_system']);
    await queryInterface.removeIndex('teams', ['external_id']);
    await queryInterface.removeColumn('teams', 'record_last_synced_at');
    await queryInterface.removeColumn('teams', 'conference_losses');
    await queryInterface.removeColumn('teams', 'conference_wins');
    await queryInterface.removeColumn('teams', 'ties');
    await queryInterface.removeColumn('teams', 'losses');
    await queryInterface.removeColumn('teams', 'wins');
    await queryInterface.removeColumn('teams', 'source_system');
    await queryInterface.removeColumn('teams', 'external_id');

    // Drop ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_teams_source_system";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_season_stats_source_system";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_career_stats_source_system";');
  }
};
