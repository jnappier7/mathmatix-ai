/**
 * COURSE CONVERSATION — one document per course SITTING, not per course.
 *
 * `courseSession.conversationId` used to be written once and reused forever:
 * every path (routes/courseChat.js turn handler, its greeting handler, the
 * activate route, the chat greeting's course branch) did
 * `Conversation.findById(courseSession.conversationId)` with no boundary check
 * at all — unlike routes/chat.js, which has rolled on the idle window since
 * utils/sessionWindow.js landed.
 *
 * So a course conversation grew without limit and the client painted its last
 * 50 messages (routes/conversations.js `/switch`) on every entry, then the
 * course greeting appended a brand-new lesson start underneath. That is the
 * reported failure exactly: three or four sittings stacked in one view,
 * duplicate assistant bubbles, and a 12:02 AM exchange sitting above a 12:24 AM
 * continuation.
 *
 * This module is the one place that decides which conversation a course turn
 * belongs to, so the four entry points can't drift apart again.
 */

const Conversation = require('../models/conversation');
const { touchSession } = require('./sessionWindow');
const { claimLoginSession, sessionBreakReason } = require('./loginSession');

/**
 * Pure: should we open a fresh conversation for this course sitting?
 * Returns the break reason ('missing' | 'closed' | 'new_login' | 'idle') or
 * null to continue the one we have. Exported for testing the policy directly.
 *
 * NOTE the deliberate asymmetry with routes/chat.js: a course conversation that
 * was closed out still rolls, but 'closed' is reported separately from
 * 'new_login' so the log tells you which rule fired.
 */
function courseBreakReason(conversation, loginSessionId, now = Date.now()) {
    return sessionBreakReason(conversation, loginSessionId, now);
}

/**
 * Resolve (and if necessary roll) the conversation backing a course session.
 *
 * Continuing is the common case — a course turn, mid-sitting, keeps its thread.
 * A break rolls: the old conversation is closed out so it stops showing up as
 * live in the sidebar, a fresh one is created carrying the current login's
 * marker, and `courseSession.conversationId` is repointed and saved.
 *
 * Course PROGRESS is unaffected — module status, `currentScaffoldIndex` and
 * `overallProgress` all live on the CourseSession, not the conversation. Only
 * the transcript starts over, which is the point.
 *
 * @param {Object}  args
 * @param {Object}  args.user            - mongoose user doc (needs _id)
 * @param {Object}  args.courseSession   - mongoose CourseSession doc
 * @param {string?} args.loginSessionId  - current login marker, or null
 * @param {string?} args.conversationName- name for a freshly created conversation
 * @param {number}  [args.now]
 * @returns {Promise<{conversation: Object, rolled: boolean, reason: string|null}>}
 */
async function resolveCourseConversation({
    user,
    courseSession,
    loginSessionId = null,
    conversationName = null,
    now = Date.now(),
}) {
    let conversation = null;
    if (courseSession.conversationId) {
        conversation = await Conversation.findById(courseSession.conversationId);
    }

    const reason = courseBreakReason(conversation, loginSessionId, now);

    if (!reason) {
        // Same sitting — continue. Claim it if it predates the marker.
        const claimed = !conversation.loginSessionId && !!loginSessionId;
        const reactivated = !conversation.isActive;
        claimLoginSession(conversation, loginSessionId);
        if (reactivated) conversation.isActive = true;
        touchSession(conversation);

        // Persist the bookkeeping directly rather than leaving it to the
        // caller's later save(): the activate route resolves and responds
        // without ever saving the conversation, and an unpersisted claim would
        // make this conversation re-adoptable by the NEXT login instead of
        // rolling. Targeted $set so we never race a concurrent message push.
        const patch = { lastActivity: conversation.lastActivity };
        if (claimed) patch.loginSessionId = loginSessionId;
        if (reactivated) patch.isActive = true;
        try {
            await Conversation.updateOne({ _id: conversation._id }, { $set: patch });
        } catch (err) {
            console.warn('[CourseConversation] continue-branch bookkeeping failed (non-fatal):', err.message);
        }

        return { conversation, rolled: false, reason: null };
    }

    // Close the previous sitting so it stops reading as live. Best-effort: a
    // failure here must not block the student from starting the new one.
    if (conversation && conversation.isActive) {
        try {
            conversation.isActive = false;
            await conversation.save();
        } catch (err) {
            console.warn('[CourseConversation] failed to close previous sitting (non-fatal):', err.message);
        }
    }

    const fresh = new Conversation({
        userId: user._id,
        conversationName: conversationName || courseSession.courseName,
        topic: courseSession.courseName,
        topicEmoji: '📚',
        conversationType: 'topic',
        loginSessionId: loginSessionId || null,
    });
    await fresh.save();

    courseSession.conversationId = fresh._id;
    await courseSession.save();

    return { conversation: fresh, rolled: !!conversation, reason };
}

module.exports = { courseBreakReason, resolveCourseConversation };
