/**
 * @fileoverview Helper functions for team operations.
 * Provides utility functions for team branding permissions and validation.
 *
 * @module routes/teams/helpers
 */

const { isSuperAdmin } = require('../../middleware/permissions');

/**
 * @description Helper function to check if a user has permission to modify team branding.
 *              Only super_admin users or head_coach role can modify branding (logo, colors).
 *              This enforces role-based access control for sensitive branding operations.
 *
 * @param {Object} user - The authenticated user object
 * @param {string} user.role - User's role (e.g., 'head_coach', 'assistant', 'scout')
 * @param {boolean} [user.is_super_admin] - Optional super admin flag
 * @returns {boolean} True if user can modify branding, false otherwise
 */
const canModifyBranding = (user) => {
  return isSuperAdmin(user) || user.role === 'head_coach';
};

module.exports = {
  canModifyBranding
};
