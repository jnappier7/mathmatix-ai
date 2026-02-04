/**
 * Admin Email Routes - Bulk Email Campaign Management
 *
 * Provides API endpoints for:
 * - Creating and sending bulk emails
 * - Managing email campaigns
 * - Audience selection
 * - Campaign analytics
 *
 * @module routes/adminEmail
 */

const express = require('express');
const router = express.Router();
const AdminEmail = require('../models/adminEmail');
const User = require('../models/user');
const EnrollmentCode = require('../models/enrollmentCode');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { sendBulkEmail } = require('../utils/emailService');

// ============================================
// AUDIENCE ENDPOINTS
// ============================================

/**
 * GET /api/admin/email/audiences
 * Get available audiences with counts
 */
router.get('/audiences', isAuthenticated, isAdmin, async (req, res) => {
    try {
        // Count each audience type
        const [studentCount, parentCount, teacherCount] = await Promise.all([
            User.countDocuments({ role: 'student', email: { $exists: true, $ne: '' } }),
            User.countDocuments({ role: 'parent', email: { $exists: true, $ne: '' } }),
            User.countDocuments({ role: 'teacher', email: { $exists: true, $ne: '' } })
        ]);

        // Get all classes (enrollment codes)
        const enrollmentCodes = await EnrollmentCode.find({ isActive: true })
            .populate('teacherId', 'firstName lastName')
            .lean();

        const classes = enrollmentCodes.map(ec => ({
            _id: ec._id,
            code: ec.code,
            className: ec.className,
            teacherName: ec.teacherId ? `${ec.teacherId.firstName} ${ec.teacherId.lastName}` : 'Unknown',
            studentCount: ec.enrolledStudents?.length || 0
        }));

        res.json({
            success: true,
            audiences: {
                all_students: { label: 'All Students', count: studentCount },
                all_parents: { label: 'All Parents', count: parentCount },
                all_teachers: { label: 'All Teachers', count: teacherCount }
            },
            classes,
            totalWithEmail: studentCount + parentCount + teacherCount
        });

    } catch (error) {
        console.error('[AdminEmail] Error fetching audiences:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching audiences'
        });
    }
});

/**
 * GET /api/admin/email/users
 * Search users for custom recipient selection
 */
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { search, role, limit = 50 } = req.query;

        const query = {
            email: { $exists: true, $ne: '' }
        };

        if (role && ['student', 'parent', 'teacher'].includes(role)) {
            query.role = role;
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { email: searchRegex },
                { username: searchRegex }
            ];
        }

        const users = await User.find(query)
            .select('_id firstName lastName email role username')
            .limit(parseInt(limit))
            .lean();

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error('[AdminEmail] Error searching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching users'
        });
    }
});


// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

/**
 * POST /api/admin/email/preview
 * Preview recipients before sending
 */
router.post('/preview', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { audienceType, enrollmentCodeId, customRecipientIds } = req.body;

        if (!audienceType) {
            return res.status(400).json({
                success: false,
                message: 'Audience type is required'
            });
        }

        const recipients = await AdminEmail.getRecipientsByAudienceType(
            audienceType,
            enrollmentCodeId,
            customRecipientIds
        );

        // Return preview (first 20 + count)
        res.json({
            success: true,
            totalRecipients: recipients.length,
            preview: recipients.slice(0, 20).map(r => ({
                _id: r._id,
                name: `${r.firstName} ${r.lastName}`,
                email: r.email,
                role: r.role
            })),
            hasMore: recipients.length > 20
        });

    } catch (error) {
        console.error('[AdminEmail] Error previewing recipients:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error previewing recipients'
        });
    }
});

/**
 * POST /api/admin/email/send
 * Create and send a new email campaign
 */
router.post('/send', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const {
            audienceType,
            enrollmentCodeId,
            customRecipientIds,
            subject,
            body,
            isHtml = true,
            category = 'announcement',
            priority = 'normal',
            scheduledFor = null
        } = req.body;

        // Validate required fields
        if (!audienceType || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'Audience type, subject, and body are required'
            });
        }

        // Create campaign
        const campaign = new AdminEmail({
            senderId: req.user._id,
            audienceType,
            enrollmentCodeId: audienceType === 'class' ? enrollmentCodeId : undefined,
            customRecipientIds: audienceType === 'custom' ? customRecipientIds : undefined,
            subject,
            body,
            isHtml,
            category,
            priority,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            createdBy: req.user._id,
            lastModifiedBy: req.user._id
        });

        // Prepare recipients
        const recipientCount = await campaign.prepareRecipients();

        if (recipientCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'No recipients found for this audience'
            });
        }

        // If scheduled for later, just save
        if (scheduledFor) {
            await campaign.save();
            return res.json({
                success: true,
                message: `Email scheduled to ${recipientCount} recipients`,
                campaignId: campaign._id,
                scheduledFor: campaign.scheduledFor
            });
        }

        // Otherwise, start sending immediately
        campaign.status = 'sending';
        campaign.startedAt = new Date();
        await campaign.save();

        // Send emails asynchronously
        sendBulkEmailCampaign(campaign._id);

        res.json({
            success: true,
            message: `Sending email to ${recipientCount} recipients`,
            campaignId: campaign._id
        });

    } catch (error) {
        console.error('[AdminEmail] Error creating campaign:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating email campaign'
        });
    }
});

