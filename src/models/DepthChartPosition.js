const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DepthChartPosition = sequelize.define('DepthChartPosition', {
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
  position_code: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 10]
    }
  },
  position_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#6B7280'
  },
  icon: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  max_players: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 1
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'depth_chart_positions',
  indexes: [
    {
      fields: ['depth_chart_id']
    },
    {
      fields: ['position_code']
    },
    {
      fields: ['sort_order']
    }
  ]
});

module.exports = DepthChartPosition; 