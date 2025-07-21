const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Team = sequelize.define('Team', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  program_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  school_logo_url: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  conference: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  division: {
    type: DataTypes.ENUM('D1', 'D2', 'D3', 'NAIA', 'JUCO'),
    allowNull: false,
    defaultValue: 'D1'
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [2, 2]
    }
  },
  primary_color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#000000',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  secondary_color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#FFFFFF',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  subscription_tier: {
    type: DataTypes.ENUM('basic', 'premium', 'enterprise'),
    defaultValue: 'basic'
  },
  subscription_expires: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'teams'
});

module.exports = Team; 