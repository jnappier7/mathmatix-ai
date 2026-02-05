// models/impersonationLog.js
// Audit log for user impersonation (student view) feature

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const impersonationLogSchema = new Schema({
  // Who initiated the impersonation
  actorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  actorRole: {
    type: String,
    enum: ['admin', 'teacher', 'parent'],
    required: true
  },
  actorEmail: { type: String, required: true },

  // Who was impersonated
  targetId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetRole: {
    type: String,
    enum: ['student', 'teacher', 'parent'],
    required: true
  },
  targetEmail: { type: String, required: true },

  // Session details
  startedAt: { type: Date, default: Date.now, index: true },
  endedAt: { type: Date, default: null },

  // How the session ended
  endReason: {
    type: String,
    enum: ['manual', 'timeout', 'logout', 'session_expired'],
    default: null
  },

  // Security & compliance
  ipAddress: { type: String },
  userAgent: { type: String },

  // Activity tracking during impersonation
  pagesVisited: [{
    path: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Was this a read-only session?
  readOnly: { type: Boolean, default: true },

  // Any actions attempted (for compliance review)
  actionsAttempted: [{
    action: String,
    path: String,
    method: String,
    blocked: Boolean,
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Indexes for common queries
impersonationLogSchema.index({ actorId: 1, startedAt: -1 });
impersonationLogSchema.index({ targetId: 1, startedAt: -1 });
impersonationLogSchema.index({ startedAt: -1 });

// Virtual for session duration
impersonationLogSchema.virtual('durationMinutes').get(function() {
  if (!this.endedAt) return null;
  return Math.round((this.endedAt - this.startedAt) / 60000);
});

// Ensure virtuals are included in JSON output
impersonationLogSchema.set('toJSON', { virtuals: true });
impersonationLogSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ImpersonationLog', impersonationLogSchema);
