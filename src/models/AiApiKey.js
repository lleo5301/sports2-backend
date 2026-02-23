const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiApiKey = sequelize.define('AiApiKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'teams', key: 'id' }
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'anthropic'
  },
  api_key_enc: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'ai_api_keys',
  timestamps: true,
  underscored: true
});

module.exports = AiApiKey;
