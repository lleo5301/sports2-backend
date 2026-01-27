const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NewsRelease = sequelize.define('NewsRelease', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'News release title'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Full content/body of the release'
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Short summary or excerpt'
  },
  author: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Author name'
  },
  publish_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Publication date'
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Category (game recap, roster move, etc.)'
  },
  image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Featured image URL'
  },
  source_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Original article URL'
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'players',
      key: 'id'
    },
    comment: 'Associated player (if player-specific news)'
  },
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'PrestoSports release ID'
  },
  source_system: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'presto',
    comment: 'Source of this release'
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last sync from external source'
  }
}, {
  tableName: 'news_releases',
  timestamps: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['external_id'],
      unique: true
    },
    {
      fields: ['publish_date']
    },
    {
      fields: ['player_id']
    }
  ]
});

module.exports = NewsRelease;
