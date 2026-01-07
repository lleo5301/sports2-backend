const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [6, 100]
    }
  },
  oauth_provider: {
    type: DataTypes.ENUM('google', 'apple', 'local'),
    allowNull: false,
    defaultValue: 'local'
  },
  oauth_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'head_coach', 'assistant_coach'),
    allowNull: false,
    defaultValue: 'assistant_coach'
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [10, 15]
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_login: {
    type: DataTypes.DATE,
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
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_failed_login: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password && user.oauth_provider === 'local') {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password && user.oauth_provider === 'local') {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Instance method to check password
User.prototype.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Instance method to get full name
User.prototype.getFullName = function () {
  return `${this.first_name} ${this.last_name}`;
};

// Instance method to check if account is currently locked
User.prototype.isLocked = function () {
  if (!this.locked_until) {
    return false;
  }
  return new Date() < new Date(this.locked_until);
};

// Instance method to increment failed login attempts
User.prototype.incrementFailedAttempts = async function () {
  this.failed_login_attempts += 1;
  this.last_failed_login = new Date();
  await this.save();
};

// Instance method to reset failed login attempts
User.prototype.resetFailedAttempts = async function () {
  this.failed_login_attempts = 0;
  this.locked_until = null;
  this.last_failed_login = null;
  await this.save();
};

// Instance method to lock account
User.prototype.lockAccount = async function (durationMinutes) {
  const lockUntil = new Date();
  lockUntil.setMinutes(lockUntil.getMinutes() + durationMinutes);
  this.locked_until = lockUntil;
  await this.save();
};

module.exports = User;
