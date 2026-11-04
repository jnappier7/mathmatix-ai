/**
 * AdminEmail Model - Bulk Email Campaign Tracking
 *
 * Supports:
 * - Bulk emails to students, parents, teachers, or classes
 * - Campaign tracking and analytics
 * - Email templates
 * - Scheduled sending
 *
 * @module models/adminEmail
 */

const mongoose = require('mongoose');
const { anyRole } = require('../utils/roleQuery');
const { marketingOptOutFilter } = require('../utils/emailUnsubscribe');
const Schema = mongoose.Schema;

// Recipient tracking schema
const recipientStatusSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    waitlistId: {
        type: Schema.Types.ObjectId,
        ref: 'Waitlist'
    },
    email: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
        default: 'pending'
    },
    sentAt: { type: Date },
    errorMessage: { type: String }
}, { _id: false });

// Main admin email schema
const adminEmailSchema = new Schema({
    // Sender (admin)
    senderId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Target audience
    audienceType: {
        type: String,
        enum: ['all_students', 'all_parents', 'all_teachers', 'class', 'custom', 'waitlist'],
        required: true
    },

    // For class-specific: enrollment code ID
    enrollmentCodeId: {
        type: Schema.Types.ObjectId,
        ref: 'EnrollmentCode'
    },

    // For custom selection: specific user IDs
    customRecipientIds: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],

    // Email content
    subject: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    body: {
        type: String,
        required: true,
        maxlength: 50000  // Allow longer content for HTML emails
    },
    isHtml: {
        type: Boolean,
        default: true
    },

    // Template (optional - for reuse)
    templateName: {
        type: String,
        trim: true
    },

    // Category for organization
    category: {
        type: String,
        enum: ['announcement', 'newsletter', 'alert', 'reminder', 'welcome', 'maintenance', 'other'],
        default: 'announcement'
    },

    // Priority
    priority: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
    },

    // Scheduling
    scheduledFor: {
        type: Date,
        default: null
    },

    // Campaign status
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'],
        default: 'draft'
    },
    startedAt: { type: Date },
    completedAt: { type: Date },

    // Recipient tracking
    recipients: [recipientStatusSchema],

    // Stats (updated after sending)
    stats: {
        totalRecipients: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        bounced: { type: Number, default: 0 }
    },

    // Audit
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }

}, {
    timestamps: true
});

// Indexes
adminEmailSchema.index({ status: 1, scheduledFor: 1 });
adminEmailSchema.index({ senderId: 1, createdAt: -1 });
adminEmailSchema.index({ audienceType: 1 });
adminEmailSchema.index({ 'recipients.userId': 1 });

// Virtual for completion percentage
adminEmailSchema.virtual('completionPercentage').get(function() {
    if (!this.stats.totalRecipients) return 0;
    return Math.round(((this.stats.sent + this.stats.failed) / this.stats.totalRecipients) * 100);
});

// Virtual for success rate
adminEmailSchema.virtual('successRate').get(function() {
    const total = this.stats.sent + this.stats.failed;
    if (!total) return 0;
    return Math.round((this.stats.sent / total) * 100);
});

// Static method to get recipients based on audience type
// Every audience is MARKETING mail (CAN-SPAM): anyone who has opted out is
// excluded here, so preview, count and send all agree. The same clause is
// what GET /api/admin/email/audiences counts with.
adminEmailSchema.statics.marketingAudienceFilter = function() {
    return { email: { $exists: true, $ne: '' }, ...marketingOptOutFilter() };
};

