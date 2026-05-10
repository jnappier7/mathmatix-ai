// utils/orchestrator/waitTimer.js
// Escalation ladder for WAIT directives. Runs as a single recursive
// setTimeout chain on the OrchestratorSession; clears immediately on
// any client speech onset (handled by the orchestrator entrypoint, not
// here — this module just schedules and reports).
//
// Default ladder (ms-since-WAIT-entered):
//   15000  — gentle nudge
//   30000  — reprompt
//   60000  — hint rung 1
//   90000  — hint rung 2
//  120000  — abandon
//
// Mastery-check override: cap at 30s, no hint rungs (hints defeat
// assessment). Inconclusive at 30s — caller advances and lets FSRS
// reschedule the item.

'use strict';

const DEFAULT_LADDER = [
  { delayMs: 15000,  kind: 'nudge',
    spoken: 'Take your time. Let me know when you are ready.' },
  { delayMs: 30000,  kind: 'reprompt',
    spoken: null /* caller fills in: rephrase the prompt */ },
  { delayMs: 60000,  kind: 'hint',
    spoken: 'Want a hint? Let me give you a small clue.' },
  { delayMs: 90000,  kind: 'hint',
    spoken: 'Here is another piece — does this help?' },
  { delayMs: 120000, kind: 'abandon',
    spoken: "Let's keep moving — we will come back to this." },
];

const MASTERY_LADDER = [
  { delayMs: 30000, kind: 'abandon',
    spoken: "Let's move on — we will come back to this one." },
];

/**
 * Resolve the ladder for a given segment + phase. Caller-supplied
 * hintLadder overrides defaults; mastery phase always uses the
 * mastery-only ladder regardless of caller spec.
 *
 * @param {import('./types').Segment} segment
 * @param {string} expectedPhase
 * @returns {Array<{delayMs:number, kind:string, spoken:string|null, boardOps?:Array}>}
 */
function resolveLadder(segment, expectedPhase) {
  if (expectedPhase === 'mastery-check') return MASTERY_LADDER;

  const wait = segment?.wait;
  if (wait?.hintLadder?.length) {
    // Caller-supplied — sort ascending by delayMs in case author got it wrong
    return [...wait.hintLadder].sort((a, b) => a.delayMs - b.delayMs);
  }
  if (wait?.timeoutMs) {
    // Caller wanted a custom total timeout — scale the default abandon
    // to match and keep the same shape for the rungs leading up to it.
    return scaleLadderToTimeout(DEFAULT_LADDER, wait.timeoutMs);
  }
  return DEFAULT_LADDER;
}

function scaleLadderToTimeout(ladder, totalMs) {
  const defaultTotal = ladder[ladder.length - 1].delayMs;
  if (!defaultTotal || defaultTotal === totalMs) return ladder;
  const factor = totalMs / defaultTotal;
  return ladder.map(rung => ({ ...rung, delayMs: Math.round(rung.delayMs * factor) }));
}

/**
 * Schedule the ladder. Returns a controller with .cancel() — the caller
 * (orchestrator entry) keeps that handle on the OrchestratorSession.
 *
 * @param {Object} args
 * @param {Array} args.ladder
 * @param {Function} args.onRung    (rung) => void  -- emits the rung action
 * @returns {{cancel: () => void}}
 */
function schedule({ ladder, onRung }) {
  let idx = 0;
  let timer = null;
  let cancelled = false;

  const fireNext = () => {
    if (cancelled || idx >= ladder.length) return;
    const rung = ladder[idx];
    const prevDelay = idx > 0 ? ladder[idx - 1].delayMs : 0;
    const wait = rung.delayMs - prevDelay;
    timer = setTimeout(() => {
      if (cancelled) return;
      try { onRung(rung); } catch (_) { /* swallow handler errors */ }
      idx += 1;
      fireNext();
    }, wait);
    timer.unref?.();
  };
  fireNext();

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

module.exports = {
  resolveLadder,
  schedule,
  DEFAULT_LADDER,
  MASTERY_LADDER,
};
