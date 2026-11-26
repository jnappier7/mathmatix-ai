/**
 * The pose-time answer key: what persist stamps on a tutor message as
 * `problemInfo`, and what diagnose reads back on the next turn.
 *
 * One function, so persist and the verdict eval stamp the same way — the eval
 * replays whole sessions, and a session's bad verdicts often start HERE, when
 * the stamp keys something other than what the tutor asked.
 *
 * A key is only a key when the solved math is what the tutor ASKED for. Owner
 * session, 2026-11-25: "what is \(\frac{1}{3}\) of \(24\)?" was stamped as
 * the evaluation 1/3 = 0.3333 and the student's correct "16" was rejected
 * against it. Math a turn merely mentions gets no stamp at all — it can neither
 * reject a right answer nor confirm a wrong one. See asksForKey.
 *
 * @module utils/pipeline/poseStamp
 */

const { parseCleanProblem } = require('../mathSolver');

const INLINE_MATH = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;

/** The math spans a tutor message carries, in order: { body, start, end }. */
function mathSpans(text) {
  const out = [];
  const src = String(text || '');
  let m;
  INLINE_MATH.lastIndex = 0;
  while ((m = INLINE_MATH.exec(src)) !== null) {
    const body = (m[1] || m[2] || m[3] || '').trim();
    if (body) out.push({ body, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const flat = (s) => String(s == null ? '' : s).replace(/\s+/g, '');
const NUMBER = /^-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?$/;
const BARE_VARIABLE = /^[a-z]$/i;

// "x = 17": a solution being stated, not an equation being posed. The solver
// reads it as the linear equation it technically is and keys the turn to 17.
function isStatedSolution(parsed) {
  const p = parsed && parsed.problem;
  if (!p || p.type !== 'general_linear') return false;
  const l = String(p.leftExpr == null ? '' : p.leftExpr).trim();
  const r = String(p.rightExpr == null ? '' : p.rightExpr).trim();
  return (BARE_VARIABLE.test(l) && NUMBER.test(r)) || (BARE_VARIABLE.test(r) && NUMBER.test(l));
}

// The spans the key was solved from: those whose own solve gives the key.
function sourceSpans(spans, parsed) {
  const key = flat(parsed.solution.answer);
  const out = [];
  spans.forEach((span, i) => {
    try {
      const p = parseCleanProblem(span.body);
      if (p.hasMath && p.solution && p.solution.success && flat(p.solution.answer) === key) out.push(i);
    } catch (_) { /* not this one */ }
  });
  return out;
}

// After the keyed math closes its clause, does the tutor go on to ask something
// with math of its own? "…\(x^2-5x-6=0\): what two numbers multiply to \(-6\)
// and add to \(-5\)?" — that question is what the student answers, and the
// equation's roots are not its key. A generic follow-on ("What is \(x\)?",
// "What do you get?") carries no math of its own and leaves the key standing.
function asksSomethingElseAfter(text, end) {
  const tail = String(text).slice(end);
  const closed = tail.match(/^\s*[:;.!?]/);
  if (!closed) return false;
  const rest = tail.slice(closed[0].length);
  return rest.split(/(?<=[.!?])\s+/).some((sentence) => {
    if (!sentence.includes('?')) return false;
    const own = mathSpans(sentence).filter((s) => !BARE_VARIABLE.test(s.body));
    return own.length > 0 || /\d/.test(sentence.replace(INLINE_MATH, ' '));
  });
}

/**
 * Is the solved math what the tutor is ASKING for — so that its answer is the
 * key to the student's reply — or only something the turn mentions?
 *
 * Three ways it is only mentioned, each seen live on 2026-11-25:
 *   - a stated solution ("Yes, \(x=17\) is correct. Can you tell me the move…");
 *   - an evaluation lifted out of a longer ask: "evaluate" is just what the
 *     catch-all does to any number it finds, so a lone value is a key only when
 *     it is the one piece of math in the message ("\(\frac{1}{3}\) of \(24\)"
 *     keyed 0.3333; "change \(\frac{3}{4}\) … numerator \(3\)" keyed 0.75);
 *   - context for a different question that follows it (a parallel example's
 *     equation, a factorization the student is asked to check).
 *
 * When the source cannot be located (plain text, or a problem spread across
 * several spans) there is nothing to judge by and the key stands, as before.
 */
function asksForKey(text, parsed) {
  if (!parsed || !parsed.problem || !parsed.solution) return false;
  if (isStatedSolution(parsed)) return false;
  const spans = mathSpans(text);
  const src = sourceSpans(spans, parsed);
  if (src.length === 0) return true;
  if (parsed.problem.type === 'evaluation') {
    const own = flat(spans[src[0]].body);
    if (spans.some((s, i) => !src.includes(i) && flat(s.body) !== own)) return false;
  }
  return !asksSomethingElseAfter(text, spans[src[src.length - 1]].end);
}

/**
 * @param {string} responseText  the tutor's reply as stored
 * @returns {{ info: {type: string, correctAnswer: string, roots?: number[]}, parsed: Object } | null}
 *   null when nothing solves, or when what solves is not what the turn asks.
 */
function solverStampFor(responseText) {
  const parsed = parseCleanProblem(responseText);
  if (!parsed.hasMath || !parsed.solution || !parsed.solution.success) return null;
  if (!asksForKey(responseText, parsed)) return null;
  const info = {
    type: parsed.problem.type,
    correctAnswer: String(parsed.solution.answer),
    ...(Array.isArray(parsed.solution.roots) && parsed.solution.roots.length > 1
      ? { roots: parsed.solution.roots }
      : {}),
  };
  return { info, parsed };
}

/**
 * A stored stamp that keys math its turn only mentions — one written before
 * asksForKey existed. Judged by re-running the solve persist ran: when that
 * reproduces the stamp and the turn does not ask for it, diagnose disowns the
 * stamp. A stamp this cannot reproduce is left alone.
 */
function stampIsMention(text, stampedAnswer) {
  if (typeof text !== 'string' || !text || stampedAnswer == null) return false;
  try {
    const parsed = parseCleanProblem(text);
    if (!parsed.hasMath || !parsed.solution || !parsed.solution.success) return false;
    if (flat(parsed.solution.answer) !== flat(stampedAnswer)) return false;
    return !asksForKey(text, parsed);
  } catch (_) {
    return false;
  }
}

module.exports = { solverStampFor, asksForKey, stampIsMention, mathSpans };
