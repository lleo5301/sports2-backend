const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Team = sequelize.define('Team', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  program_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  school_logo_url: {
    type: DataTypes.STRING,
    allowNull: true
    // Note: Accepts both full URLs and relative paths for internal uploads
  },
  conference: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  division: {
    type: DataTypes.ENUM('D1', 'D2', 'D3', 'NAIA', 'JUCO'),
    allowNull: false,
    defaultValue: 'D1'
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [2, 2]
    }
  },
  primary_color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#000000',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  secondary_color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#FFFFFF',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  subscription_tier: {
    type: DataTypes.ENUM('basic', 'premium', 'enterprise'),
    defaultValue: 'basic'
  },
  subscription_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // PrestoSports integration credentials (encrypted)
  presto_credentials: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encrypted PrestoSports API credentials and settings'
  },
  presto_team_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'PrestoSports team ID for this team'
  },
  presto_season_id: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'PrestoSports season ID currently syncing'
  },
  presto_last_sync_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last successful sync with PrestoSports'
  },
  // Source tracking (standardized across all models)
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  source_system: {
    type: DataTypes.ENUM('manual', 'presto'),
    allowNull: false,
    defaultValue: 'manual'
  },
  // Team record fields
  wins: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  losses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  ties: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  conference_wins: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  conference_losses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  record_last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scouting_grade_scale: {
    type: DataTypes.ENUM('20-80', 'letter'),
    allowNull: false,
    defaultValue: 'letter'
  }
}, {
  tableName: 'teams'
});

module.exports = Team;
