// utils/pipeline/turnRescue.js
//
// A turn the student SAW must be a turn the conversation KEEPS.
//
// The reply streams to the student during generate; persist saves it later.
// When persist threw, index.js logged "non-fatal" and moved on: the student had
// the reply on screen, the database never got it, and the next turn's history
// skipped straight over it. Production, 2026-10-28: a student answered "1"
// (which problem), the tutor said "Great choice! For problem 1…", that exchange
// never landed, and two turns later the tutor — reading a history with no
// "problem 1" in it — walked him through problem 7.
//
// persist saves the whole document, and the messages array goes out as one
// $set guarded by __v, so a version conflict or a validation error on ANY field
// takes the transcript down with it. This writes only the turn's messages, as
// an atomic $push with no version guard: the rest of the turn (XP, mastery,
// board state) may still be lost, but the words the student and tutor actually
// exchanged are not.

const Sentry = require('@sentry/node');
const log = require('../logger');

const logger = log.child({ service: 'turn-rescue' });

function plain(msg) {
    return (msg && typeof msg.toObject === 'function') ? msg.toObject() : { ...msg };
}

function usable(msg) {
    return msg && typeof msg.content === 'string' && msg.content.trim() !== ''
        && (msg.role === 'user' || msg.role === 'assistant');
}

/**
 * Push the in-memory messages the database does not have yet.
 *
 * "Not yet stored" = newer than the newest stored message. The turn's user
 * message (pushed by routes/chat.js before the pipeline) and, if persist got
 * that far, its assistant message both qualify; `responseText` covers a
 * persist that threw before it pushed the reply.
 *
 * Never throws — it runs inside an error path already.
 *
 * @param {object} conversation  the turn's Mongoose conversation doc
 * @param {object} [opts]
 * @param {string} [opts.responseText]  the reply the student was shown
 * @param {Error}  [opts.cause]          what made the normal save fail
 * @param {string} [opts.userId]
 * @returns {Promise<number>} messages rescued (0 if none were missing or the push failed)
 */
async function rescueTurnMessages(conversation, { responseText, cause, userId } = {}) {
    const conversationId = conversation?._id;
    const report = {
        conversationId: conversationId && String(conversationId),
        userId: userId && String(userId),
        cause: cause?.name,
        causeMessage: cause?.message,
    };
    try {
        const Model = conversation?.constructor;
        if (!conversationId || typeof Model?.findById !== 'function') return 0;

        const stored = await Model.findById(conversationId, { messages: { $slice: -20 } }).lean();
        if (!stored) return 0;
        const lastStoredAt = (stored.messages || []).reduce((max, m) => {
            const t = m?.timestamp ? new Date(m.timestamp).getTime() : NaN;
            return Number.isNaN(t) ? max : Math.max(max, t);
        }, -Infinity);

        const missing = (conversation.messages || [])
            .map(plain)
            .filter(m => usable(m) && new Date(m.timestamp || 0).getTime() > lastStoredAt);

        const reply = typeof responseText === 'string' ? responseText.trim() : '';
        const hasReply = (m) => m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim() === reply;
        if (reply && !missing.some(hasReply) && !(stored.messages || []).slice(-2).some(hasReply)) {
            missing.push({ role: 'assistant', content: reply, timestamp: new Date() });
        }
        if (missing.length === 0) return 0;

        await Model.updateOne(
            { _id: conversationId },
            { $push: { messages: { $each: missing } }, $set: { lastActivity: new Date() } },
        );
        logger.error('Turn save failed; rescued its messages', { ...report, rescued: missing.length });
        Sentry.captureException(cause || new Error('turn save failed'), {
            level: 'error',
            tags: { area: 'chat', kind: 'turn_save_failed', rescued: 'yes' },
            extra: { ...report, rescued: missing.length },
        });
        return missing.length;
    } catch (err) {
        // Both writes failed: the student saw a reply the conversation does
        // not have. Loudest case — this is the one to page on.
        logger.error('Turn save failed AND rescue failed; turn lost', { ...report, rescueError: err.message });
        Sentry.captureException(cause || err, {
            level: 'fatal',
            tags: { area: 'chat', kind: 'turn_save_failed', rescued: 'no' },
            extra: { ...report, rescueError: err.message },
        });
        return 0;
    }
}

module.exports = { rescueTurnMessages };
