const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Player = sequelize.define('Player', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  school_type: {
    type: DataTypes.ENUM('HS', 'COLL'),
    allowNull: false,
    defaultValue: 'HS'
  },
  position: {
    type: DataTypes.ENUM('P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH'),
    allowNull: false
  },
  height: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 10]
    }
  },
  weight: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 100,
      max: 300
    }
  },
  birth_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  graduation_year: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 2020,
      max: 2030
    }
  },
  school: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
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
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [10, 15]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  // Batting statistics
  batting_avg: {
    type: DataTypes.DECIMAL(4, 3),
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    }
  },
  home_runs: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  rbi: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  stolen_bases: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  // Pitching statistics
  era: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  wins: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  losses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  strikeouts: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  innings_pitched: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  // Medical information
  has_medical_issues: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  injury_details: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Comparison player
  has_comparison: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  comparison_player: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'graduated', 'transferred'),
    defaultValue: 'active'
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
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
  tableName: 'players',
  hooks: {
    beforeCreate: (player) => {
      // Set default values for statistics if not provided
      if (player.batting_avg === null) player.batting_avg = 0.000;
      if (player.era === null) player.era = 0.00;
    }
  }
});

// Instance method to get full name
Player.prototype.getFullName = function() {
  return `${this.first_name} ${this.last_name}`;
};

// Instance method to get age
Player.prototype.getAge = function() {
  if (!this.birth_date) return null;
  const today = new Date();
  const birthDate = new Date(this.birth_date);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

module.exports = Player; 