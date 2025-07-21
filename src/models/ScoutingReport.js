const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ScoutingReport = sequelize.define('ScoutingReport', {
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
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  game_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  opponent: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [1, 100]
    }
  },
  // Overall assessment
  overall_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  overall_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Hitting assessment
  hitting_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  hitting_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bat_speed: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  power_potential: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  plate_discipline: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  // Pitching assessment
  pitching_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  pitching_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fastball_velocity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 60,
      max: 105
    }
  },
  fastball_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  breaking_ball_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  command: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  // Fielding assessment
  fielding_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  fielding_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  arm_strength: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  arm_accuracy: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  range: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  // Running assessment
  speed_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  speed_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  home_to_first: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    validate: {
      min: 3.0,
      max: 5.0
    }
  },
  // Intangibles
  intangibles_grade: {
    type: DataTypes.ENUM('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'),
    allowNull: true
  },
  intangibles_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  work_ethic: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  coachability: {
    type: DataTypes.ENUM('Excellent', 'Good', 'Average', 'Below Average', 'Poor'),
    allowNull: true
  },
  // Projection
  projection: {
    type: DataTypes.ENUM('MLB', 'AAA', 'AA', 'A+', 'A', 'A-', 'College', 'High School'),
    allowNull: true
  },
  projection_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Status
  is_draft: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'scouting_reports'
});

module.exports = ScoutingReport; 