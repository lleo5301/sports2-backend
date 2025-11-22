const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Location = sequelize.define('Location', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 200]
    },
    comment: 'Name of the location (e.g., "Main Field", "Practice Gym")'
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 500]
    },
    comment: 'Full address of the location'
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 100]
    }
  },
  state: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 50]
    }
  },
  zip_code: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 20]
    }
  },
  location_type: {
    type: DataTypes.ENUM(
      'field', 
      'gym', 
      'facility', 
      'stadium', 
      'practice_field', 
      'batting_cage', 
      'weight_room',
      'classroom',
      'other'
    ),
    allowNull: false,
    defaultValue: 'field',
    comment: 'Type of location for categorization'
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0
    },
    comment: 'Maximum capacity of the location'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes about the location'
  },
  contact_info: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Contact information for the location (phone, email, contact person)'
  },
  amenities: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Available amenities (parking, restrooms, concessions, etc.)'
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'teams',
      key: 'id'
    },
    comment: 'Team that owns/manages this location'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this location is currently available for use'
  },
  is_home_venue: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether this is a home venue for the team'
  }
}, {
  tableName: 'locations',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['location_type']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['is_home_venue']
    },
    {
      fields: ['name', 'team_id'],
      unique: true,
      name: 'unique_location_name_per_team'
    }
  ]
});

module.exports = Location;




