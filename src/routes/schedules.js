const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Schedule, ScheduleSection, ScheduleActivity, User, Team } = require('../models');
const { protect } = require('../middleware/auth');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Validation middleware
const validateSchedule = [
  body('team_name').notEmpty().withMessage('Team name is required'),
  body('program_name').notEmpty().withMessage('Program name is required'),
  body('date').isDate().withMessage('Valid date is required'),
  body('sections').isArray().withMessage('Sections must be an array')
];

const validateSection = [
  body('type').isIn([
    'general', 'position_players', 'pitchers', 'grinder_performance',
    'grinder_hitting', 'grinder_defensive', 'bullpen', 'live_bp'
  ]).withMessage('Invalid section type'),
  body('title').notEmpty().withMessage('Section title is required')
];

const validateActivity = [
  body('time').notEmpty().withMessage('Time is required'),
  body('activity').notEmpty().withMessage('Activity is required')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// GET /api/schedules - Get all schedules for the user's team
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, date, team_id } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {
      is_active: true
    };

    // Filter by team if specified, otherwise use user's team
    if (team_id) {
      whereClause.team_id = team_id;
    } else {
      whereClause.team_id = req.user.team_id;
    }

    // Filter by date if specified
    if (date) {
      whereClause.date = date;
    }

    const schedules = await Schedule.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        }
      ],
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      data: schedules.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: schedules.count,
        pages: Math.ceil(schedules.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// GET /api/schedules/stats - Get schedule statistics
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get total events
    const totalEvents = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true
              }
            }
          ]
        }
      ]
    });

    // Get events this week
    const thisWeek = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true,
                date: {
                  [require('sequelize').Op.gte]: startOfWeek
                }
              }
            }
          ]
        }
      ]
    });

    // Get events this month
    const thisMonth = await ScheduleActivity.count({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true,
                date: {
                  [require('sequelize').Op.gte]: startOfMonth
                }
              }
            }
          ]
        }
      ]
    });

    res.json({
      data: {
        totalEvents,
        thisWeek,
        thisMonth
      }
    });
  } catch (error) {
    console.error('Error fetching schedule stats:', error);
    res.status(500).json({ error: 'Failed to fetch schedule stats' });
  }
});

// GET /api/schedules/byId/:id - Get a specific schedule with all sections and activities
router.get('/byId/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        is_active: true,
        team_id: req.user.team_id
      },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ data: schedule });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// POST /api/schedules - Create a new schedule
