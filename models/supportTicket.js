// models/supportTicket.js
// Model for AI-triaged support tickets

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'ai', 'admin'],
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const supportTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: [
      'account',        // Account access, settings, profile issues
      'billing',        // Payment, subscription, refund questions
      'bug',            // Something isn't working
      'how-to',         // How do I use a feature?
      'feature-request', // I wish the app could...
      'data-privacy',   // Data deletion, export, FERPA/COPPA
      'other'           // Anything else
    ],
    required: true
  },
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'ai_resolved', 'escalated', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },

  // AI triage results
  aiTriage: {
    handled: {
      type: Boolean,
      default: false
    },
    confidence: {
      type: Number,   // 0-1 how confident AI is in its answer
      min: 0,
      max: 1
    },
    response: String, // AI's initial response/resolution attempt
    reason: String,   // Why AI escalated (if it did)
    suggestedPriority: String,
    triageTimestamp: Date
  },

  // Conversation thread (user follow-ups, admin replies, AI responses)
  messages: [messageSchema],

  // Admin tracking
  assignedTo: String,       // Admin username or email
  adminNotes: String,       // Internal notes (not visible to user)
  resolvedAt: Date,

  // Context
  userAgent: String,
  pageUrl: String,          // What page the user was on
  userRole: String,         // student, teacher, parent, admin
  screenshot: String        // Optional screenshot URL
}, {
  timestamps: true  // adds createdAt, updatedAt
});

// Indexes for efficient querying
supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, priority: 1 });
supportTicketSchema.index({ 'aiTriage.handled': 1, status: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
