const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScheduleSection = sequelize.define('ScheduleSection', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  schedule_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'schedules',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM(
      'general',
      'position_players',
      'pitchers',
      'grinder_performance',
      'grinder_hitting',
      'grinder_defensive',
      'bullpen',
      'live_bp'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'schedule_sections',
  timestamps: true,
  underscored: true
});

module.exports = ScheduleSection;
