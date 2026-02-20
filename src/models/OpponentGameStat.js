'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OpponentGameStat = sequelize.define('OpponentGameStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  game_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'games',
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
  // Opponent identification
  opponent_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Opponent team name from box score'
  },
  opponent_presto_team_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Presto team ID for linking to league-teams'
  },
  player_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: 'Opponent player name from box score'
  },
  jersey_number: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Uniform number'
  },
  is_starter: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  batting_order: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Spot in the batting order (1-9)'
  },
  position_played: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  source_system: {
    type: DataTypes.ENUM('manual', 'presto'),
    defaultValue: 'presto'
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  },

  // Batting statistics
  at_bats: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  runs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  hits: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  doubles: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  triples: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  home_runs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  rbi: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  walks: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  strikeouts_batting: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  stolen_bases: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  caught_stealing: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  hit_by_pitch: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  sacrifice_flies: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  sacrifice_bunts: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },

  // Pitching statistics
  innings_pitched: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  hits_allowed: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  runs_allowed: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  earned_runs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  walks_allowed: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  strikeouts_pitching: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  home_runs_allowed: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  batters_faced: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  pitches_thrown: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  strikes_thrown: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  win: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  loss: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  save: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  hold: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },

  // Fielding statistics
  putouts: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  assists: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  },
  errors: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: { min: 0 }
  }
}, {
  tableName: 'opponent_game_stats',
  timestamps: true,
  indexes: [
    { fields: ['game_id'] },
    { fields: ['team_id'] },
    { fields: ['opponent_name'] },
    { fields: ['opponent_presto_team_id'] },
    { fields: ['opponent_name', 'jersey_number'] },
    {
      fields: ['game_id', 'opponent_name', 'jersey_number'],
      unique: true,
      name: 'opponent_game_stats_unique_player'
    }
  ]
});

module.exports = OpponentGameStat;
