const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AiInsight = sequelize.define('AiInsight', {
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
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  category: {
    type: DataTypes.ENUM(
      'player_performance', 'pitching_analysis', 'recruiting',
      'lineup', 'scouting', 'game_recap', 'weekly_digest'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data_snapshot: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  prompt_used: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'ai_insights',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = AiInsight;
