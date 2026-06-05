/**
 * Visual Gate — the conceptual-visual safety + value layer.
 *
 * The board system already makes *procedural* visuals safe: pose/apply/
 * resolve/verify/scaffold are synthesized from ground truth and filtered by
 * boardCommandGuard.enforcePedagogyRule (the #1 no-cheating rule). But
 * `graph` and `image` deliberately bypass that student-text gate — they're
 * teaching aids, not echoes of the student's work. That exemption has a hole:
 * a graph of the student's OWN unsolved function leaks the answer geometrically
 * (a parabola visibly crossing at x=2 and x=3 *is* the roots), and the guard
 * can't catch it because graph only checks that `fn` exists.
 *
 * This module closes that hole. It splits along the correct axis:
 *
 *   SAFETY (does it reveal the answer?) — DETERMINISTIC. Never an LLM.
 *     We already compute the active problem's answer (boardSynthesizer ->
 *     correctAnswer via mathSolver), so leak detection is real math: solve the
 *     proposed `fn = 0`, and block if its roots intersect the known solution
 *     set, or if the expression is literally the active problem.
 *
 *   VALUE (does it earn its place?) — LLM JUDGE. Low stakes.
 *     "Does this expose structure / reduce cognitive load?" is a taste call.
 *     Worst case if wrong: a slightly decorative graph slips through. The LLM
 *     never gets a vote on safety — only on whether a *safe* visual is worth it.
 *
 * Doctrine: procedural visuals must be EARNED; conceptual visuals must be SAFE;
 * no visual may complete the student's task.
 *
 * The gate is pure/synchronous for the safety path and returns a structured
 * record for the caller to log — it does no DB IO and never calls user.save()
 * (the caller owns persistence, same contract as utils/problemTracking).
 *
 * @module utils/visualGate
 */

const { parseCleanProblem } = require('./mathSolver');
const { contentHash, wasRecentlyShown } = require('./problemTracking');

// Modes form an audit-first ladder, matching the structured-tutor-response
// rollout convention (shadow/measure before enforce).
const MODES = Object.freeze({
  OFF: 'off',                       // gate disabled; pass through untouched
  SHADOW: 'shadow',                 // evaluate + log, never affect render
  AUDIT_ONLY: 'audit_only',         // evaluate + log, never render experimental
  LIVE_CONTROL: 'live_control',     // block leaks; do NOT transform
  LIVE_EXPERIMENTAL: 'live_experimental', // block leaks; transform when possible
});

const NUM_TOLERANCE = 1e-6;

// Query terms that signal an image search is fishing for the worked answer
// rather than a concept anchor.
const ANSWER_SEEKING_TERMS = [
  'answer', 'solved', 'solution', 'worked', 'step by step', 'step-by-step',
  'how to solve', 'calculator result', 'final answer',
];

// ---------------------------------------------------------------------------
// Expression normalization + numeric extraction (deterministic helpers)
// ---------------------------------------------------------------------------

/**
 * Normalize a function/expression string so cosmetic differences don't hide an
 * identity match: strip a leading "y =" / "f(x) =", drop whitespace, lowercase,
 * fold unicode superscripts to ^N, and unify "**" -> "^".
 * @param {string} s
 * @returns {string}
 */
function normalizeExpr(s) {
  if (s === null || s === undefined) return '';
  let out = String(s);
  out = out
    .replace(/⁰/g, '^0').replace(/¹/g, '^1').replace(/²/g, '^2')
    .replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5')
    .replace(/⁶/g, '^6').replace(/⁷/g, '^7').replace(/⁸/g, '^8')
    .replace(/⁹/g, '^9');
  out = out.replace(/\*\*/g, '^');
  // Strip a single leading assignment to the dependent variable ("y=", "f(x)=").
  out = out.replace(/^\s*(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\))\s*=\s*/i, '');
  return out.replace(/\s+/g, '').toLowerCase();
}

