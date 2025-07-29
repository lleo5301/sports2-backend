const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  opponent: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  game_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  home_away: {
    type: DataTypes.ENUM('home', 'away'),
    allowNull: false
  },
  team_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  opponent_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    }
  },
  result: {
    type: DataTypes.ENUM('W', 'L', 'T'),
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(200),
    allowNull: true,
    validate: {
      len: [0, 200]
    }
  },
  season: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      len: [0, 20]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [0, 1000]
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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'games',
  timestamps: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['game_date']
    },
    {
      fields: ['season']
    },
    {
      fields: ['result']
    },
    {
      fields: ['created_by']
    }
  ]
});

// Associations are defined in models/index.js

module.exports = Game; 