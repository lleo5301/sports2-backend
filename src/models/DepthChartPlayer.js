const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DepthChartPlayer = sequelize.define('DepthChartPlayer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  depth_chart_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'depth_charts',
      key: 'id'
    }
  },
  position_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'depth_chart_positions',
      key: 'id'
    }
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'players',
      key: 'id'
    }
  },
  depth_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  assigned_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  assigned_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'depth_chart_players',
  indexes: [
    {
      fields: ['depth_chart_id']
    },
    {
      fields: ['position_id']
    },
    {
      fields: ['player_id']
    },
    {
      fields: ['depth_order']
    },
    {
      unique: true,
      fields: ['depth_chart_id', 'position_id', 'player_id']
    }
  ]
});

module.exports = DepthChartPlayer;
