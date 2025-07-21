const { sequelize } = require('../config/database');

// Import models
const User = require('./User');
const Team = require('./Team');
const Player = require('./Player');
const ScoutingReport = require('./ScoutingReport');
const DailyReport = require('./DailyReport');
const PreferenceList = require('./PreferenceList');

// Define associations
User.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(User, { foreignKey: 'team_id' });

Player.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Player, { foreignKey: 'team_id' });

ScoutingReport.belongsTo(Player, { foreignKey: 'player_id' });
Player.hasMany(ScoutingReport, { foreignKey: 'player_id' });

ScoutingReport.belongsTo(User, { foreignKey: 'created_by' });
User.hasMany(ScoutingReport, { foreignKey: 'created_by' });

DailyReport.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(DailyReport, { foreignKey: 'team_id' });

DailyReport.belongsTo(User, { foreignKey: 'created_by' });
User.hasMany(DailyReport, { foreignKey: 'created_by' });

PreferenceList.belongsTo(Player, { foreignKey: 'player_id' });
Player.hasMany(PreferenceList, { foreignKey: 'player_id' });

PreferenceList.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(PreferenceList, { foreignKey: 'team_id' });

module.exports = {
  sequelize,
  User,
  Team,
  Player,
  ScoutingReport,
  DailyReport,
  PreferenceList
}; 