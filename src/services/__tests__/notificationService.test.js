const notificationService = require('../notificationService');
const { User } = require('../../models');
const emailService = require('../emailService');
const logger = require('../../utils/logger');

// Mock dependencies
jest.mock('../../models');
jest.mock('../emailService');
jest.mock('../../utils/logger');

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotificationRecipients', () => {
    it('should filter users based on email notification preferences', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  playerUpdates: true
                }
              }
            }
          }
        },
        {
          id: 2,
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  playerUpdates: false
                }
              }
            }
          }
        },
        {
          id: 3,
          email: 'user3@test.com',
          first_name: 'User',
          last_name: 'Three',
          settings: {
            notifications: {
              email: {
                enabled: false,
                types: {
                  playerUpdates: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockUsers);

      const recipients = await notificationService.getNotificationRecipients(1, 'playerUpdates');

      expect(recipients).toHaveLength(1);
      expect(recipients[0].id).toBe(1);
      expect(User.findAll).toHaveBeenCalledWith({
        where: {
          team_id: 1,
          is_active: true
        },
        attributes: ['id', 'email', 'first_name', 'last_name', 'settings']
      });
    });

    it('should exclude the user who triggered the action', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  playerUpdates: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockUsers);

      await notificationService.getNotificationRecipients(1, 'playerUpdates', 2);

      const whereClause = User.findAll.mock.calls[0][0].where;
      expect(whereClause.id).toBeDefined();
      expect(whereClause.id[Symbol.for('ne')]).toBe(2);
    });

    it('should not send emails to users with notifications disabled', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One',
          settings: {
            notifications: {
              email: {
                enabled: false,
                types: {
                  scoutingReports: true
                }
              }
            }
          }
        },
        {
          id: 2,
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  scoutingReports: false
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockUsers);

      const recipients = await notificationService.getNotificationRecipients(1, 'scoutingReports');

      expect(recipients).toHaveLength(0);
    });

    it('should default to enabled if settings are undefined', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One',
          settings: null
        },
        {
          id: 2,
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two',
          settings: {}
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockUsers);

      const recipients = await notificationService.getNotificationRecipients(1, 'playerUpdates');

      // Both users should be included since defaults are true
      expect(recipients).toHaveLength(2);
    });

    it('should gracefully handle errors and return empty array', async () => {
      User.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      const recipients = await notificationService.getNotificationRecipients(1, 'playerUpdates');

      expect(recipients).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching notification recipients:',
        expect.any(Error)
      );
    });
  });

  describe('sendEmailNotifications', () => {
    it('should call emailService with correct parameters', async () => {
      const mockRecipients = [
        {
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One'
        },
        {
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two'
        }
      ];

      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendEmailNotifications(
        mockRecipients,
        'Test Title',
        'Test Message',
        'http://test.com/action'
      );

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user1@test.com',
        'Test Title',
        'Test Message',
        'http://test.com/action'
      );
      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user2@test.com',
        'Test Title',
        'Test Message',
        'http://test.com/action'
      );
    });

    it('should not send emails when recipients array is empty', async () => {
      emailService.sendNotificationEmail = jest.fn();

      await notificationService.sendEmailNotifications([], 'Title', 'Message');

      expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    });

    it('should not send emails when recipients is null', async () => {
      emailService.sendNotificationEmail = jest.fn();

      await notificationService.sendEmailNotifications(null, 'Title', 'Message');

      expect(emailService.sendNotificationEmail).not.toHaveBeenCalled();
    });

    it('should gracefully handle email sending errors', async () => {
      const mockRecipients = [
        {
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One'
        }
      ];

      emailService.sendNotificationEmail = jest.fn().mockRejectedValue(new Error('SMTP error'));

      await notificationService.sendEmailNotifications(
        mockRecipients,
        'Test Title',
        'Test Message'
      );

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send notification to recipient:',
        expect.objectContaining({
          email: expect.any(String),
          error: expect.any(Error)
        })
      );
    });

    it('should send emails without actionUrl when not provided', async () => {
      const mockRecipients = [
        {
          email: 'user1@test.com',
          first_name: 'User',
          last_name: 'One'
        }
      ];

      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendEmailNotifications(
        mockRecipients,
        'Test Title',
        'Test Message'
      );

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user1@test.com',
        'Test Title',
        'Test Message',
        null
      );
    });
  });

  describe('sendPlayerAddedNotification', () => {
    it('should send notification to users with playerUpdates enabled', async () => {
      const originalEnv = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'http://test.com';

      const mockPlayer = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe'
      };

      const mockRecipients = [
        {
          id: 2,
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two'
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients.map(r => ({
        ...r,
        settings: {
          notifications: {
            email: {
              enabled: true,
              types: {
                playerUpdates: true
              }
            }
          }
        }
      })));

      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendPlayerAddedNotification(mockPlayer, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(User.findAll).toHaveBeenCalled();
      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user2@test.com',
        'New Player Added',
        'A new player has been added to your team: John Doe',
        expect.any(String)
      );

      process.env.FRONTEND_URL = originalEnv;
    });

    it('should handle missing FRONTEND_URL gracefully', async () => {
      const originalEnv = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const mockPlayer = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe'
      };

      const mockRecipients = [
        {
          id: 2,
          email: 'user2@test.com',
          first_name: 'User',
          last_name: 'Two',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  playerUpdates: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients);
      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendPlayerAddedNotification(mockPlayer, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user2@test.com',
        'New Player Added',
        'A new player has been added to your team: John Doe',
        null
      );

      process.env.FRONTEND_URL = originalEnv;
    });

    it('should gracefully handle errors without throwing', async () => {
      User.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      const mockPlayer = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe'
      };

      // Should not throw
      await expect(
        notificationService.sendPlayerAddedNotification(mockPlayer, 1, 5)
      ).resolves.not.toThrow();

      // Error is caught in getNotificationRecipients
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching notification recipients:',
        expect.any(Error)
      );
    });
  });

  describe('sendScoutingReportNotification', () => {
    it('should send notification to users with scoutingReports enabled', async () => {
      const originalEnv = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'http://test.com';

      const mockReport = {
        id: 1
      };

      const mockPlayer = {
        id: 2,
        first_name: 'Jane',
        last_name: 'Smith'
      };

      const mockRecipients = [
        {
          id: 3,
          email: 'user3@test.com',
          first_name: 'User',
          last_name: 'Three'
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients.map(r => ({
        ...r,
        settings: {
          notifications: {
            email: {
              enabled: true,
              types: {
                scoutingReports: true
              }
            }
          }
        }
      })));

      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendScoutingReportNotification(mockReport, mockPlayer, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user3@test.com',
        'New Scouting Report',
        'A new scouting report has been created for Jane Smith',
        expect.any(String)
      );

      process.env.FRONTEND_URL = originalEnv;
    });

    it('should handle missing player gracefully', async () => {
      const mockReport = {
        id: 1
      };

      const mockRecipients = [
        {
          id: 3,
          email: 'user3@test.com',
          first_name: 'User',
          last_name: 'Three',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  scoutingReports: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients);
      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendScoutingReportNotification(mockReport, null, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user3@test.com',
        'New Scouting Report',
        'A new scouting report has been created for a player',
        expect.any(String)
      );
    });

    it('should gracefully handle errors without throwing', async () => {
      User.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      const mockReport = { id: 1 };
      const mockPlayer = { id: 2, first_name: 'Jane', last_name: 'Smith' };

      // Should not throw
      await expect(
        notificationService.sendScoutingReportNotification(mockReport, mockPlayer, 1, 5)
      ).resolves.not.toThrow();

      // Error is caught in getNotificationRecipients
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching notification recipients:',
        expect.any(Error)
      );
    });
  });

  describe('sendSchedulePublishedNotification', () => {
    it('should send notification to users with scheduleChanges enabled', async () => {
      const originalEnv = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'http://test.com';

      const mockSchedule = {
        id: 1,
        name: 'Spring 2024 Schedule'
      };

      const mockRecipients = [
        {
          id: 4,
          email: 'user4@test.com',
          first_name: 'User',
          last_name: 'Four'
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients.map(r => ({
        ...r,
        settings: {
          notifications: {
            email: {
              enabled: true,
              types: {
                scheduleChanges: true
              }
            }
          }
        }
      })));

      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendSchedulePublishedNotification(mockSchedule, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user4@test.com',
        'Schedule Published',
        'Spring 2024 Schedule has been published and is now available to view',
        expect.any(String)
      );

      process.env.FRONTEND_URL = originalEnv;
    });

    it('should handle schedule with title instead of name', async () => {
      const mockSchedule = {
        id: 1,
        title: 'Fall 2024 Schedule'
      };

      const mockRecipients = [
        {
          id: 4,
          email: 'user4@test.com',
          first_name: 'User',
          last_name: 'Four',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  scheduleChanges: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients);
      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendSchedulePublishedNotification(mockSchedule, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user4@test.com',
        'Schedule Published',
        'Fall 2024 Schedule has been published and is now available to view',
        expect.any(String)
      );
    });

    it('should use default schedule name when neither name nor title is provided', async () => {
      const mockSchedule = {
        id: 1
      };

      const mockRecipients = [
        {
          id: 4,
          email: 'user4@test.com',
          first_name: 'User',
          last_name: 'Four',
          settings: {
            notifications: {
              email: {
                enabled: true,
                types: {
                  scheduleChanges: true
                }
              }
            }
          }
        }
      ];

      User.findAll = jest.fn().mockResolvedValue(mockRecipients);
      emailService.sendNotificationEmail = jest.fn().mockResolvedValue();

      await notificationService.sendSchedulePublishedNotification(mockSchedule, 1, 5);

      // Wait a tick for the promise to resolve
      await new Promise(resolve => setImmediate(resolve));

      expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
        'user4@test.com',
        'Schedule Published',
        'A new schedule has been published and is now available to view',
        expect.any(String)
      );
    });

    it('should gracefully handle errors without throwing', async () => {
      User.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      const mockSchedule = { id: 1, name: 'Test Schedule' };

      // Should not throw
      await expect(
        notificationService.sendSchedulePublishedNotification(mockSchedule, 1, 5)
      ).resolves.not.toThrow();

      // Error is caught in getNotificationRecipients
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching notification recipients:',
        expect.any(Error)
      );
    });
  });
});
