// utils/emailService.js
// Email service for parent reports, consent emails, and notifications

const nodemailer = require('nodemailer');

// Create reusable SMTP transporter
let transporter = null;

// Email sender configuration
// These are separate from SMTP credentials to allow sending from custom domain addresses
function getEmailConfig() {
  return {
    // Primary sender address (e.g., noreply@mathmatix.ai)
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    // Display name for emails
    fromName: process.env.EMAIL_FROM_NAME || 'MATHMATIX AI',
    // Reply-to address (e.g., support@mathmatix.ai)
    replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || process.env.SMTP_USER
  };
}

// Format the "from" field with display name
function getFromAddress() {
  const config = getEmailConfig();
  return `"${config.fromName}" <${config.from}>`;
}

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

  const emailConfig = getEmailConfig();
  console.log('✅ Email service initialized');
  console.log(`   From: ${emailConfig.from}`);
  console.log(`   Reply-To: ${emailConfig.replyTo}`);
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
    const emailConfig = getEmailConfig();
    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
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
    const emailConfig = getEmailConfig();

    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
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
    const emailConfig = getEmailConfig();

    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
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
 * Send email verification link to new user
 * @param {String} email - User's email address
 * @param {String} firstName - User's first name
 * @param {String} verificationToken - Token for verification
 */
async function sendEmailVerification(email, firstName, verificationToken) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping email verification');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;
    const emailConfig = getEmailConfig();

    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
      to: email,
      subject: 'Verify Your Email - MATHMATIX AI',
      html: getEmailVerificationTemplate(firstName, verifyUrl)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
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
    const emailConfig = getEmailConfig();
    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
      to: recipientEmail,
      subject: 'Test Email - MATHMATIX AI',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">🎉 Email System Working!</h2>
          <p>This is a test email from MATHMATIX AI.</p>
          <p>If you're seeing this, your email configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            Sent from: ${emailConfig.from}<br>
            Reply-To: ${emailConfig.replyTo}<br>
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

function getEmailVerificationTemplate(firstName, verifyUrl) {
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
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Verify Your Email Address</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 22px;">Welcome, ${firstName}!</h2>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        Thank you for creating a MATHMATIX AI account. Please verify your email address to get started.
      </p>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        Click the button below to verify your email. This link will expire in <strong>24 hours</strong>.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Verify Email
        </a>
      </div>

      <div style="background: #f0fdf4; border-left: 4px solid #27ae60; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">
          Once verified, you'll be able to access all MATHMATIX AI features including personalized AI tutoring.
        </p>
      </div>

      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin: 10px 0 0 0; color: #667eea; font-size: 12px; word-break: break-all;">
        ${verifyUrl}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">
        Didn't create an account? You can safely ignore this email.
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
    const emailConfig = getEmailConfig();

    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
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

/**
 * Send urgent safety concern alert to admin
 * Used when AI detects potential safety issues in student messages
 * @param {Object} studentData - Student information
 * @param {string} concernDescription - Description of the safety concern
 * @param {string} originalMessage - The message that triggered the concern (truncated)
 */
async function sendSafetyConcernAlert(studentData, concernDescription, originalMessage = '') {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - logging safety concern only');
    console.error(`🚨 SAFETY ALERT (email not sent): ${studentData.firstName} ${studentData.lastName} - ${concernDescription}`);
    return { success: false, error: 'Email not configured' };
  }

  // Get admin email from environment
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) {
    console.error('🚨 SAFETY ALERT: No admin email configured. Set ADMIN_ALERT_EMAIL in .env');
    return { success: false, error: 'No admin email configured' };
  }

  try {
    const emailConfig = getEmailConfig();
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
      to: adminEmail,
      subject: `🚨 URGENT: Safety Concern - ${studentData.firstName} ${studentData.lastName}`,
      html: getSafetyConcernTemplate(studentData, concernDescription, originalMessage, baseUrl)
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`🚨 Safety concern alert sent to admin (${adminEmail}):`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending safety concern alert:', error);
    // Still log the concern even if email fails
    console.error(`🚨 SAFETY ALERT (email failed): ${studentData.firstName} ${studentData.lastName} - ${concernDescription}`);
    return { success: false, error: error.message };
  }
}

