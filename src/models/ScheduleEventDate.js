const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScheduleEventDate = sequelize.define('ScheduleEventDate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  schedule_event_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'schedule_events',
      key: 'id'
    },
    comment: 'Schedule event this date belongs to'
  },
  event_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date when the event occurs'
  },
  start_time_override: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Override start time for this specific date (if different from event default)'
  },
  end_time_override: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Override end time for this specific date (if different from event default)'
  },
  location_id_override: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'locations',
      key: 'id'
    },
    comment: 'Override location for this specific date (if different from event default)'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Specific notes for this date occurrence'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'confirmed', 'cancelled', 'postponed', 'completed'),
    defaultValue: 'scheduled',
    comment: 'Status of this specific event occurrence'
  },
  cancellation_reason: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Reason for cancellation or postponement'
  },
  weather_conditions: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Weather conditions for this date (if relevant)'
  },
  attendance_count: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Actual attendance count for this event occurrence'
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
  }
}, {
  tableName: 'schedule_event_dates',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['schedule_event_id']
    },
    {
      fields: ['event_date']
    },
    {
      fields: ['location_id_override']
    },
    {
      fields: ['team_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['event_date', 'schedule_event_id'],
      unique: true,
      name: 'unique_event_date_per_schedule_event'
    }
  ]
});

module.exports = ScheduleEventDate;
