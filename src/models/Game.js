const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  opponent: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  game_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  home_away: {
    type: DataTypes.ENUM('home', 'away'),
    allowNull: false
  },
  team_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  opponent_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  result: {
    type: DataTypes.ENUM('W', 'L', 'T'),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(200),
    allowNull: true,
    validate: {
      len: [0, 200]
    }
  },
  season: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      len: [0, 20]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [0, 1000]
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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // PrestoSports sync fields
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'PrestoSports event ID'
  },
  source_system: {
    type: DataTypes.ENUM('manual', 'presto'),
    defaultValue: 'manual',
    comment: 'Source of this game record'
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last sync from PrestoSports'
  },
  game_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Game start time'
  },
  game_status: {
    type: DataTypes.ENUM('scheduled', 'completed', 'cancelled', 'postponed'),
    defaultValue: 'scheduled',
    comment: 'Game status'
  }
}, {
  tableName: 'games',
  timestamps: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['game_date']
    },
    {
      fields: ['season']
    },
    {
      fields: ['result']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['external_id'],
      unique: true
    },
    {
      fields: ['source_system']
    }
  ]
});

// Associations are defined in models/index.js

module.exports = Game; 