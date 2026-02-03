/**
 * Message Model - Teacher-Parent Messaging System
 *
 * Supports:
 * - Direct messages between teachers and parents
 * - Message threads linked to specific students
 * - Read receipts and notifications
 * - Attachments (future: progress reports, etc.)
 *
 * @module models/message
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Attachment schema for future extensibility
const attachmentSchema = new Schema({
    type: {
        type: String,
        enum: ['progress-report', 'iep-update', 'image', 'document'],
        required: true
    },
    filename: { type: String },
    url: { type: String },
    metadata: Schema.Types.Mixed  // Flexible for different attachment types
}, { _id: false });

// Main message schema
const messageSchema = new Schema({
    // Participants
    senderId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    recipientId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Student context - messages are often about a specific student
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    // Message content
    subject: {
        type: String,
        trim: true,
        maxlength: 200
    },
    body: {
        type: String,
        required: true,
        maxlength: 5000
    },

    // Thread support
    threadId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        index: true
    },
    isThreadStarter: {
        type: Boolean,
        default: false
    },

    // Status
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'archived'],
        default: 'sent'
    },
    readAt: { type: Date },

    // Flags
    isUrgent: {
        type: Boolean,
        default: false
    },
    requiresResponse: {
        type: Boolean,
        default: false
    },

    // Category for filtering
    category: {
        type: String,
        enum: ['general', 'progress', 'concern', 'achievement', 'iep', 'schedule', 'other'],
        default: 'general'
    },

    // Attachments
    attachments: [attachmentSchema],

    // Soft delete support
    deletedBySender: { type: Boolean, default: false },
    deletedByRecipient: { type: Boolean, default: false },

    // Email notification tracking
    emailNotificationSent: { type: Boolean, default: false },
    emailNotificationSentAt: { type: Date }

}, {
    timestamps: true
});

// Compound indexes for common queries
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, createdAt: -1 });
messageSchema.index({ studentId: 1, createdAt: -1 });
messageSchema.index({ threadId: 1, createdAt: 1 });
messageSchema.index({ recipientId: 1, status: 1, deletedByRecipient: 1 }); // For unread count

// Virtual for conversation participants
messageSchema.virtual('participants').get(function() {
    return [this.senderId, this.recipientId];
});

// Instance method to mark as read
messageSchema.methods.markAsRead = async function() {
    if (this.status !== 'read') {
        this.status = 'read';
        this.readAt = new Date();
        await this.save();
    }
    return this;
};

// Static method to get unread count for a user
messageSchema.statics.getUnreadCount = async function(userId) {
    return this.countDocuments({
        recipientId: userId,
        status: { $ne: 'read' },
        deletedByRecipient: false
    });
};

// Static method to get conversations (grouped by thread/participant)
messageSchema.statics.getConversations = async function(userId, options = {}) {
    const { limit = 20, skip = 0 } = options;

    // Get the most recent message from each unique conversation
    const conversations = await this.aggregate([
        {
            $match: {
                $or: [
                    { senderId: mongoose.Types.ObjectId(userId), deletedBySender: false },
                    { recipientId: mongoose.Types.ObjectId(userId), deletedByRecipient: false }
                ]
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            // Group by the "other" participant
            $group: {
                _id: {
                    $cond: {
                        if: { $eq: ['$senderId', mongoose.Types.ObjectId(userId)] },
                        then: '$recipientId',
                        else: '$senderId'
                    }
                },
                lastMessage: { $first: '$$ROOT' },
                unreadCount: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ['$recipientId', mongoose.Types.ObjectId(userId)] },
                                    { $ne: ['$status', 'read'] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $sort: { 'lastMessage.createdAt': -1 }
        },
        {
            $skip: skip
        },
        {
            $limit: limit
        }
    ]);

    // Populate participant info
    await this.populate(conversations.map(c => c.lastMessage), [
        { path: 'senderId', select: 'firstName lastName role' },
        { path: 'recipientId', select: 'firstName lastName role' },
        { path: 'studentId', select: 'firstName lastName' }
    ]);

    return conversations;
};

// Static method to get thread messages
messageSchema.statics.getThread = async function(threadId, userId) {
    const messages = await this.find({
        $or: [
            { _id: threadId },
            { threadId: threadId }
        ],
        $or: [
            { senderId: userId, deletedBySender: false },
            { recipientId: userId, deletedByRecipient: false }
        ]
    })
    .sort({ createdAt: 1 })
    .populate('senderId', 'firstName lastName role')
    .populate('recipientId', 'firstName lastName role')
    .populate('studentId', 'firstName lastName');

    return messages;
};

// Pre-save hook to set threadId for thread starters
messageSchema.pre('save', function(next) {
    if (this.isNew && !this.threadId) {
        this.isThreadStarter = true;
    }
    next();
});

// Ensure model is only defined once (for hot-reloading in dev)
module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
