const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScheduleActivity = sequelize.define('ScheduleActivity', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  section_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'schedule_sections',
      key: 'id'
    }
  },
  time: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  activity: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  },
  staff: {
    type: DataTypes.STRING,
    allowNull: true
  },
  group: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'schedule_activities',
  timestamps: true,
  underscored: true
});

module.exports = ScheduleActivity;
