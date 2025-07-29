const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { User, Team } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const router = express.Router();

// Validation middleware
const validateGeneralSettings = [
  body('theme').optional().isString().withMessage('Theme must be a string'),
  body('language').optional().isIn(['en', 'es', 'fr']).withMessage('Invalid language'),
  body('timezone').optional().isString().withMessage('Timezone must be a string'),
  body('dateFormat').optional().isString().withMessage('Date format must be a string'),
  body('timeFormat').optional().isIn(['12h', '24h']).withMessage('Time format must be 12h or 24h'),
  body('autoRefresh').optional().isBoolean().withMessage('Auto refresh must be a boolean'),
  body('compactView').optional().isBoolean().withMessage('Compact view must be a boolean'),
  body('showNotifications').optional().isBoolean().withMessage('Show notifications must be a boolean')
];

const validateAccountSettings = [
  body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('location').optional().trim().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  body('website').optional().isURL().withMessage('Invalid website URL')
];

const validateNotificationSettings = [
  body('email.enabled').optional().isBoolean().withMessage('Email enabled must be a boolean'),
  body('email.frequency').optional().isIn(['immediate', 'hourly', 'daily', 'weekly']).withMessage('Invalid email frequency'),
  body('email.types').optional().isObject().withMessage('Email types must be an object'),
  body('push.enabled').optional().isBoolean().withMessage('Push enabled must be a boolean'),
  body('push.types').optional().isObject().withMessage('Push types must be an object'),
  body('inApp.enabled').optional().isBoolean().withMessage('In-app enabled must be a boolean'),
  body('inApp.sound').optional().isBoolean().withMessage('In-app sound must be a boolean'),
  body('inApp.types').optional().isObject().withMessage('In-app types must be an object')
];

const validateSecuritySettings = [
  body('twoFactorEnabled').optional().isBoolean().withMessage('Two-factor enabled must be a boolean'),
  body('loginNotifications').optional().isBoolean().withMessage('Login notifications must be a boolean'),
  body('sessionTimeout').optional().isInt({ min: 5, max: 1440 }).withMessage('Session timeout must be 5-1440 minutes'),
  body('passwordExpiry').optional().isInt({ min: 30, max: 365 }).withMessage('Password expiry must be 30-365 days'),
  body('requirePasswordChange').optional().isBoolean().withMessage('Require password change must be a boolean')
];

const validatePasswordChange = [
  body('currentPassword').isLength({ min: 6 }).withMessage('Current password must be at least 6 characters'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match password');
    }
    return true;
  })
];

const validatePrivacySettings = [
  body('profileVisibility').optional().isIn(['public', 'team', 'private']).withMessage('Invalid profile visibility'),
  body('showEmail').optional().isBoolean().withMessage('Show email must be a boolean'),
  body('showPhone').optional().isBoolean().withMessage('Show phone must be a boolean'),
  body('allowDataSharing').optional().isBoolean().withMessage('Allow data sharing must be a boolean'),
  body('allowAnalytics').optional().isBoolean().withMessage('Allow analytics must be a boolean'),
  body('allowMarketing').optional().isBoolean().withMessage('Allow marketing must be a boolean')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Apply authentication middleware to all routes
router.use(protect);

// GET /api/settings - Get user settings
router.get('/', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user settings from database or use defaults
    const settings = {
      general: {
        theme: user.settings?.general?.theme || 'light',
        language: user.settings?.general?.language || 'en',
        timezone: user.settings?.general?.timezone || 'UTC',
        dateFormat: user.settings?.general?.dateFormat || 'MM/DD/YYYY',
        timeFormat: user.settings?.general?.timeFormat || '12h',
        autoRefresh: user.settings?.general?.autoRefresh || false,
        compactView: user.settings?.general?.compactView || false,
        showNotifications: user.settings?.general?.showNotifications || true
      },
      account: {
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        profilePicture: user.profile_picture || null
      },
      notifications: {
        email: {
          enabled: user.settings?.notifications?.email?.enabled ?? true,
          frequency: user.settings?.notifications?.email?.frequency || 'immediate',
          types: {
            playerUpdates: user.settings?.notifications?.email?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.email?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.email?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.email?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.email?.types?.systemUpdates ?? false,
            marketing: user.settings?.notifications?.email?.types?.marketing ?? false
          }
        },
        push: {
          enabled: user.settings?.notifications?.push?.enabled ?? true,
          types: {
            playerUpdates: user.settings?.notifications?.push?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.push?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.push?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.push?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.push?.types?.systemUpdates ?? false
          }
        },
        inApp: {
          enabled: user.settings?.notifications?.inApp?.enabled ?? true,
          sound: user.settings?.notifications?.inApp?.sound ?? true,
          types: {
            playerUpdates: user.settings?.notifications?.inApp?.types?.playerUpdates ?? true,
            teamUpdates: user.settings?.notifications?.inApp?.types?.teamUpdates ?? true,
            scoutingReports: user.settings?.notifications?.inApp?.types?.scoutingReports ?? true,
            scheduleChanges: user.settings?.notifications?.inApp?.types?.scheduleChanges ?? true,
            systemUpdates: user.settings?.notifications?.inApp?.types?.systemUpdates ?? true
          }
        }
      },
      security: {
        twoFactorEnabled: user.two_factor_enabled || false,
        loginNotifications: user.settings?.security?.loginNotifications ?? true,
        sessionTimeout: user.settings?.security?.sessionTimeout || 30,
        passwordExpiry: user.settings?.security?.passwordExpiry || 90,
        requirePasswordChange: user.settings?.security?.requirePasswordChange || false,
        loginHistory: user.settings?.security?.loginHistory || [],
        activeSessions: user.settings?.security?.activeSessions || []
      },
      privacy: {
        profileVisibility: user.settings?.privacy?.profileVisibility || 'team',
        showEmail: user.settings?.privacy?.showEmail || false,
        showPhone: user.settings?.privacy?.showPhone || false,
        allowDataSharing: user.settings?.privacy?.allowDataSharing || false,
        allowAnalytics: user.settings?.privacy?.allowAnalytics ?? true,
        allowMarketing: user.settings?.privacy?.allowMarketing || false
      }
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings'
    });
  }
});

