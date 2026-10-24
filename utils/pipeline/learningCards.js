/**
 * learningCards.js — deterministic AHA + Reminder capture (spec §7.2–7.3).
 *
 * The notebook must fill itself from real signals, not another LLM call:
 *
 *   • AHA (spec §7.2): the student was struggling on a problem (a failed
 *     attempt or a diagnosed misconception), then got it right ON a turn
 *     whose own message carries realization language ("ohh I get it",
 *     "that makes sense", "wait so…"). All three at once is a strong
 *     signal; anything less and we save nothing — the spec says ask when
 *     confidence is low, and until the tutor can ask, skipping beats
 *     polluting the notebook with false epiphanies.
 *
 *   • Reminder (spec §7.3): the SAME diagnosed misconception recurring for
 *     a student. One card per misconception, upserted — the second
 *     occurrence activates it ("Watch for This"), later ones bump its
 *     count. Supportive framing, never punitive.
 *
 * Detection here is pure; the persist stage owns the database writes.
 */
'use strict';

const math = require('mathjs');

// Realization language. Deliberately explicit phrases — a bare "ok" or
// "yes" must not mint an AHA card.
const REALIZATION_RX = new RegExp(
  [
    '\\boh+h*\\b[!.\\s]*(?:i\\s+(?:get|see)|now|that)',   // "ohh I get it", "oh now…", "oh that's…"
    '\\bi\\s+(?:get|got)\\s+it\\b',
    '\\bi\\s+see\\s+(?:it|now|why|what)\\b',
    '\\bthat\\s+makes\\s+sense\\b',
    '\\bmakes\\s+so\\s+much\\s+sense\\b',
    '\\bi\\s+understand\\s+(?:it\\s+)?now\\b',
    '\\bnow\\s+i\\s+(?:get|see|understand)\\b',
    '\\bwait[,!\\s]+so\\b',
    '\\bso\\s+that\'?s\\s+(?:why|how)\\b',
  ].join('|'),
  'i'
);

/**
 * Should this turn mint an AHA card?
 *
 * @param {object} signals
 * @param {string}  signals.message - the student's message this turn
 * @param {boolean} signals.wasCorrect - verified-correct answer this turn
 * @param {object|null} signals.priorProblemState - conversation.lastProblemState
 *   BEFORE this turn's update ({attemptCount, misconception, problemText})
 * @returns {{isAha: boolean, quote: string|null}}
 */
function detectAha(signals) {
  const s = signals || {};
  const msg = String(s.message == null ? '' : s.message).trim();
  if (!msg || s.wasCorrect !== true) return { isAha: false, quote: null };

  const prior = s.priorProblemState;
  const struggled = !!(prior && ((prior.attemptCount || 0) >= 1 || prior.misconception));
  if (!struggled) return { isAha: false, quote: null };

  if (!REALIZATION_RX.test(msg)) return { isAha: false, quote: null };
  return { isAha: true, quote: msg.slice(0, 400) };
}

/** Stable per-misconception dedupe key ("losing-a-negative-sign"). */
function reminderKey(misconceptionName) {
  const k = String(misconceptionName == null ? '' : misconceptionName)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return k || null;
}

/** Student-facing reminder content — supportive, never punitive (§7.3). */
function shapeReminder(misconception) {
  const m = misconception || {};
  const name = String(m.name || 'this step').trim();
  return {
    title: ('Watch for This: ' + name).slice(0, 160),
    body: [
      m.description ? String(m.description).trim() : '',
      m.fix ? ('Next time: ' + String(m.fix).trim()) : '',
    ].filter(Boolean).join('\n').slice(0, 2000) || 'You’ve hit this snag more than once — slow down here next time.',
  };
}

