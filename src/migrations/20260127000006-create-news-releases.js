'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('news_releases', {
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
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'News release title'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Full content/body of the release'
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Short summary or excerpt'
      },
      author: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'Author name'
      },
      publish_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Publication date'
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Category (game recap, roster move, etc.)'
      },
      image_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Featured image URL'
      },
      source_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Original article URL'
      },
      // Link to player if player-specific news
      player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'players',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Associated player (if player-specific news)'
      },
      // Source tracking
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'PrestoSports release ID'
      },
      source_system: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'presto',
        comment: 'Source of this release'
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

    // Index for finding releases by team
    await queryInterface.addIndex('news_releases', ['team_id'], {
      name: 'idx_news_releases_team'
    });

    // Index for external ID (for upsert)
    await queryInterface.addIndex('news_releases', ['external_id'], {
      name: 'idx_news_releases_external_id',
      unique: true
    });

    // Index for publish date (for sorting)
    await queryInterface.addIndex('news_releases', ['publish_date'], {
      name: 'idx_news_releases_publish_date'
    });

    // Index for player-specific news
    await queryInterface.addIndex('news_releases', ['player_id'], {
      name: 'idx_news_releases_player'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('news_releases');
  }
};
