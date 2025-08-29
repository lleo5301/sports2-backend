const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Vendor = sequelize.define('Vendor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  company_name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 200]
    }
  },
  contact_person: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      len: [0, 100]
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
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      len: [0, 20]
    }
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  zip_code: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  vendor_type: {
    type: DataTypes.ENUM(
      'Equipment', 
      'Apparel', 
      'Technology', 
      'Food Service', 
      'Transportation', 
      'Medical', 
      'Facilities', 
      'Other'
    ),
    allowNull: false
  },
  services_provided: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contract_start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  contract_end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  contract_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  payment_terms: {
    type: DataTypes.STRING(100),
    allowNull: true
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
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending', 'expired'),
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
  tableName: 'vendors',
  indexes: [
    {
      fields: ['team_id']
    },
    {
      fields: ['vendor_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['company_name']
    },
    {
      fields: ['team_id', 'status']
    }
  ]
});

module.exports = Vendor;
