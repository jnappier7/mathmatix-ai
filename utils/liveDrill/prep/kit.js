/**
 * Shared kit for the Test Prep banks (utils/liveDrill/prep/*): seeded picks, multiple-choice
 * assembly, the card markup the live pages already render, and the plain-SVG figures.
 *
 * A Test Prep bank is a native drill (engine.js DRILLS[*].native): `makePlay(book, recentIds,
 * rand)` returns one play in the engine's normalized shape. Every template is a function of `rand`
 * alone, so play n of a game is still a pure function of (seed, n). Templates return either
 *   { choices: [html, …], answer: index }   — multiple choice (the kit shuffles and letters them), or
 *   { typed: integer, neg?: true }          — a typed number on the phone's pad.
 */
const M = '−'; // display minus
const num = (n) => (n < 0 ? `${M}${-n}` : String(n));
const par = (n) => (n < 0 ? `(${num(n)})` : String(n));
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];
function shuffle(rand, xs) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Distinct items from `xs`, `n` of them, in random order. */
const sample = (rand, xs, n) => shuffle(rand, xs).slice(0, n);

/**
 * What a choice SAYS, for telling two choices apart. A product of factors reads the same in any
 * order — (m + 1)(m − 9) and (m − 9)(m + 1) are one answer, and offering both made a correct
 * pick a miss — so the factors are sorted (a squared factor counts twice). Anything else is
 * compared as written.
 */
function choiceKey(html) {
  const s = String(html).replace(/\s+/g, ' ').trim();
  const m = s.match(/^([^()]*?)((?:\([^()]+\)(?:<sup>2<\/sup>)?)+)$/);
  if (!m || !/^(?:−|-)?\d*$/.test(m[1])) return s;
  const factors = [];
  for (const f of m[2].match(/\([^()]+\)(?:<sup>2<\/sup>)?/g)) {
    const base = f.replace(/<sup>2<\/sup>$/, '');
    factors.push(base); if (base !== f) factors.push(base);
  }
  return `${m[1]}${factors.sort().join('')}`;
}
/** Right answer first, then up to three wrongs that don't say the same thing as it or each other. */
function mc(rand, ans, wrongs) {
  const seen = new Set([choiceKey(ans)]); const pool = [];
  for (const w of wrongs) { const k = choiceKey(w); if (!seen.has(k)) { seen.add(k); pool.push(w); } }
  return { choices: [ans, ...sample(rand, pool, 3)], answer: 0 };
}

/** "+ 3", "− 3", "" — for writing mx + b with the right sign. */
const signed = (n) => (n === 0 ? '' : n < 0 ? ` ${M} ${-n}` : ` + ${n}`);
/** "3x", "−x", "x" */
const coef = (m, v = 'x') => (m === 1 ? v : m === -1 ? `${M}${v}` : `${num(m)}${v}`);
/** Slope as text: an integer, or a reduced fraction "−3/4". */
function frac(p, q) {
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(Math.abs(p), q);
  p /= g; q /= g;
  return q === 1 ? num(p) : `${p < 0 ? M : ''}${Math.abs(p)}/${q}`;
}
function gcd(a, b) { return b ? gcd(b, a % b) : a || 1; }
/** y = mx + b with a fractional slope (p/q) and integer b. */
function slopeIntercept(p, q, b) {
  const m = frac(p, q);
  // a fraction slope in parentheses: "(1/4)x", never "1/4x" (which reads as 1 over 4x)
  const paren = (s) => (s.includes('/') ? (s.startsWith(M) ? `${M}(${s.slice(1)})` : `(${s})`) : s);
  const mx = m === '0' ? '' : m === '1' ? 'x' : m === `${M}1` ? `${M}x` : `${paren(m)}x`;
  if (!mx) return `y = ${num(b)}`;
  return `y = ${mx}${signed(b)}`;
}

