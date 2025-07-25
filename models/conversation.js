// models/conversation.js
// NEW FILE: Defines the schema for a new 'Conversation' collection.
// This decouples conversation history from the user document for scalability.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// This sub-schema is identical to the one previously in user.js
const messageSchema = new Schema({
    role: { type: String, required: true }, // 'user' or 'assistant'
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const conversationSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index this field for faster lookups
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    messages: {
        type: [messageSchema],
        default: []
    },
    summary: {
        type: String,
        default: null
    },
    activeMinutes: {
        type: Number,
        default: 0
    }
}, { timestamps: true }); // Mongoose adds createdAt and updatedAt

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;// JavaScript Document