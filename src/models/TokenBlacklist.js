const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  jti: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  reason: {
    type: DataTypes.ENUM('logout', 'password_change', 'admin_revoke', 'security_revoke'),
    allowNull: false
  }
}, {
  tableName: 'token_blacklist'
});

module.exports = TokenBlacklist;
