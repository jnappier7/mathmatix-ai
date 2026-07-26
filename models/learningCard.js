// LEARNING CARDS — the Live Workspace's persistent learning notebook
// (docs/LIVE_WORKSPACE_REQUIREMENTS.md §7, §15).
//
// A card preserves something worth keeping beyond the conversation it
// happened in: an AHA moment in the student's own words, a recurring
// mistake to watch for, a reusable idea or strategy. Cards live in their
// own collection — the notebook is CROSS-session by definition, while
// conversations archive and roll over.
//
// Writers today: utils/pipeline/learningCards.js (deterministic capture in
// the persist stage — AHA and Reminder). The idea/strategy/reflection types
// are part of the schema so the API and notebook UI are ready for them, but
// nothing auto-creates them yet.

const mongoose = require('mongoose');
const { Schema } = mongoose;

const learningCardSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        required: true,
        enum: ['aha', 'reminder', 'idea', 'strategy', 'reflection'],
    },
    // Short student-facing headline ("You figured out two-step equations!",
    // "Watch for This: losing a negative sign").
    title: { type: String, required: true, maxlength: 160 },
    // The substance. For AHA cards this leads with the student's own words —
    // spec §7.2: "prioritize the student's own wording."
    body: { type: String, default: '', maxlength: 2000 },
    // Verbatim student quote behind an AHA card.
    quote: { type: String, default: null, maxlength: 400 },
    skillId: { type: String, default: null, index: true },
    // Stable dedupe key for reminder cards (one card per misconception per
    // student — recurrences bump seenCount instead of stacking duplicates).
    misconceptionKey: { type: String, default: null },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    // The problem on the board when the card was born, when known.
    problemTex: { type: String, default: null, maxlength: 500 },
    seenCount: { type: Number, default: 1 },
    lastSeenAt: { type: Date, default: Date.now },
    // Soft delete — students may clear cards from their notebook without the
    // evidence trail vanishing.
    archived: { type: Boolean, default: false },
}, { timestamps: true });

learningCardSchema.index({ userId: 1, type: 1, createdAt: -1 });
learningCardSchema.index({ userId: 1, misconceptionKey: 1 }, { sparse: true });

module.exports = mongoose.model('LearningCard', learningCardSchema);
