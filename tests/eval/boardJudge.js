/**
 * BOARD-TAG INTEGRITY JUDGE — deterministic, keyless. Runs every generated
 * tutor reply through the REAL board pipeline pieces the production server
 * uses (utils/boardTagParser → utils/boardResponseSchema.normalizeBoardCommand
 * → utils/boardCommandGuard.enforcePedagogyRule) and reports two failure
 * classes as judge violations:
 *
 *   deadBoardTag  — the tutor wrote a <BOARD> tag the parser/schema rejects
 *                   (bad action, missing required attribute, tex that
 *                   sanitizes away to nothing). The tag is stripped from the
 *                   visible text, so the student sees NOTHING where the tutor
 *                   believes a card landed.
 *   ghostBoardStep — the tag parses but the pedagogy guard drops it: an
 *                   apply/resolve/verify that doesn't trace to the student's
 *                   words (the anti-cheat #1 rule), a scaffold with no blank
 *                   or a leaked result, a clear with no start-over signal.
 *                   Same desync: the tutor believes it wrote the board and
 *                   keeps narrating work the student never sees.
 *
 * This is NOT a mock of the guard — it IS the guard. If a card is dropped
 * here it is dropped in production, so a violation is a real "the board the
 * tutor imagines diverges from the board the student sees" defect.
 *
 * Wired automatically by runner.js on every reply a model generates (mock or
 * live); no scenario opt-in needed, because any reply anywhere can carry tags.
 */

'use strict';

const { parseBoardTags } = require('../../utils/boardTagParser');
const { normalizeBoardCommand } = require('../../utils/boardResponseSchema');
const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

// Required payload field per action after normalization — mirrors the tag
// protocol in promptCompact.js. A pose without tex or a graph without fn is a
// card the client cannot render.
const REQUIRED_FIELD = {
  pose: 'tex', resolve: 'tex', verify: 'tex', scaffold: 'tex', example: 'tex',
  apply: 'op', graph: 'fn', image: 'query',
};

function describeCommand(cmd) {
  const payload = cmd.tex || cmd.op || cmd.fn || cmd.query || cmd.model || '';
  return payload ? `${cmd.action} "${String(payload).slice(0, 80)}"` : cmd.action;
}

/**
 * @param {string} reply - RAW model output (tags still inline)
 * @param {object} ctx
 * @param {string}   ctx.studentMessage      the student's message this turn
 * @param {Array<{role,content}>} [ctx.priorUserMessages] earlier student turns
 *        (most recent last) — the guard reads the immediate predecessor so a
 *        "yes, do it" confirmation still licenses the stated move.
 * @param {string|null} [ctx.lastBoardAction] last board action in the
 *        conversation, when the scenario tracks it (null otherwise).
 * @returns {{ violations: Array<{judge, evidence}>, commands: Array }}
 */
function judgeBoardIntegrity(reply, ctx = {}) {
  const violations = [];
  const text = String(reply || '');
  const rawTagCount = (text.match(/<BOARD\b/gi) || []).length;
  if (rawTagCount === 0) return { violations, commands: [], cleanedText: text };

  const { cleanedText, boardCommands } = parseBoardTags(text);

  // Parser layer: a tag the permissive parser itself refuses (invalid action,
  // missing tex/op/fn/query) is stripped from the text and emits nothing.
  if (boardCommands.length < rawTagCount) {
    violations.push({
      judge: 'deadBoardTag',
      evidence: `${rawTagCount - boardCommands.length} of ${rawTagCount} <BOARD> tags failed to parse (invalid action or missing required attribute) — the student sees nothing where the tutor believes a card landed`,
    });
  }

  // Schema layer: normalizeBoardCommand is what the structured path runs;
  // it also strips tex that sanitizes away (dangling backslashes etc.).
  const commands = [];
  for (const cmd of boardCommands) {
    const norm = normalizeBoardCommand(cmd);
    const need = norm && REQUIRED_FIELD[norm.action];
    if (!norm || (need && !norm[need])) {
      violations.push({
        judge: 'deadBoardTag',
        evidence: `schema-invalid board command (${describeCommand(cmd)}) — renders as a dead card`,
      });
      continue;
    }
    commands.push(norm);
  }

  // Guard layer: the real anti-cheat rule, with the same ctx production
  // passes (cleaned reply text, current + immediately-prior student turns).
  if (commands.length) {
    const { dropped } = enforcePedagogyRule({
      commands,
      userMessage: ctx.studentMessage || '',
      recentUserMessages: ctx.priorUserMessages || [],
      lastBoardActionInConversation: ctx.lastBoardAction || null,
      tutorReplyText: cleanedText || null,
    });
    for (const d of dropped) {
      // CONFIRMED-CORRECT EXEMPTION: when the student's answer this turn was
      // verified correct, production synthesizes the verify card straight
      // from the diagnosis (boardSynthesizer: `diagnosis.isCorrect === true`
      // → verify card), so the board does NOT sit empty even when the
      // model's own recap apply/resolve tags fail the student-text mirror
      // rule. The recap-card habit is documented in personas.json
      // _knownIssues rather than pinned here — the desync we hard-fail is
      // the one production has no backstop for.
      const MIRROR_REASONS = new Set([
        'apply_op_not_in_student_message',
        'resolve_tex_not_in_student_message',
        'verify_tex_not_in_student_message',
      ]);
      if (ctx.studentWasCorrect && MIRROR_REASONS.has(d.reason)) continue;
      violations.push({
        judge: 'ghostBoardStep',
        evidence: `${describeCommand(d.command)} dropped by the pedagogy guard (${d.reason}) — the tutor believes this card is on the student's board, but the server never sends it`,
      });
    }
  }

  return { violations, commands, cleanedText };
}

module.exports = { judgeBoardIntegrity };
