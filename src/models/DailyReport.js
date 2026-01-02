const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DailyReport = sequelize.define('DailyReport', {
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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  report_type: {
    type: DataTypes.ENUM('practice', 'game', 'scrimmage', 'workout'),
    allowNull: false,
    defaultValue: 'practice'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  weather: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  temperature: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: -50,
      max: 120
    }
  },
  // Practice/Game details
  opponent: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 200]
    }
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: true
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: true
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 480
    }
  },
  // Game results (if applicable)
  home_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  away_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  innings: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 20
    }
  },
  // Activities and notes
  activities: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  highlights: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  concerns: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  next_steps: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Player attendance
  players_present: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  players_absent: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  // Equipment and facilities
  equipment_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  facility_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Status
  is_complete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_approved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'daily_reports'
});

module.exports = DailyReport;
