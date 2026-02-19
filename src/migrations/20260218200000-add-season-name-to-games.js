'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('games', 'season_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Human-readable season name, e.g. "NJCAA Baseball 2025-26"'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('games', 'season_name');
  }
};
