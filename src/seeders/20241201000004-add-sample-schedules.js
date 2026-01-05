'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get the first team ID for association
    const teams = await queryInterface.sequelize.query(
      'SELECT id FROM teams LIMIT 1',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const teamId = teams[0]?.id || 1;
    const now = new Date();

    // Create schedules
    const schedules = [
      {
        team_name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        date: new Date('2024-03-15'),
        motto: 'Regular practice session',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        team_name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        date: new Date('2024-03-16'),
        motto: 'Game day preparation',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        team_name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        date: new Date('2024-03-17'),
        motto: 'Recovery and light training',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        team_name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        date: new Date('2024-03-18'),
        motto: 'Strength and conditioning',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        team_name: 'Texas Longhorns',
        program_name: 'University of Texas Baseball',
        date: new Date('2024-03-19'),
        motto: 'Bullpen and batting practice',
        team_id: teamId,
        created_by: 1,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ];

    const createdSchedules = await queryInterface.bulkInsert('schedules', schedules, { returning: true });

    // Create schedule sections for each schedule
    const sections = [];
    const activities = [];

    createdSchedules.forEach((schedule, index) => {
      // Add general section
      sections.push({
        schedule_id: schedule.id,
        type: 'general',
        title: 'General Practice',
        sort_order: 1,
        created_at: now,
        updated_at: now
      });

      // Add specific sections based on schedule type
      if (index === 1) { // Game day
        sections.push({
          schedule_id: schedule.id,
          type: 'general',
          title: 'Game vs Texas A&M',
          sort_order: 2,
          created_at: now,
          updated_at: now
        });
      } else if (index === 4) { // Bullpen day
        sections.push({
          schedule_id: schedule.id,
          type: 'bullpen',
          title: 'Bullpen Session',
          sort_order: 2,
          created_at: now,
          updated_at: now
        });
      }
    });

    const createdSections = await queryInterface.bulkInsert('schedule_sections', sections, { returning: true });

    // Create activities for each section
    createdSections.forEach((section, _sectionIndex) => {
      if (section.type === 'general') {
        activities.push(
          {
            section_id: section.id,
            time: '09:00',
            activity: 'Warm-up and stretching',
            location: 'Field',
            notes: 'Dynamic stretching routine',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '09:30',
            activity: 'Throwing program',
            location: 'Outfield',
            notes: 'Long toss and arm care',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '10:00',
            activity: 'Batting practice',
            location: 'Cages',
            notes: 'Live BP with coaches',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '11:00',
            activity: 'Fielding drills',
            location: 'Infield/Outfield',
            notes: 'Position-specific work',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '11:30',
            activity: 'Cool down',
            location: 'Field',
            notes: 'Static stretching',
            created_at: now,
            updated_at: now
          }
        );
      } else if (section.type === 'game') {
        activities.push(
          {
            section_id: section.id,
            time: '14:00',
            activity: 'Pre-game meeting',
            location: 'Clubhouse',
            notes: 'Game plan discussion',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '15:00',
            activity: 'Pre-game warm-up',
            location: 'Field',
            notes: 'Team warm-up routine',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '16:00',
            activity: 'Game vs Texas A&M',
            location: 'Disch-Falk Field',
            notes: 'Home game',
            created_at: now,
            updated_at: now
          }
        );
      } else if (section.type === 'bullpen') {
        activities.push(
          {
            section_id: section.id,
            time: '09:00',
            activity: 'Bullpen session',
            location: 'Bullpen',
            notes: 'Pitchers throwing program',
            created_at: now,
            updated_at: now
          },
          {
            section_id: section.id,
            time: '10:00',
            activity: 'Catcher work',
            location: 'Bullpen',
            notes: 'Catcher receiving practice',
            created_at: now,
            updated_at: now
          }
        );
      }
    });

    await queryInterface.bulkInsert('schedule_activities', activities, {});
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.bulkDelete('schedule_activities', null, {});
    await queryInterface.bulkDelete('schedule_sections', null, {});
    await queryInterface.bulkDelete('schedules', null, {});
  }
};
