'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create sync_type ENUM
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_sync_logs_sync_type" AS ENUM (
          'roster', 'schedule', 'stats', 'team_record',
          'season_stats', 'career_stats', 'full'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create source_system ENUM
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_sync_logs_source_system" AS ENUM ('presto', 'manual', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create status ENUM
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_sync_logs_status" AS ENUM ('started', 'completed', 'partial', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create sync_logs table
    await queryInterface.createTable('sync_logs', {
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
      sync_type: {
        type: Sequelize.ENUM('roster', 'schedule', 'stats', 'team_record', 'season_stats', 'career_stats', 'full'),
        allowNull: false
      },
      source_system: {
        type: Sequelize.ENUM('presto', 'manual', 'other'),
        allowNull: false,
        defaultValue: 'presto'
      },
      api_endpoint: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Sanitized API endpoint called (tokens redacted)'
      },
      status: {
        type: Sequelize.ENUM('started', 'completed', 'partial', 'failed'),
        allowNull: false,
        defaultValue: 'started'
      },
      initiated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'User who triggered sync (null for automated)'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Sync duration in milliseconds'
      },
      // Request context
      request_params: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Sanitized request parameters (no credentials)'
      },
      // Result counts
      items_created: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      items_updated: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      items_skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      items_failed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Response summary
      response_summary: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'High-level sync results'
      },
      // Error tracking
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Main error message if sync failed'
      },
      item_errors: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Array of individual item failures'
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

    // Create indexes
    await queryInterface.addIndex('sync_logs', ['team_id'], {
      name: 'idx_sync_logs_team_id'
    });

    await queryInterface.addIndex('sync_logs', ['sync_type'], {
      name: 'idx_sync_logs_sync_type'
    });

    await queryInterface.addIndex('sync_logs', ['status'], {
      name: 'idx_sync_logs_status'
    });

    await queryInterface.addIndex('sync_logs', ['started_at'], {
      name: 'idx_sync_logs_started_at'
    });

    // Composite index for "last sync of type X for team Y"
    await queryInterface.addIndex('sync_logs', ['team_id', 'sync_type', 'started_at'], {
      name: 'idx_sync_logs_team_type_date'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('sync_logs');

    // Drop ENUMs
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sync_logs_sync_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sync_logs_source_system";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sync_logs_status";');
  }
};
