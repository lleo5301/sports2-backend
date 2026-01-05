const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [0, 1000]
    }
  },
  type: {
    type: DataTypes.ENUM('player-performance', 'team-statistics', 'scouting-analysis', 'recruitment-pipeline', 'custom'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    defaultValue: 'draft',
    allowNull: false
  },
  data_sources: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of data source IDs used in this report'
  },
  sections: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of report sections with their configurations'
  },
  filters: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Report filters and parameters'
  },
  schedule: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Report scheduling configuration'
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  last_generated: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time the report was generated'
  },
  generation_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of times this report has been generated'
  }
}, {
  tableName: 'reports',
  timestamps: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

// Associations
Report.associate = (models) => {
  Report.belongsTo(models.Team, {
    foreignKey: 'team_id',
    as: 'team'
  });

  Report.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'created_by_user'
  });
};

module.exports = Report;
