'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PlayerCareerStats = sequelize.define('PlayerCareerStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'players',
      key: 'id'
    }
  },

  // Career batting totals
  seasons_played: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_games: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_at_bats: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_hits: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_doubles: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_triples: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_home_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_rbi: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_walks: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_strikeouts: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_stolen_bases: { type: DataTypes.INTEGER, defaultValue: 0 },

  // Career calculated stats
  career_batting_average: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  career_obp: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  career_slg: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
  career_ops: { type: DataTypes.DECIMAL(4, 3), allowNull: true },

  // Career pitching totals
  career_pitching_appearances: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_innings_pitched: { type: DataTypes.DECIMAL(6, 1), defaultValue: 0 },
  career_wins: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_losses: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_saves: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_earned_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  career_strikeouts_pitching: { type: DataTypes.INTEGER, defaultValue: 0 },

  // Career calculated pitching
  career_era: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  career_whip: { type: DataTypes.DECIMAL(4, 2), allowNull: true },

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
  tableName: 'player_career_stats',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['source_system'] }
  ]
});

// Calculate career batting stats
PlayerCareerStats.prototype.calculateBattingStats = function () {
  if (this.career_at_bats > 0) {
    this.career_batting_average = this.career_hits / this.career_at_bats;

    const plateAppearances = this.career_at_bats + this.career_walks;
    if (plateAppearances > 0) {
      this.career_obp = (this.career_hits + this.career_walks) / plateAppearances;
    }

    const totalBases = this.career_hits + this.career_doubles + (2 * this.career_triples) + (3 * this.career_home_runs);
    this.career_slg = totalBases / this.career_at_bats;

    if (this.career_obp && this.career_slg) {
      this.career_ops = parseFloat(this.career_obp) + parseFloat(this.career_slg);
    }
  }
};

// Calculate career pitching stats
PlayerCareerStats.prototype.calculatePitchingStats = function () {
  const ip = parseFloat(this.career_innings_pitched) || 0;
  if (ip > 0) {
    this.career_era = (this.career_earned_runs * 9) / ip;
  }
};

module.exports = PlayerCareerStats;
