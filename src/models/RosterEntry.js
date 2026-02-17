'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RosterEntry = sequelize.define('RosterEntry', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  roster_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'rosters', key: 'id' }
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'players', key: 'id' }
  },
  position: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  jersey_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 0, max: 99 }
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'injured', 'suspended', 'inactive'),
    allowNull: false,
    defaultValue: 'active'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'roster_entries'
});

module.exports = RosterEntry;
