const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const HighSchoolCoach = sequelize.define('HighSchoolCoach', {
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
  school_district: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  position: {
    type: DataTypes.ENUM(
      'Head Coach',
      'Assistant Coach',
      'JV Coach',
      'Freshman Coach',
      'Pitching Coach',
      'Hitting Coach'
    ),
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
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  region: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  years_coaching: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 50
    }
  },
  conference: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  school_classification: {
    type: DataTypes.ENUM('1A', '2A', '3A', '4A', '5A', '6A', 'Private'),
    allowNull: true
  },
  relationship_type: {
    type: DataTypes.ENUM(
      'Recruiting Contact',
      'Former Player',
      'Coaching Connection',
      'Tournament Contact',
      'Camp Contact',
      'Other'
    ),
    defaultValue: 'Recruiting Contact'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
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
  players_sent_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of players sent to our program from this coach'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
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
  }
}, {
  tableName: 'high_school_coaches',
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
      fields: ['state']
    },
    {
      fields: ['relationship_type']
    },
    {
      fields: ['team_id', 'status']
    }
  ]
});

module.exports = HighSchoolCoach;
