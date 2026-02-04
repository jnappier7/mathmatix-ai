/**
 * Announcement Model - Teacher-to-Class/Student Messaging
 *
 * Supports:
 * - Class-wide announcements from teachers
 * - Direct messages to individual students
 * - Priority levels (normal, important, urgent)
 * - Read receipts per student
 * - Scheduled announcements
 *
 * @module models/announcement
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Read receipt schema for tracking who has read the announcement
const readReceiptSchema = new Schema({
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    readAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

// Main announcement schema
const announcementSchema = new Schema({
    // Sender (teacher)
    teacherId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Target type: 'class' for all students, 'individual' for specific students
    targetType: {
        type: String,
        enum: ['class', 'individual', 'enrollment_code'],
        required: true
    },

    // For class-wide: enrollment code ID (optional - if null, all teacher's students)
    enrollmentCodeId: {
        type: Schema.Types.ObjectId,
        ref: 'EnrollmentCode',
        index: true
    },

    // For individual messages: array of student IDs
    recipientIds: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],

    // Message content
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    body: {
        type: String,
        required: true,
        maxlength: 5000
    },

    // Priority level
    priority: {
        type: String,
        enum: ['normal', 'important', 'urgent'],
        default: 'normal'
    },

    // Category for organization
    category: {
        type: String,
        enum: ['general', 'assignment', 'reminder', 'encouragement', 'achievement', 'event', 'other'],
        default: 'general'
    },

    // Scheduling
    scheduledFor: {
        type: Date,
        default: null  // null means send immediately
    },
    isSent: {
        type: Boolean,
        default: false
    },
    sentAt: {
        type: Date
    },

    // Expiration (optional - announcements can expire)
    expiresAt: {
        type: Date,
        default: null
    },

    // Read tracking
    readBy: [readReceiptSchema],

    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },

    // Allow replies (future feature)
    allowReplies: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

// Compound indexes for common queries
announcementSchema.index({ teacherId: 1, createdAt: -1 });
announcementSchema.index({ recipientIds: 1, createdAt: -1 });
announcementSchema.index({ enrollmentCodeId: 1, createdAt: -1 });
announcementSchema.index({ scheduledFor: 1, isSent: 1 });
announcementSchema.index({ 'readBy.studentId': 1 });

// Virtual for checking if announcement is expired
announcementSchema.virtual('isExpired').get(function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
});

// Virtual for read percentage
announcementSchema.virtual('readPercentage').get(function() {
    if (!this.recipientIds || this.recipientIds.length === 0) return 0;
    return Math.round((this.readBy.length / this.recipientIds.length) * 100);
});

// Instance method to mark as read by a student
announcementSchema.methods.markAsReadBy = async function(studentId) {
    const alreadyRead = this.readBy.some(
        r => r.studentId.toString() === studentId.toString()
    );

    if (!alreadyRead) {
        this.readBy.push({
            studentId,
            readAt: new Date()
        });
        await this.save();
    }
    return this;
};

// Instance method to check if read by a student
announcementSchema.methods.isReadBy = function(studentId) {
    return this.readBy.some(
        r => r.studentId.toString() === studentId.toString()
    );
};

// Static method to get announcements for a student
announcementSchema.statics.getForStudent = async function(studentId, options = {}) {
    const { limit = 20, skip = 0, unreadOnly = false } = options;

    // First, get the student to find their teacher and enrollment codes
    const User = mongoose.model('User');
    const student = await User.findById(studentId, 'teacherId').lean();
    if (!student || !student.teacherId) return [];

    // Also get enrollment codes the student belongs to
    const EnrollmentCode = mongoose.model('EnrollmentCode');
    const enrollmentCodes = await EnrollmentCode.find(
        { 'enrolledStudents.studentId': studentId },
        '_id'
    ).lean();
    const enrollmentCodeIds = enrollmentCodes.map(ec => ec._id);

    // Build query for announcements targeting this student
    const query = {
        isDeleted: false,
        isSent: true,
        $or: [
            // Directly targeted
            { recipientIds: studentId },
            // Class-wide from their teacher (no specific enrollment code)
            {
                teacherId: student.teacherId,
                targetType: 'class',
                enrollmentCodeId: null
            },
            // Enrollment code specific
            {
                targetType: 'enrollment_code',
                enrollmentCodeId: { $in: enrollmentCodeIds }
            }
        ],
        // Not expired
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    };

    // Fix: properly combine the $or conditions
    const finalQuery = {
        isDeleted: false,
        isSent: true,
        $and: [
            {
                $or: [
                    { recipientIds: studentId },
                    {
                        teacherId: student.teacherId,
                        targetType: 'class',
                        enrollmentCodeId: null
                    },
                    {
                        targetType: 'enrollment_code',
                        enrollmentCodeId: { $in: enrollmentCodeIds }
                    }
                ]
            },
            {
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            }
        ]
    };

    if (unreadOnly) {
        finalQuery['readBy.studentId'] = { $ne: studentId };
    }

    const announcements = await this.find(finalQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('teacherId', 'firstName lastName')
        .lean();

    // Add isRead flag for each announcement
    return announcements.map(a => ({
        ...a,
        isRead: a.readBy?.some(r => r.studentId.toString() === studentId.toString()) || false
    }));
};

// Static method to get unread count for a student
announcementSchema.statics.getUnreadCount = async function(studentId) {
    const announcements = await this.getForStudent(studentId, { unreadOnly: true, limit: 100 });
    return announcements.length;
};

// Static method to get teacher's announcements
announcementSchema.statics.getByTeacher = async function(teacherId, options = {}) {
    const { limit = 50, skip = 0 } = options;

    return this.find({
        teacherId,
        isDeleted: false
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('enrollmentCodeId', 'className code')
    .lean();
};

// Static method to send scheduled announcements (for cron job)
announcementSchema.statics.sendScheduled = async function() {
    const now = new Date();
    const result = await this.updateMany(
        {
            scheduledFor: { $lte: now },
            isSent: false,
            isDeleted: false
        },
        {
            isSent: true,
            sentAt: now
        }
    );
    return result.modifiedCount;
};

// Pre-save hook to auto-send if not scheduled
announcementSchema.pre('save', function(next) {
    if (this.isNew && !this.scheduledFor) {
        this.isSent = true;
        this.sentAt = new Date();
    }
    next();
});

// Ensure model is only defined once
module.exports = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
