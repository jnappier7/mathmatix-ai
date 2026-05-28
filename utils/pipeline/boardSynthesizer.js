/* ============================================================
   boardSynthesizer.js — deterministic WorkBoard card emission.

   Why this exists
   ---------------
   The LLM is supposed to emit <BOARD action="…" /> tags inline so
   the WorkBoard panel mirrors the live work. Compliance is
   unreliable: even with strong prompting, the model regularly
   forgets the pose card at the start of a problem, drops the
   verify at the end, and produces only some of the intermediate
   resolve/apply cards.

   The previous safety net (inferWorkspace) only fired when the
   LLM emitted ZERO tags for the turn, and couldn't handle pose
   or verify. That left the most common failure mode — "tutor
   emits one tag mid-problem, board misses bookends" — uncovered.

   This module is the authoritative deterministic emitter. It runs
   every turn, derives the cards that *should* exist from
   pipeline ground truth (math engine + diagnose stage + the
   student's literal text), and the caller merges its output with
   any LLM-emitted tags (LLM wins on duplicates so its phrasing
   is preserved).

   Ground truth, not guesswork
   ---------------------------
   - POSE: triggered when a parseable math problem appears in
     either side of this turn AND there is no active problem on
     the board (lastBoardAction is null|verify|clear).
   - APPLY: student named an operation; tutor affirmed.
   - RESOLVE: student stated an intermediate equation (variable
     still on the LHS); tutor affirmed.
   - VERIFY: student stated the final answer AND the diagnose
     stage's math engine confirms it. The tutor's text is NOT
     consulted — if the math engine says correct, the board
     reflects that even when the tutor's prose hedges (the
     hedging is a separate bug; the board should not propagate
     it).

   The #1 product rule (no answer reveal) is still enforced
   downstream by enforcePedagogyRule. This module's outputs run
   through that guard too — defense in depth.
   ============================================================ */

'use strict';

const { parseCleanProblem } = require('../mathSolver');

// ---------------------------------------------------------------------------
// Detectors — operations, intermediate equations, final answers
// ---------------------------------------------------------------------------

// Verbs/phrases that signal the student is naming an operation to
// apply to both sides. Mirrors boardCommandGuard.OPERATION_KEYWORDS
// so the guard won't drop what we emit. Kept as a flat list of
// regex-friendly tokens we look for inside the message.
const APPLY_KEYWORD_PATTERNS = [
  // arithmetic ops with "both sides"
  /\b(add|adding|added)\b[^.?!]*\bboth\s+sides\b/i,
  /\b(subtract|subtracting|subtracted)\b[^.?!]*\bboth\s+sides\b/i,
  /\b(multiply|multiplying|multiplied|times)\b[^.?!]*\bboth\s+sides\b/i,
  /\b(divide|dividing|divided)\b[^.?!]*\bboth\s+sides\b/i,
  // shorthand: "-3 on both sides", "+5 to both sides"
  /[+\-]\s*\d+(?:\.\d+)?\s*(?:on|to|from)?\s*both\s+sides/i,
  // bare "divide by N" / "multiply by N"
  /\b(divide|multiply)\s+by\s+\S+/i,
  // structural ops
  /\bcombine\s+like\s+terms\b/i,
  /\bdistribute\b/i,
  /\bfactor\s+(?:out\s+)?\S+/i,
  /\bsimplify\b/i,
  /\bisolate\s+\S+/i,
  // Mr. Napier methodology
  /\b(box|opposite|opposites|zero\s+pairs?)\b/i,
];

// "the 3 and the x are side by side so I gotta…" — student named the
// situation but not the operation. We want APPLY to require an
// actual operation verb, not just adjacency talk.
function detectAppliedOperation(studentText) {
  if (!studentText || typeof studentText !== 'string') return null;
  const t = studentText.trim();
  if (t.length === 0 || t.length > 240) return null;
  if (/[?]$/.test(t)) return null; // questions don't apply

  for (const rx of APPLY_KEYWORD_PATTERNS) {
    const m = t.match(rx);
    if (m) {
      // Use the matched phrase as the op text — it traces back to the
      // student's message verbatim, so the pedagogy guard's
      // opMatchesStudentText check is guaranteed to pass.
      return m[0].toLowerCase().trim();
    }
  }
  return null;
}

