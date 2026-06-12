// utils/activeConversation.js
//
// Single source of truth for "the conversation the student is currently in".
//
// Chat (routes/chat.js), the welcome greeting (routes/welcome.js), gradeWork,
// rapport-building and others all key the live session off
// `user.activeConversationId`. The voice paths historically did NOT — they
// read "the most recent conversation by updatedAt" and wrote via
// `findOneAndUpdate({ userId })` with no sort (which targets an arbitrary /
// oldest document). That read/write split meant voice turns forked into a
// different document than the one chat reads, so switching chat <-> voice
// looked like "a brand new conversation began" and context was lost in both
// directions.
//
// This module makes every mode read AND write the same `activeConversationId`
// document, so a session is continuous across chat and voice.

const Conversation = require('../models/conversation');
const User = require('../models/user');

// How many trailing messages voice loads for LLM context by default.
const VOICE_HISTORY_DEPTH = 12;

/**
 * Resolve the user's active (general, non-mastery) conversation id, creating a
 * fresh conversation if the current one is missing, inactive, or a mastery
 * session. Mirrors the creation logic in chat.js / welcome.js so all modes
 * converge on the same document.
 *
 * @param {Object} user - lean user object or mongoose doc (needs _id, activeConversationId)
 * @returns {Promise<{ conversationId: import('mongoose').Types.ObjectId, created: boolean }>}
 */
async function resolveActiveConversationId(user) {
    const userId = user._id;
    const currentId = user.activeConversationId || null;

    if (currentId) {
        const existing = await Conversation.findById(currentId)
            .select('isActive isMastery')
            .lean();
        if (existing && existing.isActive && !existing.isMastery) {
            return { conversationId: currentId, created: false };
        }
    }

    // No usable active conversation — create one and point the user at it.
    const conv = await Conversation.create({ userId, messages: [], isMastery: false });
    await User.updateOne({ _id: userId }, { $set: { activeConversationId: conv._id } });
    // Keep the in-memory user in sync for the rest of this request / session
    // (matters for long-lived voice WebSocket sessions that reuse `this.user`).
    try { user.activeConversationId = conv._id; } catch (_) { /* frozen/lean — ignore */ }

    return { conversationId: conv._id, created: true };
}

/**
 * Load the trailing message tail of the user's active conversation as
 * LLM-ready { role, content } entries. Read-only: never creates a
 * conversation. Returns [] when there is no active conversation yet.
 *
 * @param {Object} user - needs activeConversationId
 * @param {number} [depth=VOICE_HISTORY_DEPTH]
 * @returns {Promise<Array<{role: 'user'|'assistant', content: string}>>}
 */
async function loadActiveHistory(user, depth = VOICE_HISTORY_DEPTH) {
    const convId = user && user.activeConversationId;
    if (!convId) return [];

    const conv = await Conversation.findById(convId)
        .select({ messages: { $slice: -depth } })
        .lean();

    return (conv?.messages || [])
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
        }));
}

/**
 * Append user/assistant turns to the user's active conversation, creating it
 * if necessary. This is the write counterpart of loadActiveHistory — both
 * target `user.activeConversationId`, so chat and voice stay in one thread.
 *
 * @param {Object} user - needs _id, activeConversationId
 * @param {Array<{role: string, content: string}>} turns
 * @returns {Promise<import('mongoose').Types.ObjectId|null>} conversationId written to, or null if nothing to write
 */
async function appendToActiveConversation(user, turns) {
    const clean = (turns || [])
        .filter(t => t && t.content && String(t.content).trim().length > 0)
        .map(t => ({
            role: t.role === 'user' ? 'user' : 'assistant',
            content: String(t.content).trim(),
            timestamp: new Date(),
        }));
    if (!clean.length) return null;

    const { conversationId } = await resolveActiveConversationId(user);
    await Conversation.updateOne(
        { _id: conversationId },
        { $push: { messages: { $each: clean } }, $set: { lastActivity: new Date() } }
    );
    return conversationId;
}

module.exports = {
    VOICE_HISTORY_DEPTH,
    resolveActiveConversationId,
    loadActiveHistory,
    appendToActiveConversation,
};
