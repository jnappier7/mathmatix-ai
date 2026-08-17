/**
 * LIVE-TIER PROMPT ASSEMBLY — the half of production's prompt the live evals
 * were missing.
 *
 * Production does NOT hand the model the base system prompt alone. It appends
 * the decide stage's output (utils/pipeline/generate.js → assemblePrompt):
 *
 *     systemPrompt
 *       + phasePrompt
 *       + "--- CURRENT ACTION ---" + buildActionPrompt(decision)
 *
 * and buildActionPrompt is where every ACTION DIRECTIVE lands — the "DRAW IT"
 * ask, the affirm-then-probe ordering, the representation-switch cue, the
 * prerequisite bridge. The live evals sent the base prompt only, so they were
 * scoring a tutor that had been told none of it, and then reporting the gap as
 * a tutor-quality regression: every visual-apt persona failed the nightly from
 * the day the "draw it" directive shipped, because the directive asking for the
 * drawing never reached the model.
 *
 * This calls prod's OWN composer rather than restating it, so the harness can't
 * drift from the pipeline again.
 *
 * Still not mirrored here (deliberate): the verification directive, which the
 * live suites already model their own way via verifiedAnswerHint(), and the
 * mood directive, which no persona exercises.
 */
'use strict';

function withActionBlock(systemPrompt, decision) {
  if (!decision) return systemPrompt;
  // Lazy require: generate.js loads the OpenAI client at module scope, and the
  // keyless tier must never pull that in.
  const { buildActionPrompt } = require('../../utils/pipeline/generate');

  let out = systemPrompt;
  if (decision.phasePrompt) out += '\n\n' + decision.phasePrompt;
  const actionPrompt = buildActionPrompt(decision);
  if (actionPrompt) out += '\n\n--- CURRENT ACTION ---\n' + actionPrompt;
  return out;
}

module.exports = { withActionBlock };
