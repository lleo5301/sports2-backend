const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiMessage = sequelize.define('AiMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'ai_conversations', key: 'id' }
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant', 'tool_call', 'tool_result'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tool_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  token_count: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'ai_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiMessage;
