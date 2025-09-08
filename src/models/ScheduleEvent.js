const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScheduleEvent = sequelize.define('ScheduleEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 200]
    },
    comment: 'Title of the event (e.g., "Practice", "Game vs Team A")'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed description of the event'
  },
  event_type: {
    type: DataTypes.ENUM(
      'practice',
      'game',
      'scrimmage',
      'tournament',
      'meeting',
      'training',
      'conditioning',
      'team_building',
      'other'
    ),
    allowNull: false,
    defaultValue: 'practice',
    comment: 'Type of event for categorization'
  },
  schedule_template_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'schedule_templates',
      key: 'id'
    },
    comment: 'Schedule template this event belongs to'
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'locations',
      key: 'id'
    },
    comment: 'Location where the event takes place'
  },
  start_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'Start time of the event (time only, dates are separate)'
  },
  end_time: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: 'End time of the event (time only, dates are separate)'
  },
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1,
      max: 1440 // Max 24 hours
    },
    comment: 'Duration in minutes (alternative to end_time)'
  },
  recurring_pattern: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Recurring pattern configuration (days of week, frequency, etc.)'
  },
  required_equipment: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'List of required equipment for this event'
  },
  max_participants: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1
    },
    comment: 'Maximum number of participants for this event'
  },
  target_groups: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Target groups (positions, skill levels, etc.) for this event'
  },
  preparation_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Notes about preparation needed for this event'
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
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    comment: 'Priority level of the event'
  }
}, {
  tableName: 'schedule_events',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['schedule_template_id']
    },
    {
      fields: ['location_id']
    },
    {
      fields: ['team_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['event_type']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['start_time']
    }
  ]
});

module.exports = ScheduleEvent;