router.post('/', validateSchedule, handleValidationErrors, async (req, res) => {
  try {
    const { team_name, program_name, date, motto, sections } = req.body;

    // Create the main schedule
    const schedule = await Schedule.create({
      team_name,
      program_name,
      date,
      motto,
      team_id: req.user.team_id,
      created_by: req.user.id
    });

    // Create sections and activities
    if (sections && sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const sectionData = sections[i];
        const section = await ScheduleSection.create({
          schedule_id: schedule.id,
          type: sectionData.type,
          title: sectionData.title,
          sort_order: i
        });

        // Create activities for this section
        if (sectionData.activities && sectionData.activities.length > 0) {
          const activities = sectionData.activities.map((activity, index) => ({
            section_id: section.id,
            time: activity.time,
            activity: activity.activity,
            location: activity.location || null,
            staff: activity.staff || null,
            group: activity.group || null,
            notes: activity.notes || null,
            sort_order: index
          }));

          await ScheduleActivity.bulkCreate(activities);
        }
      }
    }

    // Fetch the created schedule with all related data
    const createdSchedule = await Schedule.findOne({
      where: { id: schedule.id },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    res.status(201).json({
      message: 'Schedule created successfully',
      data: createdSchedule
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// PUT /api/schedules/:id - Update a schedule
router.put('/byId/:id', validateSchedule, handleValidationErrors, async (req, res) => {
  try {
    const { team_name, program_name, date, motto, sections } = req.body;

    // Check if schedule exists and user has access
    const existingSchedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id,
        is_active: true
      }
    });

    if (!existingSchedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Update the main schedule
    await existingSchedule.update({
      team_name,
      program_name,
      date,
      motto
    });

    // Delete existing sections and activities (cascade will handle activities)
    await ScheduleSection.destroy({
      where: { schedule_id: existingSchedule.id }
    });

    // Recreate sections and activities
    if (sections && sections.length > 0) {
      for (let i = 0; i < sections.length; i++) {
        const sectionData = sections[i];
        const section = await ScheduleSection.create({
          schedule_id: existingSchedule.id,
          type: sectionData.type,
          title: sectionData.title,
          sort_order: i
        });

        // Create activities for this section
        if (sectionData.activities && sectionData.activities.length > 0) {
          const activities = sectionData.activities.map((activity, index) => ({
            section_id: section.id,
            time: activity.time,
            activity: activity.activity,
            location: activity.location || null,
            staff: activity.staff || null,
            group: activity.group || null,
            notes: activity.notes || null,
            sort_order: index
          }));

          await ScheduleActivity.bulkCreate(activities);
        }
      }
    }

    // Fetch the updated schedule
    const updatedSchedule = await Schedule.findOne({
      where: { id: existingSchedule.id },
      include: [
        {
          model: User,
          as: 'Creator',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: Team,
          attributes: ['id', 'name']
        },
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['sort_order', 'ASC'], ['time', 'ASC']]
            }
          ],
          order: [['sort_order', 'ASC']]
        }
      ]
    });

    res.json({
      message: 'Schedule updated successfully',
      data: updatedSchedule
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// DELETE /api/schedules/:id - Soft delete a schedule
router.delete('/byId/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id,
        is_active: true
      }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await schedule.update({ is_active: false });

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// POST /api/schedules/:id/sections - Add a section to a schedule
router.post('/:id/sections', validateSection, handleValidationErrors, async (req, res) => {
  try {
    const { type, title } = req.body;

    const schedule = await Schedule.findOne({
      where: {
        id: req.params.id,
        team_id: req.user.team_id,
        is_active: true
      }
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Get the next sort order
    const lastSection = await ScheduleSection.findOne({
      where: { schedule_id: schedule.id },
      order: [['sort_order', 'DESC']]
    });

    const sortOrder = lastSection ? lastSection.sort_order + 1 : 0;

    const section = await ScheduleSection.create({
      schedule_id: schedule.id,
      type,
      title,
      sort_order: sortOrder
    });

    res.status(201).json({
      message: 'Section added successfully',
      data: section
    });
  } catch (error) {
    console.error('Error adding section:', error);
    res.status(500).json({ error: 'Failed to add section' });
  }
});

// POST /api/schedules/sections/:sectionId/activities - Add an activity to a section
router.post('/sections/:sectionId/activities', validateActivity, handleValidationErrors, async (req, res) => {
  try {
    const { time, activity, location, staff, group, notes } = req.body;

    // Verify the section belongs to the user's team
    const section = await ScheduleSection.findOne({
      include: [
        {
          model: Schedule,
          where: {
            team_id: req.user.team_id,
            is_active: true
          }
        }
      ],
      where: { id: req.params.sectionId }
    });

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Get the next sort order
    const lastActivity = await ScheduleActivity.findOne({
      where: { section_id: section.id },
      order: [['sort_order', 'DESC']]
    });

    const sortOrder = lastActivity ? lastActivity.sort_order + 1 : 0;

    const newActivity = await ScheduleActivity.create({
      section_id: section.id,
      time,
      activity,
      location,
      staff,
      group,
      notes,
      sort_order: sortOrder
    });

    res.status(201).json({
      message: 'Activity added successfully',
      data: newActivity
    });
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

// DELETE /api/schedules/sections/:sectionId - Delete a section
router.delete('/sections/:sectionId', async (req, res) => {
  try {
    const section = await ScheduleSection.findOne({
      include: [
        {
          model: Schedule,
          where: {
            team_id: req.user.team_id,
            is_active: true
          }
        }
      ],
      where: { id: req.params.sectionId }
    });

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    await section.destroy(); // This will cascade delete activities

    res.json({ message: 'Section deleted successfully' });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// DELETE /api/schedules/activities/:activityId - Delete an activity
router.delete('/activities/:activityId', async (req, res) => {
  try {
    const activity = await ScheduleActivity.findOne({
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: Schedule,
              where: {
                team_id: req.user.team_id,
                is_active: true
              }
            }
          ]
        }
      ],
      where: { id: req.params.activityId }
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await activity.destroy();

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// @route   GET /api/schedules/export-pdf
// @desc    Export schedule as PDF
// @access  Private
router.get('/export-pdf', async (req, res) => {
  try {
    // For now, return a simple HTML that can be printed as PDF
    // In production, you would use a library like puppeteer or jsPDF

    const schedules = await Schedule.findAll({
      where: { team_id: req.user.team_id },
      include: [
        {
          model: ScheduleSection,
          include: [
            {
              model: ScheduleActivity,
              order: [['time', 'ASC']]
            }
          ]
        }
      ],
      order: [['date', 'DESC']]
    });

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Team Schedules</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .schedule { margin-bottom: 30px; border: 1px solid #ddd; padding: 20px; }
          .header { background: #f5f5f5; padding: 10px; margin: -20px -20px 20px -20px; }
          .section { margin-bottom: 20px; }
          .activity { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
          .time { font-weight: bold; min-width: 80px; }
          .activity-name { flex: 1; }
          .location { font-style: italic; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          @media print {
            body { margin: 0; }
            .schedule { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>Team Schedules</h1>
    `;

    schedules.forEach(schedule => {
      html += `
        <div class="schedule">
          <div class="header">
            <h2>${schedule.team_name} - ${schedule.program_name}</h2>
            <p><strong>Date:</strong> ${new Date(schedule.date).toLocaleDateString()}</p>
            ${schedule.motto ? `<p><strong>Motto:</strong> ${schedule.motto}</p>` : ''}
          </div>
      `;

      if (schedule.ScheduleSections && schedule.ScheduleSections.length > 0) {
        schedule.ScheduleSections.forEach(section => {
          html += `
            <div class="section">
              <h3>${section.title}</h3>
              ${section.ScheduleActivities && section.ScheduleActivities.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Activity</th>
                      <th>Location</th>
                      <th>Staff/Group</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${section.ScheduleActivities.map(activity => `
                      <tr>
                        <td>${activity.time}</td>
                        <td>${activity.activity}</td>
                        <td>${activity.location || ''}</td>
                        <td>${activity.staff || activity.group || ''}</td>
                        <td>${activity.notes || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p>No activities scheduled</p>'}
            </div>
          `;
        });
      } else {
        html += '<p>No sections defined</p>';
      }

      html += '</div>';
    });

    html += `
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', 'attachment; filename="team-schedules.html"');
    res.send(html);

  } catch (error) {
    console.error('Error exporting schedules:', error);
    res.status(500).json({ error: 'Failed to export schedules' });
  }
});

module.exports = router; 