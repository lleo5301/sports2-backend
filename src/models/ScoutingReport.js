'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScoutingReport = sequelize.define('ScoutingReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'players', key: 'id' }
  },
  prospect_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'prospects', key: 'id' }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  game_date: { type: DataTypes.DATEONLY, allowNull: true },
  opponent: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { len: [1, 100] }
  },
  event_type: {
    type: DataTypes.ENUM('game', 'showcase', 'practice', 'workout', 'video'),
    allowNull: true,
    defaultValue: 'game'
  },

  // --- Old ENUM fields (kept for backward compatibility) ---
  overall_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  hitting_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  bat_speed: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  power_potential: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  plate_discipline: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  pitching_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  fastball_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  breaking_ball_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  command: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  fielding_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  arm_strength: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  arm_accuracy: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  range: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  speed_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  intangibles_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  work_ethic: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  coachability: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  projection: {
    type: DataTypes.ENUM('MLB', 'AAA', 'AA', 'A+', 'A', 'A-', 'College', 'High School'),
    allowNull: true
  },

  // --- New INTEGER grade fields (present/future pairs) ---
  overall_present: { type: DataTypes.INTEGER, allowNull: true },
  overall_future: { type: DataTypes.INTEGER, allowNull: true },
  hitting_present: { type: DataTypes.INTEGER, allowNull: true },
  hitting_future: { type: DataTypes.INTEGER, allowNull: true },
  bat_speed_present: { type: DataTypes.INTEGER, allowNull: true },
  bat_speed_future: { type: DataTypes.INTEGER, allowNull: true },
  raw_power_present: { type: DataTypes.INTEGER, allowNull: true },
  raw_power_future: { type: DataTypes.INTEGER, allowNull: true },
  game_power_present: { type: DataTypes.INTEGER, allowNull: true },
  game_power_future: { type: DataTypes.INTEGER, allowNull: true },
  plate_discipline_present: { type: DataTypes.INTEGER, allowNull: true },
  plate_discipline_future: { type: DataTypes.INTEGER, allowNull: true },
  pitching_present: { type: DataTypes.INTEGER, allowNull: true },
  pitching_future: { type: DataTypes.INTEGER, allowNull: true },
  fastball_present: { type: DataTypes.INTEGER, allowNull: true },
  fastball_future: { type: DataTypes.INTEGER, allowNull: true },
  curveball_present: { type: DataTypes.INTEGER, allowNull: true },
  curveball_future: { type: DataTypes.INTEGER, allowNull: true },
  slider_present: { type: DataTypes.INTEGER, allowNull: true },
  slider_future: { type: DataTypes.INTEGER, allowNull: true },
  changeup_present: { type: DataTypes.INTEGER, allowNull: true },
  changeup_future: { type: DataTypes.INTEGER, allowNull: true },
  command_present: { type: DataTypes.INTEGER, allowNull: true },
  command_future: { type: DataTypes.INTEGER, allowNull: true },
  fielding_present: { type: DataTypes.INTEGER, allowNull: true },
  fielding_future: { type: DataTypes.INTEGER, allowNull: true },
  arm_strength_present: { type: DataTypes.INTEGER, allowNull: true },
  arm_strength_future: { type: DataTypes.INTEGER, allowNull: true },
  arm_accuracy_present: { type: DataTypes.INTEGER, allowNull: true },
  arm_accuracy_future: { type: DataTypes.INTEGER, allowNull: true },
  range_present: { type: DataTypes.INTEGER, allowNull: true },
  range_future: { type: DataTypes.INTEGER, allowNull: true },
  hands_present: { type: DataTypes.INTEGER, allowNull: true },
  hands_future: { type: DataTypes.INTEGER, allowNull: true },
  speed_present: { type: DataTypes.INTEGER, allowNull: true },
  speed_future: { type: DataTypes.INTEGER, allowNull: true },
  baserunning_present: { type: DataTypes.INTEGER, allowNull: true },
  baserunning_future: { type: DataTypes.INTEGER, allowNull: true },
  intangibles_present: { type: DataTypes.INTEGER, allowNull: true },
  intangibles_future: { type: DataTypes.INTEGER, allowNull: true },
  work_ethic_grade: { type: DataTypes.INTEGER, allowNull: true },
  coachability_grade: { type: DataTypes.INTEGER, allowNull: true },
  baseball_iq_present: { type: DataTypes.INTEGER, allowNull: true },
  baseball_iq_future: { type: DataTypes.INTEGER, allowNull: true },
  overall_future_potential: { type: DataTypes.INTEGER, allowNull: true },

  // --- Other new fields ---
  sixty_yard_dash: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  mlb_comparison: { type: DataTypes.STRING(100), allowNull: true },

  // --- Existing notes/metadata fields ---
  overall_notes: { type: DataTypes.TEXT, allowNull: true },
  hitting_notes: { type: DataTypes.TEXT, allowNull: true },
  pitching_notes: { type: DataTypes.TEXT, allowNull: true },
  fielding_notes: { type: DataTypes.TEXT, allowNull: true },
  speed_notes: { type: DataTypes.TEXT, allowNull: true },
  intangibles_notes: { type: DataTypes.TEXT, allowNull: true },
  projection_notes: { type: DataTypes.TEXT, allowNull: true },
  fastball_velocity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 60, max: 105 }
  },
  home_to_first: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    validate: { min: 3.0, max: 5.0 }
  },
  is_draft: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_public: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'scouting_reports'
});

module.exports = ScoutingReport;
