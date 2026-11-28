/**
 * boardSettle.js — the last word on a turn's board, as one pure function.
 *
 * Every pose source has spoken by the time this runs (the model's tags, the
 * synthesizer, the backfills). What is left decides what the student sees as
 * ONE problem card versus several, so it lives in one place the pipeline and
 * the replay fixtures both call — tests/unit/workspace/inlineWorkDock.test.js
 * replays the 2026-10-05 five-card session through exactly this.
 *
 * Order matters:
 *   0. the problem in focus stays the student's: a parallel example becomes an
 *      `example` card, and a pose nobody wrote is dropped;
 *   1. a verify that is not an answer becomes the resolve it is — before the
 *      cycle bookkeeping, or it closes the card and drops the pin; and the
 *      reverse: a line that IS the answer becomes the verify it is, and an
 *      answer posed as a new problem is dropped;
 *   2. a pose of the student's own scratch arithmetic is dropped;
 *   3. a pose restating the problem in focus folds back into its card;
 *   4. a genuinely new pose gets the `clear` the model forgot;
 *   5. lastBoardAction / the pin follow the surviving cycle cards;
 *   6. the ledger folds the turn (what a reload replays).
 */
'use strict';

const { dropScratchFragmentPoses, synthesizeAutoClear } = require('./boardSynthesizer');
const { demoteNonAnswerVerifies, promoteAnswerResolves, dropAnswerPoses, foldRestatedPoses } = require('./boardContinuity');
const { applyTurnToLedger } = require('./boardLedger');
const { hasStartOverIntent } = require('../boardCommandGuard');

/**
 * @param {object} p
 * @param {Array}  p.commands         the turn's board commands so far
 * @param {string} p.message          the student's message
 * @param {string|null} p.pinTex      conversation.boardProblem.tex before the turn
 * @param {string|null} p.lastBoardAction
 * @param {object|null} p.ledger      conversation.boardLedger before the turn
 * @param {string|null} [p.tutorText] the tutor's reply, as the student sees it
 * @param {Date}   [p.now]
 * @param {Function} [p.assistanceFor] commands → §12 assistance level
 * @param {object|null} [p.sourceRef]
 * @returns {{ commands, lastBoardAction, pin: ('keep'|{tex}|null), ledger, events }}
 *   pin: 'keep' = untouched, null = drop it, {tex} = pin this problem.
 */
// Math as bare characters, so "\\(x^{2}\\) - 5x" and "x^2-5x" compare equal.
const bare = (text) => String(text == null ? '' : text)
  .replace(/\\[()[\]]|\$/g, '')
  .replace(/\\(?:left|right|,|;|!)/g, '')
  .replace(/\\cdot|\\times/g, '*')
  .replace(/\\(?=[a-zA-Z])/g, '')
  .replace(/[{}\s]/g, '')
  .toLowerCase();
const states = (text, tex) => { const t = bare(tex); return t.length > 0 && bare(text).includes(t); };

// How a tutor brings in a problem that is NOT the student's: a parallel
// example to model the move on, before handing their own problem back.
const EXAMPLE_FRAMING = /\b(?:parallel|similar|example|easier|simpler|smaller\s+numbers|warm[-\s]?up|practice\s+(?:one|version)|like\s+(?:this|yours))\b/i;

/**
 * One problem in focus, and it is the student's.
 *
 * Two ways a turn used to replace it without the student asking (both live,
 * 2026-11-26, each sealing the real problem "Not finished yet"):
 *   - the tutor's PARALLEL EXAMPLE was posed as the problem. The board then
 *     held x^2-3x-10=0 while the student solved x^2-5x-14=0, and their correct
 *     roots were graded against the example;
 *   - a second pose in the same turn that nobody wrote — "2(x + 3) = 14"
 *     beside the student's "3(x-4) = 2x + 5".
 * A pose survives when the student stated it, or when it is the only pose and
 * nothing marks it as an example. A parallel example becomes the read-only
 * `example` card it is; an ungrounded extra is dropped.
 */
