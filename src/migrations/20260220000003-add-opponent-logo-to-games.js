'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('games', 'opponent_logo_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Opponent team logo URL from PrestoSports'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('games', 'opponent_logo_url');
  }
};
