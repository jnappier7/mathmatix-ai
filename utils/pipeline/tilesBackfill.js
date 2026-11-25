// utils/pipeline/tilesBackfill.js
//
// "Let me get the tiles out" with no tiles card is the board contradicting the
// chat, so the pipeline backfills the card (Stage 5c.0a in index.js). The card
// goes through the pedagogy guard like any other — and until 2026-11-25 that
// guard call could not fail: it was handed the tiles line itself as the pinned
// problem, so the guard's "is this line already on the board?" check compared
// the line with itself. Whatever line the backfill picked was waved through.
//
// Here the guard is told the truth and nothing else:
//   • pinnedProblemTex is the conversation's real pin (or null);
//   • the problem posed THIS turn counts as on the board only when it is one
//     of this turn's guard-verified pose commands — it is put in front of the
//     tiles card in the same batch, which is the guard's own way of knowing
//     "this problem was just posed" (its running activeProblemTex);
//   • otherwise the line must be something the student stated, or built on
//     their mat (studentBoardLines).
// A line that is none of those gets no card: tiles for a line the student has
// not been given are that line, shown early.

const { enforcePedagogyRule } = require('../boardCommandGuard');

/**
 * @param {object} args
 * @param {string} args.tilesTex              the line to lay out in tiles
 * @param {string|null} [args.turnPoseTex]    tex of a pose command verified THIS turn
 * @param {string|null} [args.pinnedProblemTex] the conversation's pin before this turn
 * @param {string} [args.userMessage]
 * @param {Array}  [args.recentUserMessages]
 * @param {string|null} [args.lastBoardAction]
 * @param {string[]} [args.studentBoardLines]
 * @returns {{ card: object|null, reason: string|null }}
 */
function tilesPromiseCard({
    tilesTex,
    turnPoseTex = null,
    pinnedProblemTex = null,
    userMessage = '',
    recentUserMessages = [],
    lastBoardAction = null,
    studentBoardLines = [],
} = {}) {
    if (!tilesTex || typeof tilesTex !== 'string') return { card: null, reason: 'tiles_missing_tex' };
    const tiles = { action: 'tiles', tex: tilesTex };
    const batch = turnPoseTex ? [{ action: 'pose', tex: turnPoseTex }, tiles] : [tiles];
    const guard = enforcePedagogyRule({
        commands: batch,
        userMessage,
        recentUserMessages,
        lastBoardActionInConversation: lastBoardAction,
        pinnedProblemTex: pinnedProblemTex || null,
        studentBoardLines,
    });
    const card = guard.allowed.find((c) => c && c.action === 'tiles') || null;
    if (card) return { card, reason: null };
    const drop = guard.dropped.find((d) => d && d.command && d.command.action === 'tiles');
    return { card: null, reason: (drop && drop.reason) || 'tiles_not_allowed' };
}

module.exports = { tilesPromiseCard };
