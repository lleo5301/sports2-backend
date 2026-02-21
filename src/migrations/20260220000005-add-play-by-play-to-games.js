'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('games', 'play_by_play', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Parsed play-by-play data from PrestoSports event stats XML'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('games', 'play_by_play');
  }
};
