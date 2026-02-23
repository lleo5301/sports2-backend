const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiConversation = sequelize.define('AiConversation', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  model: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'claude-sonnet-4-6'
  },
  system_prompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_archived: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  total_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'ai_conversations',
  timestamps: true,
  underscored: true
});

module.exports = AiConversation;