adminEmailSchema.statics.getRecipientsByAudienceType = async function(audienceType, enrollmentCodeId = null, customIds = []) {
    const User = mongoose.model('User');
    const base = this.marketingAudienceFilter();

    let query = {};

    // Roles HELD (roles[]), not the active dashboard (role): a parent who is
    // also a teacher and last opened the teacher view is still a parent to
    // email. The audience counts in routes/adminEmail.js already used
    // anyRole(); this resolver used the bare field, so the UI promised N
    // recipients and the send quietly reached fewer.
    switch (audienceType) {
        case 'all_students':
            query = { ...anyRole('student'), ...base };
            break;

        case 'all_parents':
            query = { ...anyRole('parent'), ...base };
            break;

        case 'all_teachers':
            query = { ...anyRole('teacher'), ...base };
            break;

        case 'class':
            if (!enrollmentCodeId) {
                throw new Error('Enrollment code ID required for class audience');
            }
            // Get student IDs from enrollment code
            const EnrollmentCode = mongoose.model('EnrollmentCode');
            const code = await EnrollmentCode.findById(enrollmentCodeId);
            if (!code) throw new Error('Enrollment code not found');

            const studentIds = code.enrolledStudents.map(s => s.studentId);
            query = { _id: { $in: studentIds }, ...base };
            break;

        case 'custom':
            if (!customIds || customIds.length === 0) {
                throw new Error('Custom recipient IDs required');
            }
            query = { _id: { $in: customIds }, ...base };
            break;

        case 'waitlist': {
            // Waitlist entries are in their own collection, not the User model
            const Waitlist = mongoose.model('Waitlist');
            const entries = await Waitlist.find(base).lean();
            return entries.map(e => ({
                _id: e._id,
                email: e.email,
                firstName: '',
                lastName: '',
                role: e.role || 'waitlist',
                _isWaitlist: true
            }));
        }

        default:
            throw new Error(`Invalid audience type: ${audienceType}`);
    }

    return User.find(query, '_id email firstName lastName role').lean();
};

// Instance method to prepare recipients list
adminEmailSchema.methods.prepareRecipients = async function() {
    const recipients = await this.constructor.getRecipientsByAudienceType(
        this.audienceType,
        this.enrollmentCodeId,
        this.customRecipientIds
    );

    this.recipients = recipients.map(user => ({
        userId: user._isWaitlist ? undefined : user._id,
        waitlistId: user._isWaitlist ? user._id : undefined,
        email: user.email,
        status: 'pending'
    }));

    this.stats.totalRecipients = this.recipients.length;
    await this.save();

    return this.recipients.length;
};

// Instance method to update recipient status
adminEmailSchema.methods.updateRecipientStatus = async function(recipientId, status, errorMessage = null) {
    const idStr = recipientId.toString();
    const recipient = this.recipients.find(
        r => (r.userId && r.userId.toString() === idStr) ||
             (r.waitlistId && r.waitlistId.toString() === idStr)
    );

    if (recipient) {
        recipient.status = status;
        if (status === 'sent') {
            recipient.sentAt = new Date();
            this.stats.sent++;
        } else if (status === 'failed') {
            recipient.errorMessage = errorMessage;
            this.stats.failed++;
        } else if (status === 'bounced') {
            this.stats.bounced++;
        } else if (status === 'delivered') {
            this.stats.delivered++;
        }
    }
};

// Instance method to mark campaign as completed
adminEmailSchema.methods.markCompleted = async function() {
    this.status = 'sent';
    this.completedAt = new Date();
    await this.save();
};

// Static method to get scheduled campaigns ready to send
adminEmailSchema.statics.getScheduledToSend = async function() {
    const now = new Date();
    return this.find({
        status: 'scheduled',
        scheduledFor: { $lte: now }
    });
};

// Static method to get campaign history
adminEmailSchema.statics.getCampaignHistory = async function(options = {}) {
    const { limit = 50, skip = 0 } = options;

    return this.find({
        status: { $in: ['sent', 'sending', 'failed'] }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'firstName lastName')
    .lean();
};

// Static method to get draft campaigns
adminEmailSchema.statics.getDrafts = async function(adminId) {
    return this.find({
        senderId: adminId,
        status: 'draft'
    })
    .sort({ updatedAt: -1 })
    .lean();
};

// Pre-save hook to update status based on schedule
adminEmailSchema.pre('save', function(next) {
    if (this.isModified('scheduledFor') && this.scheduledFor) {
        this.status = 'scheduled';
    }
    next();
});

// Ensure model is only defined once
module.exports = mongoose.models.AdminEmail || mongoose.model('AdminEmail', adminEmailSchema);