/**
 * GET /api/admin/email/campaigns
 * Get campaign history
 */
router.get('/campaigns', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { limit = 50, skip = 0 } = req.query;

        const campaigns = await AdminEmail.find()
            .sort({ createdAt: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .populate('senderId', 'firstName lastName')
            .lean();

        res.json({
            success: true,
            campaigns: campaigns.map(c => ({
                _id: c._id,
                subject: c.subject,
                audienceType: c.audienceType,
                category: c.category,
                status: c.status,
                stats: c.stats,
                scheduledFor: c.scheduledFor,
                completedAt: c.completedAt,
                createdAt: c.createdAt,
                sender: c.senderId ? `${c.senderId.firstName} ${c.senderId.lastName}` : 'Unknown'
            }))
        });

    } catch (error) {
        console.error('[AdminEmail] Error fetching campaigns:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching campaigns'
        });
    }
});

/**
 * GET /api/admin/email/campaigns/:campaignId
 * Get detailed campaign info
 */
router.get('/campaigns/:campaignId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;

        const campaign = await AdminEmail.findById(campaignId)
            .populate('senderId', 'firstName lastName')
            .lean();

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        // Get recipient breakdown by status
        const statusBreakdown = {
            pending: campaign.recipients.filter(r => r.status === 'pending').length,
            sent: campaign.recipients.filter(r => r.status === 'sent').length,
            failed: campaign.recipients.filter(r => r.status === 'failed').length,
            bounced: campaign.recipients.filter(r => r.status === 'bounced').length
        };

        // Get sample of failed recipients
        const failedSample = campaign.recipients
            .filter(r => r.status === 'failed')
            .slice(0, 10)
            .map(r => ({ email: r.email, error: r.errorMessage }));

        res.json({
            success: true,
            campaign: {
                _id: campaign._id,
                subject: campaign.subject,
                body: campaign.body,
                audienceType: campaign.audienceType,
                category: campaign.category,
                status: campaign.status,
                priority: campaign.priority,
                stats: campaign.stats,
                statusBreakdown,
                failedSample,
                scheduledFor: campaign.scheduledFor,
                startedAt: campaign.startedAt,
                completedAt: campaign.completedAt,
                createdAt: campaign.createdAt,
                sender: campaign.senderId ? `${campaign.senderId.firstName} ${campaign.senderId.lastName}` : 'Unknown'
            }
        });

    } catch (error) {
        console.error('[AdminEmail] Error fetching campaign:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching campaign'
        });
    }
});

/**
 * DELETE /api/admin/email/campaigns/:campaignId
 * Cancel a scheduled campaign
 */
router.delete('/campaigns/:campaignId', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;

        const campaign = await AdminEmail.findById(campaignId);

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found'
            });
        }

        if (!['draft', 'scheduled'].includes(campaign.status)) {
            return res.status(400).json({
                success: false,
                message: 'Can only cancel draft or scheduled campaigns'
            });
        }

        campaign.status = 'cancelled';
        await campaign.save();

        res.json({
            success: true,
            message: 'Campaign cancelled'
        });

    } catch (error) {
        console.error('[AdminEmail] Error cancelling campaign:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling campaign'
        });
    }
});


// ============================================
// EMAIL SENDING HELPER (runs asynchronously)
// ============================================

