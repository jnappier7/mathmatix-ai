'use strict';
/* ============================================================
   symbolicVerifier.js — deterministic answer verification via mathjs.

   The deterministic mathSolver covers ~30% of topics and the LLM verifier
   is unreliable on multi-term / calculus answers, so those come back
   isCorrect=null and the tutor is forced to guess (and false-flags correct
   work). This adds a SYMBOLIC tier that resolves the algebra/calculus cases
   exactly:

     • EQUIVALENCE — two expressions are equal iff they agree at many random
       sample points. Catches un-simplified forms (10/24 = 5/12), rearranged
       terms, factored/expanded, different-but-equal notation. No brittle
       string matching.
     • ANTIDERIVATIVE — an integral answer F is correct iff d/dx(F) equals the
       integrand. Differentiates F symbolically, then checks equivalence.

   Contract: NEVER throws. Returns { isCorrect: true|false|null, method,
   confidence }. null = genuinely couldn't decide (unparseable / too few valid
   samples), so callers fall through to the existing LLM verifier — the tier
   only ever ADDS confident verdicts, never manufactures one.
   ============================================================ */
const math = require('mathjs');

const CONSTS = /^(pi|e|i|Infinity|NaN|true|false|PI|E)$/;

// LaTeX (how student answers arrive) -> a mathjs-parseable string. Bounded and
// defensive; anything it can't map falls out as a parse failure -> null upstream.
function latexToExpr(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/\\[()[\]]/g, ' ').replace(/^\$+|\$+$/g, '');           // math delimiters
  s = s.replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi\b/g, ' pi ')
    .replace(/\\(?:!|,|;|:| )/g, '')                                     // thin spaces
    .replace(/\\sqrt\s*\[([^\][]*)\]\s*\{([^{}]*)\}/g, 'nthRoot(($2),($1))') // \sqrt[n]{x}
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
  for (let i = 0; i < 4 && /\\frac/.test(s); i++) {                      // \frac (nesting)
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
  }
  s = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)')                           // x^{6} -> x^(6)
    .replace(/_\s*\{([^{}]*)\}/g, '_$1')                                 // subscripts
    .replace(/\\([a-zA-Z]+)/g, '$1')                                     // \ln \sin -> ln sin
    .replace(/[{}]/g, '')
    .replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/·/g, '*');
  // |2b + 1| -> abs(2b + 1) so absolute-value equations are checkable (\left|
  // \right| already stripped above, leaving bare | … |). Non-greedy, single level.
  s = s.replace(/\|\s*([^|]+?)\s*\|/g, 'abs($1)');
  return s.trim();
}

function compile(expr) {
  try { return math.compile(expr); } catch (_) { return null; }
}

function collectVars(expr) {
  const out = new Set();
  try {
    math.parse(expr).traverse(function (node) {
      if (node && node.isSymbolNode) {
        const n = node.name;
        if (!CONSTS.test(n) && typeof math[n] !== 'function') out.add(n);
      }
    });
  } catch (_) { return []; }
  return [...out];
}

// Positive, growing, irrational-ish sample points — keep sqrt/log in-domain
// while staying dense enough to separate genuinely different expressions.
function samplePoint(i, varIndex) { return 0.3 + 0.37 * i + 0.13 * varIndex; }

// true | false | null(undecidable). Two expressions are equal iff they agree
// at every valid sample; a single clear disagreement among agreements is
// treated as undecidable (guards float flukes), two+ disagreements -> false.
function equivalent(a, b) {
  const ca = compile(a); const cb = compile(b);
  if (!ca || !cb) return null;
  const vars = [...new Set(collectVars(a).concat(collectVars(b)))];
  // K-12 math answers use single-letter variables; a multi-letter "variable"
  // means mathjs parsed prose ("the answer is blue" -> the*answer*is*blue) as
  // a math expression. Refuse to verdict on that — fall through to the LLM.
  if (vars.some(function (v) { return v.length > 1; })) return null;
  let tried = 0; let agree = 0; let disagree = 0;
  for (let i = 0; i < 32 && tried < 12; i++) {
    const scope = {};
    vars.forEach(function (v, idx) { scope[v] = samplePoint(i, idx); });
    let va; let vb;
    try { va = ca.evaluate(scope); vb = cb.evaluate(scope); } catch (_) { continue; }
    if (typeof va !== 'number' || typeof vb !== 'number' || !isFinite(va) || !isFinite(vb)) continue;
    tried += 1;
    if (Math.abs(va - vb) <= 1e-6 * (1 + Math.abs(va))) agree += 1; else disagree += 1;
  }
  if (tried < 5) return null;                 // couldn't sample enough (singular/complex)
  if (disagree === 0) return true;
  if (disagree >= 2 || agree === 0) return false;
  return null;                                // 1 flaky disagreement — don't gamble
}

