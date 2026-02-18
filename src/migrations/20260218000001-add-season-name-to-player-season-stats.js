'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('player_season_stats', 'season_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('player_season_stats', 'season_name');
  }
};
