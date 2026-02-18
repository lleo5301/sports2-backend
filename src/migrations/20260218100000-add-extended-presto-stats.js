'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // PlayerSeasonStats: raw_stats and split_stats JSONB
    await queryInterface.addColumn('player_season_stats', 'raw_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Full 214-key Presto stats object'
    });
    await queryInterface.addColumn('player_season_stats', 'split_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Keyed by split type: home, away, conference, vs_lhp, vs_rhp, risp, two_outs, bases_loaded, bases_empty, leadoff, with_runners'
    });

    // Games: team_stats, opponent_stats, game_summary, running records
    await queryInterface.addColumn('games', 'team_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Per-game team batting/pitching/fielding from Presto'
    });
    await queryInterface.addColumn('games', 'opponent_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Per-game opponent stats'
    });
    await queryInterface.addColumn('games', 'game_summary', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'e.g. "W, 5-3"'
    });
    await queryInterface.addColumn('games', 'running_record', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Team record at time of game, e.g. "15-8"'
    });
    await queryInterface.addColumn('games', 'running_conference_record', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Conference record at time of game'
    });

    // Teams: aggregate stats JSONB columns
    await queryInterface.addColumn('teams', 'team_batting_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team batting from Presto getTeamStats()'
    });
    await queryInterface.addColumn('teams', 'team_pitching_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team pitching'
    });
    await queryInterface.addColumn('teams', 'team_fielding_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team fielding'
    });
    await queryInterface.addColumn('teams', 'stats_last_synced_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When team stats were last refreshed'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('player_season_stats', 'raw_stats');
    await queryInterface.removeColumn('player_season_stats', 'split_stats');
    await queryInterface.removeColumn('games', 'team_stats');
    await queryInterface.removeColumn('games', 'opponent_stats');
    await queryInterface.removeColumn('games', 'game_summary');
    await queryInterface.removeColumn('games', 'running_record');
    await queryInterface.removeColumn('games', 'running_conference_record');
    await queryInterface.removeColumn('teams', 'team_batting_stats');
    await queryInterface.removeColumn('teams', 'team_pitching_stats');
    await queryInterface.removeColumn('teams', 'team_fielding_stats');
    await queryInterface.removeColumn('teams', 'stats_last_synced_at');
  }
};