function getSafetyConcernTemplate(studentData, concernDescription, originalMessage, baseUrl) {
  const timestamp = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });

  // Truncate message for privacy but provide context
  const truncatedMessage = originalMessage
    ? (originalMessage.length > 200 ? originalMessage.substring(0, 200) + '...' : originalMessage)
    : 'Not available';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; border: 3px solid #e74c3c;">

    <!-- Header -->
    <div style="background: #e74c3c; color: white; padding: 30px 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 700;">🚨 SAFETY CONCERN ALERT</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Immediate attention may be required</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <div style="background: #fff5f5; border-left: 4px solid #e74c3c; padding: 20px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 10px 0; color: #c0392b; font-size: 18px;">AI-Detected Safety Concern</h2>
        <p style="margin: 0; color: #333; font-size: 16px; line-height: 1.6;">
          <strong>${concernDescription}</strong>
        </p>
      </div>

      <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px;">Student Information</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666; width: 40%;">Name</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-weight: 600;">${studentData.firstName} ${studentData.lastName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Username</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${studentData.username || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Grade Level</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${studentData.gradeLevel || 'Not specified'}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">User ID</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333; font-family: monospace; font-size: 12px;">${studentData.userId}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666;">Detected At</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${timestamp}</td>
        </tr>
      </table>

      <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px;">Message Context</h3>
      <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; font-family: monospace; font-size: 13px; color: #555; word-wrap: break-word;">
        ${truncatedMessage}
      </div>

      <!-- Action Buttons -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${baseUrl}/admin-dashboard.html?student=${studentData.userId}"
           style="display: inline-block; background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-right: 10px;">
          View Student Profile
        </a>
        <a href="${baseUrl}/admin-dashboard.html?tab=conversations&user=${studentData.userId}"
           style="display: inline-block; background: #3498db; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Conversation
        </a>
      </div>

      <div style="background: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; margin-top: 20px; border-radius: 4px;">
        <h4 style="margin: 0 0 10px 0; color: #2980b9; font-size: 14px;">Recommended Actions</h4>
        <ul style="margin: 0; padding-left: 20px; color: #555; line-height: 1.8; font-size: 14px;">
          <li>Review the full conversation history</li>
          <li>Contact the student's teacher or parent if appropriate</li>
          <li>Document the incident in accordance with your policies</li>
          <li>If immediate danger is suspected, contact appropriate authorities</li>
        </ul>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0; font-size: 12px; color: #999;">
        This is an automated safety alert from MATHMATIX AI.<br>
        © ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Send welcome email with login credentials to a newly created user
 * @param {Object} options
 * @param {String} options.email - User's email address
 * @param {String} options.firstName - User's first name
 * @param {String} options.lastName - User's last name
 * @param {String} options.username - User's username
 * @param {String[]} options.roles - User's roles
 * @param {String} [options.temporaryPassword] - Auto-generated password (only if applicable)
 */
async function sendWelcomeEmail({ email, firstName, lastName, username, roles, temporaryPassword }) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn('Email not configured - skipping welcome email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const emailConfig = getEmailConfig();
    const mailOptions = {
      from: getFromAddress(),
      replyTo: emailConfig.replyTo,
      to: email,
      subject: `Welcome to MATHMATIX AI, ${firstName}!`,
      html: getWelcomeEmailTemplate({ firstName, lastName, username, email, roles, temporaryPassword })
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
}

function getWelcomeEmailTemplate({ firstName, lastName, username, email, roles, temporaryPassword }) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const loginUrl = `${baseUrl}/login.html`;
  const roleLabels = (roles || []).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');

  const credentialsBlock = temporaryPassword ? `
      <div style="background: #fff3cd; border-left: 4px solid #f0ad4e; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0 0 8px 0; color: #856404; font-weight: 600; font-size: 14px;">Your Login Credentials</p>
        <table style="font-size: 14px; color: #555;">
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Username:</td><td>${username}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Email:</td><td>${email}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Temporary Password:</td><td style="font-family: monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${temporaryPassword}</td></tr>
        </table>
        <p style="margin: 10px 0 0 0; color: #856404; font-size: 12px;">We recommend changing your password after your first login.</p>
      </div>
  ` : `
      <div style="background: #d4edda; border-left: 4px solid #27ae60; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #155724; font-size: 14px;">
          Your administrator will share your login credentials with you separately.
        </p>
      </div>
  `;

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
      <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 14px;">Welcome to Your New Account</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 22px;">Hi ${firstName}!</h2>

      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">
        An account has been created for you on <strong>MATHMATIX AI</strong>. Here are your details:
      </p>

      <table style="font-size: 15px; color: #555; margin-bottom: 15px;">
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Name:</td><td>${firstName} ${lastName}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Role:</td><td>${roleLabels}</td></tr>
      </table>

      ${credentialsBlock}

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Log In Now
        </a>
      </div>

      <p style="margin: 20px 0 0 0; color: #666; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin: 10px 0 0 0; color: #667eea; font-size: 12px; word-break: break-all;">
        ${loginUrl}
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">
        This account was created by your MATHMATIX AI administrator.
      </p>
      <p style="margin: 0; font-size: 12px; color: #999;">
        &copy; ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.
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
  sendEmailVerification,
  sendTestEmail,
  sendMessageNotification,
  sendSafetyConcernAlert,
  sendWelcomeEmail,
  initializeTransporter,
  getEmailConfig
};
