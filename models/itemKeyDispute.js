// models/itemKeyDispute.js
//
// A bank item whose stored answer key the tutor disagreed with after solving
// the question itself. Written by routes/chat.js when the model emits
// <KEY_DISPUTE: …> during an ACT missed-question review (utils/actReview.js
// tells it to verify the key before using it), read by
// GET /api/admin/item-disputes.
//
// A dispute is evidence for a human key audit, never a verdict: the tutor can
// be wrong too. Nothing here deactivates or re-keys an item.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const itemKeyDisputeSchema = new Schema({
  problemId: { type: String, required: true, index: true },
  testSessionId: { type: String },
  position: { type: Number },                 // question number on the student's form
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },

  studentAnswer: { type: String },            // the letter recorded for the student
  storedKey: { type: String },                // the positional key the prompt carried
  tutorAnswer: { type: String },              // what the tutor's own derivation produced

  source: { type: String, default: 'act-review' },
  status: { type: String, enum: ['open', 'confirmed', 'dismissed'], default: 'open', index: true },
  note: { type: String },
}, { timestamps: true });

itemKeyDisputeSchema.index({ problemId: 1, status: 1 });

module.exports = mongoose.models.ItemKeyDispute
  || mongoose.model('ItemKeyDispute', itemKeyDisputeSchema);
