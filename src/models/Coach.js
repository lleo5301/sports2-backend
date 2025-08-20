const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Coach = sequelize.define('Coach', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  school_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 200]
    }
  },
  position: {
    type: DataTypes.ENUM('Head Coach', 'Recruiting Coordinator', 'Pitching Coach', 'Volunteer'),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      len: [0, 20]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true,
      len: [0, 255]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  // Contact tracking fields
  last_contact_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  next_contact_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  contact_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'coaches',
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['school_name']
    },
    {
      fields: ['status']
    },
    {
      fields: ['team_id', 'status']
    }
  ]
});

module.exports = Coach;
