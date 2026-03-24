/**
 * RECORD AMENDMENT REQUEST MODEL - FERPA Compliance
 *
 * FERPA (34 CFR § 99.20) grants parents and eligible students the right
 * to request amendment of education records they believe are inaccurate,
 * misleading, or in violation of the student's privacy rights.
 *
 * This model tracks amendment requests through their lifecycle:
 *   submitted → under_review → approved/denied/partially_approved
 *
 * If denied, FERPA requires the school to inform the parent/student of
 * their right to a formal hearing (34 CFR § 99.21).
 *
 * @module models/recordAmendment
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const recordAmendmentSchema = new Schema({
    // Who is the amendment about
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Who submitted the request
    requestedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    requestedByRole: {
        type: String,
        enum: ['parent', 'student', 'admin'],
        required: true
    },

    // What record needs amendment
    recordType: {
        type: String,
        enum: [
            'profile',              // Name, grade, course info
            'iep_plan',             // IEP accommodations/goals
            'assessment_results',   // Screener/growth check scores
            'grading_results',      // AI grading results
            'conversation_summary', // AI-generated summaries
            'skill_mastery',        // Skill mastery levels
            'learning_profile',     // Learning style, interests
            'other'
        ],
        required: true
    },

    // Description of the inaccuracy
    currentValue: { type: String, trim: true },
    requestedChange: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },

    // Optional reference to the specific document/field
    recordReference: {
        collection: { type: String, trim: true },
        documentId: { type: Schema.Types.ObjectId },
        fieldPath: { type: String, trim: true }
    },

    // Request lifecycle
    status: {
        type: String,
        enum: ['submitted', 'under_review', 'approved', 'denied', 'partially_approved'],
        default: 'submitted',
        index: true
    },

    // Admin review
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true },

    // If denied, FERPA requires notification of hearing rights
    denialReason: { type: String, trim: true },
    hearingRightsNotified: { type: Boolean, default: false },
    hearingRightsNotifiedAt: { type: Date },

    // If approved, what was actually changed
    changeApplied: { type: String, trim: true },

    // Audit metadata
    ipAddress: { type: String },
    userAgent: { type: String }
}, {
    timestamps: true  // createdAt, updatedAt
});

// Indexes for compliance queries
recordAmendmentSchema.index({ createdAt: -1 });
recordAmendmentSchema.index({ studentId: 1, status: 1 });
recordAmendmentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('RecordAmendment', recordAmendmentSchema);
