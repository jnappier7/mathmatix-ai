// utils/emailService.js
// Email service for parent reports, consent emails, and notifications

const nodemailer = require('nodemailer');

// Create reusable SMTP transporter
let transporter = null;

function initializeTransporter() {
  if (transporter) return transporter;

  // Check if email is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('⚠️  Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  console.log('✅ Email service initialized');
  return transporter;
}

/**
 * Send weekly progress report to parent
 * @param {Object} parent - Parent user object
 * @param {Object} studentData - Student progress data
 */
async function sendParentWeeklyReport(parent, studentData) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping weekly report');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const mailOptions = {
      from: `"MATHMATIX AI" <${process.env.SMTP_USER}>`,
      to: parent.email,
      subject: `${studentData.studentName}'s Weekly Math Progress`,
      html: getWeeklyReportTemplate(parent, studentData)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Weekly report sent to ${parent.email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending weekly report:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send parental consent request email (for non-school signups under 13)
 * @param {String} parentEmail - Parent's email address
 * @param {String} studentName - Student's full name
 * @param {String} consentToken - Unique token for consent verification
 * @param {String} studentId - Student's database ID
 */
async function sendParentalConsentRequest(parentEmail, studentName, consentToken, studentId) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping consent request');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const consentUrl = `${baseUrl}/parental-consent.html?token=${consentToken}&student=${studentId}`;

    const mailOptions = {
      from: `"MATHMATIX AI" <${process.env.SMTP_USER}>`,
      to: parentEmail,
      subject: 'Parental Consent Required - MATHMATIX AI',
      html: getParentalConsentTemplate(studentName, consentUrl)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Consent email sent to ${parentEmail}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending consent email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 * @param {String} email - User's email address
 * @param {String} resetToken - Password reset token
 */
async function sendPasswordResetEmail(email, resetToken) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping password reset email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password.html?token=${resetToken}`;

    const mailOptions = {
      from: `"MATHMATIX AI" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your Password - MATHMATIX AI',
      html: getPasswordResetTemplate(resetUrl)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send test email (for configuration verification)
 * @param {String} recipientEmail - Email to send test to
 */
async function sendTestEmail(recipientEmail) {
  const transport = initializeTransporter();
  if (!transport) {
    throw new Error('Email not configured. Check SMTP settings in .env');
  }

  try {
    const mailOptions = {
      from: `"MATHMATIX AI" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: 'Test Email - MATHMATIX AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">🎉 Email System Working!</h2>
          <p>This is a test email from MATHMATIX AI.</p>
          <p>If you're seeing this, your email configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            Sent from MATHMATIX AI Email Service<br>
            ${new Date().toLocaleString()}
          </p>
        </div>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Test email sent to ${recipientEmail}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending test email:', error);
    throw error;
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function getWeeklyReportTemplate(parent, studentData) {
  const {
    studentName,
    problemsCompleted = 0,
    currentLevel = 1,
    xpEarned = 0,
    activeMinutes = 0,
    masteryGained = 0,
    strugglingSkills = [],
    achievements = []
  } = studentData;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">MATHMATIX AI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Unlock the Pattern. Learn for Life.</p>
    </div>

    <!-- Greeting -->
    <div style="padding: 30px 20px 20px 20px;">
      <h2 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 22px;">Hi ${parent.firstName || 'Parent'},</h2>
      <p style="margin: 0; color: #555; font-size: 16px; line-height: 1.6;">
        Here's how <strong>${studentName}</strong> did this week in math:
      </p>
    </div>

    <!-- Stats Grid -->
    <div style="padding: 0 20px 20px 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">

        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; color: white;">
          <div style="font-size: 32px; font-weight: 700; margin-bottom: 5px;">${problemsCompleted}</div>
          <div style="font-size: 14px; opacity: 0.9;">Problems Solved</div>
        </div>

        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 12px; padding: 20px; color: white;">
          <div style="font-size: 32px; font-weight: 700; margin-bottom: 5px;">Level ${currentLevel}</div>
          <div style="font-size: 14px; opacity: 0.9;">Current Level</div>
        </div>

        <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); border-radius: 12px; padding: 20px; color: white;">
          <div style="font-size: 32px; font-weight: 700; margin-bottom: 5px;">${xpEarned} XP</div>
          <div style="font-size: 14px; opacity: 0.9;">XP Earned</div>
        </div>

        <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); border-radius: 12px; padding: 20px; color: white;">
          <div style="font-size: 32px; font-weight: 700; margin-bottom: 5px;">${activeMinutes} min</div>
          <div style="font-size: 14px; opacity: 0.9;">Active Learning</div>
        </div>

      </div>
    </div>

    ${achievements.length > 0 ? `
    <!-- Achievements -->
    <div style="padding: 20px; background: #f0fdf4; margin: 0 20px; border-radius: 8px; border-left: 4px solid #27ae60;">
      <h3 style="margin: 0 0 10px 0; color: #27ae60; font-size: 18px;">🏆 Recent Achievements</h3>
      <ul style="margin: 0; padding-left: 20px; color: #555;">
        ${achievements.map(achievement => `<li style="margin-bottom: 5px;">${achievement}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${strugglingSkills.length > 0 ? `
    <!-- Areas for Growth -->
    <div style="padding: 20px; background: #fff5f5; margin: 20px; border-radius: 8px; border-left: 4px solid #e74c3c;">
      <h3 style="margin: 0 0 10px 0; color: #e74c3c; font-size: 18px;">📚 Areas for Extra Practice</h3>
      <ul style="margin: 0; padding-left: 20px; color: #555;">
        ${strugglingSkills.map(skill => `<li style="margin-bottom: 5px;">${skill}</li>`).join('')}
      </ul>
      <p style="margin: 15px 0 0 0; color: #666; font-size: 14px;">
        <em>The AI tutor is providing extra support in these areas.</em>
      </p>
    </div>
    ` : ''}

    <!-- CTA Button -->
    <div style="padding: 20px; text-align: center;">
      <a href="${process.env.BASE_URL || 'http://localhost:3000'}/parent-dashboard.html"
         style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Full Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">
        Update your notification preferences in your <a href="${process.env.BASE_URL || 'http://localhost:3000'}/parent-dashboard.html" style="color: #667eea; text-decoration: none;">parent dashboard</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

function getPasswordResetTemplate(resetUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">MATHMATIX AI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Password Reset Request</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 22px;">Reset Your Password</h2>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password for your MATHMATIX AI account.
      </p>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>

      <div style="background: #fff5f5; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">
          <strong>Didn't request this?</strong> You can safely ignore this email. Your password won't be changed.
        </p>
      </div>

      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin: 10px 0 0 0; color: #667eea; font-size: 12px; word-break: break-all;">
        ${resetUrl}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

function getParentalConsentTemplate(studentName, consentUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">MATHMATIX AI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Parental Consent Required</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 22px;">Your Child Needs Your Permission</h2>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        <strong>${studentName}</strong> has created a MATHMATIX AI account and needs your consent to activate it.
      </p>

      <div style="background: #f0fdf4; border-left: 4px solid #27ae60; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; color: #27ae60; font-size: 18px;">What is MATHMATIX AI?</h3>
        <p style="margin: 0; color: #555; line-height: 1.6;">
          An AI-powered math tutor that provides personalized, adaptive learning for K-12 students.
        </p>
      </div>

      <div style="background: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; color: #3498db; font-size: 18px;">What data do we collect?</h3>
        <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8;">
          <li>Student name and learning progress</li>
          <li>Homework photos (auto-deleted after 30 days)</li>
          <li>Math problem attempts and solutions</li>
        </ul>
        <p style="margin: 15px 0 0 0; color: #555; font-weight: 600;">
          We DO NOT collect SSN, physical address, or sell data to advertisers.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${consentUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #27ae60, #16a085); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Review Privacy Policy & Give Consent
        </a>
      </div>

      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px; text-align: center;">
        This link expires in 7 days. If you have questions, contact us at
        <a href="mailto:support@mathmatix.ai" style="color: #667eea; text-decoration: none;">support@mathmatix.ai</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Send email notification for new message
 * @param {Object} recipient - Recipient user object
 * @param {Object} sender - Sender user object
 * @param {Object} message - Message object
 */
async function sendMessageNotification(recipient, sender, message) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping message notification');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const dashboardUrl = recipient.role === 'teacher'
      ? `${baseUrl}/teacher-dashboard.html?tab=messages`
      : `${baseUrl}/parent-dashboard.html?tab=messages`;

    const mailOptions = {
      from: `"MATHMATIX AI" <${process.env.SMTP_USER}>`,
      to: recipient.email,
      subject: message.isUrgent
        ? `🔔 URGENT: New message from ${sender.firstName} ${sender.lastName}`
        : `New message from ${sender.firstName} ${sender.lastName} - MATHMATIX AI`,
      html: getMessageNotificationTemplate(recipient, sender, message, dashboardUrl)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Message notification sent to ${recipient.email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending message notification:', error);
    return { success: false, error: error.message };
  }
}

function getMessageNotificationTemplate(recipient, sender, message, dashboardUrl) {
  const categoryLabels = {
    general: 'General',
    progress: 'Progress Update',
    concern: 'Concern',
    achievement: 'Achievement',
    iep: 'IEP Related',
    schedule: 'Schedule',
    other: 'Other'
  };

  const urgentBanner = message.isUrgent ? `
    <div style="background: #fff5f5; border-left: 4px solid #e74c3c; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
      <p style="margin: 0; color: #c0392b; font-weight: 600;">
        ⚠️ This message is marked as URGENT
      </p>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #12B3B3 0%, #0D8686 100%); color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">MATHMATIX AI</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">New Message</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 22px;">Hi ${recipient.firstName || 'there'},</h2>

      ${urgentBanner}

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        You have a new message from <strong>${sender.firstName} ${sender.lastName}</strong> (${sender.role === 'teacher' ? 'Teacher' : 'Parent'}).
      </p>

      <!-- Message Preview -->
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
        ${message.subject ? `<p style="margin: 0 0 10px 0; font-weight: 600; color: #2c3e50; font-size: 16px;">${message.subject}</p>` : ''}
        <p style="margin: 0 0 10px 0; color: #12B3B3; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">${categoryLabels[message.category] || 'General'}</p>
        <p style="margin: 0; color: #555; font-size: 15px; line-height: 1.6;">
          ${message.body.substring(0, 200)}${message.body.length > 200 ? '...' : ''}
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #12B3B3, #0D8686); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          View & Reply
        </a>
      </div>

      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px; text-align: center;">
        Log in to your MATHMATIX AI account to view the full message and reply.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.<br>
        <a href="${process.env.BASE_URL || 'http://localhost:3000'}/settings.html" style="color: #999; text-decoration: underline;">Manage notification preferences</a>
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

module.exports = {
  sendParentWeeklyReport,
  sendParentalConsentRequest,
  sendPasswordResetEmail,
  sendTestEmail,
  sendMessageNotification,
  initializeTransporter
};
