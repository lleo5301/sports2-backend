const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PreferenceList = sequelize.define('PreferenceList', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  player_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'players',
      key: 'id'
    }
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    }
  },
  list_type: {
    type: DataTypes.ENUM('new_players', 'overall_pref_list', 'hs_pref_list', 'college_transfers'),
    allowNull: false
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 999,
    validate: {
      min: 1,
      max: 999
    }
  },
  added_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  added_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'committed', 'signed', 'lost'),
    defaultValue: 'active'
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
  // Recruiting specific fields
  interest_level: {
    type: DataTypes.ENUM('High', 'Medium', 'Low', 'Unknown'),
    allowNull: true
  },
  visit_scheduled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  visit_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  scholarship_offered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  scholarship_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  // Transfer portal specific
  transfer_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  eligibility_remaining: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 4
    }
  },
  academic_standing: {
    type: DataTypes.ENUM('Good', 'Warning', 'Probation', 'Unknown'),
    allowNull: true
  }
}, {
  tableName: 'preference_lists',
  indexes: [
    {
      unique: true,
      fields: ['player_id', 'team_id', 'list_type']
    },
    {
      fields: ['team_id', 'list_type', 'priority']
    }
  ]
});

module.exports = PreferenceList; 