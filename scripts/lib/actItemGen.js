// scripts/lib/actItemGen.js
//
// Shared machinery for the generated ACT banks (scripts/generateActVisualItems.js,
// scripts/generateActReasoningItems.js): seeded randomness, the math-text
// helpers the banks write answers with, and item assembly — four distinct
// choices, numbers in ascending order, the distractor gate, wrong choices
// named by VALUE in the explanation.
//
// A family is { id, skillId, count, kind, gen(rng) }, and gen returns null (draw
// again) or { params, difficulty, prompt, fig?, key, wrong: [[text, why]], explain }.

const crypto = require('crypto');
const { hasBadDistractors } = require('../../utils/distractorQuality');
const { sortPermutation } = require('../../utils/actChoiceOrder');

// ── Seeded randomness ───────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ── Math text ───────────────────────────────────────────────────────────────

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** p/q reduced, as the banks write it: "-2/3", "3", "1/2". */
function frac(p, q) {
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  return q === 1 ? `${p}` : `${p}/${q}`;
}
/** A number that may be fractional, from a rational p/q. */
const ratio = (p, q) => frac(p, q);
/** Coefficient in front of x: "", "-", "2", "(2/3)". */
function coef(p, q = 1) {
  const s = frac(p, q);
  if (s === '1') return '';
  if (s === '-1') return '-';
  return s.includes('/') ? `(${s})` : s;
}
/** y = mx + b with m = p/q. */
function lineEq(p, q, b, lhs = 'y') {
  const m = coef(p, q);
  const head = p === 0 ? '' : `${m}x`;
  if (!head) return `${lhs} = ${b}`;
  if (b === 0) return `${lhs} = ${head}`;
  return `${lhs} = ${head} ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
}
const factor = (r) => (r === 0 ? 'x' : `(x ${r < 0 ? '+' : '-'} ${Math.abs(r)})`);
const signed = (n) => (n < 0 ? `-${Math.abs(n)}` : `${n}`);
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const dec1 = (n) => (Math.round(n * 10) / 10).toString();


const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A bank: assemble() builds one item (or null), generate() runs every family.
 * @param {{ source: string, idPrefix: string, tags: (fam) => string[] }} spec
 */
function makeBank({ source, idPrefix, tags }) {
  function assemble(fam, g, n, rng) {
    const seen = new Set([g.key]);
    const wrong = [];
    for (const [t, why] of g.wrong) {
      if (t == null || seen.has(t) || /NaN|undefined|Infinity/.test(t)) continue;
      seen.add(t); wrong.push([t, why]);
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) return null;
    let texts = shuffle(rng, [g.key, ...wrong.map(([t]) => t)]);
    // Numbers go in ascending order, as on the ACT (and as the runner serves them).
    const perm = sortPermutation(texts);
    if (perm) texts = perm.map((i) => texts[i]);
    const options = texts.map((text, i) => ({ label: LETTERS[i], text }));
    const correctOption = LETTERS[texts.indexOf(g.key)];
    const problemId = `${idPrefix}${fam.id}-${String(n).padStart(2, '0')}`;
    const svg = g.fig ? g.fig.svg : null;
    const item = {
      problemId,
      skillId: fam.skillId,
      prompt: g.prompt,
      svg,
      ...(svg ? { figureAlt: g.fig.alt } : {}),
      answer: { type: 'auto', value: g.key, equivalents: [] },
      answerType: 'multiple-choice',
      options,
      correctOption,
      difficulty: g.difficulty,
      gradeBand: '8-12',
      explanation: `${g.explain} Wrong choices: ${wrong.map(([t, why]) => `${t} ${why}`).join('; ')}.`,
      tags: tags(fam),
      source,
      contentHash: crypto.createHash('sha256').update(`${problemId}|${g.prompt}|${g.key}|${svg || ''}`).digest('hex'),
      isActive: true,
    };
    if (hasBadDistractors(item)) return null;
    return item;
  }

  function generate(families) {
    const items = [];
    const report = [];
    for (const fam of families) {
      const rng = mulberry32(seedOf(fam.id));
      const used = new Set();
      let made = 0, tries = 0;
      while (made < fam.count && tries < fam.count * 400) {
        tries += 1;
        const g = fam.gen(rng);
        if (!g || used.has(g.params)) continue;
        const item = assemble(fam, g, made + 1, rng);
        if (!item) continue;
        used.add(g.params);
        items.push(item);
        made += 1;
      }
      report.push([fam.id, fam.skillId, made, fam.count]);
    }
    return { items, report };
  }

  return { assemble, generate };
}

module.exports = { mulberry32, seedOf, ri, pick, shuffle, gcd, frac, ratio, coef, lineEq, factor, signed, money, dec1, makeBank };
