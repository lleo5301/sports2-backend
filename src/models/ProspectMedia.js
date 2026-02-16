'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ProspectMedia = sequelize.define('ProspectMedia', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  prospect_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'prospects', key: 'id' }
  },
  uploaded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  media_type: {
    type: DataTypes.ENUM('video', 'photo', 'document'),
    allowNull: false
  },
  file_path: { type: DataTypes.STRING(500), allowNull: true },
  url: { type: DataTypes.STRING(500), allowNull: true },
  title: { type: DataTypes.STRING(200), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  is_primary_photo: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'prospect_media'
});

module.exports = ProspectMedia;
