const { UserPermission } = require('../models');
const logger = require('../utils/logger');

/**
 * Check if user is a super admin (bypasses all permission checks)
 * @param {Object} user - The user object from req.user
 * @returns {boolean} True if user is super_admin
 */
const isSuperAdmin = (user) => {
  return user && user.role === 'super_admin';
};

/**
 * Check if user is a head coach (gets all permissions except system profile deletion)
 * @param {Object} user - The user object from req.user
 * @returns {boolean} True if user is head_coach
 */
const isHeadCoach = (user) => {
  return user && user.role === 'head_coach';
};

/**
 * Permissions that head_coach role is denied (must be checked explicitly)
 */
const HEAD_COACH_DENIED = [
  'system_profile_delete'
];

/**
 * Middleware to check if user has a specific permission
 * @param {string} permissionType - The permission type to check
 * @returns {Function} Express middleware function
 */
const checkPermission = (permissionType) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses all permission checks
      if (isSuperAdmin(req.user)) {
        return next();
      }

      // Head coach gets all permissions except explicitly denied ones
      if (isHeadCoach(req.user) && !HEAD_COACH_DENIED.includes(permissionType)) {
        return next();
      }

      const userId = req.user.id;
      const teamId = req.user.team_id;

      // Check if user has the specific permission
      const permission = await UserPermission.findOne({
        where: {
          user_id: userId,
          team_id: teamId,
          permission_type: permissionType,
          is_granted: true
        }
      });

      // Check if permission has expired
      if (permission && permission.expires_at && new Date() > permission.expires_at) {
        return res.status(403).json({
          success: false,
          message: 'Permission has expired'
        });
      }

      if (!permission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${permissionType}`
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Middleware to check if user has any of the specified permissions
 * @param {string[]} permissionTypes - Array of permission types to check
 * @returns {Function} Express middleware function
 */
const checkAnyPermission = (permissionTypes) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses all permission checks
      if (isSuperAdmin(req.user)) {
        return next();
      }

      // Head coach passes if any of the requested permissions are not denied
      if (isHeadCoach(req.user) && permissionTypes.some(p => !HEAD_COACH_DENIED.includes(p))) {
        return next();
      }

      const userId = req.user.id;
      const teamId = req.user.team_id;

      // Check if user has any of the specified permissions
      const permission = await UserPermission.findOne({
        where: {
          user_id: userId,
          team_id: teamId,
          permission_type: permissionTypes,
          is_granted: true
        }
      });

      // Check if permission has expired
      if (permission && permission.expires_at && new Date() > permission.expires_at) {
        return res.status(403).json({
          success: false,
          message: 'Permission has expired'
        });
      }

      if (!permission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required one of: ${permissionTypes.join(', ')}`
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

/**
 * Middleware to check if user has all of the specified permissions
 * @param {string[]} permissionTypes - Array of permission types to check
 * @returns {Function} Express middleware function
 */
const checkAllPermissions = (permissionTypes) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses all permission checks
      if (isSuperAdmin(req.user)) {
        return next();
      }

      // Head coach passes if none of the requested permissions are denied
      if (isHeadCoach(req.user) && permissionTypes.every(p => !HEAD_COACH_DENIED.includes(p))) {
        return next();
      }

      const userId = req.user.id;
      const teamId = req.user.team_id;

      // Check if user has all of the specified permissions
      const permissions = await UserPermission.findAll({
        where: {
          user_id: userId,
          team_id: teamId,
          permission_type: permissionTypes,
          is_granted: true
        }
      });

      // Check if any permission has expired
      const expiredPermission = permissions.find(
        permission => permission.expires_at && new Date() > permission.expires_at
      );

      if (expiredPermission) {
        return res.status(403).json({
          success: false,
          message: 'One or more permissions have expired'
        });
      }

      if (permissions.length !== permissionTypes.length) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required all of: ${permissionTypes.join(', ')}`
        });
      }

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions'
      });
    }
  };
};

// Specific permission checkers for depth chart operations
const depthChartPermissions = {
  canView: checkPermission('depth_chart_view'),
  canCreate: checkPermission('depth_chart_create'),
  canEdit: checkPermission('depth_chart_edit'),
  canDelete: checkPermission('depth_chart_delete'),
  canManagePositions: checkPermission('depth_chart_manage_positions'),
  canAssignPlayers: checkPermission('player_assign'),
  canUnassignPlayers: checkPermission('player_unassign'),
  canViewOrEdit: checkAnyPermission(['depth_chart_view', 'depth_chart_edit']),
  canManage: checkAnyPermission(['depth_chart_create', 'depth_chart_edit', 'depth_chart_delete'])
};

module.exports = {
  isSuperAdmin,
  isHeadCoach,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  depthChartPermissions
};
