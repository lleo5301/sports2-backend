'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // In some dev setups, core tables are created by sequelize.sync before migrations run.
    // Guard against missing table so fresh DBs don't fail.
    try {
      await queryInterface.describeTable('players');
    } catch (err) {
      console.warn('[migration:add-video-to-players] players table not found; skipping addColumn. It will be created by sync.');
      return;
    }

    const table = await queryInterface.describeTable('players');
    if (!table.video_url) {
      await queryInterface.addColumn('players', 'video_url', {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'URL path to player video file'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.describeTable('players');
      const table = await queryInterface.describeTable('players');
      if (table.video_url) {
        await queryInterface.removeColumn('players', 'video_url');
      }
    } catch (err) {
      // table doesn't exist; nothing to do
      return;
    }
  }
};
