const { sequelize } = require('../config/database');

// Import models
const User = require('./User');
const Team = require('./Team');
const Player = require('./Player');
const ScoutingReport = require('./ScoutingReport');
const DailyReport = require('./DailyReport');
const PreferenceList = require('./PreferenceList');
const Schedule = require('./Schedule');
const ScheduleSection = require('./ScheduleSection');
const ScheduleActivity = require('./ScheduleActivity');
const DepthChart = require('./DepthChart');
const DepthChartPosition = require('./DepthChartPosition');
const DepthChartPlayer = require('./DepthChartPlayer');
const UserPermission = require('./UserPermission');
const Report = require('./Report');
const Game = require('./Game');
const Coach = require('./Coach');
const Scout = require('./Scout');
const ScheduleTemplate = require('./ScheduleTemplate');
const Vendor = require('./Vendor');
const HighSchoolCoach = require('./HighSchoolCoach');
const UserTeam = require('./UserTeam');

// Define associations

// Primary team relationship (backwards compatible)
User.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(User, { foreignKey: 'team_id' });

// Many-to-many: User can have multiple teams (through UserTeam junction table)
User.belongsToMany(Team, {
  through: UserTeam,
  foreignKey: 'user_id',
  otherKey: 'team_id',
  as: 'Teams'  // user.Teams gives all teams
});
Team.belongsToMany(User, {
  through: UserTeam,
  foreignKey: 'team_id',
  otherKey: 'user_id',
  as: 'Members'  // team.Members gives all users
});

// UserTeam explicit associations for eager loading
UserTeam.belongsTo(User, { foreignKey: 'user_id' });
UserTeam.belongsTo(Team, { foreignKey: 'team_id' });
User.hasMany(UserTeam, { foreignKey: 'user_id' });
Team.hasMany(UserTeam, { foreignKey: 'team_id' });

Player.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Player, { foreignKey: 'team_id' });

Player.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Player, { foreignKey: 'created_by' });

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

PreferenceList.belongsTo(User, { foreignKey: 'added_by', as: 'AddedBy' });
User.hasMany(PreferenceList, { foreignKey: 'added_by' });

// Schedule associations
Schedule.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Schedule, { foreignKey: 'team_id' });

Schedule.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Schedule, { foreignKey: 'created_by' });

ScheduleSection.belongsTo(Schedule, { foreignKey: 'schedule_id' });
Schedule.hasMany(ScheduleSection, { foreignKey: 'schedule_id' });

ScheduleActivity.belongsTo(ScheduleSection, { foreignKey: 'section_id' });
ScheduleSection.hasMany(ScheduleActivity, { foreignKey: 'section_id' });

// Depth Chart associations
DepthChart.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(DepthChart, { foreignKey: 'team_id' });

DepthChart.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(DepthChart, { foreignKey: 'created_by' });

DepthChartPosition.belongsTo(DepthChart, { foreignKey: 'depth_chart_id' });
DepthChart.hasMany(DepthChartPosition, { foreignKey: 'depth_chart_id' });

DepthChartPlayer.belongsTo(DepthChart, { foreignKey: 'depth_chart_id' });
DepthChart.hasMany(DepthChartPlayer, { foreignKey: 'depth_chart_id' });

DepthChartPlayer.belongsTo(DepthChartPosition, { foreignKey: 'position_id' });
DepthChartPosition.hasMany(DepthChartPlayer, { foreignKey: 'position_id' });

DepthChartPlayer.belongsTo(Player, { foreignKey: 'player_id' });
Player.hasMany(DepthChartPlayer, { foreignKey: 'player_id' });

DepthChartPlayer.belongsTo(User, { foreignKey: 'assigned_by', as: 'AssignedBy' });
User.hasMany(DepthChartPlayer, { foreignKey: 'assigned_by' });

// User Permission associations
UserPermission.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(UserPermission, { foreignKey: 'user_id' });

UserPermission.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(UserPermission, { foreignKey: 'team_id' });

UserPermission.belongsTo(User, { foreignKey: 'granted_by', as: 'GrantedBy' });
User.hasMany(UserPermission, { foreignKey: 'granted_by', as: 'GrantedPermissions' });

// Report associations
Report.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Report, { foreignKey: 'team_id' });

Report.belongsTo(User, { foreignKey: 'created_by', as: 'created_by_user' });
User.hasMany(Report, { foreignKey: 'created_by' });

// Game associations
Game.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
Team.hasMany(Game, { foreignKey: 'team_id' });

Game.belongsTo(User, { foreignKey: 'created_by', as: 'created_by_user' });
User.hasMany(Game, { foreignKey: 'created_by' });

// Coach associations
Coach.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Coach, { foreignKey: 'team_id' });

Coach.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Coach, { foreignKey: 'created_by' });

// Scout associations
Scout.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Scout, { foreignKey: 'team_id' });

Scout.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Scout, { foreignKey: 'created_by' });

// Schedule Template associations
ScheduleTemplate.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(ScheduleTemplate, { foreignKey: 'team_id' });

ScheduleTemplate.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(ScheduleTemplate, { foreignKey: 'created_by' });

// Vendor associations
Vendor.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(Vendor, { foreignKey: 'team_id' });

Vendor.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(Vendor, { foreignKey: 'created_by' });

// High School Coach associations
HighSchoolCoach.belongsTo(Team, { foreignKey: 'team_id' });
Team.hasMany(HighSchoolCoach, { foreignKey: 'team_id' });

HighSchoolCoach.belongsTo(User, { foreignKey: 'created_by', as: 'Creator' });
User.hasMany(HighSchoolCoach, { foreignKey: 'created_by' });

module.exports = {
  sequelize,
  User,
  Team,
  Player,
  ScoutingReport,
  DailyReport,
  PreferenceList,
  Schedule,
  ScheduleSection,
  ScheduleActivity,
  DepthChart,
  DepthChartPosition,
  DepthChartPlayer,
  UserPermission,
  Report,
  Game,
  Coach,
  Scout,
  ScheduleTemplate,
  Vendor,
  HighSchoolCoach,
  UserTeam
};