/** AHA card content — the student's own words lead (§7.2). */
function shapeAha(quote, skillId) {
  const label = skillId
    ? String(skillId).replace(/[-_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
    : null;
  return {
    title: (label ? ('AHA! ' + label) : 'AHA! It clicked').slice(0, 160),
    body: '“' + String(quote || '').trim() + '”',
  };
}

/** Compact client shape — what rides the chat response for the celebration. */
function toClientCard(doc) {
  return {
    type: doc.type,
    title: doc.title,
    // Only reminders past their activation threshold surface to the client;
    // seenCount lets the UI say "3rd time" if it wants to.
    seenCount: doc.seenCount || 1,
  };
}

// A reminder only surfaces once the mistake has RECURRED — the first
// occurrence is just learning, the second is a pattern (spec: "recurring
// mistakes"). The card exists from occurrence one so the count is honest.
const REMINDER_ACTIVATION_COUNT = 2;

// ── Reminder trust (course audit C07, 2026-10-23) ──────────────────────────
// A "Watch for This" card is persistent guidance the student re-reads for
// weeks, so it must clear a higher bar than a single turn's verdict. The
// card the audit found said adding 1/3 and 1/6 to get 1/2 was a MISTAKE (it
// is correct) and "corrected" it to 1/2 + 1/6 = 2/3 — a different
// expression. It was born from a misgraded turn whose grading target came
// from an earlier problem, then re-counted after later correct work.
//
// Two independent checks, both conservative (skipping a card costs nothing;
// a wrong card teaches an error):
//   1. misconceptionCardGate — the VERDICT: a confirmed incorrect on the
//      exact problem the student attempted.
//   2. validateReminderMath — the CARD: every closed arithmetic claim in its
//      text is checked; a "mistake" that is actually right, or a correction
//      that is itself wrong, rejects the card.

// Verdict sources that grade the student's answer against the problem they
// actually attempted. Excluded on purpose: 'earlier_problem' (a parked prior
// problem, not the one on the board), 'batch' (one item of a numbered set),
// 'llm:step' (a sub-step), 'llm:conceptual' (prose — no arithmetic to be wrong
// about), and null (no verdict at all).
function isAttemptGradingSource(src) {
  if (!src) return false;
  return src === 'solver' || src === 'derivation' || src === 'root_set'
    || src === 'llm' || src === 'arithmetic_override' || /^symbolic:/.test(src);
}

// A leading minus is a sign only when no number sits right before it ("3-4").
const NUM = String.raw`(?:(?<![\d)]\s*)-)?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?`;

// A number ends at a non-digit — a sentence's full stop is not a decimal point.
const END = String.raw`(?![\d\/]|\.\d)`;

function normalizeMathText(text) {
  return String(text == null ? '' : text)
    .replace(/\\d?frac\s*\{\s*(-?[\d.]+)\s*\}\s*\{\s*([\d.]+)\s*\}/g, '$1/$2')
    .replace(/\\times|\\cdot|×|·/g, '*').replace(/\\div|÷/g, '/')
    .replace(/\\left|\\right|\\[()[\]]|\$/g, ' ')
    .replace(/[−–—]/g, '-')
    // "1.25 x 0.8" — the typed times sign, only between numbers.
    .replace(/(\d)\s*x\s*(?=\d)/gi, '$1*');
}

function evalNum(expr) {
  try {
    const v = math.evaluate(String(expr).replace(/,/g, ''));
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch (_) { return null; }
}

function near(a, b) { return Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a)); }


function verbOp(verb) {
  const v = verb.toLowerCase();
  if (v.startsWith('add')) return '+';
  if (v.startsWith('subtract')) return '-';
  if (v.startsWith('multipl')) return '*';
  return '/';
}

// "subtracted 2 from 9" is 9 - 2; every other joiner keeps the spoken order.
function actionExpr(op, x, y, joiner) {
  const [a, b] = (op === '-' && /^from$/i.test(joiner)) ? [y, x] : [x, y];
  return [`(${a}) ${op} (${b})`, [a, b]];
}

// The numbers an expression is built from, as values ("1/3 + 1/6" → [1/3, 1/6]).
function operandsOf(expr) {
  return (String(expr).match(new RegExp(NUM, 'g')) || []).map(n => n.replace(/\s+/g, ''));
}

function sameOperands(a, b) {
  const va = a.map(evalNum).sort((x, y) => x - y);
  const vb = b.map(evalNum).sort((x, y) => x - y);
  return va.length === vb.length && va.every((v, i) => v != null && vb[i] != null && near(v, vb[i]));
}

// What the card says the student set out to compute — "added 1/3 and 1/6",
// with or without a stated result.
function attemptedExpressions(text) {
  const s = normalizeMathText(text);
  const out = [];
  const rx = new RegExp(`\\b(add(?:ed|ing|s)?|subtract(?:ed|ing|s)?|multipl(?:ied|ying|ies|y)|divid(?:ed|ing|es|e))\\s+(${NUM})\\s+(and|by|from|to|with)\\s+(${NUM})${END}`, 'gi');
  let m;
  while ((m = rx.exec(s))) {
    const op = verbOp(m[1]);
    out.push({ op, operands: actionExpr(op, m[2], m[4], m[3])[1] });
  }
  return out;
}

/**
 * Every closed arithmetic claim in a piece of text, judged.
 *   "1/3 + 1/6 = 1/2"                     → {lhs:'1/3 + 1/6', rhs:'1/2', isTrue:true}
 *   "added 1/3 and 1/6 to get 1/2"        → same
 *   "subtracted 2 from 9 and got 6"       → {lhs:'9 - 2', rhs:'6', isTrue:false}
 * Only fully numeric claims count — a letter means algebra, not arithmetic.
 */
function extractArithmeticClaims(text) {
  const s = normalizeMathText(text);
  const claims = [];
  const push = (lhs, rhs, op, kind, operands) => {
    const a = evalNum(lhs);
    const b = evalNum(rhs);
    if (a == null || b == null) return;
    claims.push({ lhs: lhs.trim(), rhs: rhs.trim(), op, kind, operands, isTrue: near(a, b) });
  };
  // Chains too: "3/5 + 2/15 = 9/15 + 2/15 = 11/15" is two claims, each link
  // judged against its neighbour.
  const EXPR = `${NUM}(?:\\s*[-+*/]\\s*${NUM})*`;
  const chainRx = new RegExp(`${EXPR}(?:\\s*=\\s*${EXPR})+${END}`, 'g');
  let m;
  while ((m = chainRx.exec(s))) {
    const sides = m[0].split('=').map(x => x.trim());
    for (let i = 0; i + 1 < sides.length; i++) {
      const [l, r] = [sides[i], sides[i + 1]];
      // Fractions are numbers, not division: collapse each number to N first.
      const opOf = (e) => { const o = e.replace(new RegExp(NUM, 'g'), 'N').match(/N\s*([-+*/])\s*N/); return o ? o[1] : null; };
      // A link must COMPUTE something — "x = 5" or "1/2 = 1/2" restates.
      if (!opOf(l) && !opOf(r)) continue;
      push(l, r, opOf(l) || opOf(r), 'equation', operandsOf(l));
    }
  }
  const verbRx = new RegExp(
    `\\b(add(?:ed|ing|s)?|subtract(?:ed|ing|s)?|multipl(?:ied|ying|ies|y)|divid(?:ed|ing|es|e))\\s+(${NUM})\\s+(and|by|from|to|with)\\s+(${NUM})\\s*(?:,\\s*)?(?:to\\s+get|and\\s+got|got|getting|giving|gives|resulting\\s+in|which\\s+(?:gives|is|equals)|=|as)\\s+(${NUM})${END}`,
    'gi'
  );
  while ((m = verbRx.exec(s))) {
    const verb = m[1].toLowerCase();
    const [x, y, r] = [m[2], m[4], m[5]];
    const op = verbOp(verb);
    const [lhs, operands] = actionExpr(op, x, y, m[3]);
    push(lhs, r, op, 'action', operands);
  }
  return claims;
}

/**
 * Is a reminder card's math sound enough to save?
 *   correction_is_false        — the "Next time" fix states false arithmetic.
 *   mistake_is_correct         — the card says the student DID something
 *                                ("added 1/3 and 1/6 to get 1/2") that is right.
 *   correction_changes_problem — the card's correct working starts from
 *                                different numbers than the student's attempt
 *                                ("added 1/3 and 1/6 … correct: 1/2 + 1/6 = 2/3").
 * A bare correct EQUATION in the description is not evidence on its own —
 * cards legitimately quote right intermediate steps ("calculated 8 × 6 = 48
 * but did not divide by 2").
 * @returns {{ok: boolean, reason: string|null, claims: object[]}}
 */
function validateReminderMath(misconception) {
  const m = misconception || {};
  const text = `${m.name || ''}\n${m.description || ''}`;
  const described = extractArithmeticClaims(text);
  const fix = extractArithmeticClaims(m.fix || '');
  const claims = described.concat(fix);
  if (fix.some(c => !c.isTrue)) {
    return { ok: false, reason: 'correction_is_false', claims };
  }
  if (described.some(c => c.kind === 'action' && c.isTrue)) {
    return { ok: false, reason: 'mistake_is_correct', claims };
  }
  const attempts = attemptedExpressions(text);
  const working = claims.filter(c => c.kind === 'equation' && c.isTrue && c.op);
  for (const a of attempts) {
    const sameOp = working.filter(w => w.op === a.op);
    if (sameOp.length && !sameOp.some(w => sameOperands(w.operands, a.operands))) {
      return { ok: false, reason: 'correction_changes_problem', claims };
    }
  }
  return { ok: true, reason: null, claims };
}

/**
 * Is this turn a CONFIRMED incorrect on the problem the student attempted?
 * Pure — persist passes in what it already has.
 * @param {object} p
 * @param {object} p.diagnosis
 * @param {string} p.originalMessage - the student's own message this turn
 * @param {string|null} p.problemTex - the pinned board problem, when known
 * @param {function} p.answersMatch - (a, b) => boolean, the grading engine
 * @returns {{ok: boolean, reason: string|null}}
 */
function misconceptionCardGate({ diagnosis, originalMessage, problemTex, answersMatch }) {
  const d = diagnosis || {};
  if (d.isCorrect !== false || d.type === 'correct_partial') return { ok: false, reason: 'not_incorrect' };
  if (!isAttemptGradingSource(d.verificationSource)) return { ok: false, reason: 'source_not_attempt' };
  const ans = d.answer == null ? '' : String(d.answer).trim();
  const key = d.correctAnswer == null ? '' : String(d.correctAnswer).trim();
  if (!ans || !key) return { ok: false, reason: 'no_attempt_or_key' };
  if (answersMatch && answersMatch(ans, key)) return { ok: false, reason: 'answer_matches_key' };

  // The student's own message, read as a closed arithmetic claim: if what
  // they WROTE is true ("3/5 + 2/15 = 11/15"), a misconception card would
  // contradict the page in front of them, whatever the grader concluded.
  const own = extractArithmeticClaims(originalMessage);
  if (own.length > 0 && own.every(c => c.isTrue)) return { ok: false, reason: 'student_work_is_true' };

  // The grading key must belong to THIS problem. When the pinned problem is
  // closed arithmetic we can compute it; a key that doesn't match came from
  // somewhere else (the audit card's key came from an earlier pump problem).
  const posed = posedValue(problemTex);
  if (posed != null) {
    const k = evalNum(key);
    if (k == null || !near(posed, k)) return { ok: false, reason: 'key_not_from_this_problem' };
    const a = evalNum(ans);
    if (a != null && near(posed, a)) return { ok: false, reason: 'answer_matches_problem' };
  }
  return { ok: true, reason: null };
}

// The value of a pinned problem when it is pure arithmetic ("3/5 + 2/15",
// "\frac{3}{5}+\frac{2}{15} = ?"), else null.
function posedValue(problemTex) {
  if (!problemTex) return null;
  const s = normalizeMathText(problemTex).replace(/=\s*\??\s*$/, '').replace(/^[^\d(-]*:/, '').trim();
  if (!/^[-+*/^()\s\d.]+$/.test(s) || !/\d\s*[-+*/^]\s*[\d(]/.test(s)) return null;
  return evalNum(s);
}

// The attempt a reminder came from — kept on the card so a later grading
// correction (or a human) can tell which work it was born from.
function sourceAttempt({ diagnosis, problemTex, conversationId, originalMessage }) {
  const d = diagnosis || {};
  return {
    at: new Date(),
    conversationId: conversationId || null,
    problemTex: problemTex ? String(problemTex).slice(0, 500) : null,
    studentMessage: originalMessage ? String(originalMessage).slice(0, 500) : null,
    studentAnswer: d.answer == null ? null : String(d.answer).slice(0, 200),
    correctAnswer: d.correctAnswer == null ? null : String(d.correctAnswer).slice(0, 200),
    verificationSource: d.verificationSource || null,
    misconceptionSource: d.misconception?.source || null,
  };
}

module.exports = {
  detectAha,
  reminderKey,
  shapeReminder,
  shapeAha,
  toClientCard,
  REMINDER_ACTIVATION_COUNT,
  REALIZATION_RX,
  extractArithmeticClaims,
  validateReminderMath,
  misconceptionCardGate,
  isAttemptGradingSource,
  posedValue,
  sourceAttempt,
};