// Verify F is an antiderivative of `integrand`: d/dx(F) must equal integrand.
function verifyAntiderivative(studentF, integrand, variable) {
  const F = latexToExpr(studentF);
  const f = latexToExpr(integrand);
  if (!F || !f) return null;
  const v = variable || 'x';
  const Fnoc = F.replace(/([+\-]\s*)C\b/gi, '');   // drop the +C
  let dF;
  try { dF = math.derivative(Fnoc, v).toString(); } catch (_) { return null; }
  return equivalent(dF, f);
}

// Split an equation problem tex into { lhs, rhs } (exactly one '='), or null.
function extractEquation(tex) {
  const s = latexToExpr(tex);
  if (!s) return null;
  const parts = s.split('=');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  return { lhs: parts[0].trim(), rhs: parts[1].trim() };
}

// The solution value(s) a student EXPLICITLY claimed via "x = …": "x = 8" -> [8],
// "x = 2 or x = 3" -> [2,3], "x = -7/3" -> [-2.33…]. A bare number is
// deliberately NOT accepted here — mid-problem it could be an intermediate step,
// and force-grading that against the whole equation would false-flag correct
// working. Explicit "x =" is the signal that the student is claiming a solution.
function claimedSolutionValues(text, variable) {
  if (text == null) return [];
  const v = variable || 'x';
  const s = String(text).replace(/[−–—]/g, '-');
  const re = new RegExp(v + '\\s*=\\s*(-?[0-9][0-9.]*(?:\\s*/\\s*-?[0-9.]+)?)', 'gi');
  const out = []; let m;
  while ((m = re.exec(s)) !== null) {
    try { const val = math.evaluate(m[1]); if (typeof val === 'number' && isFinite(val)) out.push(val); } catch (_) { /* skip */ }
  }
  return out;
}

// A student's solution is correct iff every value they named satisfies the
// equation: substitute into (lhs - rhs) and check it's ~0. (Completeness —
// did they name ALL roots — is diagnose's root-set logic, not this.)
function verifyEquationSolution(studentAnswer, equationTex, variable) {
  const eq = extractEquation(equationTex);
  if (!eq) return null;
  // Auto-detect the unknown from the equation (m, p, t, b, …) instead of
  // assuming x — a problem in 'p' with a "p = 60" answer must still verify.
  // Only when there's exactly ONE single-letter variable; otherwise fall back
  // to x (a multi-variable/literal equation has no single value to check).
  let v = variable;
  if (!v) {
    const found = collectVars('(' + eq.lhs + ')-(' + eq.rhs + ')').filter(function (x) { return x.length === 1; });
    v = found.length === 1 ? found[0] : 'x';
  }
  const vals = claimedSolutionValues(studentAnswer, v);
  if (!vals.length) return null;
  const diff = compile('(' + eq.lhs + ')-(' + eq.rhs + ')');
  if (!diff) return null;
  for (const val of vals) {
    let r;
    try { r = diff.evaluate({ [v]: val }); } catch (_) { return null; }
    if (typeof r !== 'number' || !isFinite(r)) return null;
    if (Math.abs(r) > 1e-6 * (1 + Math.abs(val))) return false;
  }
  return true;
}

// Pull the integrand + variable out of an integral problem tex:
// "\int (6x^5 - 4x)\,dx" / "∫ 6x^5 dx" -> { integrand:'6x^5 - 4x', variable:'x' }.
function extractIntegral(tex) {
  if (tex == null) return null;
  const m = String(tex).match(/(?:\\int|∫)\s*(.+?)\s*\\?[, ]*\bd\s*([a-zA-Z])\b/);
  if (!m) return null;
  const integrand = latexToExpr(m[1]);
  if (!integrand) return null;
  return { integrand, variable: m[2] };
}

/**
 * @param {object} p
 * @param {string} p.studentAnswer  the student's answer (LaTeX or plain)
 * @param {string} [p.correctAnswer] the known-correct answer, if any
 * @param {string} [p.integrand]    for integrals: the expression being integrated
 * @param {string} [p.problemTex]   the problem tex — integrand auto-extracted if it's an integral
 * @param {string} [p.variable]     defaults to 'x'
 * @returns {{isCorrect: (boolean|null), method: string, confidence: number}}
 */
function symbolicVerify(p) {
  p = p || {};
  try {
    let integrand = p.integrand;
    let variable = p.variable;
    if (!integrand && p.problemTex) {
      const ig = extractIntegral(p.problemTex);
      if (ig) { integrand = ig.integrand; variable = variable || ig.variable; }
    }
    if (integrand && p.studentAnswer) {
      const r = verifyAntiderivative(p.studentAnswer, integrand, variable);
      if (r !== null) return { isCorrect: r, method: 'antiderivative', confidence: 0.98 };
    }
    // Equation problem ("solve …=…"): does the student's stated x=value satisfy it?
    if (p.problemTex && p.studentAnswer != null) {
      const r = verifyEquationSolution(p.studentAnswer, p.problemTex, variable);
      if (r !== null) return { isCorrect: r, method: 'equation', confidence: 0.98 };
    }
    if (p.correctAnswer != null && p.studentAnswer != null) {
      const a = latexToExpr(p.studentAnswer); const b = latexToExpr(p.correctAnswer);
      if (a && b) {
        const r = equivalent(a, b);
        if (r !== null) return { isCorrect: r, method: 'equivalence', confidence: 0.97 };
      }
    }
  } catch (_) { /* never throw — fall through to unverifiable */ }
  return { isCorrect: null, method: 'unverifiable', confidence: 0 };
}

