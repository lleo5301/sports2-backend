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
    allowNull: true  // Allow null for TBD games (future season schedules)
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
  season_name: {
    type: DataTypes.STRING(100),
    allowNull: true
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
  // Enhanced game details
  attendance: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  weather: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  game_duration: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Game duration in format like "2:45"'
  },
  // PrestoSports sync fields
  presto_event_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'PrestoSports event ID for explicit source tracking'
  },
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
  },

  // Extended Presto game stats
  team_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Per-game team stats from Presto'
  },
  opponent_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Per-game opponent stats'
  },
  game_summary: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'e.g. "W, 5-3"'
  },
  running_record: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Team record at time of game'
  },
  running_conference_record: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Conference record at time of game'
  },

  // Opponent branding
  opponent_logo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Opponent team logo URL from PrestoSports'
  },

  // Event metadata from PrestoSports
  tournament_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'tournaments',
      key: 'id'
    }
  },
  venue_name: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Stadium / field name'
  },
  event_type: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'scrimmage | regular'
  },
  is_conference: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_neutral: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_post_season: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
    },
    {
      fields: ['tournament_id']
    },
    {
      fields: ['event_type']
    },
    {
      fields: ['is_conference']
    }
  ]
});

// Associations are defined in models/index.js

module.exports = Game;
