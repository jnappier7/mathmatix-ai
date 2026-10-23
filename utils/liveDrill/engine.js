/**
 * Live Two-Minute Drill — the play engine.
 *
 * The drills themselves are GENERATED pages (public/courses/<course>/two-minute-drill.html,
 * published from the Course Planner straight to main — see CLAUDE.md §12). Their item bank is
 * the top half of the page's one <script>, everything above the "===== app =====" marker: pure
 * functions, no DOM. So rather than keep a copy that drifts on every publish, this module reads
 * that half out of the published page and runs it in a vm context. A publish that adds a
 * template or rewords a tell is live in class games on the next boot, with no edit here.
 *
 * Two things the page's own runtime never needed:
 *
 *   1. A SEEDED Math.random. The page calls Math.random freely; the context gets a Math whose
 *      random() reads a generator re-seeded before every play. Play n of a game is therefore
 *      a pure function of (game seed, n) — every student in a game sees the same plays in the
 *      same order, and the server can regenerate any play to grade it.
 *   2. A normalized play. The two pages shape plays differently (Algebra: `kind` why/do, choices
 *      as {d, k}; Geometry: every play a "why", choices as reason keys, an optional figure), so
 *      `normalize` turns both into one shape the live pages render without knowing which drill
 *      it came from. The HTML in it is the page's own (template output, numbers only — no
 *      user text ever reaches it).
 *
 * If a publish ever changes the page's structure so the bank can't be found, `getDrill` throws
 * and the route answers 503 for that drill; tests/unit/liveDrillEngine.test.js fails in CI.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

const facts = require('./facts');

const DRILLS = {
  algebra: { file: 'public/courses/algebra/two-minute-drill.html', title: 'Algebra 1' },
  geometry: { file: 'public/courses/geometry/two-minute-drill.html', title: 'Honors Geometry' },
  // Fluency mode: a bank owned here (utils/liveDrill/facts.js), typed answers, per-fact tracking.
  facts: { native: facts, title: 'Math Facts', scoring: 'facts', typed: true, trackFacts: true, focus: true },
  // Test Prep: one bank per unit test, built from the teacher's practice test (utils/liveDrill/prep/).
  alg1m3: { native: require('./prep/alg1Module3'), title: 'Alg 1 · Module 3 Test', scoring: 'prep' },
  hgeo3: { native: require('./prep/hgeoCh3'), title: 'H. Geometry · Ch. 3 Test', scoring: 'prep' },
  // Chapter Reviews: quick-fire, one bank per chapter, built from the teacher's notes and chapter
  // review (utils/liveDrill/review/). Standard scoring — every play is one move.
  alg1m7: { native: require('./review/alg1Ch7'), title: 'Alg 1 · Module 7 Review' },
  hgeo4: { native: require('./review/hgeoCh4'), title: 'H. Geometry · Ch. 4 Review' },
  alg1m8: { native: require('./review/alg1Ch8'), title: 'Alg 1 · Module 8 Review' },
  hgeo5: { native: require('./review/hgeoCh5'), title: 'H. Geometry · Ch. 5 Review' },
  alg1m9: { native: require('./review/alg1Ch9'), title: 'Alg 1 · Module 9 Review' },
  hgeo6: { native: require('./review/hgeoCh6'), title: 'H. Geometry · Ch. 6 Review' },
  alg1m10: { native: require('./review/alg1Ch10'), title: 'Alg 1 · Module 10 Review' },
  hgeo7: { native: require('./review/hgeoCh7'), title: 'H. Geometry · Ch. 7 Review' },
  alg1m11: { native: require('./review/alg1Ch11'), title: 'Alg 1 · Module 11 Review' },
  hgeo8: { native: require('./review/hgeoCh8'), title: 'H. Geometry · Ch. 8 Review' },
};

const APP_MARKER = '// ===================== app =====================';
const RECENT = 6; // the page avoids repeating any of the last six templates

/** mulberry32 — small, fast, good enough to deal math problems. */
function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFor(seed, n) {
  return crypto.createHash('sha256').update(`${seed}:${n}`).digest().readUInt32LE(0);
}

/** Pull the item bank (and Geometry's static figure) out of a published drill page. */
function extractBank(html) {
  const start = html.indexOf('<script>');
  const end = html.indexOf(APP_MARKER, start);
  if (start < 0 || end < 0) throw new Error('drill page has no item bank before the app marker');
  let code = html.slice(start + '<script>'.length, end);
  // Geometry draws its one transversal figure in the app half. It is static (no randomness),
  // so it is lifted out whole: from its declaration to the first line that closes it.
  const fig = /\nfunction diagram\(\) \{[\s\S]*?\n\}\n/.exec(html.slice(end));
  if (fig) code += fig[0];
  return code;
}

const cache = new Map();

function getDrill(drillId) {
  const def = DRILLS[drillId];
  if (!def) return null;
  if (cache.has(drillId)) return cache.get(drillId);
  if (def.native) {
    const drill = { id: drillId, title: def.title, bank: def.native, native: true };
    cache.set(drillId, drill);
    return drill;
  }

  const html = fs.readFileSync(path.join(ROOT, def.file), 'utf8');
  const code = extractBank(html);
  const rng = { next: Math.random };
  const seededMath = Object.create(Math);
  seededMath.random = () => rng.next();
  const context = vm.createContext({ Math: seededMath, module: { exports: {} } });
  const bank = vm.runInContext(
    `${code}\n;({ R, TELL, T, BOOKS, makePlay,
       DOTELL: typeof DOTELL === 'undefined' ? null : DOTELL,
       diagram: typeof diagram === 'undefined' ? null : diagram })`,
    context,
    { filename: def.file, timeout: 2000 }
  );
  if (!bank || typeof bank.makePlay !== 'function' || !bank.BOOKS || !bank.R) {
    throw new Error(`${def.file}: item bank is missing makePlay/BOOKS/R`);
  }
  const drill = { id: drillId, title: def.title, bank, rng };
  cache.set(drillId, drill);
  return drill;
}