/**
 * Pull the numeric solution values out of an answer string like
 * "x = 2 or x = 3" -> [2, 3], "x = -4" -> [-4], "x = 1.5, y = 2" -> [1.5, 2].
 * Returns [] when the answer is non-numeric ("No real solutions",
 * "All real numbers", etc.) — those can't be leaked by a coordinate.
 * @param {string} answer
 * @returns {number[]}
 */
function extractNumbers(answer) {
  if (!answer || typeof answer !== 'string') return [];
  // Skip qualitative answers entirely — a graph can't reveal "no solution".
  if (/no\s+(real\s+)?solution|all\s+real|infinitely\s+many|undefined|identity|contradiction/i.test(answer)) {
    return [];
  }
  const matches = answer.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Compute the values a graph of `fn` would visibly reveal — primarily its real
 * roots (x-intercepts), by solving "fn = 0" with the existing deterministic
 * solver. These are the coordinates a student could read straight off the
 * curve. Returns [] when the function can't be solved to discrete real values
 * (in which case there's nothing numeric to leak).
 *
 * NOTE: covers roots/x-intercepts, which is the dominant leak surface
 * ("find the roots/zeros/x-intercepts of f"). Vertex/y-intercept/intersection
 * leaks are a documented extension point — see README for the gate.
 *
 * @param {string} fn
 * @returns {number[]}
 */
function graphRevealedValues(fn) {
  if (!fn || typeof fn !== 'string') return [];
  const probe = `${fn} = 0`;
  let parsed;
  try {
    parsed = parseCleanProblem(probe);
  } catch (_) {
    return [];
  }
  if (!parsed || !parsed.hasMath || !parsed.solution || !parsed.solution.success) {
    return [];
  }
  const sol = parsed.solution;
  if (Array.isArray(sol.roots) && sol.roots.length) {
    return sol.roots.map(Number).filter((n) => Number.isFinite(n));
  }
  return extractNumbers(sol.answer);
}

/** Do two numeric sets share any value (within tolerance)? */
function setsIntersect(a, b) {
  if (!a.length || !b.length) return false;
  return a.some((x) => b.some((y) => Math.abs(x - y) <= NUM_TOLERANCE));
}

/**
 * Heuristic: is the *assignment itself* to produce this visual? If the student
 * was asked to "graph"/"plot"/"sketch" the function, then graphing it is the
 * task, not a leak — the visual equivalent of `pose` always being allowed.
 *
 * Interim heuristic over problemText until observe-stage task-intent
 * classification exists (`requestedTask` is preferred when present).
 *
 * @param {object} activeProblem
 * @returns {boolean}
 */
function visualIsTheTask(activeProblem) {
  if (!activeProblem) return false;
  if (activeProblem.requestedTask) {
    return /graph|plot|sketch|draw/i.test(String(activeProblem.requestedTask));
  }
  return /\b(graph|plot|sketch|draw)\b/i.test(String(activeProblem.problemText || ''));
}

// ---------------------------------------------------------------------------
// SAFETY layer — deterministic leak detection (no LLM, no async)
// ---------------------------------------------------------------------------

/**
 * Decide whether a single graph/image command would reveal the answer to the
 * active unsolved problem. Pure and synchronous.
 *
 * @param {object} command - { action: 'graph'|'image', fn?, query?, caption? }
 * @param {object} activeProblem - {
 *     problemText, normalizedExpression, correctAnswer, problemType,
 *     requestedTask?, status }
 * @returns {{ leak: boolean, reasonCode: string, riskLevel: string }}
 */
function assessLeak(command, activeProblem) {
  const action = command && command.action;

  // Malformed commands are a safety problem too — a missing field can't render
  // but shouldn't silently survive.
  if (action === 'graph' && !command.fn) {
    return { leak: true, reasonCode: 'MISSING_REQUIRED_FIELD', riskLevel: 'fatal' };
  }
  if (action === 'image' && !command.query) {
    return { leak: true, reasonCode: 'MISSING_REQUIRED_FIELD', riskLevel: 'fatal' };
  }

  // No active problem, or it's already solved -> nothing left to leak.
  if (!activeProblem || activeProblem.status === 'solved') {
    return { leak: false, reasonCode: 'NO_ACTIVE_PROBLEM', riskLevel: 'none' };
  }

  const solutionValues = extractNumbers(activeProblem.correctAnswer);

  if (action === 'graph') {
    // Exception: graphing IS the assignment.
    if (visualIsTheTask(activeProblem)) {
      return { leak: false, reasonCode: 'VISUAL_IS_THE_TASK', riskLevel: 'none' };
    }

    // Rule A — expression identity: the graphed function is literally the
    // active problem's function. Cheap, and catches the common case.
    const activeExpr = normalizeExpr(activeProblem.normalizedExpression || activeProblem.problemText);
    const fnNorm = normalizeExpr(command.fn);
    if (activeExpr && fnNorm && activeExpr.includes(fnNorm)) {
      return { leak: true, reasonCode: 'ACTIVE_PROBLEM_EXACT_LEAK', riskLevel: 'fatal' };
    }

    // Rule B — solution intersection: the graph's roots coincide with the
    // known answer, even if the expression was rearranged/disguised.
    const revealed = graphRevealedValues(command.fn);
    if (setsIntersect(revealed, solutionValues)) {
      return { leak: true, reasonCode: 'SOLUTION_SET_LEAK', riskLevel: 'fatal' };
    }

    return { leak: false, reasonCode: 'NO_LEAK', riskLevel: 'none' };
  }

  if (action === 'image') {
    const q = String(command.query).toLowerCase();
    const qNorm = normalizeExpr(command.query);

    // The query embeds the active expression — almost certainly fishing for a
    // worked/graphed answer of the student's own problem.
    const activeExpr = normalizeExpr(activeProblem.normalizedExpression || activeProblem.problemText);
    if (activeExpr && qNorm && qNorm.includes(activeExpr) && !visualIsTheTask(activeProblem)) {
      return { leak: true, reasonCode: 'ACTIVE_PROBLEM_EXACT_LEAK', riskLevel: 'high' };
    }

    // The query names the literal answer value(s).
    if (solutionValues.length) {
      for (const v of solutionValues) {
        if (new RegExp(`(?:^|[^\\d.-])${v}(?:[^\\d]|$)`).test(q)) {
          return { leak: true, reasonCode: 'SOLUTION_SET_LEAK', riskLevel: 'high' };
        }
      }
    }

    // Answer-seeking phrasing ("...solved", "...step by step").
    if (ANSWER_SEEKING_TERMS.some((t) => q.includes(t))) {
      return { leak: true, reasonCode: 'UNSAFE_IMAGE_QUERY', riskLevel: 'medium' };
    }

    // Residual risk: web image search can still return an answer-bearing image
    // for a clean-looking query. That's handled by the existing COPPA-safe
    // image whitelist downstream — this gate is query-level only for images.
    return { leak: false, reasonCode: 'NO_LEAK', riskLevel: 'none' };
  }

  // Anything that isn't graph/image is out of this gate's scope.
  return { leak: false, reasonCode: 'NOT_VISUAL_GATE_SCOPE', riskLevel: 'none' };
}

// ---------------------------------------------------------------------------
// TRANSFORM — swap a leaking visual for a safe parallel one
// ---------------------------------------------------------------------------

/**
 * Build a structurally-similar replacement graph whose answer differs from the
 * active problem — a "parallel problem" visual, which is doctrinally allowed
 * (worked steps on parallel problems are fine; see [[feedback_no_cheating]]).
 *
 * Only attempts the tractable case: a quadratic with integer roots gets a twin
 * quadratic with different integer roots. Everything else returns null and the
 * caller falls back to a block. Dedups against the user's recentProblems when a
 * user doc is supplied so the twin doesn't collide with a real assigned problem.
 *
 * @param {object} command - the blocked graph command
 * @param {object} activeProblem
 * @param {object|null} user - Mongoose user doc (optional, for dedup)
 * @returns {object|null} replacement command or null
 */
function buildParallelReplacement(command, activeProblem, user) {
  if (!command || command.action !== 'graph' || !command.fn) return null;

  // Only twin quadratics for now — the shape where a graph most often leaks
  // (roots/x-intercepts) and where a clean parallel is easy to synthesize.
  const revealed = graphRevealedValues(command.fn);
  const looksQuadratic = /x\s*\^?\s*2|x²/i.test(command.fn);
  if (!looksQuadratic || revealed.length < 1) return null;

  // Candidate integer-root pairs. A safe twin must share NO root with either
  // the original function or — critically — the active problem's solution set.
  // (A twin that merely differs from the original can still leak if one of its
  // roots happens to coincide with a real answer value.)
  const origRoots = revealed.map((r) => Math.round(r)).sort((a, b) => a - b).join(',');
  const forbidden = new Set([
    ...revealed.map((r) => Math.round(r)),
    ...extractNumbers(activeProblem && activeProblem.correctAnswer).map((r) => Math.round(r)),
  ]);
  const candidates = [
    [1, 4], [7, 8], [-5, -2], [4, 9], [-1, 6], [8, 11], [-6, -3], [5, 12],
  ];

  for (const [r1, r2] of candidates) {
    if ([r1, r2].sort((a, b) => a - b).join(',') === origRoots) continue;
    if (forbidden.has(r1) || forbidden.has(r2)) continue;
    const b = -(r1 + r2);
    const c = r1 * r2;
    const fn = `x^2 ${b >= 0 ? '+ ' + b : '- ' + Math.abs(b)}x ${c >= 0 ? '+ ' + c : '- ' + Math.abs(c)}`;

    if (user && wasRecentlyShown(user, { contentHash: contentHash(fn) })) continue;

    return {
      action: 'graph',
      fn,
      caption: 'A similar quadratic — notice how its roots appear as x-intercepts.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// VALUE layer — LLM judge (async, low-stakes, injectable for tests)
// ---------------------------------------------------------------------------

const VALUE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'visual_value_verdict',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['earns_place', 'visual_purpose', 'audit_reason'],
      properties: {
        earns_place: { type: 'boolean' },
        visual_purpose: {
          type: 'string',
          enum: [
            'expose_structure', 'contrast_cases', 'show_change',
            'connect_representations', 'reduce_cognitive_load',
            'correct_misconception', 'none',
          ],
        },
        audit_reason: { type: 'string' },
      },
    },
  },
};

/**
 * Default LLM value judge. Decides whether a *safe* visual earns its place.
 * This is the only place an LLM is consulted, and only on low-stakes value —
 * never on safety. Returns a permissive verdict if the call fails (a
 * decorative visual slipping through is acceptable; a crash is not).
 *
 * @param {object} command
 * @param {object} ctx - { activeProblem, learningState, tutorMessage }
 * @returns {Promise<{earns_place, visual_purpose, audit_reason}>}
 */
async function defaultValueJudge(command, ctx) {
  // Lazy require so the safety path (and tests) never pull in the network stack.
  const { callLLMStructured } = require('./llmGateway');
  const sys = [
    'You are the Mathmatix Visual Value Judge. You do NOT generate tutoring.',
    'A visual has already passed a deterministic SAFETY gate — it does not reveal the answer.',
    'Your ONLY job: does this visual earn its place on the board, or is it decoration?',
    'It earns its place only if it does at least one of: expose structure, contrast cases,',
    'show change over time, connect symbolic and graphical meaning, reduce cognitive load,',
    'or correct a misconception. Do not classify students by learning style — judge the concept.',
    'Return strict JSON.',
  ].join(' ');
  const payload = {
    command: { action: command.action, fn: command.fn || null, query: command.query || null, caption: command.caption || null },
    concept: (ctx.learningState && ctx.learningState.concept) || null,
    misconception: (ctx.learningState && ctx.learningState.misconception) || null,
    masteryScore: (ctx.learningState && ctx.learningState.masteryScore) ?? null,
    tutorMessage: ctx.tutorMessage || null,
  };
  try {
    return await callLLMStructured(
      'gpt-4o-mini',
      [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }],
      VALUE_RESPONSE_FORMAT,
      { temperature: 0 },
    );
  } catch (_) {
    return { earns_place: true, visual_purpose: 'none', audit_reason: 'value_judge_unavailable_failopen' };
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full gate on one graph/image command.
 *
 * Order of authority:
 *   1. SAFETY (deterministic): leak -> block, or transform in experimental mode.
 *   2. VALUE (LLM): only consulted for safe visuals, and only in modes that can
 *      actually act on it. Decorative visuals are blocked.
 *
 * Returns the command to render (possibly a replacement), or null to drop it,
 * plus a `record` for the caller to persist to the visual_decisions log.
 *
 * @param {object} params
 * @param {object} params.command
 * @param {object} params.activeProblem
 * @param {object} [params.learningState]
 * @param {string} [params.tutorMessage]
 * @param {object} [params.user] - for transform dedup
 * @param {string} [params.mode=MODES.SHADOW]
 * @param {function} [params.valueJudge] - injectable; defaults to the LLM judge
 * @returns {Promise<{ command: object|null, record: object }>}
 */
async function applyVisualGate({
  command,
  activeProblem,
  learningState = null,
  tutorMessage = null,
  user = null,
  mode = MODES.SHADOW,
  valueJudge = defaultValueJudge,
}) {
  // Out of scope -> untouched.
  if (!command || !['graph', 'image'].includes(command.action)) {
    return { command, record: { decision: 'allow', reasonCode: 'NOT_VISUAL_GATE_SCOPE', riskLevel: 'none', action: command && command.action } };
  }

  const safety = assessLeak(command, activeProblem);

  // Decide the *intended* action first, independent of mode, so the log always
  // captures what the gate WOULD do (this is what makes shadow data useful).
  let intended; // 'allow' | 'block' | 'transform'
  let replacement = null;
  let value = null;

  if (safety.leak) {
    replacement = (mode === MODES.LIVE_EXPERIMENTAL)
      ? buildParallelReplacement(command, activeProblem, user)
      : null;
    intended = replacement ? 'transform' : 'block';
  } else {
    // Safe — does it earn its place? Only spend an LLM call when a mode could
    // act on the verdict (skip in shadow to keep shadow cheap/observational).
    const judgeable = mode === MODES.LIVE_CONTROL || mode === MODES.LIVE_EXPERIMENTAL;
    if (judgeable) {
      value = await valueJudge(command, { activeProblem, learningState, tutorMessage });
      intended = value.earns_place ? 'allow' : 'block';
    } else {
      intended = 'allow';
    }
  }

  const record = {
    action: command.action,
    decision: intended,
    reasonCode: !safety.leak && value && !value.earns_place ? 'DECORATIVE_OR_LOW_VALUE' : safety.reasonCode,
    riskLevel: safety.riskLevel,
    visualPurpose: value ? value.visual_purpose : null,
    originalCommand: command,
    replacementCommand: replacement,
    auditReason: value ? value.audit_reason : safety.reasonCode,
  };

  // Now apply mode: shadow/audit_only/off never change what renders.
  let rendered;
  if (mode === MODES.OFF || mode === MODES.SHADOW || mode === MODES.AUDIT_ONLY) {
    rendered = command;
  } else if (intended === 'allow') {
    rendered = command;
  } else if (intended === 'transform') {
    rendered = replacement;
  } else {
    rendered = null; // block
  }

  return { command: rendered, record };
}

module.exports = {
  applyVisualGate,
  assessLeak,
  buildParallelReplacement,
  defaultValueJudge,
  // exported for unit tests
  normalizeExpr,
  extractNumbers,
  graphRevealedValues,
  visualIsTheTask,
  MODES,
};
