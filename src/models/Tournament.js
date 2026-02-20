const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tournament = sequelize.define('Tournament', {
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
  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  season: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  season_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  tournament_type: {
    type: DataTypes.STRING(20),
    allowNull: true
  }
}, {
  tableName: 'tournaments',
  timestamps: true,
  indexes: [
    { fields: ['team_id'] },
    { fields: ['season'] },
    {
      fields: ['team_id', 'name', 'season'],
      unique: true,
      name: 'tournaments_team_name_season_unique'
    }
  ]
});

module.exports = Tournament;