// PUT /api/settings/general - Update general settings
router.put('/general',
  validateGeneralSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update settings
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        general: {
          ...currentSettings.general,
          ...req.body
        }
      };

      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'General settings updated successfully',
        data: updatedSettings.general
      });
    } catch (error) {
      console.error('Update general settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating general settings'
      });
    }
  }
);

// PUT /api/settings/account - Update account settings
router.put('/account',
  validateAccountSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if email is being changed and if it's already taken
      if (req.body.email && req.body.email !== user.email) {
        const existingUser = await User.findOne({
          where: { email: req.body.email }
        });
        
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Email address is already in use'
          });
        }
      }

      // Update user account information
      const updateData = {};
      if (req.body.firstName) updateData.first_name = req.body.firstName;
      if (req.body.lastName) updateData.last_name = req.body.lastName;
      if (req.body.email) updateData.email = req.body.email;
      if (req.body.phone) updateData.phone = req.body.phone;
      if (req.body.bio) updateData.bio = req.body.bio;
      if (req.body.location) updateData.location = req.body.location;
      if (req.body.website) updateData.website = req.body.website;

      await user.update(updateData);

      res.json({
        success: true,
        message: 'Account settings updated successfully',
        data: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          bio: user.bio,
          location: user.location,
          website: user.website,
          profilePicture: user.profile_picture
        }
      });
    } catch (error) {
      console.error('Update account settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating account settings'
      });
    }
  }
);

// PUT /api/settings/notifications - Update notification settings
router.put('/notifications',
  validateNotificationSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update settings
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        notifications: {
          ...currentSettings.notifications,
          ...req.body
        }
      };

      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        data: updatedSettings.notifications
      });
    } catch (error) {
      console.error('Update notification settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating notification settings'
      });
    }
  }
);

// PUT /api/settings/security - Update security settings
router.put('/security',
  validateSecuritySettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update settings
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        security: {
          ...currentSettings.security,
          ...req.body
        }
      };

      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Security settings updated successfully',
        data: updatedSettings.security
      });
    } catch (error) {
      console.error('Update security settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating security settings'
      });
    }
  }
);

// PUT /api/settings/change-password - Change password
router.put('/change-password',
  validatePasswordChange,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await user.update({ 
        password: hashedPassword,
        password_changed_at: new Date()
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Error changing password'
      });
    }
  }
);

