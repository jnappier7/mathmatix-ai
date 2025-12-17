// models/screenerSession.js
// CTO REVIEW FIX: Persistent storage for screener sessions
// Prevents data loss on server restart

const mongoose = require('mongoose');

const screenerSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Current ability estimate
    theta: {
        type: Number,
        default: 0
    },
    standardError: {
        type: Number,
        default: Infinity
    },
    confidence: {
        type: Number,
        default: 0
    },
    cumulativeInformation: {
        type: Number,
        default: 0
    },

    // Response history
    responses: [{
        problemId: String,
        skillId: String,
        difficulty: Number,
        correct: Boolean,
        responseTime: Number,
        theta: Number,
        standardError: Number
    }],

    // Session state
    questionCount: {
        type: Number,
        default: 0
    },
    converged: {
        type: Boolean,
        default: false
    },
    plateaued: {
        type: Boolean,
        default: false
    },
    frontierDetected: {
        type: Boolean,
        default: false
    },

    // Frontier information
    frontier: {
        skillId: String,
        difficultyLevel: Number,
        firstFailureTheta: Number
    },

    // Timing
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date
    },

    // Completion criteria
    minQuestions: {
        type: Number,
        default: 15
    },
    targetQuestions: {
        type: Number,
        default: 20
    },
    maxQuestions: {
        type: Number,
        default: 25
    },
    seThresholdStringent: {
        type: Number,
        default: 0.25
    },
    seThresholdAcceptable: {
        type: Number,
        default: 0.30
    },
    seThresholdFallback: {
        type: Number,
        default: 0.35
    },
    minInformationGain: {
        type: Number,
        default: 0.05
    },

    // Skill coverage tracking
    testedSkills: [String],
    testedSkillCategories: {
        'number-operations': {
            type: Number,
            default: 0
        },
        'algebra': {
            type: Number,
            default: 0
        },
        'geometry': {
            type: Number,
            default: 0
        },
        'advanced': {
            type: Number,
            default: 0
        }
    },

    // Phase tracking
    phase: {
        type: String,
        enum: ['screener', 'interview', 'complete'],
        default: 'screener'
    },

    // Expiration (cleanup old sessions after 24 hours)
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        index: { expires: 0 } // TTL index - MongoDB will auto-delete
    }
}, {
    timestamps: true
});

// Index for finding active sessions by userId
screenerSessionSchema.index({ userId: 1, createdAt: -1 });

// Static method to find or create session
screenerSessionSchema.statics.findBySessionId = async function(sessionId) {
    return this.findOne({ sessionId });
};

// Static method to get active session for user
screenerSessionSchema.statics.getActiveSession = async function(userId) {
    return this.findOne({
        userId,
        phase: { $ne: 'complete' },
        expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ScreenerSession', screenerSessionSchema);
