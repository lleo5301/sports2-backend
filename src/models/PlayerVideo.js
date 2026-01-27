const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlayerVideo = sequelize.define('PlayerVideo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'players',
      key: 'id'
    }
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
    allowNull: true,
    comment: 'Video title'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Video description'
  },
  url: {
    type: DataTypes.STRING(1000),
    allowNull: false,
    comment: 'Video URL'
  },
  thumbnail_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    comment: 'Thumbnail image URL'
  },
  embed_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
    comment: 'Embeddable video URL'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in seconds'
  },
  video_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type: highlight, game, interview, etc.'
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Video provider: youtube, vimeo, hudl, etc.'
  },
  provider_video_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Provider-specific video ID'
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When the video was published'
  },
  view_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Number of views'
  },
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'PrestoSports video ID'
  },
  source_system: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'presto',
    comment: 'Source of this video'
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last sync from external source'
  }
}, {
  tableName: 'player_videos',
  timestamps: true,
  indexes: [
    {
      fields: ['player_id']
    },
    {
      fields: ['team_id']
    },
    {
      fields: ['external_id'],
      unique: true
    },
    {
      fields: ['video_type']
    }
  ]
});

// Video types
PlayerVideo.VIDEO_TYPES = {
  HIGHLIGHT: 'highlight',
  GAME: 'game',
  INTERVIEW: 'interview',
  TRAINING: 'training',
  PROMOTIONAL: 'promotional',
  OTHER: 'other'
};

module.exports = PlayerVideo;
