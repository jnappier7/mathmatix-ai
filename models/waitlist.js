const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['student', 'parent', 'teacher', 'other'],
    default: 'other'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Same shape as User.emailPreferences — waitlist signups are a bulk-email
  // audience too, and an opt-out must stick (utils/emailUnsubscribe.js).
  emailPreferences: {
    marketingOptOut:       { type: Boolean, default: false },
    marketingOptOutAt:     { type: Date },
    marketingOptOutSource: { type: String, enum: ['link', 'one-click', 'settings', 'admin'] }
  }
});

module.exports = mongoose.model('Waitlist', waitlistSchema);