// Pull a purely-NUMERIC arithmetic computation the tutor posed ("what's
// 50 × 3?" -> "50*3", "multiply 10 × 5 × 3" -> "10*5*3"). Numbers joined by
// arithmetic operators with NO letters attached, so it never mis-fires on
// algebra (2x), dimensions ("7 cm, 2.6 cm"), or list/step numbers. Returns the
// last such expression (the question usually trails the message), or null.
function detectPosedArithmetic(text) {
  if (text == null) return null;
  const s = String(text)
    // LaTeX operators FIRST — the system prompt mandates LaTeX for all math, so a
    // sub-step the tutor poses is stored as "15 \div 5", not "15 ÷ 5". Without this
    // normalization the regex below never matched a \div/\times/\cdot sub-step, the
    // student's correct answer went unverified, and the tutor looped doubting it.
    .replace(/\\times/g, '*').replace(/\\cdot/g, '*').replace(/\\div/g, '/')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[()[\]]/g, ' ')   // strip \( \) \[ \] delimiters
    .replace(/×/g, '*').replace(/·/g, '*').replace(/÷/g, '/').replace(/[−–—]/g, '-');
  // An EXPONENT is not arithmetic. In "f(x) = \frac{x^2 - 9}{x - 3}" the scan
  // reads straight past the caret and pulls "2 - 9" — a number that appears
  // nowhere in the tutor's question — then grades the student's answer against
  // -7. That is how "what value of x would make x - 3 equal zero?" answered "3"
  // came back INCORRECT in production (AP Calculus AB, 2026-07-28). A candidate
  // whose first number is the exponent of a variable is a fragment of algebra,
  // not a posed computation, so drop it and keep looking at earlier candidates.
  const re = /(?<![\w.$])-?\d+(?:\.\d+)?(?:\s*[*+/-]\s*-?\d+(?:\.\d+)?)+(?![\w.])/g;
  const candidates = [];
  for (const match of s.matchAll(re)) {
    const before = s.slice(0, match.index).replace(/\s+$/, '');
    if (/[\^_]$/.test(before)) continue;   // x^2 - 9  /  a_1 + 2
    candidates.push(match[0]);
  }
  if (!candidates.length) return null;
  const raw = candidates[candidates.length - 1];
  const expr = raw.replace(/\s+/g, '');
  if (!/\d[*+/]-?\d|\d-\d/.test(expr)) return null;   // needs a real binary operator

  // An expression that already states its own result is a STATEMENT, not a
  // posed question — typically the tutor quoting the student's work back at
  // them ("then you wrote 4/5 = 0.8"). Treating it as posed made the student's
  // own wrong answer the grading target: they restated 4/5 as 0.8, it "matched"
  // the quoted arithmetic, and a wrong answer was confirmed as correct.
  //
  // Checked by position rather than by rebuilding a pattern from `expr` — the
  // expression contains regex metacharacters (`*`, `+`) and escaping it into a
  // new RegExp is how this threw "Nothing to repeat" on "50 * 3".
  const at = s.lastIndexOf(raw);
  if (at !== -1 && /^\s*=\s*-?\d/.test(s.slice(at + raw.length))) return null;

  return expr;
}

// The student's answer as a bare number, or null if it's an expression/prose.
// "150" -> "150", "72 cm^3" -> "72", "-2" -> "-2"; "50*3=150" / "x^2" -> null.
function bareNumericAnswer(text) {
  if (text == null) return null;
  // strip a trailing unit (+ optional exponent) so "72 cm^3" reads as one number
  const t = String(text).replace(/[−–—]/g, '-')
    .replace(/\s*(cm|mm|km|m|in|ft|yd|units?|degrees?|°)\s*(\^?\s*\d+|[²³¹])?\s*[.!]*$/i, '')
    .trim();
  if (/[a-z]/i.test(t)) return null;                  // leftover letters -> prose / variable (x^2)
  if (/[*+/×÷=^]/.test(t)) return null;               // an expression or a power, not a bare answer
  const nums = t.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 1) return null;        // exactly one number
  return nums[0];
}

module.exports = { symbolicVerify, equivalent, verifyAntiderivative, verifyEquationSolution, extractEquation, latexToExpr, extractIntegral, detectPosedArithmetic, bareNumericAnswer };
