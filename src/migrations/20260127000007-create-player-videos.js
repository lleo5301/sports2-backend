'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_videos', {
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
      title: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Video title'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Video description'
      },
      url: {
        type: Sequelize.STRING(1000),
        allowNull: false,
        comment: 'Video URL'
      },
      thumbnail_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
        comment: 'Thumbnail image URL'
      },
      embed_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
        comment: 'Embeddable video URL'
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration in seconds'
      },
      video_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Type: highlight, game, interview, etc.'
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Video provider: youtube, vimeo, hudl, etc.'
      },
      provider_video_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Provider-specific video ID'
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the video was published'
      },
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Number of views'
      },
      // Source tracking
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'PrestoSports video ID'
      },
      source_system: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'presto',
        comment: 'Source of this video'
      },
      last_synced_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last sync from external source'
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

    // Index for finding videos by player
    await queryInterface.addIndex('player_videos', ['player_id'], {
      name: 'idx_player_videos_player'
    });

    // Index for finding videos by team
    await queryInterface.addIndex('player_videos', ['team_id'], {
      name: 'idx_player_videos_team'
    });

    // Index for external ID (for upsert)
    await queryInterface.addIndex('player_videos', ['external_id'], {
      name: 'idx_player_videos_external_id',
      unique: true
    });

    // Index for video type
    await queryInterface.addIndex('player_videos', ['video_type'], {
      name: 'idx_player_videos_type'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('player_videos');
  }
};
