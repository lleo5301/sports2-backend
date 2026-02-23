const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiUsageLog = sequelize.define('AiUsageLog', {
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
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'ai_conversations', key: 'id' }
  },
  model: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  input_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  output_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  cost_usd: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    defaultValue: 0
  },
  key_source: {
    type: DataTypes.ENUM('platform', 'byok'),
    allowNull: false,
    defaultValue: 'platform'
  }
}, {
  tableName: 'ai_usage_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiUsageLog;
