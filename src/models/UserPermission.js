const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserPermission = sequelize.define('UserPermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
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
  permission_type: {
    type: DataTypes.ENUM(
      'depth_chart_view',
      'depth_chart_create',
      'depth_chart_edit',
      'depth_chart_delete',
      'depth_chart_manage_positions',
      'player_assign',
      'player_unassign',
      'schedule_view',
      'schedule_create',
      'schedule_edit',
      'schedule_delete',
      'reports_view',
      'reports_create',
      'reports_edit',
      'reports_delete',
      'team_settings',
      'team_management',
      'user_management'
    ),
    allowNull: false
  },
  is_granted: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  granted_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  granted_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'user_permissions',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['team_id']
    },
    {
      fields: ['permission_type']
    },
    {
      fields: ['is_granted']
    },
    {
      unique: true,
      fields: ['user_id', 'team_id', 'permission_type']
    }
  ]
});

module.exports = UserPermission;
