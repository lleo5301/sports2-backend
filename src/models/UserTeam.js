'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserTeam = sequelize.define('UserTeam', {
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
  role: {
    type: DataTypes.ENUM('primary', 'secondary'),
    defaultValue: 'secondary',
    allowNull: false,
    comment: 'Primary is the main team, secondary for additional teams'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'user_teams',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'team_id'],
      name: 'user_teams_user_team_unique'
    }
  ]
});

module.exports = UserTeam;
