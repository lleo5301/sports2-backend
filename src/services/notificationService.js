const { User } = require('../models');
const emailService = require('./emailService');

/**
 * Notification Service for Sports2 Application
 * Handles sending team-wide notifications based on user preferences
 */
class NotificationService {
  /**
   * Get team members who have opted into specific email notification types
   * @param {number} teamId - Team ID
   * @param {string} notificationType - Type of notification (playerUpdates, scoutingReports, scheduleChanges)
   * @param {number} excludeUserId - Optional user ID to exclude from notifications (e.g., the action creator)
   * @returns {Promise<Array>} - Array of users with email notifications enabled
   */
  async getNotificationRecipients(teamId, notificationType, excludeUserId = null) {
    try {
      const whereClause = {
        team_id: teamId,
        is_active: true
      };

      // Exclude the user who triggered the action
      if (excludeUserId) {
        whereClause.id = { [require('sequelize').Op.ne]: excludeUserId };
      }

      const users = await User.findAll({
        where: whereClause,
        attributes: ['id', 'email', 'first_name', 'last_name', 'settings']
      });

      // Filter users based on their notification preferences
      const recipients = users.filter(user => {
        // Check if email notifications are enabled
        const emailEnabled = user.settings?.notifications?.email?.enabled ?? true;
        if (!emailEnabled) {
          return false;
        }

        // Check if the specific notification type is enabled
        const typeEnabled = user.settings?.notifications?.email?.types?.[notificationType] ?? true;
        return typeEnabled;
      });

      return recipients;
    } catch (error) {
      console.error('Error fetching notification recipients:', error);
      return [];
    }
  }

  /**
   * Send email notifications to multiple recipients
   * @param {Array} recipients - Array of user objects with email and name
   * @param {string} title - Email title
   * @param {string} message - Email message
   * @param {string} actionUrl - Optional URL for action button
   */
  async sendEmailNotifications(recipients, title, message, actionUrl = null) {
    if (!recipients || recipients.length === 0) {
      return;
    }

    // Send emails in parallel, but don't wait for completion
    // This ensures notification errors don't block the main action flow
    const emailPromises = recipients.map(recipient => {
      return emailService.sendNotificationEmail(
        recipient.email,
        title,
        message,
        actionUrl
      ).catch(error => {
        // Log error but don't throw - we don't want to break the main flow
        console.error(`Failed to send notification to ${recipient.email}:`, error);
      });
    });

    // Fire and forget - don't await completion
    Promise.all(emailPromises).catch(error => {
      console.error('Error sending notification emails:', error);
    });
  }

  /**
   * Send notification when a new player is added
   * @param {Object} player - Player object
   * @param {number} teamId - Team ID
   * @param {number} creatorId - ID of user who created the player
   */
  async sendPlayerAddedNotification(player, teamId, creatorId) {
    try {
      const recipients = await this.getNotificationRecipients(teamId, 'playerUpdates', creatorId);

      if (recipients.length === 0) {
        return;
      }

      const title = 'New Player Added';
      const message = `A new player has been added to your team: ${player.first_name} ${player.last_name}`;
      const actionUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/players/${player.id}`
        : null;

      await this.sendEmailNotifications(recipients, title, message, actionUrl);
    } catch (error) {
      // Log error but don't throw - we don't want to break the main flow
      console.error('Error sending player added notification:', error);
    }
  }

  /**
   * Send notification when a new scouting report is created
   * @param {Object} report - Scouting report object
   * @param {Object} player - Player object the report is about
   * @param {number} teamId - Team ID
   * @param {number} creatorId - ID of user who created the report
   */
  async sendScoutingReportNotification(report, player, teamId, creatorId) {
    try {
      const recipients = await this.getNotificationRecipients(teamId, 'scoutingReports', creatorId);

      if (recipients.length === 0) {
        return;
      }

      const title = 'New Scouting Report';
      const playerName = player ? `${player.first_name} ${player.last_name}` : 'a player';
      const message = `A new scouting report has been created for ${playerName}`;
      const actionUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/reports/scouting/${report.id}`
        : null;

      await this.sendEmailNotifications(recipients, title, message, actionUrl);
    } catch (error) {
      // Log error but don't throw - we don't want to break the main flow
      console.error('Error sending scouting report notification:', error);
    }
  }

  /**
   * Send notification when a schedule is published
   * @param {Object} schedule - Schedule object
   * @param {number} teamId - Team ID
   * @param {number} creatorId - ID of user who created/published the schedule
   */
  async sendSchedulePublishedNotification(schedule, teamId, creatorId) {
    try {
      const recipients = await this.getNotificationRecipients(teamId, 'scheduleChanges', creatorId);

      if (recipients.length === 0) {
        return;
      }

      const title = 'Schedule Published';
      const scheduleName = schedule.name || schedule.title || 'A new schedule';
      const message = `${scheduleName} has been published and is now available to view`;
      const actionUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/schedules/${schedule.id}`
        : null;

      await this.sendEmailNotifications(recipients, title, message, actionUrl);
    } catch (error) {
      // Log error but don't throw - we don't want to break the main flow
      console.error('Error sending schedule published notification:', error);
    }
  }
}

// Export singleton instance
module.exports = new NotificationService();
