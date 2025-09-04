'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get the first team's players for association
    const players = await queryInterface.sequelize.query(
      'SELECT p.id FROM players p JOIN teams t ON p.team_id = t.id LIMIT 5',
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    if (players.length === 0) {
      console.log('No players found to create scouting reports for');
      return;
    }

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const scoutingReports = [
      {
        player_id: players[0].id,
        created_by: 1,
        report_date: now.toISOString().split('T')[0],
        game_date: now.toISOString().split('T')[0],
        opponent: 'Texas A&M',
        overall_grade: 'B+',
        overall_notes: 'Strong performance overall. Shows good fundamentals and work ethic. Areas for improvement include plate discipline and defensive positioning.',
        hitting_grade: 'B',
        hitting_notes: 'Solid contact hitter with good bat speed. Needs to work on pitch selection.',
        bat_speed: 'Good',
        power_potential: 'Average',
        plate_discipline: 'Below Average',
        pitching_grade: 'A-',
        pitching_notes: 'Excellent fastball command and developing breaking ball.',
        fastball_velocity: 92,
        fastball_grade: 'A',
        breaking_ball_grade: 'B+',
        command: 'Good',
        fielding_grade: 'B+',
        fielding_notes: 'Good range and arm strength. Needs work on footwork.',
        arm_strength: 'Good',
        arm_accuracy: 'Good',
        range: 'Average',
        speed_grade: 'B',
        speed_notes: 'Good speed but needs to improve base running instincts.',
        home_to_first: 4.2,
        intangibles_grade: 'A',
        intangibles_notes: 'Excellent work ethic and coachability. Team leader.',
        work_ethic: 'Excellent',
        coachability: 'Excellent',
        projection: 'College',
        projection_notes: 'Has potential to play at next level with continued development.',
        is_draft: false,
        is_public: false,
        created_at: now,
        updated_at: now
      },
      {
        player_id: players[1].id,
        created_by: 1,
        report_date: oneWeekAgo.toISOString().split('T')[0],
        game_date: oneWeekAgo.toISOString().split('T')[0],
        opponent: 'LSU',
        overall_grade: 'A-',
        overall_notes: 'Exceptional talent with high upside. Consistent performer in clutch situations.',
        hitting_grade: 'A',
        hitting_notes: 'Outstanding power hitter with excellent plate coverage.',
        bat_speed: 'Excellent',
        power_potential: 'Excellent',
        plate_discipline: 'Good',
        fielding_grade: 'B',
        fielding_notes: 'Solid defensive skills, could improve reaction time.',
        arm_strength: 'Excellent',
        arm_accuracy: 'Good',
        range: 'Good',
        speed_grade: 'B-',
        speed_notes: 'Average speed but good base running intelligence.',
        home_to_first: 4.5,
        intangibles_grade: 'A',
        intangibles_notes: 'Natural leader with great baseball IQ.',
        work_ethic: 'Excellent',
        coachability: 'Excellent',
        projection: 'MLB',
        projection_notes: 'High ceiling player with professional potential.',
        is_draft: false,
        is_public: true,
        created_at: oneWeekAgo,
        updated_at: oneWeekAgo
      },
      {
        player_id: players[2].id,
        created_by: 1,
        report_date: twoWeeksAgo.toISOString().split('T')[0],
        game_date: twoWeeksAgo.toISOString().split('T')[0],
        opponent: 'Florida',
        overall_grade: 'C+',
        overall_notes: 'Developing player with room for improvement. Shows flashes of potential.',
        hitting_grade: 'C',
        hitting_notes: 'Needs to work on consistency at the plate.',
        bat_speed: 'Average',
        power_potential: 'Below Average',
        plate_discipline: 'Average',
        pitching_grade: 'B-',
        pitching_notes: 'Good control but needs to develop secondary pitches.',
        fastball_velocity: 87,
        fastball_grade: 'B-',
        breaking_ball_grade: 'C+',
        command: 'Average',
        fielding_grade: 'C+',
        fielding_notes: 'Basic defensive skills, needs improvement in all areas.',
        arm_strength: 'Average',
        arm_accuracy: 'Average',
        range: 'Below Average',
        speed_grade: 'C',
        speed_notes: 'Below average speed affects defensive positioning.',
        home_to_first: 4.8,
        intangibles_grade: 'B+',
        intangibles_notes: 'Good attitude and willing to learn.',
        work_ethic: 'Good',
        coachability: 'Good',
        projection: 'High School',
        projection_notes: 'Needs significant development to reach next level.',
        is_draft: false,
        is_public: false,
        created_at: twoWeeksAgo,
        updated_at: twoWeeksAgo
      }
    ];

    await queryInterface.bulkInsert('scouting_reports', scoutingReports, {});
    console.log(`Created ${scoutingReports.length} sample scouting reports`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('scouting_reports', null, {});
  }
};
