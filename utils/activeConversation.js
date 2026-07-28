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
const { isForeignLoginSession } = require('./loginSession');

// How many trailing messages voice loads for LLM context by default.
const VOICE_HISTORY_DEPTH = 12;

/**
 * Resolve the user's active (general, non-mastery) conversation id, creating a
 * fresh conversation if the current one is missing, inactive, or a mastery
 * session. Mirrors the creation logic in chat.js / welcome.js so all modes
 * converge on the same document.
 *
 * DELIBERATELY NO IDLE CHECK. Rule 1 of the continuity policy: returning from
 * voice mode continues the chat exactly where it left off. Voice is the only
 * caller here, and a voice turn must never be the thing that decides a session
 * ended — chat owns that boundary (routes/chat.js). If this rolled on
 * `isSessionStale`, a student who sat quietly on a problem for half an hour and
 * then SPOKE would have their thread cut mid-problem, silently, with no client
 * event to explain it.
 *
 * It DOES honour the login marker. That isn't a mid-session rollover: a
 * conversation stamped by a previous sign-in is not this student's current
 * sitting at all, and appending to it would orphan the voice turns into a
 * transcript chat is about to abandon anyway (rule 2). Within one login the
 * marker never changes, so voice never rolls.
 *
 * @param {Object} user - lean user object or mongoose doc (needs _id, activeConversationId)
 * @param {Object} [opts]
 * @param {string|null} [opts.loginSessionId] - current login marker; omit to skip the check
 * @returns {Promise<{ conversationId: import('mongoose').Types.ObjectId, created: boolean }>}
 */
async function resolveActiveConversationId(user, opts = {}) {
    const userId = user._id;
    const currentId = user.activeConversationId || null;
    const loginSessionId = opts.loginSessionId || null;

    if (currentId) {
        const existing = await Conversation.findById(currentId)
            .select('isActive isMastery loginSessionId')
            .lean();
        if (existing && existing.isActive && !existing.isMastery
            && !isForeignLoginSession(existing, loginSessionId)) {
            // Adopt an unmarked conversation for this login (see loginSession.js).
            if (loginSessionId && !existing.loginSessionId) {
                await Conversation.updateOne({ _id: currentId }, { $set: { loginSessionId } });
            }
            return { conversationId: currentId, created: false };
        }
    }

    // No usable active conversation — create one and point the user at it.
    const conv = await Conversation.create({
        userId, messages: [], isMastery: false, loginSessionId,
    });
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
async function appendToActiveConversation(user, turns, opts = {}) {
    const clean = (turns || [])
        .filter(t => t && t.content && String(t.content).trim().length > 0)
        .map(t => ({
            role: t.role === 'user' ? 'user' : 'assistant',
            content: String(t.content).trim(),
            timestamp: new Date(),
        }));
    if (!clean.length) return null;

    const { conversationId } = await resolveActiveConversationId(user, {
        loginSessionId: opts.loginSessionId || null,
    });
    const set = { lastActivity: new Date() };
    // Voice turns fold their board output into the same ledger chat writes
    // (Live Workspace): pass the updated ledger with the turn so a voice
    // session's board survives reloads exactly like a typed one.
    if (opts.boardLedger !== undefined) set.boardLedger = opts.boardLedger;
    await Conversation.updateOne(
        { _id: conversationId },
        { $push: { messages: { $each: clean } }, $set: set }
    );
    return conversationId;
}

/**
 * Read-only: the active conversation's board ledger (Live Workspace state),
 * or null when there is none. Voice sessions seed from this at start so the
 * board ghost and the ledger fold continue from whatever chat already built.
 */
async function loadActiveBoardLedger(user) {
    const convId = user && user.activeConversationId;
    if (!convId) return null;
    const conv = await Conversation.findById(convId).select('boardLedger').lean();
    return conv?.boardLedger || null;
}

/**
 * Did the tutor speak within the last `ms`? Pure. The anti-collision guard
 * for lesson starts (owner transcript, 2026-07-28: one "ok" produced a
 * free-chat lesson kickoff AND a course greeting in the same minute — two
 * lessons collided in one thread). A greeting path that finds a fresh
 * assistant message must DEFER, not stack a second lesson start.
 */
function assistantSpokeWithin(messages, ms, now = Date.now()) {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        if (m && m.role !== 'user' && m.timestamp) {
            const t = new Date(m.timestamp).getTime();
            return Number.isFinite(t) && (now - t) < ms;
        }
    }
    return false;
}

module.exports = {
    VOICE_HISTORY_DEPTH,
    resolveActiveConversationId,
    loadActiveBoardLedger,
    assistantSpokeWithin,
    loadActiveHistory,
    appendToActiveConversation,
};
