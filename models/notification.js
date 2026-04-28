// models/notification.js
// Persisted notifications for parent / teacher / admin dashboard feeds.
// Used by services/sessionService.js to record session summaries and other
// dashboard-bound events so they survive restarts and can be fetched later.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  // Recipient — either a specific user (parent/teacher) or a role-wide
  // broadcast (e.g. admin feed). At least one must be set.
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  recipientRole: {
    type: String,
    enum: ['parent', 'teacher', 'admin', 'student'],
    required: true,
    index: true
  },

  // Optional — the user the notification is *about* (e.g. the student whose
  // session ended). Useful for filtering a teacher's feed by student.
  subjectUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  type: {
    type: String,
    enum: [
      'session_summary',
      'session_struggle',
      'milestone',
      'help_request',
      'announcement',
      'other'
    ],
    required: true
  },

  // Free-form payload (session summary, alert details, etc.).
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },

  // Read / dismissed state — readAt set when the recipient marks it read.
  readAt: {
    type: Date,
    default: null
  },

  // TTL — notifications older than 90 days are auto-removed by Mongo's
  // TTL monitor. Override per-doc when needed (e.g. legal-hold notes).
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
}, { timestamps: true });

// Compound indexes for the two main read patterns:
//   1. "Show me my unread notifications, newest first"
//   2. "Show me everything for this subject student in the last quarter"
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ subjectUserId: 1, createdAt: -1 });

// Mongo TTL — purges expired docs in the background.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.Notification ||
  mongoose.model('Notification', notificationSchema);