async function sendBulkEmailCampaign(campaignId) {
    const nodemailer = require('nodemailer');
    const { getEmailConfig, initializeTransporter } = require('../utils/emailService');

    try {
        const campaign = await AdminEmail.findById(campaignId);
        if (!campaign || campaign.status !== 'sending') return;

        const transport = initializeTransporter();
        if (!transport) {
            campaign.status = 'failed';
            await campaign.save();
            console.error('[AdminEmail] No email transport configured');
            return;
        }

        const emailConfig = getEmailConfig();
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

        // Process recipients in batches of 10
        const batchSize = 10;
        const recipients = campaign.recipients;

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);

            await Promise.all(batch.map(async (recipient) => {
                if (recipient.status !== 'pending') return;

                try {
                    // Build email body with footer
                    const fullBody = campaign.isHtml
                        ? `${campaign.body}
                            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
                            <p style="font-size: 12px; color: #666; text-align: center;">
                                This email was sent by MATHMATIX AI administration.<br>
                                <a href="${baseUrl}/settings.html" style="color: #667eea;">Manage email preferences</a>
                            </p>`
                        : `${campaign.body}\n\n---\nThis email was sent by MATHMATIX AI administration.`;

                    await transport.sendMail({
                        from: `"${emailConfig.fromName}" <${emailConfig.from}>`,
                        replyTo: emailConfig.replyTo,
                        to: recipient.email,
                        subject: campaign.subject,
                        [campaign.isHtml ? 'html' : 'text']: fullBody
                    });

                    await campaign.updateRecipientStatus(recipient.userId, 'sent');

                } catch (emailError) {
                    console.error(`[AdminEmail] Failed to send to ${recipient.email}:`, emailError.message);
                    await campaign.updateRecipientStatus(recipient.userId, 'failed', emailError.message);
                }
            }));

            // Save progress periodically
            await campaign.save();

            // Small delay between batches to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Mark complete
        await campaign.markCompleted();
        console.log(`[AdminEmail] Campaign ${campaignId} completed: ${campaign.stats.sent} sent, ${campaign.stats.failed} failed`);

    } catch (error) {
        console.error('[AdminEmail] Campaign sending error:', error);
        const campaign = await AdminEmail.findById(campaignId);
        if (campaign) {
            campaign.status = 'failed';
            await campaign.save();
        }
    }
}


// ============================================
// TEMPLATES (Future Feature)
// ============================================

/**
 * GET /api/admin/email/templates
 * Get available email templates
 */
router.get('/templates', isAuthenticated, isAdmin, async (req, res) => {
    // Predefined templates for common communications
    const templates = [
        {
            id: 'welcome',
            name: 'Welcome Message',
            subject: 'Welcome to MATHMATIX AI!',
            body: `<h2>Welcome to MATHMATIX AI!</h2>
<p>We're excited to have you join our learning community.</p>
<p>MATHMATIX AI provides personalized math tutoring that adapts to each student's learning style and pace.</p>
<p>Here are some things you can do:</p>
<ul>
<li>Students: Start chatting with your AI tutor to get help with math</li>
<li>Parents: Monitor your child's progress from your dashboard</li>
<li>Teachers: Manage your students and view learning analytics</li>
</ul>
<p>If you have any questions, our support team is here to help!</p>`
        },
        {
            id: 'maintenance',
            name: 'Scheduled Maintenance',
            subject: 'Scheduled Maintenance Notice - MATHMATIX AI',
            body: `<h2>Scheduled Maintenance Notice</h2>
<p>We will be performing scheduled maintenance on MATHMATIX AI.</p>
<p><strong>Date:</strong> [DATE]</p>
<p><strong>Time:</strong> [TIME] - [TIME] (EST)</p>
<p><strong>Expected Duration:</strong> [DURATION]</p>
<p>During this time, the platform may be temporarily unavailable. We apologize for any inconvenience.</p>
<p>Thank you for your patience!</p>`
        },
        {
            id: 'newsletter',
            name: 'Monthly Newsletter',
            subject: 'MATHMATIX AI Monthly Update',
            body: `<h2>Monthly Update from MATHMATIX AI</h2>
<p>Here's what's new this month:</p>
<h3>New Features</h3>
<ul>
<li>[Feature 1]</li>
<li>[Feature 2]</li>
</ul>
<h3>Tips for Success</h3>
<p>[Tip content]</p>
<p>Keep up the great work!</p>`
        },
        {
            id: 'reminder',
            name: 'Activity Reminder',
            subject: 'We miss you! - MATHMATIX AI',
            body: `<h2>We've Missed You!</h2>
<p>It's been a while since you last visited MATHMATIX AI.</p>
<p>Your personalized math tutor is ready and waiting to help you continue learning.</p>
<p>Log in today to:</p>
<ul>
<li>Continue where you left off</li>
<li>Try new problem types</li>
<li>Earn XP and level up</li>
</ul>
<p>We're here whenever you're ready to learn!</p>`
        }
    ];

    res.json({
        success: true,
        templates
    });
});

module.exports = router;
