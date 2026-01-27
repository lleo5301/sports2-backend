'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlayerSeasonStats = sequelize.define('PlayerSeasonStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'players',
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
  season: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  presto_season_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },

  // Batting stats
  games_played: { type: DataTypes.INTEGER, defaultValue: 0 },
  games_started: { type: DataTypes.INTEGER, defaultValue: 0 },
  at_bats: { type: DataTypes.INTEGER, defaultValue: 0 },
  runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  hits: { type: DataTypes.INTEGER, defaultValue: 0 },
  doubles: { type: DataTypes.INTEGER, defaultValue: 0 },
  triples: { type: DataTypes.INTEGER, defaultValue: 0 },
  home_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  rbi: { type: DataTypes.INTEGER, defaultValue: 0 },
  walks: { type: DataTypes.INTEGER, defaultValue: 0 },
  strikeouts: { type: DataTypes.INTEGER, defaultValue: 0 },
  stolen_bases: { type: DataTypes.INTEGER, defaultValue: 0 },
  caught_stealing: { type: DataTypes.INTEGER, defaultValue: 0 },
  hit_by_pitch: { type: DataTypes.INTEGER, defaultValue: 0 },
  sacrifice_flies: { type: DataTypes.INTEGER, defaultValue: 0 },
  sacrifice_bunts: { type: DataTypes.INTEGER, defaultValue: 0 },

  // Calculated batting stats
  batting_average: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  on_base_percentage: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  slugging_percentage: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  ops: { type: DataTypes.DECIMAL(4, 3), allowNull: true },

  // Pitching stats
  pitching_appearances: { type: DataTypes.INTEGER, defaultValue: 0 },
  pitching_starts: { type: DataTypes.INTEGER, defaultValue: 0 },
  innings_pitched: { type: DataTypes.DECIMAL(5, 1), defaultValue: 0 },
  pitching_wins: { type: DataTypes.INTEGER, defaultValue: 0 },
  pitching_losses: { type: DataTypes.INTEGER, defaultValue: 0 },
  saves: { type: DataTypes.INTEGER, defaultValue: 0 },
  holds: { type: DataTypes.INTEGER, defaultValue: 0 },
  hits_allowed: { type: DataTypes.INTEGER, defaultValue: 0 },
  runs_allowed: { type: DataTypes.INTEGER, defaultValue: 0 },
  earned_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  walks_allowed: { type: DataTypes.INTEGER, defaultValue: 0 },
  strikeouts_pitching: { type: DataTypes.INTEGER, defaultValue: 0 },
  home_runs_allowed: { type: DataTypes.INTEGER, defaultValue: 0 },

  // Calculated pitching stats
  era: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  whip: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  k_per_9: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  bb_per_9: { type: DataTypes.DECIMAL(4, 2), allowNull: true },

  // Fielding stats
  fielding_games: { type: DataTypes.INTEGER, defaultValue: 0 },
  putouts: { type: DataTypes.INTEGER, defaultValue: 0 },
  assists: { type: DataTypes.INTEGER, defaultValue: 0 },
  errors: { type: DataTypes.INTEGER, defaultValue: 0 },
  fielding_percentage: { type: DataTypes.DECIMAL(4, 3), allowNull: true },

  // Source tracking
  external_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  source_system: {
    type: DataTypes.ENUM('manual', 'presto'),
    allowNull: false,
    defaultValue: 'manual'
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'player_season_stats',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['player_id'] },
    { fields: ['team_id'] },
    { fields: ['season'] },
    { fields: ['player_id', 'season'], unique: true },
    { fields: ['source_system'] }
  ]
});

// Helper methods for calculating stats
PlayerSeasonStats.prototype.calculateBattingStats = function () {
  if (this.at_bats > 0) {
    this.batting_average = this.hits / this.at_bats;

    const plateAppearances = this.at_bats + this.walks + this.hit_by_pitch + this.sacrifice_flies;
    if (plateAppearances > 0) {
      this.on_base_percentage = (this.hits + this.walks + this.hit_by_pitch) / plateAppearances;
    }

    const totalBases = this.hits + this.doubles + (2 * this.triples) + (3 * this.home_runs);
    this.slugging_percentage = totalBases / this.at_bats;

    if (this.on_base_percentage && this.slugging_percentage) {
      this.ops = parseFloat(this.on_base_percentage) + parseFloat(this.slugging_percentage);
    }
  }
};

PlayerSeasonStats.prototype.calculatePitchingStats = function () {
  const ip = parseFloat(this.innings_pitched) || 0;
  if (ip > 0) {
    this.era = (this.earned_runs * 9) / ip;
    this.whip = (this.walks_allowed + this.hits_allowed) / ip;
    this.k_per_9 = (this.strikeouts_pitching * 9) / ip;
    this.bb_per_9 = (this.walks_allowed * 9) / ip;
  }
};

PlayerSeasonStats.prototype.calculateFieldingStats = function () {
  const totalChances = this.putouts + this.assists + this.errors;
  if (totalChances > 0) {
    this.fielding_percentage = (this.putouts + this.assists) / totalChances;
  }
};

module.exports = PlayerSeasonStats;
