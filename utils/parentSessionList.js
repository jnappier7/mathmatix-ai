// utils/parentSessionList.js
//
// Shapes the "Recent sessions" list on the parent dashboard
// (GET /api/parent/child/:childId/progress → recentSessions).
//
// Pure: takes the Conversation rows routes/parent.js already queried and
// returns what the page renders. Everything a parent reads here is cleaned on
// the way out — LaTeX rewritten as plain math (the page has no typesetter),
// tutor first person and "the student" repaired, stray "undefined" dropped —
// because the summaries are stored LLM output that will never be regenerated.
//
// Empty sessions (no active minutes AND no real summary — the "Session
// completed - 0 minutes" placeholder) are not listed; they are counted, so the
// page can say "+3 short sessions" instead of a column of blank rows.

const { plainMath } = require('./plainMath');
const { repairSummary, isPlaceholderSummary } = require('./summaryText');

const NO_SUMMARY_TEXT = 'Tutoring session (no summary was recorded).';

function cleanForParent(text, firstName) {
    return plainMath(repairSummary(text, firstName));
}

function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

/** The live row's summary when the tutor has not written a liveSummary yet. */
function liveFallbackSummary(active) {
    const topic = active.currentTopic || 'mathematics';
    const attempted = Number(active.problemsAttempted) || 0;
    const correct = Number(active.problemsCorrect) || 0;
    return `Currently working on ${topic}. ` + (attempted > 0
        ? `${plural(attempted, 'problem', 'problems')} attempted with ${correct} correct.`
        : 'Session in progress.');
}

function minutesOf(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {object} args
 * @param {object|null} args.active      the truly-active conversation, if any
 * @param {object[]}    args.completed   completed conversations, newest first
 * @param {string}      [args.firstName] the child's first name
 * @param {number}      [args.limit=6]   max completed rows to list
 * @returns {{ sessions: object[], hiddenShortSessions: number }}
 */
function shapeRecentSessions({ active = null, completed = [], firstName = '', limit = 6 } = {}) {
    const sessions = [];

    if (active && active.lastActivity) {
        sessions.push({
            date: active.lastActivity || active.startDate,
            summary: cleanForParent(active.liveSummary || liveFallbackSummary(active), firstName),
            duration: minutesOf(active.activeMinutes),
            problemsAttempted: Number(active.problemsAttempted) || 0,
            problemsCorrect: Number(active.problemsCorrect) || 0,
            isActive: true,
        });
    }

    let hiddenShortSessions = 0;
    let listed = 0;
    for (const s of completed || []) {
        const minutes = minutesOf(s.activeMinutes);
        const placeholder = isPlaceholderSummary(s.summary);
        if (minutes === 0 && placeholder) { hiddenShortSessions++; continue; }
        if (listed >= limit) continue;
        listed++;
        sessions.push({
            date: s.lastActivity || s.startDate,
            summary: placeholder ? NO_SUMMARY_TEXT : cleanForParent(s.summary, firstName),
            duration: minutes,
            problemsAttempted: Number(s.problemsAttempted) || 0,
            problemsCorrect: Number(s.problemsCorrect) || 0,
            isActive: false,
        });
    }

    return { sessions, hiddenShortSessions };
}

module.exports = { shapeRecentSessions, liveFallbackSummary, NO_SUMMARY_TEXT };
