// models/conversation.js
// NEW FILE: Defines the schema for a new 'Conversation' collection.
// This decouples conversation history from the user document for scalability.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// This sub-schema is identical to the one previously in user.js
const messageSchema = new Schema({
    role: { type: String, required: true }, // 'user' or 'assistant'
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    reaction: { type: String, default: null } // Emoji reaction (e.g., '❤️', '👍', '💯')
}, { _id: false });

const conversationSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index this field for faster lookups
    },
    conversationName: {
        type: String,
        default: 'Math Session'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isAssessment: {
        type: Boolean,
        default: false
    },
    isAssessmentComplete: {
        type: Boolean,
        default: false
    },
    isMastery: {
        type: Boolean,
        default: false
    },
    masteryBadgeId: {
        type: String,
        default: null
    },
    masterySkillId: {
        type: String,
        default: null
    },
    messages: {
        type: [messageSchema],
        default: []
    },
    summary: {
        type: String,
        default: null
    },
    activeMinutes: {
        type: Number,
        default: 0
    },
    // --- LIVE ACTIVITY TRACKING ---
    liveSummary: {
        type: String,
        default: null // Updated during session for live feed
    },
    currentTopic: {
        type: String,
        default: null // e.g., "Linear Equations", "Fractions"
    },
    problemsAttempted: {
        type: Number,
        default: 0
    },
    problemsCorrect: {
        type: Number,
        default: 0
    },
    strugglingWith: {
        type: String,
        default: null // e.g., "negative numbers", "isolating variables"
    },
    lastSummaryUpdate: {
        type: Date,
        default: null
    },
    alerts: [{
        type: { type: String }, // 'struggle', 'milestone', 'help_request', 'session_start', 'session_end'
        message: String,
        timestamp: { type: Date, default: Date.now },
        acknowledged: { type: Boolean, default: false }
    }],
    // Additional metadata for special conversation types (e.g., parent-teacher)
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true }); // Mongoose adds createdAt and updatedAt

// Index for efficient querying of active sessions
conversationSchema.index({ isActive: 1, lastActivity: -1 });

// Pre-save hook to validate and clean messages
conversationSchema.pre('save', function(next) {
    if (this.messages && Array.isArray(this.messages)) {
        const originalLength = this.messages.length;

        // Filter out messages with undefined or empty content
        this.messages = this.messages.filter((msg, index) => {
            if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
                console.warn(`[Conversation] Removing invalid message at index ${index} (conversationId: ${this._id}, userId: ${this.userId})`);
                console.warn(`[Conversation] Invalid message details: role=${msg.role}, content=${msg.content}, timestamp=${msg.timestamp}`);
                return false;
            }
            if (!msg.role || (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system')) {
                console.warn(`[Conversation] Removing message with invalid role at index ${index}: ${msg.role}`);
                return false;
            }
            return true;
        });

        if (this.messages.length !== originalLength) {
            console.warn(`[Conversation] Removed ${originalLength - this.messages.length} invalid messages from conversation ${this._id}`);
        }
    }
    next();
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;// JavaScript Document