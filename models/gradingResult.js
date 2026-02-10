const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// SUB-SCHEMAS
// ============================================================================

/**
 * Per-problem analysis result
 */
const problemResultSchema = new Schema({
    problemNumber: { type: Number, required: true },
    problemStatement: { type: String, default: '' },
    studentAnswer: { type: String, default: '' },
    correctAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },

    // What the student did well
    strengths: { type: String, default: '' },

    // Error details (empty if correct)
    errors: [{
        step: { type: String, default: '' },
        description: { type: String, default: '' },
        category: {
            type: String,
            enum: ['arithmetic', 'sign', 'algebraic', 'order-of-operations',
                   'graphing', 'notation', 'conceptual', 'incomplete', 'other'],
            default: 'other'
        },
        correction: { type: String, default: '' }
    }],

    // One-sentence per-problem feedback
    feedback: { type: String, default: '' }
}, { _id: false });

/**
 * Teacher review / comment
 */
const teacherReviewSchema = new Schema({
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedAt: { type: Date, default: Date.now },
    comment: { type: String, default: '' },
    problemComments: [{
        problemNumber: Number,
        comment: { type: String, default: '' }
    }]
}, { _id: false });

// ============================================================================
// MAIN SCHEMA
// ============================================================================

const gradingResultSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Re-attempt tracking: links to the previous submission for the same worksheet
    previousAttemptId: { type: Schema.Types.ObjectId, ref: 'GradingResult', default: null },
    attemptNumber: { type: Number, default: 1 },

    // Summary counts
    problemCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },

    // Per-problem breakdown
    problems: [problemResultSchema],

    // AI-generated overall analysis
    overallFeedback: { type: String, default: '' },
    whatWentWell: { type: String, default: '' },
    practiceRecommendations: [{ type: String }],

    // Skill tagging (links to curriculum)
    skillsAssessed: [{ type: String }],

    // Source image reference (path, not base64)
    imageFilename: { type: String },
    imageMimetype: { type: String },

    // XP awarded
    xpEarned: { type: Number, default: 0 },

    // Teacher review
    teacherReview: teacherReviewSchema,

    // Status tracking
    status: {
        type: String,
        enum: ['analyzed', 'reviewed', 'returned'],
        default: 'analyzed'
    }
}, {
    timestamps: true
});

// ============================================================================
// INDEXES
// ============================================================================

gradingResultSchema.index({ userId: 1, createdAt: -1 });
gradingResultSchema.index({ userId: 1, status: 1 });

// ============================================================================
// VIRTUALS
// ============================================================================

gradingResultSchema.virtual('accuracyRate').get(function () {
    if (this.problemCount === 0) return 0;
    return Math.round((this.correctCount / this.problemCount) * 100);
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

/**
 * Apply a teacher review
 */
gradingResultSchema.methods.applyTeacherReview = function (review) {
    this.teacherReview = review;
    this.status = 'reviewed';
    return this;
};

/**
 * Get a student-friendly summary object
 */
gradingResultSchema.methods.toStudentView = function () {
    return {
        id: this._id,
        previousAttemptId: this.previousAttemptId || null,
        attemptNumber: this.attemptNumber || 1,
        problemCount: this.problemCount,
        correctCount: this.correctCount,
        // ANTI-CHEAT: correctAnswer is intentionally excluded from student view
        // to prevent students from using the grading feature as an answer key.
        problems: this.problems.map(p => ({
            problemNumber: p.problemNumber,
            problemStatement: p.problemStatement,
            studentAnswer: p.studentAnswer,
            isCorrect: p.isCorrect,
            strengths: p.strengths,
            errors: p.errors,
            feedback: p.feedback
        })),
        overallFeedback: this.overallFeedback,
        whatWentWell: this.whatWentWell,
        practiceRecommendations: this.practiceRecommendations,
        xpEarned: this.xpEarned,
        teacherComment: this.teacherReview?.comment || null,
        status: this.status,
        createdAt: this.createdAt
    };
};

// ============================================================================
// STATICS
// ============================================================================

/**
 * Get recent analysis history for a student
 */
gradingResultSchema.statics.getHistory = function (userId, limit = 20) {
    return this.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-__v')
        .lean();
};

/**
 * Get error pattern summary for a student across recent sessions.
 * Returns counts by error category (e.g., { sign: 12, arithmetic: 5, conceptual: 3 })
 * Used by the tutor to proactively address persistent weaknesses.
 *
 * @param {ObjectId} userId
 * @param {number} [lookback=14] - Days to look back
 * @returns {Promise<{patterns: Object, totalErrors: number, sessionsAnalyzed: number}>}
 */
gradingResultSchema.statics.getErrorPatterns = async function (userId, lookback = 14) {
    const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);
    const results = await this.find({ userId, createdAt: { $gte: since } })
        .select('problems.errors.category')
        .lean();

    const patterns = {};
    let totalErrors = 0;

    for (const result of results) {
        for (const problem of (result.problems || [])) {
            for (const error of (problem.errors || [])) {
                if (error.category) {
                    patterns[error.category] = (patterns[error.category] || 0) + 1;
                    totalErrors++;
                }
            }
        }
    }

    return { patterns, totalErrors, sessionsAnalyzed: results.length };
};

/**
 * Get analysis results for a teacher's students
 */
gradingResultSchema.statics.getForTeacher = function (studentIds, options = {}) {
    const query = { userId: { $in: studentIds } };
    if (options.status) query.status = options.status;

    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 50)
        .populate('userId', 'firstName lastName')
        .select('-__v')
        .lean();
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = mongoose.model('GradingResult', gradingResultSchema);
