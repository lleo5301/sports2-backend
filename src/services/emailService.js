const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service for Sports2 Application
 * Handles all email communications including notifications and password resets
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialize();
  }

  /**
   * Initialize the email transporter
   */
  initialize() {
    try {
      // Check if SMTP is actually configured (not using defaults)
      const hasCustomConfig = process.env.SMTP_USER && process.env.SMTP_PASS &&
                             process.env.SMTP_USER !== 'admin@mail.theprogram1814.com';

      if (!hasCustomConfig) {
        logger.warn('⚠️  Email service not configured - SMTP credentials not provided. Email functionality will be disabled.');
        return;
      }

      const config = {
        host: process.env.SMTP_HOST || 'mail.theprogram1814.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false // For self-signed certificates in development
        }
      };

      // Check if nodemailer.createTransporter exists
      if (typeof nodemailer.createTransporter !== 'function') {
        logger.error('❌ Email service error: nodemailer.createTransporter is not available');
        return;
      }

      this.transporter = nodemailer.createTransporter(config);
      this.isConfigured = true;

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('❌ Email service configuration error:', error);
          this.isConfigured = false;
        } else {
          logger.info('✅ Email service ready');
        }
      });
    } catch (error) {
      logger.error('❌ Failed to initialize email service:', error);
      this.transporter = null;
      this.isConfigured = false;
    }
  }

  /**
   * Send a generic email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text content
   * @param {string} options.html - HTML content
   * @returns {Promise<Object>} - Send result
   */
  async sendEmail({ to, subject, text, html }) {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('⚠️  Email not sent - Email service not configured', { to });
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || `"Sports2 Team" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info('✅ Email sent successfully', { messageId: result.messageId });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('❌ Failed to send email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   * @param {string} email - User email
   * @param {string} resetToken - Password reset token
   * @param {string} resetUrl - Password reset URL
   */
  async sendPasswordResetEmail(email, resetToken, resetUrl) {
    const subject = 'Password Reset Request - Sports2';

    const text = `
You have requested a password reset for your Sports2 account.

Click the following link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

Best regards,
The Sports2 Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Password Reset - Sports2</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset Request</h1>
        </div>
        <div class="content">
            <p>Hello,</p>
            <p>You have requested a password reset for your Sports2 account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you did not request this password reset, please ignore this email.</p>
        </div>
        <div class="footer">
            <p>Best regards,<br>The Sports2 Team</p>
        </div>
    </div>
</body>
</html>
    `;

    return await this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Send welcome email to new users
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {string} teamName - Team name
   */
  async sendWelcomeEmail(email, firstName, teamName) {
    const subject = `Welcome to Sports2, ${firstName}!`;

    const text = `
Hello ${firstName},

Welcome to Sports2! We're excited to have you join the ${teamName} team.

Your account has been successfully created. You can now:
- Access your team dashboard
- View and manage player information
- Create and share scouting reports
- Track team schedules and events

If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The Sports2 Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to Sports2</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .feature { margin: 15px 0; padding: 10px; background-color: white; border-radius: 5px; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Sports2!</h1>
        </div>
        <div class="content">
            <p>Hello ${firstName},</p>
            <p>Welcome to Sports2! We're excited to have you join the <strong>${teamName}</strong> team.</p>
            <p>Your account has been successfully created. You can now:</p>
            <div class="feature">✅ Access your team dashboard</div>
            <div class="feature">✅ View and manage player information</div>
            <div class="feature">✅ Create and share scouting reports</div>
            <div class="feature">✅ Track team schedules and events</div>
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        </div>
        <div class="footer">
            <p>Best regards,<br>The Sports2 Team</p>
        </div>
    </div>
</body>
</html>
    `;

    return await this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Send notification email
   * @param {string} email - Recipient email
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} actionUrl - Optional action URL
   */
  async sendNotificationEmail(email, title, message, actionUrl = null) {
    const subject = `${title} - Sports2`;

    let text = `
${title}

${message}

Best regards,
The Sports2 Team
    `.trim();

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${title} - Sports2</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
        </div>
        <div class="content">
            <p>${message}</p>
    `;

    if (actionUrl) {
      text += `

View details: ${actionUrl}`;
      html += `<a href="${actionUrl}" class="button">View Details</a>`;
    }

    html += `
        </div>
        <div class="footer">
            <p>Best regards,<br>The Sports2 Team</p>
        </div>
    </div>
</body>
</html>
    `;

    return await this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Test email configuration
   * @param {string} testEmail - Email to send test to
   */
  async testEmail(testEmail) {
    return await this.sendEmail({
      to: testEmail,
      subject: 'Sports2 Email Test',
      text: 'This is a test email from Sports2. If you receive this, email is working correctly!',
      html: '<p>This is a test email from Sports2. If you receive this, <strong>email is working correctly!</strong></p>'
    });
  }
}

// Export singleton instance
module.exports = new EmailService();
