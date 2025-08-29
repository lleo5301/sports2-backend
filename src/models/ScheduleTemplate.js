const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScheduleTemplate = sequelize.define('ScheduleTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  template_data: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'JSON data containing sections and activities template'
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
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this is a default/base template'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'schedule_templates',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['is_default']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = ScheduleTemplate;