/** The playbooks a teacher can pick from, in the page's own order. */
function listPlaybooks(drillId) {
  const drill = getDrill(drillId);
  return Object.entries(drill.bank.BOOKS).map(([key, b]) => ({
    key, name: b.name, ch: b.ch, blurb: b.blurb,
  }));
}

// ---------- rendering (mirrors the page's rowsHTML / posedHTML / tellFor) ----------

function rowsHTML(bank, it, revealed) {
  const rows = it.rows.map(([s, r], i) =>
    `<tr><td class="n">${i + 1}</td><td class="s">${s}</td><td class="r">${r === '…' ? '(previous step)' : r}</td></tr>`);
  const rc = revealed ? `<span class="q ok">${bank.R[it.ans]}</span>` : '<span class="q">?</span>';
  rows.push(`<tr class="now"><td class="n">${it.rows.length + 1}</td><td class="s">${it.stmt}</td><td class="r">${rc}</td></tr>`);
  return `<table class="pf"><thead><tr><th></th><th>Statements</th><th>Reasons</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function posedHTML(it, revealed) {
  const shown = revealed ? `<div class="posed-ans">${it.ans}</div>` : '';
  return `<div class="posed"><p class="posed-ask">${it.ask}</p><div class="posed-q">${it.prompt}</div>${shown}</div>`;
}

function cardHTML(bank, it, revealed) {
  const fig = it.fig && bank.diagram ? `<div class="fig">${bank.diagram()}</div>` : '';
  const body = it.kind === 'do' ? posedHTML(it, revealed) : rowsHTML(bank, it, revealed);
  return `${fig}<div class="card-body">${body}</div>`;
}

/**
 * One play in the shape both live pages render. `answer`, `tell` and `revealCard` are the
 * private half — the routes send them only once a play is closed.
 */
function normalize(drill, it) {
  const { bank } = drill;
  const isDo = it.kind === 'do';
  // Algebra choices are {d, k}; Geometry's are bare reason keys.
  const choices = it.choices.map((c) => (typeof c === 'object'
    ? { k: String(c.k), html: isDo ? c.d : bank.R[c.k] }
    : { k: String(c), html: bank.R[c] }));
  const ansKey = String(it.ansKey !== undefined ? it.ansKey : it.ans);
  const ansHtml = isDo ? it.ans : bank.R[it.ans];
  const tell = isDo ? `<b>${it.ans}</b> &mdash; ${it.tell}` : `<b>${bank.R[it.ans]}.</b> ${bank.TELL[it.ans]}`;
  const head = isDo ? it.ask : it.fig ? 'Use the diagram. Which reason justifies the highlighted line?'
    : 'Which reason justifies the highlighted line?';
  const book = bank.BOOKS[it.pb];
  return {
    id: it.id,
    playbook: it.pb,
    playbookName: book ? book.name : '',
    head,
    card: cardHTML(bank, it, false),
    choices,
    answer: ansKey,
    answerHtml: ansHtml,
    tell,
    revealCard: cardHTML(bank, it, true),
    summary: summaryOf(it, isDo),
  };
}

/**
 * One line for the end-of-game play-by-play: the posed problem, or the statement whose reason was
 * asked. Template HTML (fractions, ∠) — rendered, never escaped. Figures and tables can't live in a
 * one-line row, so they come out; a problem that WAS its figure ("find the area" of a drawn
 * rectangle) falls back to its instruction.
 */
function summaryOf(it, isDo) {
  // The question leads, muted, so "99, 96, 93" reads as "…find the fourth: 99, 96, 93".
  if (!isDo) return `<span class="pa">Reason for</span> ${it.stmt}`;
  const text = String(it.prompt || '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<table[\s\S]*?<\/table>/gi, '')
    .replace(/<div class="figq">\s*<\/div>/gi, '');
  return text.replace(/<[^>]*>/g, '').trim()
    ? `<span class="pa">${it.ask}</span> ${text}`
    : `<span class="pa solo">${it.ask}</span>`;
}

/**
 * Deal play n of a game. `recentIds` are the template ids of plays n-1 … n-6, which the page's
 * makePlay steers away from — the caller deals plays in order, so this stays deterministic.
 * `opts` reaches native banks only: Math Facts takes `{ focus: [2, 5, 10] }`.
 */
function dealPlay(drillId, playbook, seed, n, recentIds, opts) {
  const drill = getDrill(drillId);
  if (!drill) throw new Error(`unknown drill ${drillId}`);
  const book = drill.bank.BOOKS[playbook] ? playbook : 'all';
  if (drill.native) return drill.bank.makePlay(book, (recentIds || []).slice(0, RECENT), mulberry32(seedFor(seed, n)), opts);
  drill.rng.next = mulberry32(seedFor(seed, n));
  try {
    return normalize(drill, drill.bank.makePlay(book, (recentIds || []).slice(0, RECENT)));
  } finally {
    drill.rng.next = Math.random;
  }
}

/** The public half of a play — safe to send while it is still open. */
function publicPlay(play) {
  const pub = { id: play.id, playbook: play.playbook, playbookName: play.playbookName,
    head: play.head, card: play.card, choices: play.choices };
  if (play.input) pub.input = play.input; // a typed answer: the screen shows a number pad
  if (play.neg) pub.neg = true; // …with a ± key, because the answer can be negative
  return pub;
}

module.exports = { DRILLS, getDrill, listPlaybooks, dealPlay, publicPlay, RECENT, _extractBank: extractBank };
