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
    },

    // Session type: starting-point (full initial) or growth-check (shorter progress)
    sessionType: {
        type: String,
        enum: ['starting-point', 'growth-check'],
        default: 'starting-point'
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

    // Bayesian prior (for MAP estimation in early questions)
    priorMean: {
        type: Number,
        default: 0
    },
    priorSD: {
        type: Number,
        default: 1.25
    },

    // Response history
    responses: [{
        problemId: String,
        skillId: String,
        skillCategory: String,          // Skill's category (e.g., 'algebra', 'fractions')
        difficulty: Number,
        discrimination: Number,         // IRT discrimination parameter (α)
        correct: Boolean,
        skipped: Boolean,               // Whether the student skipped this question
        responseTime: Number,
        userAnswer: String,             // Student's submitted answer
        correctAnswer: mongoose.Schema.Types.Mixed, // The correct answer (string or object)
        questionNumber: Number,         // 1-indexed question number in session
        thetaBefore: Number,            // Theta estimate before this response
        seBefore: Number,               // Standard error before this response
        thetaAfter: Number,             // Theta estimate after this response
        thetaChange: Number,            // Absolute change in theta from this response
        informationGained: Number,      // Fisher information gained from this item
        theta: Number,                  // (legacy) Theta at time of response
        standardError: Number           // (legacy) SE at time of response
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

    // Completion criteria (8-30 questions based on convergence)
    // Defaults aligned with catConfig.js SESSION_DEFAULTS
    minQuestions: {
        type: Number,
        default: 8  // Minimum for basic reliability
    },
    targetQuestions: {
        type: Number,
        default: 15  // Soft target for typical students
    },
    maxQuestions: {
        type: Number,
        default: 30  // Hard cap to prevent fatigue
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
        default: 0.40
    },
    minInformationGain: {
        type: Number,
        default: 0.08
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

    // Interview phase data
    interviewSkills: [{
        skillId: String,
        difficulty: Number,
        reason: String  // 'failed-near-theta', 'slow-correct-near-theta', etc.
    }],
    interviewQuestions: [{
        questionId: String,
        type: String,  // 'explanation', 'transfer', 'misconception-probe', etc.
        question: String,
        baseProblem: String,
        expectedAnswer: String,
        skillId: String,
        rubric: {
            excellent: String,
            good: String,
            developing: String,
            needs_work: String
        },
        response: String,
        evaluation: {
            rating: String,  // 'excellent', 'good', 'developing', 'needs_work'
            strengths: String,
            areasForGrowth: String,
            understandingLevel: String,  // 'deep', 'surface', 'misconception'
            rawEvaluation: String
        },
        answeredAt: Date
    }],
    interviewStartTime: Date,
    interviewEndTime: Date,

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
