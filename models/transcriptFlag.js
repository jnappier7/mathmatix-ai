/**
 * TRANSCRIPT FLAG — Teacher/Admin-raised concern on a single tutor turn
 *
 * Created when a reviewer ("that tutor response looks off") clicks Flag this
 * moment in the transcript viewer. These flags feed the red-team eval suite
 * (separate work); this model just stores them.
 *
 * @module models/transcriptFlag
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const transcriptFlagSchema = new Schema(
    {
        // The conversation and specific turn the flag points at. turnIndex is
        // the index into conversation.messages[]. Storing both lets us render a
        // flag in context (open transcript, scroll to turn) without having to
        // recompute anything.
        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        turnIndex: {
            type: Number,
            required: true,
            min: 0,
        },

        // Whose transcript this flag refers to — denormalized so the admin
        // list view can filter/sort without joining.
        studentId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },

        // Who raised the flag. flaggedByRole is denormalized off the User
        // document at creation time so that admin queries don't have to join
        // User just to show who flagged what.
        flaggedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        flaggedByRole: {
            type: String,
            enum: ['teacher', 'admin'],
            required: true,
        },

        // Free-form reason from the reviewer. Optional but encouraged.
        reason: {
            type: String,
            default: '',
            maxlength: 2000,
            trim: true,
        },

        // Snapshot of the flagged tutor turn at flag time. The underlying
        // messages array is append-only, so this is defense-in-depth — the
        // turn at turnIndex shouldn't move. Stored so the flag remains
        // meaningful even if the conversation is later purged.
        turnSnapshot: {
            role: { type: String },
            content: { type: String },
            timestamp: { type: Date },
        },

        // Lifecycle. v1 is read-only after creation; status is here so admin
        // triage (the next piece of work) doesn't require a migration.
        status: {
            type: String,
            enum: ['open', 'reviewed', 'dismissed'],
            default: 'open',
            index: true,
        },
    },
    { timestamps: true }
);

// Prevent accidental duplicate flags from the same reviewer on the same turn.
transcriptFlagSchema.index(
    { conversationId: 1, turnIndex: 1, flaggedBy: 1 },
    { unique: true }
);

const TranscriptFlag =
    mongoose.models.TranscriptFlag ||
    mongoose.model('TranscriptFlag', transcriptFlagSchema);

module.exports = TranscriptFlag;