// ---------------------------------------------------------------- cards

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function posed(ask, prompt, fig, shown) {
  // "Use the graph." is the instruction, not the question: the question gets the big type.
  if (/^Use the /.test(prompt)) [ask, prompt] = [prompt, ask];
  // A label is a few words in small caps; a whole sentence of story in caps is hard to read.
  const story = String(ask).replace(/<[^>]*>/g, '').length > 48 ? ' story' : '';
  return `${fig ? `<div class="fig">${fig}</div>` : ''}<div class="card-body"><div class="posed"><p class="posed-ask${story}">${ask}</p><div class="posed-q">${prompt}</div>${shown != null ? `<div class="posed-ans">${shown}</div>` : ''}</div></div>`;
}
/** A two-column proof with the step in question highlighted; `rows` are [statement, reason]. */
function proof(ask, given, rows, at, fig, shownReason) {
  const tr = rows.map(([s, r], i) => {
    if (i < at) return `<tr><td class="n">${i + 1}</td><td class="s">${s}</td><td class="r">${r}</td></tr>`;
    if (i === at) return `<tr class="now"><td class="n">${i + 1}</td><td class="s">${s}</td><td class="r">${shownReason != null ? `<span class="q ok">${shownReason}</span>` : '<span class="q">?</span>'}</td></tr>`;
    return '';
  }).join('');
  const table = `<table class="pf"><thead><tr><th></th><th>Statements</th><th>Reasons</th></tr></thead><tbody>${tr}</tbody></table>`;
  // A label is a few words in small caps; a whole sentence of story in caps is hard to read.
  const story = String(ask).replace(/<[^>]*>/g, '').length > 48 ? ' story' : '';
  return `${fig ? `<div class="fig">${fig}</div>` : ''}<div class="card-body"><div class="posed"><p class="posed-ask${story}">${ask}</p><div class="posed-q prove">${given}</div></div>${table}</div>`;
}

/**
 * Turn a template's result into the engine's play. `t` = { id, ask, prompt, fig?, choices?/answer?,
 * typed?, neg?, tell, proof? }.
 */
function finish(t, book, books, rand) {
  const head = t.ask;
  const text = String(t.prompt || '').replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const summary = text ? `<span class="pa">${t.ask}</span> ${text.slice(0, 140)}` : `<span class="pa solo">${t.ask}</span>`;
  const base = { id: t.id, playbook: book, playbookName: books[book].name, head, summary };
  let card; let revealCard; let answerHtml;
  if (t.typed != null) {
    answerHtml = num(t.typed);
    card = t.proof ? proof(t.ask, t.prompt, t.proof.rows, t.proof.at, t.fig) : posed(t.ask, t.prompt, t.fig);
    revealCard = t.proof ? proof(t.ask, t.prompt, t.proof.rows, t.proof.at, t.fig, answerHtml) : posed(t.ask, t.prompt, t.fig, answerHtml);
    return { ...base, card, choices: [], input: 'number', ...(t.neg ? { neg: true } : {}), answer: String(t.typed),
      answerHtml, tell: `<b>${answerHtml}</b> &mdash; ${t.tell}`, revealCard };
  }
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const order = shuffle(rand, t.choices.map((html, i) => ({ html, right: i === t.answer })));
  const choices = order.map((c, i) => ({ k: keys[i], html: c.html }));
  const answer = keys[order.findIndex((c) => c.right)];
  answerHtml = t.choices[t.answer];
  card = t.proof ? proof(t.ask, t.prompt, t.proof.rows, t.proof.at, t.fig) : posed(t.ask, t.prompt, t.fig);
  revealCard = t.proof ? proof(t.ask, t.prompt, t.proof.rows, t.proof.at, t.fig, answerHtml) : posed(t.ask, t.prompt, t.fig, answerHtml);
  return { ...base, card, choices, answer, answerHtml, tell: `<b>${answerHtml}</b> &mdash; ${t.tell}`, revealCard };
}

/**
 * The makePlay every prep bank exports: pick a template from the playbook (avoiding the last few
 * dealt, so the same kind of question doesn't come twice in a row), run it, and finish it.
 */
function makeBank(BOOKS, TEMPLATES) {
  function makePlay(book, recentIds, rand) {
    const key = BOOKS[book] ? book : 'all';
    const pool = Object.entries(TEMPLATES).filter(([, t]) => key === 'all' || t.book === key);
    const fresh = pool.filter(([id]) => !(recentIds || []).includes(id));
    const [id, tpl] = pick(rand, fresh.length ? fresh : pool);
    // A template can (rarely) land on two choices that say the same thing; deal it again.
    const dup = (t) => t.choices && new Set(t.choices.map(choiceKey)).size < t.choices.length;
    let t = tpl.make(rand);
    for (let i = 0; i < 25 && dup(t); i++) t = tpl.make(rand);
    return finish({ id, ...t }, tpl.book, BOOKS, rand);
  }
  return { BOOKS, TEMPLATES, makePlay };
}

module.exports = { M, num, par, int, pick, shuffle, sample, choiceKey, mc, signed, coef, frac, gcd, slopeIntercept, esc, posed, proof, finish, makeBank };
