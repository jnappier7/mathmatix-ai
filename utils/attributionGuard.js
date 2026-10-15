/**
 * Attribution guard — the tutor must not credit the student with work they
 * didn't do (QA handoff 2026-10-14 §2.5). Witnessed in prod, verbatim:
 *
 *   student: "(10, 23)"
 *   tutor:   "You substituted y = 2x + 3 into the second equation…"   ← its own hint
 *
 *   student: "The bisector splits angle Q in half, so 76 / 2 = 38."
 *   tutor:   "You correctly noted that ray RS bisects ∠R…"            ← the problem's
 *                                                                        words, not theirs
 *
 * A fabricated "you did X" is worse than no praise: it tells a student their
 * reasoning was something it wasn't, and "correctly" on a WRONG claim
 * (∠Q → ∠R) certifies the misconception.
 *
 * Deterministic and conservative. A "You [adverb] <verb>…" claim is checked
 * only when it names concrete math (numbers, terms like 2x, points like RS);
 * it is UNGROUNDED only when NONE of those tokens appear in what the student
 * actually wrote. Ungrounded claims are rewritten to "Let's <verb>…", which
 * keeps the teaching move and drops the false credit. A claim with no math
 * tokens ("you found a pattern") can't be judged and is left alone.
 */

const PAST_TO_BASE = {
  substituted: 'substitute', subbed: 'substitute', plugged: 'plug', replaced: 'replace',
  noted: 'note', noticed: 'notice', observed: 'observe', recognized: 'recognize', realized: 'realize',
  identified: 'identify', spotted: 'spot', pointed: 'point',
  found: 'find', calculated: 'calculate', computed: 'compute', worked: 'work', figured: 'figure',
  added: 'add', subtracted: 'subtract', multiplied: 'multiply', divided: 'divide',
  isolated: 'isolate', combined: 'combine', factored: 'factor', distributed: 'distribute',
  expanded: 'expand', simplified: 'simplify', solved: 'solve', moved: 'move',
  applied: 'apply', used: 'use', set: 'set', wrote: 'write', canceled: 'cancel', cancelled: 'cancel',
};
const VERBS = Object.keys(PAST_TO_BASE).join('|');

// "You substituted", "you correctly noted", "You've already found", "you have just isolated"
const CLAIM_RX = new RegExp(
  `\\b(you)(?:['’]ve|\\s+have)?\\s+(?:(?:correctly|already|just|rightly|nicely|cleverly|smartly)\\s+)?(${VERBS})\\b([^.!?\\n]*)`,
  'gi'
);

// Concrete math a claim can name: numbers, coefficient terms (2x, 3y^2), lone
// x/y/z, and geometry point names (R, RS, PQR). LaTeX commands are dropped
// first so "\angle R" reads as "R".
function mathTokens(text) {
  const t = String(text || '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}$]/g, ' ');
  const out = new Set();
  for (const m of t.matchAll(/\d+(?:\.\d+)?(?:[a-z](?:\^\d+)?)?/gi)) out.add(m[0].toLowerCase());
  for (const m of t.matchAll(/(?:^|[^A-Za-z])([xyz])(?![A-Za-z])/g)) out.add(m[1]);
  for (const m of t.matchAll(/(?:^|[^A-Za-z])([A-Z]{1,3})(?![A-Za-z])/g)) {
    if (m[1] !== 'I' && m[1] !== 'A') out.add(m[1]);   // pronoun / article, and MC "A" is ambiguous
  }
  return out;
}

/**
 * @param {string} reply - the tutor's final student-facing text
 * @param {string[]} studentMessages - what the student actually wrote (latest last)
 * @returns {{ text: string, rewrites: Array<{claim: string, tokens: string[]}> }}
 */
function guardAttribution(reply, studentMessages) {
  if (!reply || typeof reply !== 'string') return { text: reply, rewrites: [] };
  const said = new Set();
  for (const m of studentMessages || []) for (const tok of mathTokens(m)) said.add(tok);

  const rewrites = [];
  const text = reply.replace(CLAIM_RX, (whole, you, verb, rest) => {
    const tokens = [...mathTokens(rest)];
    if (tokens.length === 0) return whole;                       // nothing concrete to check
    if (tokens.some(tok => said.has(tok))) return whole;         // grounded in their words
    rewrites.push({ claim: whole.trim().slice(0, 160), tokens });
    const base = PAST_TO_BASE[verb.toLowerCase()];
    const lets = you[0] === 'Y' ? "Let's" : "let's";
    return `${lets} ${base}${rest}`;
  });
  return { text, rewrites };
}

module.exports = { guardAttribution, mathTokens };