// "3x = 21", "2x = 16", "y - 4 = 8". Variable still on LHS so it's
// an intermediate step, not a final answer.
const RX_INTERMEDIATE_EQUATION = /(?:^|\s)(-?\d*[a-z](?:\s*[+\-*/]\s*\d+)?)\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)(?=$|[\s.,!?])/i;

// Bare final solution: "x = 7", "y = 2/3".
const RX_FINAL_SOLUTION = /(?:^|\s)([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)(?=$|[\s.,!?])/i;

// "3(7) - 5 = 16", "4(6) + 3 = 27". Both sides arithmetic.
const RX_SUBSTITUTION_CHECK = /(?:^|\s)((?:-?\d+(?:\.\d+)?[\s+\-*/().^]*){2,})\s*=\s*(-?\d+(?:\.\d+)?)(?=$|[\s.,!?])/;

function detectIntermediateEquation(studentText) {
  if (!studentText || typeof studentText !== 'string') return null;
  const t = studentText.trim();
  if (t.length === 0 || t.length > 240) return null;
  if (/[?]$/.test(t)) return null;
  if (/\b(is|does|should|maybe|i\s+think|i\s+guess)\b/i.test(t)) return null;

  // A final solution like "x = 7" matches RX_INTERMEDIATE_EQUATION too
  // when the coefficient is missing — gate it out so verify wins.
  if (RX_FINAL_SOLUTION.test(t)) return null;

  const m = t.match(RX_INTERMEDIATE_EQUATION);
  if (!m) return null;

  const lhs = m[1].trim();
  const rhs = m[2].trim();
  // LHS must contain a letter and a digit-adjacent coefficient or
  // operator, otherwise it's just "x = 7" with whitespace noise.
  if (!/[a-z]/i.test(lhs)) return null;
  if (!/\d|[+\-*/]/.test(lhs)) return null;

  return `${lhs} = ${rhs}`;
}

function detectFinalSolution(studentText) {
  if (!studentText || typeof studentText !== 'string') return null;
  const t = studentText.trim();
  if (t.length === 0 || t.length > 200) return null;
  if (/[?]$/.test(t)) return null;
  if (/\b(is|does|should|maybe|i\s+think|i\s+guess)\b/i.test(t)) return null;

  const m = t.match(RX_FINAL_SOLUTION);
  if (!m) return null;
  return { variable: m[1], value: m[2], tex: `${m[1]} = ${m[2]}` };
}

function detectSubstitutionCheck(studentText) {
  if (!studentText || typeof studentText !== 'string') return null;
  const t = studentText.trim();
  if (t.length === 0 || t.length > 240) return null;
  if (/[?]$/.test(t)) return null;
  // Must not also contain a variable — "3x = 21" is intermediate, not check.
  if (/[a-z]/i.test(t.replace(/[a-z]\s*=/gi, '='))) return null;

  const m = t.match(RX_SUBSTITUTION_CHECK);
  if (!m) return null;
  const lhs = m[1].trim();
  // LHS must contain operators or parens, otherwise it's trivial.
  if (!/[+\-*/().^]/.test(lhs)) return null;
  return `${lhs} = ${m[2].trim()}`;
}

// ---------------------------------------------------------------------------
// Tutor affirmation gate (reused for apply/resolve where math engine
// can't confirm correctness independently). Same conservative bias
// as inferWorkspace.js: any negation signal vetoes.
// ---------------------------------------------------------------------------

const NEGATION_SIGNALS = [
  /\bnot\s+(?:quite|exactly|right|correct|yet)\b/i,
  /\btry\s+(?:again|once more|that again)\b/i,
  /\b(?:actually|but)\b[^.!?]*\b(?:not|isn['’]t|wasn['’]t|wrong|incorrect)\b/i,
  /\blet\s+(?:me|us)\s+(?:show|explain|walk)\b/i,
  /\b(?:close|good\s+attempt|good\s+try)[,!.\s]/i,
  /\bhmm?[,.\s]/i,
  /\bdouble[-\s]check\b/i,
  /\bremember\b[^.!?]*\b(?:that|the\s+rule)\b/i,
  /\bwhat\s+if\b/i,
];

const STRONG_AFFIRM = [
  /\byes[,!.\s]/i,
  /\b(?:exactly|precisely|perfect|spot\s+on|nailed\s+it|you\s+got\s+it|you\s+did\s+it)\b/i,
  /\bthat['’]s\s+(?:right|correct|it|exactly\s+right)\b/i,
  /\b(?:correct|right)\b[!,.\s]/i,
  /\b(?:nice|great|awesome|brilliant)\s+(?:work|job|move|catch|step|reasoning)\b/i,
  /\b(?:woohoo|woo|yay)\b/i,
  /\bclean\s+solution\b/i,
  /\bgood\s+(?:job|work)\b/i,
];

function tutorAffirms(tutorResponse) {
  if (!tutorResponse || typeof tutorResponse !== 'string') return false;
  const t = tutorResponse.trim();
  if (t.length === 0) return false;
  for (const rx of NEGATION_SIGNALS) {
    if (rx.test(t)) return false;
  }
  for (const rx of STRONG_AFFIRM) {
    if (rx.test(t)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Canonical problem text — what goes on the pose card.
// Mirrors persist.js extractCanonicalProblemText for the cases we care
// about (linear equations, arithmetic), but lives here so the
// synthesizer doesn't import from persist (which has DB-touching
// dependencies).
// ---------------------------------------------------------------------------

function canonicalProblemTex(problem) {
  if (!problem) return null;
  switch (problem.type) {
    case 'general_linear':
      // mathSolver returns { leftExpr, rightExpr, ... } for linear
      // equations — no `equation` or `expression` field. Compose
      // from the parsed sides so the tex matches what the student
      // sees.
      if (problem.leftExpr !== undefined && problem.rightExpr !== undefined) {
        return `${problem.leftExpr} = ${problem.rightExpr}`;
      }
      return problem.equation || problem.expression || null;
    case 'quadratic_equation':
      return problem.equation || problem.expression || null;
    case 'expand_polynomial':
    case 'factor_quadratic':
    case 'factor_diff_of_squares':
      return problem.expression || null;
    case 'evaluation':
      // The evaluation type is mathSolver's catch-all when text like
      // "the equation 3x - 5 = 16." doesn't match a more specific
      // pattern. Its `expression` field carries the raw text it
      // grabbed — often including prose. Reject anything that
      // doesn't look like a clean math expression to avoid posting
      // garbage tex on the board.
      if (!problem.expression) return null;
      if (/[a-z]{4,}/i.test(problem.expression)) return null; // prose words
      return problem.expression;
    case 'arithmetic':
      if (problem.left !== undefined && problem.right !== undefined && problem.operator) {
        return `${problem.left} ${problem.operator} ${problem.right}`;
      }
      return null;
    case 'limit':
      if (problem.raw && typeof problem.approachValue === 'number') {
        return `lim x→${problem.approachValue} of ${problem.raw}`;
      }
      return problem.raw || null;
    default:
      // Same prose-rejection rule as the evaluation case: only let
      // through fields that look like real math expressions.
      // eslint-disable-next-line no-case-declarations
      const candidate = problem.expression || problem.equation || problem.raw;
      if (!candidate) return null;
      if (/[a-z]{4,}/i.test(candidate)) return null;
      return candidate;
  }
}

function detectPosedProblem(text) {
  if (!text || typeof text !== 'string') return null;
  // Bound the input — tutor messages can run long and we don't want
  // to scan multi-paragraph recaps. The first 600 chars cover any
  // realistic "Solve …" intro line.
  const sample = text.slice(0, 600);
  // parseCleanProblem handles whole-string parsing, prose rejection,
  // and math-substring extraction internally.
  const result = parseCleanProblem(sample);
  if (!result.hasMath || !result.solution?.success) return null;
  const tex = canonicalProblemTex(result.problem);
  if (!tex) return null;
  return { tex, problem: result.problem, correctAnswer: String(result.solution.answer) };
}

// ---------------------------------------------------------------------------
// Geometry pose fallback — when parseCleanProblem can't see a problem.
//
// Why this exists: parseCleanProblem only recognizes equation-shaped
// math (general_linear, quadratic, factor, arithmetic, evaluation,
// limit). Geometry word problems — triangle congruence, circle area,
// equation-of-a-circle, similar-triangle ratios — come in as prose
// with concrete numbers and never parse, so the algebra-side pose
// detector returns null and the board sits empty for an entire
// geometry session.
//
// Strategy: detect that the tutor is *posing* a geometry problem
// (geometry vocab + problem-framing cue + at least one digit), then
// quote the question sentence verbatim into the pose tex. Verbatim
// quotation is ground truth — no guessing about what the problem
// means. KaTeX renders `\text{...}` as serif prose; if the
// sanitized sentence fails to parse the workspace falls back to
// textContent (see public/js/workspace.js:42).
// ---------------------------------------------------------------------------

const GEOMETRY_VOCAB = /\b(triangles?|circles?|angles?|radius|diameter|circumference|hypotenuse|polygons?|quadrilaterals?|parallelograms?|rectangles?|trapezoids?|pentagons?|hexagons?|perimeters?|congruent|similar|parallel|perpendicular|bisectors?|midpoints?|chords?|tangents?|secants?|arcs?|sectors?|(?:vertex|vertices)|legs?|diagonals?|altitudes?|medians?|centroids?|equation\s+of\s+(?:a|the)\s+circle)\b/i;

// "Question:", "Here's one", "What is …", "Find …", "Convert …",
// etc. Conservative — bare statements without a cue don't fire so
// concept explanations stay off the board.
const PROBLEM_CUE = /\b(question\s*:|here'?s\s+(?:a|one|another)|try\s+(?:this|one|the\s+following)|let'?s\s+try|what\s+(?:is|are|'?s)\b|find\s+(?:the|how|out)\b|calculate\b|determine\b|convert\b|how\s+(?:many|long|wide|much|tall|far)\b|solve\s+for\b)/i;

function extractProblemSentence(text) {
  // Prefer an explicit "Question:" marker — covers Maya's review-mode
  // formatting ("Question: Triangle ABC is congruent to …").
  const qMark = text.match(/Question\s*:\s*([\s\S]+?)(?:\n\n|$)/i);
  let body = qMark ? qMark[1] : text;
  body = body.trim();

  // Split into sentence units. The lookbehind keeps the terminator
  // on the preceding sentence so we can find the one ending in '?'.
  const sentences = body.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const qIdx = sentences.findIndex(s => /\?\s*$/.test(s));
  if (qIdx === -1) return null;

  // Include up to two preceding setup sentences (the parameters) so
  // the pose card shows the full problem, not just the bare ask.
  const start = Math.max(0, qIdx - 2);
  const chunk = sentences.slice(start, qIdx + 1).join(' ').trim();
  if (chunk.length < 12 || chunk.length > 320) return null;
  return chunk;
}

// KaTeX \text{...} treats most prose as literal, but a handful of
// characters need neutralizing to avoid throwing.
function sentenceToTex(sentence) {
  const safe = sentence
    .replace(/\\/g, ' ')
    .replace(/[${}#%&_^]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return `\\text{${safe}}`;
}

function detectGeometryProblem(tutorText) {
  if (!tutorText || typeof tutorText !== 'string') return null;
  const sample = tutorText.slice(0, 800);
  if (!GEOMETRY_VOCAB.test(sample)) return null;
  if (!PROBLEM_CUE.test(sample)) return null;
  // Concept explanations don't carry concrete numbers; a posed
  // problem nearly always does. This filter cheaply rules out
  // "Triangles have three angles" style narration.
  if (!/\d/.test(sample)) return null;

  const sentence = extractProblemSentence(sample);
  if (!sentence) return null;
  // Re-check vocab on the extracted chunk so we don't quote a
  // generic question from a tutor recap whose geometry vocab lived
  // in a different paragraph.
  if (!GEOMETRY_VOCAB.test(sentence)) return null;

  return { tex: sentenceToTex(sentence), sentence };
}

// ---------------------------------------------------------------------------
// Dedupe — does an LLM-emitted command already cover this synthesized one?
// ---------------------------------------------------------------------------

function normalizeForCompare(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().replace(/\s+/g, '').replace(/[\\${}()[\]]/g, '');
}

function commandsOverlap(a, b) {
  if (!a || !b || a.action !== b.action) return false;
  if (a.action === 'apply') {
    return normalizeForCompare(a.op) === normalizeForCompare(b.op);
  }
  // pose / resolve / verify all key on tex
  return normalizeForCompare(a.tex) === normalizeForCompare(b.tex);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Synthesize the board commands this turn should emit, based on
 * pipeline ground truth.
 *
 * @param {object} params
 * @param {string} params.studentMessage   incoming student text
 * @param {string} params.tutorResponse    tutor's reply (post-tag-strip)
 * @param {object} params.diagnosis        diagnose-stage output
 * @param {object} params.observation      observe-stage output
 * @param {string|null} params.lastBoardAction
 * @param {Array} [params.recentAssistantMessages] not used yet; kept
 *        so callers can pass it without breaking when we extend later.
 * @returns {Array<{action:string, tex?:string, op?:string, check?:string}>}
 */
function synthesizeBoardCommands({
  studentMessage,
  tutorResponse,
  diagnosis,
  observation,
  lastBoardAction = null,
  recentAssistantMessages: _recentAssistantMessages = [], // eslint-disable-line no-unused-vars
} = {}) {
  const cards = [];

  const cycleIsClosed = !lastBoardAction
    || lastBoardAction === 'verify'
    || lastBoardAction === 'clear';

  // ── 1. POSE ──
  // A new problem can appear on either side of the turn:
  //   - student bare-drops "solve 3x-5=16"
  //   - tutor offers "Try 4x+3=27"
  // The math engine is the source of truth: if it parses a problem
  // out of the text AND there's no active problem on the board, emit
  // pose.
  if (cycleIsClosed) {
    // Prefer the student's message — if they introduced the problem,
    // the canonical text matches what they typed. Fall back to tutor.
    let posed = detectPosedProblem(studentMessage);
    if (!posed) posed = detectPosedProblem(tutorResponse);
    // Geometry word problems don't parse as algebra; quote the
    // tutor's question sentence verbatim so the board reflects the
    // problem the student is looking at.
    if (!posed) {
      const geo = detectGeometryProblem(tutorResponse);
      if (geo) posed = { tex: geo.tex };
    }
    if (posed) {
      cards.push({ action: 'pose', tex: posed.tex });
    }
  }

  // After a pose this turn, downstream steps below should treat the
  // active cycle as "open" — but the lastBoardAction param reflects
  // the START of the turn, not after our synthesized pose. Track an
  // effective state so apply/resolve don't get suppressed.
  const effectiveLastAction = cards.some(c => c.action === 'pose')
    ? 'pose'
    : lastBoardAction;

  // Skip the rest of the rules when the board has no active problem
  // (e.g. small talk turns) — apply/resolve only make sense within
  // an open problem.
  const cycleOpen = effectiveLastAction
    && effectiveLastAction !== 'verify'
    && effectiveLastAction !== 'clear';

  if (!cycleOpen) {
    return cards;
  }

  // ── 2. APPLY ──
  // Student named an operation AND tutor affirmed. We deliberately
  // do NOT emit apply on the same turn as a pose — when the student
  // bare-drops "solve 3x-5=16" they haven't applied anything yet.
  if (effectiveLastAction !== 'pose' || lastBoardAction !== null) {
    const op = detectAppliedOperation(studentMessage);
    if (op && tutorAffirms(tutorResponse)) {
      cards.push({ action: 'apply', op });
    }
  }

  // ── 3. VERIFY ──
  // Two paths to a verify card:
  //   (a) student stated the final solution AND diagnose's math
  //       engine confirms correct (isCorrect === true). The tutor's
  //       prose is NOT consulted — if the engine says right, the
  //       board reflects truth even when the tutor hedges.
  //   (b) student stated a substitution check ("3(7) - 5 = 16")
  //       AND the prior board action shows we're verifying a known
  //       solution. Tutor must affirm (no math engine in the loop
  //       for arbitrary substitution math).
  const finalSol = detectFinalSolution(studentMessage);
  if (finalSol && diagnosis?.isCorrect === true) {
    const card = { action: 'verify', tex: finalSol.tex };
    cards.push(card);
  } else {
    const subCheck = detectSubstitutionCheck(studentMessage);
    if (subCheck && tutorAffirms(tutorResponse)) {
      // We don't have the solution tex without conversation state;
      // emit verify keyed on the check expression. The board renders
      // verify cards that show the substitution as the proof of work.
      cards.push({ action: 'verify', tex: subCheck });
    }
  }

  // ── 4. RESOLVE ──
  // Student stated an intermediate equation AND tutor affirmed.
  // Skip if we already emitted a verify this turn (verify wins —
  // the work is done; no point posting an extra resolve).
  if (!cards.some(c => c.action === 'verify')) {
    const eq = detectIntermediateEquation(studentMessage);
    if (eq && tutorAffirms(tutorResponse)) {
      cards.push({ action: 'resolve', tex: eq });
    }
  }

  return cards;
}

/**
 * Merge synthesized cards with the LLM-emitted ones. LLM wins on
 * overlap so its phrasing (which may carry the model's wording for
 * the apply op string, etc.) is preserved.
 *
 * @returns {{added:Array, kept:Array, all:Array}}
 *   added — synthesized cards we appended
 *   kept  — LLM cards already present
 *   all   — final ordered list (pose → apply → resolve → verify),
 *           which is what should be sent to the client.
 */
function mergeWithLlmCommands(llmCommands, synthesized) {
  const llm = Array.isArray(llmCommands) ? llmCommands : [];
  const synth = Array.isArray(synthesized) ? synthesized : [];

  const added = [];
  for (const s of synth) {
    if (!llm.some(l => commandsOverlap(l, s))) {
      added.push(s);
    }
  }

  // Order by canonical sequence — the frontend renders in array
  // order, so pose-first / verify-last produces the cleanest
  // animation when both LLM and synthesizer fire in the same turn.
  const ORDER = { pose: 0, apply: 1, resolve: 2, verify: 3, clear: 4, graph: 5, image: 6 };
  const all = [...llm, ...added].sort((a, b) => {
    const ai = ORDER[a.action] ?? 99;
    const bi = ORDER[b.action] ?? 99;
    return ai - bi;
  });

  return { added, kept: llm, all };
}

module.exports = {
  synthesizeBoardCommands,
  mergeWithLlmCommands,
  // Exposed for tests
  _detectAppliedOperation: detectAppliedOperation,
  _detectIntermediateEquation: detectIntermediateEquation,
  _detectFinalSolution: detectFinalSolution,
  _detectSubstitutionCheck: detectSubstitutionCheck,
  _detectPosedProblem: detectPosedProblem,
  _detectGeometryProblem: detectGeometryProblem,
  _extractProblemSentence: extractProblemSentence,
  _sentenceToTex: sentenceToTex,
  _tutorAffirms: tutorAffirms,
  _commandsOverlap: commandsOverlap,
};
