'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('teams', 'scouting_grade_scale', {
      type: Sequelize.ENUM('20-80', 'letter'),
      allowNull: false,
      defaultValue: 'letter'
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn('teams', 'scouting_grade_scale');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_teams_scouting_grade_scale";');
  }
};
