'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Roster = sequelize.define('Roster', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
    validate: { len: [1, 150] }
  },
  roster_type: {
    type: DataTypes.ENUM('game_day', 'travel', 'practice', 'season', 'custom'),
    allowNull: false,
    defaultValue: 'custom'
  },
  source: {
    type: DataTypes.ENUM('manual', 'presto'),
    allowNull: false,
    defaultValue: 'manual'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  game_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'games', key: 'id' }
  },
  effective_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'rosters'
});

module.exports = Roster;
