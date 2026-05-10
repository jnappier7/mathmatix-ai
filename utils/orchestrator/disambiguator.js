// utils/orchestrator/disambiguator.js
// Context-keyed disambiguator lookup. Used when the interrupt classifier's
// confidence falls in the 0.55–0.80 band — the soft-pause prompt should
// reflect WHERE in the lesson the student interrupted, not a flat
// "what were you thinking there?".
//
// Lookup is keyed by (phase, mode, lastBoardOpType). Falls back to a
// generic phrase if no specific row applies.

'use strict';

const FALLBACK = 'What were you thinking there?';

// Order matters: more specific rows first. Each row's `match` is checked
// in order; first hit wins.
const TABLE = [
  // ── i-do (teacher demonstration) ──
  { match: { phase: 'i-do', lastOp: 'writeStep' },
    spoken: "What's catching your eye on this step?" },
  { match: { phase: 'i-do', lastOp: 'graph' },
    spoken: 'Something about the picture standing out?' },
  { match: { phase: 'i-do', lastOp: 'unitCircle' },
    spoken: 'What part of the circle are you looking at?' },
  { match: { phase: 'i-do' },
    spoken: 'Want to pause here, or did something land funny?' },

  // ── concept-intro / vocabulary ──
  { match: { phase: 'concept-intro' },
    spoken: 'Is the idea making sense, or is something off?' },
  { match: { phase: 'vocabulary' },
    spoken: 'Want me to use that word a different way?' },

  // ── we-do (collaborative) ──
  { match: { phase: 'we-do', lastOp: 'writeStep' },
    spoken: 'Working it out, or want me to take that step?' },
  { match: { phase: 'we-do' },
    spoken: 'Are you with me, or want to back up a step?' },

  // ── you-do (student turn) ──
  { match: { phase: 'you-do' },
    spoken: 'Want a hint, or are you close?' },

  // ── mastery-check ──
  { match: { phase: 'mastery-check' },
    spoken: 'Is that your answer, or are you still thinking?' },

  // ── prerequisite-review ──
  { match: { phase: 'prerequisite-review' },
    spoken: 'Does this look familiar from before?' },
];

/**
 * Pick a disambiguator phrase given orchestrator state.
 *
 * @param {Object} ctx
 * @param {string} [ctx.phase]
 * @param {string} [ctx.mode]
 * @param {string} [ctx.lastBoardOpType] - 'writeStep' | 'graph' | 'unitCircle' | etc.
 * @returns {string}
 */
function pickDisambiguator(ctx = {}) {
  const phase = ctx.phase || null;
  const mode = ctx.mode || null;
  const lastOp = ctx.lastBoardOpType || null;

  for (const row of TABLE) {
    const m = row.match;
    if (m.phase && m.phase !== phase) continue;
    if (m.mode && m.mode !== mode) continue;
    if (m.lastOp && m.lastOp !== lastOp) continue;
    return row.spoken;
  }
  return FALLBACK;
}

module.exports = { pickDisambiguator, FALLBACK };
