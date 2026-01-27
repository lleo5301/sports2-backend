'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create credential_type ENUM
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_integration_credentials_credential_type" AS ENUM ('oauth2', 'basic', 'api_key');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create integration_credentials table
    await queryInterface.createTable('integration_credentials', {
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
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Integration provider: presto, hudl, synergy, etc.'
      },
      credential_type: {
        type: Sequelize.ENUM('oauth2', 'basic', 'api_key'),
        allowNull: false,
        defaultValue: 'basic'
      },
      // Basic auth credentials (encrypted JSON: {username, password})
      credentials_encrypted: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Encrypted JSON with username/password or API key'
      },
      // OAuth tokens (encrypted)
      access_token_encrypted: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Encrypted access token'
      },
      refresh_token_encrypted: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Encrypted refresh token'
      },
      token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the access token expires'
      },
      refresh_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the refresh token expires (if applicable)'
      },
      // Metadata
      last_refreshed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last successful token refresh'
      },
      refresh_error_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Consecutive refresh failures (for backoff)'
      },
      last_refresh_error: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Last refresh error message (sanitized)'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'False if deactivated due to errors or user action'
      },
      config: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Provider-specific configuration (team_id, season_id, etc.)'
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

    // Create unique constraint: one credential per provider per team
    await queryInterface.addIndex('integration_credentials', ['team_id', 'provider'], {
      name: 'idx_integration_credentials_team_provider',
      unique: true
    });

    // Index for finding credentials by provider
    await queryInterface.addIndex('integration_credentials', ['provider'], {
      name: 'idx_integration_credentials_provider'
    });

    // Index for finding active credentials
    await queryInterface.addIndex('integration_credentials', ['is_active'], {
      name: 'idx_integration_credentials_active'
    });

    // Index for finding expired tokens (for refresh job)
    await queryInterface.addIndex('integration_credentials', ['token_expires_at'], {
      name: 'idx_integration_credentials_token_expires'
    });

    // Migrate existing presto credentials from teams table
    await queryInterface.sequelize.query(`
      INSERT INTO integration_credentials (team_id, provider, credential_type, credentials_encrypted, config, is_active, created_at, updated_at)
      SELECT
        id as team_id,
        'presto' as provider,
        'basic' as credential_type,
        presto_credentials as credentials_encrypted,
        jsonb_build_object(
          'team_id', presto_team_id,
          'season_id', presto_season_id
        ) as config,
        CASE WHEN presto_credentials IS NOT NULL THEN true ELSE false END as is_active,
        COALESCE(presto_last_sync_at, NOW()) as created_at,
        NOW() as updated_at
      FROM teams
      WHERE presto_credentials IS NOT NULL;
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('integration_credentials');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_integration_credentials_credential_type";');
  }
};
