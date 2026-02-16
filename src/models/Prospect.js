'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Prospect = sequelize.define('Prospect', {
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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [1, 100] }
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [1, 100] }
  },
  email: { type: DataTypes.STRING(255), allowNull: true },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  photo_url: { type: DataTypes.STRING(500), allowNull: true },
  school_type: {
    type: DataTypes.ENUM('HS', 'JUCO', 'D1', 'D2', 'D3', 'NAIA', 'Independent'),
    allowNull: false,
    defaultValue: 'HS'
  },
  school_name: { type: DataTypes.STRING(200), allowNull: true },
  city: { type: DataTypes.STRING(100), allowNull: true },
  state: { type: DataTypes.STRING(50), allowNull: true },
  graduation_year: { type: DataTypes.INTEGER, allowNull: true },
  class_year: {
    type: DataTypes.ENUM('FR', 'SO', 'JR', 'SR', 'GR'),
    allowNull: true
  },
  primary_position: {
    type: DataTypes.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
    allowNull: false
  },
  secondary_position: {
    type: DataTypes.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UTL'),
    allowNull: true
  },
  bats: { type: DataTypes.ENUM('L', 'R', 'S'), allowNull: true },
  throws: { type: DataTypes.ENUM('L', 'R'), allowNull: true },
  height: { type: DataTypes.STRING(10), allowNull: true },
  weight: { type: DataTypes.INTEGER, allowNull: true },
  sixty_yard_dash: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
  home_to_first: { type: DataTypes.DECIMAL(3, 1), allowNull: true },
  fastball_velocity: { type: DataTypes.INTEGER, allowNull: true },
  exit_velocity: { type: DataTypes.INTEGER, allowNull: true },
  pop_time: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
  gpa: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
  sat_score: { type: DataTypes.INTEGER, allowNull: true },
  act_score: { type: DataTypes.INTEGER, allowNull: true },
  academic_eligibility: {
    type: DataTypes.ENUM('eligible', 'pending', 'ineligible', 'unknown'),
    allowNull: true,
    defaultValue: 'unknown'
  },
  status: {
    type: DataTypes.ENUM('identified', 'evaluating', 'contacted', 'visiting', 'offered', 'committed', 'signed', 'passed'),
    allowNull: false,
    defaultValue: 'identified'
  },
  source: { type: DataTypes.STRING(100), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  video_url: { type: DataTypes.STRING(500), allowNull: true },
  social_links: { type: DataTypes.JSONB, allowNull: true },
  external_profile_url: { type: DataTypes.STRING(500), allowNull: true }
}, {
  tableName: 'prospects'
});

module.exports = Prospect;
