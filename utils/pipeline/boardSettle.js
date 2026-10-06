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
 *   1. a verify that is not an answer becomes the resolve it is — before the
 *      cycle bookkeeping, or it closes the card and drops the pin;
 *   2. a pose of the student's own scratch arithmetic is dropped;
 *   3. a pose restating the problem in focus folds back into its card;
 *   4. a genuinely new pose gets the `clear` the model forgot;
 *   5. lastBoardAction / the pin follow the surviving cycle cards;
 *   6. the ledger folds the turn (what a reload replays).
 */
'use strict';

const { dropScratchFragmentPoses, synthesizeAutoClear } = require('./boardSynthesizer');
const { demoteNonAnswerVerifies, foldRestatedPoses } = require('./boardContinuity');
const { applyTurnToLedger } = require('./boardLedger');
const { hasStartOverIntent } = require('../boardCommandGuard');

/**
 * @param {object} p
 * @param {Array}  p.commands         the turn's board commands so far
 * @param {string} p.message          the student's message
 * @param {string|null} p.pinTex      conversation.boardProblem.tex before the turn
 * @param {string|null} p.lastBoardAction
 * @param {object|null} p.ledger      conversation.boardLedger before the turn
 * @param {Date}   [p.now]
 * @param {Function} [p.assistanceFor] commands → §12 assistance level
 * @param {object|null} [p.sourceRef]
 * @returns {{ commands, lastBoardAction, pin: ('keep'|{tex}|null), ledger, events }}
 *   pin: 'keep' = untouched, null = drop it, {tex} = pin this problem.
 */
function settleBoardTurn({
  commands, message = '', pinTex = null, lastBoardAction = null, ledger = null,
  now = new Date(), assistanceFor = null, sourceRef = null,
} = {}) {
  let cmds = Array.isArray(commands) ? commands.slice() : [];
  const events = { demoted: [], scratchDropped: [], folded: [], autoCleared: false };

  const demote = demoteNonAnswerVerifies(cmds);
  cmds = demote.commands;
  events.demoted = demote.demoted;

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

module.exports = { settleBoardTurn };
