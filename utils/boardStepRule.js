/**
 * boardStepRule.js — when the tutor may write a step line (a `resolve`) on the
 * Work Board. ONE wording, used by every prompt that drives the board (inline
 * tags, structured output, the update_board tool, the Board-LLM translator),
 * so the model is never told something the guard does not enforce.
 *
 * The rule itself is enforced in utils/boardCommandGuard.js
 * (lineFromStudentAndBoard, landsNamedMove) — change both together.
 */
'use strict';

const RESOLVE_RULE = 'the line the work is now on, written as a WHOLE line (both sides). '
  + 'Emit it (a) when the student gave the result — if they gave only the side that changed ("6x + 7"), '
  + 'complete the line with the untouched side from the board ("6x + 7 = 2x + 31"); or (b) when the student '
  + 'NAMED the move ("distribute the 3", "combine like terms", "subtract 2x from both sides") and you are '
  + 'telling them where it lands — one line per move, and not when you are asking them to work it out. '
  + 'NEVER the final answer ("x = 6"): the student states that.';

const MIRROR_RULE = 'The board follows the STUDENT\'s work: never emit an apply or resolve for a move the '
  + 'student has neither made nor named, never more than one new line per move, and never the answer.';

module.exports = { RESOLVE_RULE, MIRROR_RULE };