// PUT /api/settings/two-factor - Toggle two-factor authentication
router.put('/two-factor',
  body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { enabled } = req.body;
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      await user.update({ two_factor_enabled: enabled });

      res.json({
        success: true,
        message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`,
        data: { twoFactorEnabled: enabled }
      });
    } catch (error) {
      console.error('Toggle two-factor error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating two-factor authentication'
      });
    }
  }
);

// GET /api/settings/two-factor/qr - Get two-factor QR code
router.get('/two-factor/qr', async (req, res) => {
  try {
    // In a real implementation, you would generate a QR code here
    // For now, we'll return a mock response
    res.json({
      success: true,
      data: {
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        secret: 'JBSWY3DPEHPK3PXP'
      }
    });
  } catch (error) {
    console.error('Get two-factor QR error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating QR code'
    });
  }
});

// POST /api/settings/two-factor/verify - Verify two-factor code
router.post('/two-factor/verify',
  body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { code } = req.body;
      
      // In a real implementation, you would verify the TOTP code here
      // For now, we'll accept any 6-digit code
      if (code === '123456') {
        res.json({
          success: true,
          message: 'Two-factor authentication verified successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
      }
    } catch (error) {
      console.error('Verify two-factor error:', error);
      res.status(500).json({
        success: false,
        message: 'Error verifying two-factor code'
      });
    }
  }
);

// GET /api/settings/login-history - Get login history
router.get('/login-history', async (req, res) => {
  try {
    // In a real implementation, you would fetch login history from the database
    // For now, we'll return mock data
    const loginHistory = [
      {
        id: 1,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        ip: '192.168.1.1',
        location: 'New York, NY',
        device: 'Chrome on Windows',
        success: true
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        ip: '192.168.1.1',
        location: 'New York, NY',
        device: 'Chrome on Windows',
        success: true
      },
      {
        id: 3,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        ip: '10.0.0.1',
        location: 'Los Angeles, CA',
        device: 'Safari on iPhone',
        success: false
      }
    ];

    res.json({
      success: true,
      data: loginHistory
    });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching login history'
    });
  }
});

// GET /api/settings/export-data - Export user data
router.get('/export-data', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Team,
          attributes: ['id', 'name', 'program_name']
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // In a real implementation, you would generate a comprehensive data export
    // For now, we'll return a simple JSON response
    const userData = {
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        location: user.location,
        website: user.website,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      team: user.Team ? {
        id: user.Team.id,
        name: user.Team.name,
        programName: user.Team.program_name
      } : null,
      settings: user.settings,
      exportDate: new Date().toISOString()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${user.id}-${Date.now()}.json"`);
    res.json(userData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting user data'
    });
  }
});

// DELETE /api/settings/account - Delete account
router.delete('/account',
  body('confirmation').equals('DELETE').withMessage('Confirmation must be exactly "DELETE"'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // In a real implementation, you might want to:
      // 1. Archive the user data instead of deleting
      // 2. Send a confirmation email
      // 3. Log the deletion for audit purposes
      
      await user.destroy();

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting account'
      });
    }
  }
);

// PUT /api/settings/profile-picture - Upload profile picture
router.put('/profile-picture', async (req, res) => {
  try {
    // In a real implementation, you would:
    // 1. Handle file upload using multer or similar
    // 2. Process and resize the image
    // 3. Store it in cloud storage (S3, etc.)
    // 4. Update the user's profile_picture field
    
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Mock profile picture URL
    const profilePictureUrl = `/uploads/profile-pictures/${user.id}-${Date.now()}.jpg`;

    await user.update({ profile_picture: profilePictureUrl });

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: { profilePicture: profilePictureUrl }
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading profile picture'
    });
  }
});

// GET /api/settings/privacy - Get privacy settings
router.get('/privacy', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const privacySettings = user.settings?.privacy || {
      profileVisibility: 'team',
      showEmail: false,
      showPhone: false,
      allowDataSharing: false,
      allowAnalytics: true,
      allowMarketing: false
    };

    res.json({
      success: true,
      data: privacySettings
    });
  } catch (error) {
    console.error('Get privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching privacy settings'
    });
  }
});

// PUT /api/settings/privacy - Update privacy settings
router.put('/privacy',
  validatePrivacySettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update settings
      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        privacy: {
          ...currentSettings.privacy,
          ...req.body
        }
      };

      await user.update({ settings: updatedSettings });

      res.json({
        success: true,
        message: 'Privacy settings updated successfully',
        data: updatedSettings.privacy
      });
    } catch (error) {
      console.error('Update privacy settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating privacy settings'
      });
    }
  }
);

// GET /api/settings/notifications/preferences - Get notification preferences
router.get('/notifications/preferences', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    // Return default notification preferences
    const preferences = {
      email: {
        enabled: true,
        frequency: 'daily',
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      },
      push: {
        enabled: false,
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      },
      inApp: {
        enabled: true,
        sound: true,
        types: {
          reports: true,
          schedules: true,
          games: true,
          players: true
        }
      }
    };

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification preferences'
    });
  }
});

// PUT /api/settings/notifications/preferences - Update notification preferences
router.put('/notifications/preferences', validateNotificationSettings, handleValidationErrors, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    // In a real implementation, you'd save these preferences to the database
    // For now, just return success
    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: req.body
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification preferences'
    });
  }
});

// POST /api/settings/notifications/test-email - Test email notification
router.post('/notifications/test-email', async (req, res) => {
  try {
    // In a real implementation, you'd send a test email
    // For now, just return success
    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending test email'
    });
  }
});

// GET /api/settings/sessions - Get active sessions
router.get('/sessions', async (req, res) => {
  try {
    // In a real implementation, you'd track user sessions
    // For now, return a mock session
    const sessions = [
      {
        id: 'current-session',
        device: 'Web Browser',
        location: 'Unknown',
        ip_address: req.ip,
        last_activity: new Date().toISOString(),
        is_current: true
      }
    ];

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active sessions'
    });
  }
});

module.exports = router; 