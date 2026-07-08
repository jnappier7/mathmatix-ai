/**
 * TUTOR-REPLY JUDGES — automated detectors for the tutor failure classes this
 * project keeps hitting in production transcripts.
 *
 * Each judge is a PURE function of (reply, ctx) → { violated: boolean, evidence }.
 * They are heuristic string checks, not proofs — a regression NET, not a verifier.
 * The point is to turn "Jason reads a transcript and spots the bug" into "CI scores
 * the tutor's actual words against the classes we already know it fails."
 *
 * ctx fields the judges may use:
 *   studentWasCorrect  {boolean}  the student's answer this turn was mathematically correct
 *   hasFocus           {boolean}  a specific problem/graph was already on screen
 *   focusTerms         {string[]} tokens naming the current focus (e.g. ["y=x^3","x^3","cubic"])
 *   shouldElicit       {boolean}  the tutor should have asked the student to try, not solved it
 *   answer             {string}   the (never-to-be-revealed) answer for the active problem
 *   mustNotReveal      {boolean}  revealing `answer` is a violation this turn
 */

'use strict';

const norm = (s) => String(s || '').toLowerCase();

// ── Rejecting a correct answer ──────────────────────────────────────────────
// The cardinal sin behind most of this session's transcripts: the student is
// right and the tutor hedges/denies ("not quite", "almost", "you're close",
// "let's double-check", "not correct"). Only a violation when the student WAS right.
const REJECTION_MARKERS = /\b(not quite|almost(?!\s+there,\s+you'?re\s+right)|you'?re close|close,?\s+but|not (?:quite )?right|that'?s not (?:it|right|correct)|not correct|incorrect|try (?:that )?again|let'?s (?:double[-\s]?)?check|let'?s re[-\s]?check|hmm,?\s+not|isn'?t (?:quite )?right|(?:gone|went)\s+off\s+track|went\s+wrong|where\s+(?:things|it|we)\s+(?:went|might have gone)|pinpoint\s+where|where things might have gone)\b/i;
function rejectedCorrectAnswer(reply, ctx = {}) {
  if (!ctx.studentWasCorrect) return { violated: false };
  const m = norm(reply).match(REJECTION_MARKERS);
  return m ? { violated: true, evidence: `rejected a correct answer: "${m[0]}"` } : { violated: false };
}

// ── Asserting a false non-equivalence ───────────────────────────────────────
// The tutor told the student 5/12 and 10/24 were "not equivalent". When the two
// forms in play ARE equal (studentWasCorrect), claiming they're not is a hard fail.
const NONEQUIV_MARKERS = /\b(not equivalent|aren'?t equivalent|isn'?t equivalent|not equal|aren'?t equal|isn'?t equal|not the same|aren'?t the same|don'?t (?:match|equal)|they'?re different)\b/i;
function assertedFalseEquivalence(reply, ctx = {}) {
  if (!ctx.studentWasCorrect) return { violated: false };
  const m = norm(reply).match(NONEQUIV_MARKERS);
  return m ? { violated: true, evidence: `claimed equal forms are unequal: "${m[0]}"` } : { violated: false };
}

// ── Losing the current focus ────────────────────────────────────────────────
// "What function do you have in mind?" while y=x^3 was on screen. A violation only
// when a focus already existed AND the reply asks the student to (re)name the topic.
const AMNESIA_MARKERS = /\bwhat\b[^?]{0,60}?\b(?:do you have in mind|would you like to (?:work on|explore|tackle|focus on)|are you (?:working on|referring to|thinking (?:of|about)))\b|what (?:do you )?(?:want|feel like) (?:to )?work(?:ing)? on\b/i;
function lostContext(reply, ctx = {}) {
  if (!ctx.hasFocus) return { violated: false };
  const m = norm(reply).match(AMNESIA_MARKERS);
  return m ? { violated: true, evidence: `asked the student to re-name the topic while a focus was active: "${m[0]}"` } : { violated: false };
}

// ── Solving instead of eliciting ────────────────────────────────────────────
// A bare problem drop should be met with "what's your first move?", not a full
// worked solution. Heuristic: two or more equation-transformation lines, or the
// final answer stated, when the tutor should have elicited.
function solvedInsteadOfEliciting(reply, ctx = {}) {
  if (!ctx.shouldElicit) return { violated: false };
  const text = String(reply || '');
  // Two or more "=" transformations with numbers = a worked solution, not a prompt.
  const eqCount = /\d/.test(text) ? (text.match(/=/g) || []).length : 0;
  if (eqCount >= 2) return { violated: true, evidence: `worked ${eqCount} solution steps instead of eliciting` };
  if (ctx.answer && containsValue(text, ctx.answer)) return { violated: true, evidence: `stated the answer (${ctx.answer}) instead of eliciting` };
  return { violated: false };
}

// ── Imprecise / stigmatizing math language ──────────────────────────────────
// Terminology the teacher explicitly rejected: "reduce" (implies smaller) — say
// SIMPLIFY; "improper fraction" (implies wrong) — say "fraction greater than one".
function usedImpreciseTerm(reply, ctx = {}) {
  const found = [];
  if (/\breduc(?:e|es|ed|ing|tion)\b/i.test(reply) && /\b(fraction|lowest terms|simplest)\b/i.test(reply)) {
    found.push('"reduce" (say "simplify")');
  }
  if (/\bimproper fraction/i.test(reply)) found.push('"improper fraction" (say "fraction greater than one")');
  return found.length ? { violated: true, evidence: found.join('; ') } : { violated: false };
}

// ── Revealing the answer ────────────────────────────────────────────────────
function revealedAnswer(reply, ctx = {}) {
  if (!ctx.mustNotReveal || !ctx.answer) return { violated: false };
  return containsValue(reply, ctx.answer)
    ? { violated: true, evidence: `revealed the withheld answer (${ctx.answer})` }
    : { violated: false };
}

// ── Wrong order-of-operations claim ─────────────────────────────────────────
// "multiplication comes before division" as a RULE (the PEMDAS trap).
const OOO_MARKERS = /\bmultipl\w+\s+(?:comes?|is|goes|happens?)\s+before\s+divi|divi\w+\s+(?:comes?|is|goes)\s+after\s+multipl|addition\s+(?:comes?|is|goes)\s+before\s+subtrac/i;
function badOrderOfOperations(reply) {
  const m = norm(reply).match(OOO_MARKERS);
  return m ? { violated: true, evidence: `asserted a false precedence rule: "${m[0]}"` } : { violated: false };
}

// A value can appear in many forms; match the raw string and, for fractions/
// numbers, a whitespace-insensitive form.
function containsValue(text, value) {
  const t = String(text);
  const v = String(value).trim();
  if (!v) return false;
  if (t.includes(v)) return true;
  const compact = v.replace(/\s+/g, '');
  return compact !== v && t.replace(/\s+/g, '').includes(compact);
}

const JUDGES = {
  rejectedCorrectAnswer,
  assertedFalseEquivalence,
  lostContext,
  solvedInsteadOfEliciting,
  usedImpreciseTerm,
  revealedAnswer,
  badOrderOfOperations,
};

/**
 * Run a set of judges against a reply. Returns { violations: [{judge, evidence}] }.
 * @param {string} reply
 * @param {string[]} judgeNames  which judges to apply this turn
 * @param {object} ctx
 */
function judgeReply(reply, judgeNames, ctx = {}) {
  const violations = [];
  for (const name of judgeNames) {
    const fn = JUDGES[name];
    if (!fn) throw new Error(`Unknown judge: ${name}`);
    const r = fn(reply, ctx);
    if (r.violated) violations.push({ judge: name, evidence: r.evidence });
  }
  return { violations, passed: violations.length === 0 };
}

module.exports = { JUDGES, judgeReply, containsValue };
