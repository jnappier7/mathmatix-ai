// models/deletionAudit.js
// Append-only audit trail for student data deletions (FERPA/COPPA compliance)

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const deletionAuditSchema = new Schema({
    targetUserId: { type: String, required: true, index: true },
    requestedBy: { type: String, required: true },
    requestedByRole: { type: String, required: true, enum: ['admin', 'parent', 'teacher', 'student', 'system'] },
    reason: { type: String, default: 'Data deletion request' },
    collectionsAffected: [{ type: String }],
    documentCounts: { type: Schema.Types.Mixed, default: {} },
    errors: [{ collection: String, error: String }],
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    durationMs: { type: Number }
}, {
    timestamps: false,
    // No updates or deletes — append-only for compliance
    strict: true
});

// Index for compliance queries
deletionAuditSchema.index({ completedAt: -1 });
deletionAuditSchema.index({ requestedBy: 1 });

module.exports = mongoose.model('DeletionAudit', deletionAuditSchema);
