/**
 * EDUCATION RECORD ACCESS LOG - FERPA Compliance
 *
 * FERPA (34 CFR § 99.32) requires educational agencies to maintain a record
 * of each request for access to and each disclosure of education records.
 * This log must include:
 *   - The parties who requested or received the information
 *   - The legitimate interest the parties had in the information
 *
 * Exceptions (no logging required):
 *   - Access by the student themselves
 *   - Access by school officials with legitimate educational interest
 *     (when the criteria is met per the institution's annual notification)
 *   - Directory information disclosures
 *
 * However, we log ALL access for maximum transparency and auditability,
 * including the exceptions above (marked accordingly).
 *
 * @module models/educationRecordAccessLog
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const educationRecordAccessLogSchema = new Schema({
    // Whose records were accessed
    studentId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Who accessed the records
    accessedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accessedByRole: {
        type: String,
        enum: ['admin', 'teacher', 'parent', 'student', 'system'],
        required: true
    },

    // What was accessed
    recordType: {
        type: String,
        enum: [
            'profile',
            'iep_plan',
            'conversations',
            'course_sessions',
            'assessment_results',
            'grading_results',
            'skill_mastery',
            'learning_profile',
            'progress_data',
            'uploads',
            'full_export',
            'analytics'
        ],
        required: true
    },

    // How/why it was accessed
    accessType: {
        type: String,
        enum: ['view', 'export', 'api_read', 'impersonation', 'report_generation'],
        default: 'view'
    },

    // Legitimate educational interest justification
    legitimateInterest: {
        type: String,
        enum: [
            'teaching_instruction',      // Teacher viewing student progress
            'academic_support',          // Teacher reviewing IEP/accommodations
            'parental_right_of_access',  // Parent viewing child records
            'student_self_access',       // Student viewing own records
            'administrative_function',   // Admin performing system duties
            'data_export_request',       // FERPA right-of-access export
            'audit_compliance',          // Compliance audit
            'system_automated'           // Automated system process
        ],
        required: true
    },

    // Route/endpoint that triggered the access
    endpoint: { type: String, trim: true },

    // Whether this is a FERPA-exempt access (logged for transparency but not required)
    ferpaExempt: { type: Boolean, default: false },
    exemptionReason: { type: String, trim: true },

    // Request metadata
    ipAddress: { type: String },
    userAgent: { type: String },

    accessedAt: { type: Date, default: Date.now, index: true }
}, {
    timestamps: false  // Using accessedAt instead
});

// Compound indexes for compliance queries
educationRecordAccessLogSchema.index({ studentId: 1, accessedAt: -1 });
educationRecordAccessLogSchema.index({ accessedBy: 1, accessedAt: -1 });
educationRecordAccessLogSchema.index({ recordType: 1, accessedAt: -1 });

// TTL: Retain access logs for 5 years (FERPA best practice)
educationRecordAccessLogSchema.index({ accessedAt: 1 }, { expireAfterSeconds: 5 * 365 * 24 * 60 * 60 });

module.exports = mongoose.model('EducationRecordAccessLog', educationRecordAccessLogSchema);
