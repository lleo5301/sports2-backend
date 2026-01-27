'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get all existing users
    const users = await queryInterface.sequelize.query(
      'SELECT id, team_id, role FROM users WHERE is_active = true',
      { type: Sequelize.QueryTypes.SELECT }
    );

    const permissions = [];
    const now = new Date();

    // All permissions available in the system
    const allPermissions = [
      'depth_chart_view',
      'depth_chart_create',
      'depth_chart_edit',
      'depth_chart_delete',
      'depth_chart_manage_positions',
      'player_assign',
      'player_unassign',
      'schedule_view',
      'schedule_create',
      'schedule_edit',
      'schedule_delete',
      'reports_view',
      'reports_create',
      'reports_edit',
      'reports_delete',
      'team_settings',
      'user_management'
    ];

    // Limited permissions for assistant coaches
    const assistantCoachPermissions = [
      'depth_chart_view',
      'depth_chart_create',
      'depth_chart_edit',
      'player_assign',
      'player_unassign',
      'schedule_view',
      'schedule_create',
      'schedule_edit',
      'reports_view',
      'reports_create',
      'reports_edit'
    ];

    for (const user of users) {
      let userPermissions;

      // Super admins and head coaches get all permissions
      if (user.role === 'super_admin' || user.role === 'head_coach') {
        userPermissions = allPermissions;
      } else {
        // Assistant coaches get limited permissions
        userPermissions = assistantCoachPermissions;
      }

      userPermissions.forEach(permissionType => {
        permissions.push({
          user_id: user.id,
          team_id: user.team_id,
          permission_type: permissionType,
          is_granted: true,
          granted_by: user.id,
          granted_at: now,
          created_at: now,
          updated_at: now
        });
      });
    }

    if (permissions.length > 0) {
      await queryInterface.bulkInsert('user_permissions', permissions, {});
    }
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.bulkDelete('user_permissions', null, {});
  }
};