function keepTheStudentsProblem(cmds, { message, tutorText, focusOpen }) {
  const poses = cmds.filter(c => c && c.action === 'pose' && c.tex);
  if (poses.length === 0) return { commands: cmds, examples: [], dropped: [] };
  const examples = [];
  const dropped = [];
  const byStudent = poses.filter(p => states(message, p.tex));
  const framedAsExample = typeof tutorText === 'string' && EXAMPLE_FRAMING.test(tutorText);
  const out = [];
  for (const c of cmds) {
    if (!c || c.action !== 'pose' || !c.tex) { out.push(c); continue; }
    if (byStudent.includes(c)) { out.push(c); continue; }
    const inTutorText = states(tutorText, c.tex);
    // A problem is open, the student did not bring this one, and the tutor
    // introduces it as an example: it illustrates, it does not replace.
    if (focusOpen && byStudent.length === 0 && inTutorText && framedAsExample) {
      examples.push(c.tex);
      out.push({ ...c, action: 'example' });
      continue;
    }
    // More than one new problem in a turn: the student's wins, and one that
    // appears in nobody's words is not a problem anyone posed.
    if (poses.length > 1 && (byStudent.length > 0 || !inTutorText)) {
      dropped.push(c.tex);
      continue;
    }
    out.push(c);
  }
  // A `clear` that only existed to make room for a pose that is gone.
  const stillPoses = out.some(c => c && c.action === 'pose');
  const commands = stillPoses ? out : out.filter(c => !(c && c.action === 'clear'));
  return { commands, examples, dropped };
}

/**
 * FILL-INS ARE RETIRED (owner 2026-11-28; the why is beside
 * MODEL_BOARD_ACTIONS in boardResponseSchema.js). No prompt offers a
 * `scaffold` card any more; this is the backstop for one that arrives anyway
 * — an old habit of the model's, a cached prompt, the synthesizer. Dropped
 * whole: a fill-in with its box removed is a half-written step the student
 * did not write.
 */
function dropFillIns(commands) {
  const list = Array.isArray(commands) ? commands : [];
  const kept = list.filter(c => !(c && c.action === 'scaffold'));
  return { commands: kept, dropped: list.length - kept.length };
}

function settleBoardTurn({
  commands, message = '', pinTex = null, lastBoardAction = null, ledger = null,
  now = new Date(), assistanceFor = null, sourceRef = null, tutorText = null,
} = {}) {
  let cmds = dropFillIns(commands).commands;
  const events = { demoted: [], promoted: [], answerPoses: [], scratchDropped: [], folded: [], autoCleared: false, examples: [], ungroundedPoses: [] };

  // 0. The problem in focus is the student's (see keepTheStudentsProblem).
  const focusOpen = !!pinTex && lastBoardAction !== 'verify' && lastBoardAction !== 'clear';
  const kept = keepTheStudentsProblem(cmds, { message, tutorText, focusOpen });
  cmds = kept.commands;
  events.examples = kept.examples;
  events.ungroundedPoses = kept.dropped;

  const demote = demoteNonAnswerVerifies(cmds);
  cmds = demote.commands;
  events.demoted = demote.demoted;

  // 1b. …and its mirror: the answer to the problem in focus closes the card
  // even when it arrived as a plain line, and is never posed as a problem.
  const focusTex = (ledger && ledger.current && ledger.current.problemTex) || pinTex || null;
  const answerPose = dropAnswerPoses(cmds, { ledger, pinTex });
  cmds = answerPose.commands;
  events.answerPoses = answerPose.dropped;
  const promote = promoteAnswerResolves(cmds, focusTex);
  cmds = promote.commands;
  events.promoted = promote.promoted;

  if (cmds.some(c => c && c.action === 'pose')) {
    const scratch = dropScratchFragmentPoses(cmds, message);
    cmds = scratch.kept;
    events.scratchDropped = scratch.dropped;
  }

  const fold = foldRestatedPoses(cmds, { ledger, pinTex, startOver: hasStartOverIntent(message) });
  cmds = fold.commands;
  events.folded = fold.folded;

  const beforeLen = cmds.length;
  cmds = synthesizeAutoClear({ commands: cmds, previousProblemTex: pinTex });
  events.autoCleared = cmds.length > beforeLen;

  // Read-only `example` cards are teaching aids, not moves in the solve
  // cycle — they never advance lastBoardAction or touch the pin.
  let nextLast = lastBoardAction;
  let pin = 'keep';
  const cycleCards = cmds.filter(c => c && c.action !== 'example');
  if (cycleCards.length > 0) {
    nextLast = cycleCards[cycleCards.length - 1].action;
    const poseCard = [...cycleCards].reverse().find(c => c.action === 'pose');
    if (poseCard && poseCard.tex) pin = { tex: poseCard.tex };
    else if (nextLast === 'verify' || nextLast === 'clear') pin = null;
  }

  let nextLedger = ledger;
  if (cmds.length > 0) {
    const assistance = typeof assistanceFor === 'function' ? assistanceFor(cmds) : null;
    nextLedger = applyTurnToLedger(ledger, cmds, now, { assistance, sourceRef });
  }

  return { commands: cmds, lastBoardAction: nextLast, pin, ledger: nextLedger, events };
}

module.exports = { settleBoardTurn, dropFillIns };
