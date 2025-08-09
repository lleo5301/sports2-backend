'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('players', 'video_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'URL path to player video file'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('players', 'video_url');
  }
};
