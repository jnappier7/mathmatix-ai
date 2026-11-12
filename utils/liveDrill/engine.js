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
  // Test Prep (one bank per unit test, built from the teacher's practice test, utils/liveDrill/prep/)
  // and Chapter Reviews (quick-fire, one bank per chapter, built from the teacher's notes and chapter
  // review, utils/liveDrill/review/; standard scoring — every play is one move). Listed in TEACHING
  // ORDER, Algebra then Geometry: the host picker renders this object in order.
  alg1m1: { native: require('./review/alg1Ch1'), title: 'Algebra 1 · Module 1 Review' },
  alg1m2: { native: require('./review/alg1Ch2'), title: 'Algebra 1 · Module 2 Review' },
  alg1m3: { native: require('./prep/alg1Module3'), title: 'Algebra 1 · Module 3 Test Prep', scoring: 'prep' },
  alg1m4: { native: require('./review/alg1Ch4'), title: 'Algebra 1 · Module 4 Review' },
  alg1m5: { native: require('./review/alg1Ch5'), title: 'Algebra 1 · Module 5 Review' },
  alg1m6: { native: require('./review/alg1Ch6'), title: 'Algebra 1 · Module 6 Review' },
  alg1m7: { native: require('./review/alg1Ch7'), title: 'Algebra 1 · Module 7 Review' },
  alg1m8: { native: require('./review/alg1Ch8'), title: 'Algebra 1 · Module 8 Review' },
  alg1m9: { native: require('./review/alg1Ch9'), title: 'Algebra 1 · Module 9 Review' },
  alg1m10: { native: require('./review/alg1Ch10'), title: 'Algebra 1 · Module 10 Review' },
  alg1m11: { native: require('./review/alg1Ch11'), title: 'Algebra 1 · Module 11 Review' },
  alg1m12: { native: require('./review/alg1Ch12'), title: 'Algebra 1 · Module 12 Review' },
  alg1m13: { native: require('./review/alg1Sem2'), title: 'Algebra 1 · Semester 2 Exam Review' },
  hgeo1: { native: require('./review/hgeoCh1'), title: 'Honors Geometry · Chapter 1 Review' },
  hgeo3: { native: require('./prep/hgeoCh3'), title: 'Honors Geometry · Chapter 3 Test Prep', scoring: 'prep' },
  hgeo4: { native: require('./review/hgeoCh4'), title: 'Honors Geometry · Chapter 4 Review' },
  hgeo5: { native: require('./review/hgeoCh5'), title: 'Honors Geometry · Chapter 5 Review' },
  hgeo6: { native: require('./review/hgeoCh6'), title: 'Honors Geometry · Chapter 6 Review' },
  hgeo7: { native: require('./review/hgeoCh7'), title: 'Honors Geometry · Chapter 7 Review' },
  hgeo8: { native: require('./review/hgeoCh8'), title: 'Honors Geometry · Chapter 8 Review' },
  hgeo9: { native: require('./review/hgeoCh9'), title: 'Honors Geometry · Chapter 9 Review' },
  hgeo10: { native: require('./review/hgeoCh10'), title: 'Honors Geometry · Chapter 10 Review' },
  hgeo11: { native: require('./review/hgeoCh11'), title: 'Honors Geometry · Chapter 11 Review' },
  // Algebra 2 (no Course Planner site yet): one native course drill, a playbook per unit.
  alg2: { native: require('./review/alg2'), title: 'Algebra 2' },
  // Fluency games: one reflex, fast, on the Math Facts clocks; server-scored solo runs feed a class leaderboard
  congruence: { native: require('./fluency/congruence'), title: 'Honors Geometry · Triangle Congruence Fluency', scoring: 'facts', graded: true },
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

/**
 * The numbered sections a playbook's label covers: "5.1" → [5.1]; "5.3–5.5" → [5.3, 5.4, 5.5];
 * "2.4, 2.7" → [2.4, 2.7]. Labels with no N.M ("Mod 5", "ACT style", "Q1–5", "Ch. 2–3", "+−×÷")
 * cover none. A range across chapters ("2.7–3.1") is read as its two ends.
 */
function sectionsOfLabel(ch) {
  const out = [];
  const re = /(\d+)\.(\d+)(?:\s*[–\-—]\s*(\d+)\.(\d+))?/g;
  let m;
  while ((m = re.exec(String(ch || '')))) {
    const chap = m[1]; const a = Number(m[2]);
    if (m[3] && m[3] !== chap) { out.push(`${chap}.${a}`, `${m[3]}.${Number(m[4])}`); continue; }
    const b = m[3] ? Number(m[4]) : a;
    for (let i = a; i <= b && i - a < 20; i++) out.push(`${chap}.${i}`);
  }
  return [...new Set(out)];
}

/**
 * The drill's numbered sections in order ("5.1" … "5.5"), each with the playbooks that cover it —
 * the pick a teacher actually makes mid-module ("we did 5.2 today"), derived from the labels the
 * banks already print, never a second catalog. Only sections some playbook covers are listed: a
 * number the course skips (Module 4 goes 4.1, 4.2, 4.3, 4.5 — there is no 4.4 in the packets, the
 * notes or the test) is simply not a pick, rather than a greyed button that looks like a bug. A
 * drill whose labels carry no N.M (Math Facts, a Test Prep's question ranges, the course pages'
 * modules) has none.
 */
function listSections(drillId) {
  const books = listPlaybooks(drillId);
  const covering = new Map();
  for (const b of books) for (const s of sectionsOfLabel(b.ch)) {
    if (!covering.has(s)) covering.set(s, []);
    covering.get(s).push(b);
  }
  const num = (s) => s.split('.').map(Number);
  const ids = [...covering.keys()].sort((x, y) => (num(x)[0] - num(y)[0]) || (num(x)[1] - num(y)[1]));
  return ids.map((key) => {
    const bs = covering.get(key);
    return { key, name: `Section ${key}`, books: bs.map((b) => b.key), topics: bs.map((b) => b.name), blurb: bs.map((b) => b.blurb).filter(Boolean).join(' ') };
  });
}

/** "5.1 & 5.2", "5.1, 5.2 & 5.4" */
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`);

/**
 * What a playbook key means: a book of the bank; a numbered section (every book that covers it);
 * SEVERAL sections or books joined by commas ("5.1,5.2" — a teacher mid-module drills what has
 * been taught so far: the union of their books, in the bank's order); or, for anything else, the
 * whole bank. The key comes back canonical (known parts only, sections in order, no repeats), so
 * a game's `playbook` is the same string however the picker spelled it. The host and the solo
 * page both send it.
 */
function resolvePlaybook(drillId, key) {
  const drill = getDrill(drillId);
  const BOOKS = drill.bank.BOOKS;
  const secs = listSections(drillId);
  const secOf = (k) => secs.find((s) => s.key === k && s.books.length);
  const parts = String(key == null ? '' : key).split(',').map((k) => k.trim()).filter(Boolean);
  const picked = { secs: [], books: [] };
  for (const k of parts) {
    if (BOOKS[k] && k !== 'all') { if (!picked.books.includes(k)) picked.books.push(k); continue; }
    const sec = /^\d+\.\d+$/.test(k) ? secOf(k) : null;
    if (sec && !picked.secs.includes(sec)) picked.secs.push(sec);
  }
  if (!picked.secs.length && !picked.books.length) return { key: 'all', name: BOOKS.all.name, books: ['all'] };
  picked.secs.sort((a, b) => secs.indexOf(a) - secs.indexOf(b));
  const books = Object.keys(BOOKS).filter((b) => picked.books.includes(b) || picked.secs.some((s) => s.books.includes(b)));
  if (!picked.secs.length) return { key: picked.books.join(','), name: listOf(picked.books.map((b) => BOOKS[b].name)), books };
  const extra = picked.books.filter((b) => !picked.secs.some((s) => s.books.includes(b))); // books beyond the chosen sections
  const name = `Section${picked.secs.length > 1 ? 's' : ''} ${listOf(picked.secs.map((s) => s.key))}${extra.length ? ` + ${listOf(extra.map((b) => BOOKS[b].name))}` : ''}`;
  return { key: [...picked.secs.map((s) => s.key), ...extra].join(','), name, books, section: true };
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
  const { books } = resolvePlaybook(drillId, playbook);
  const recent = (recentIds || []).slice(0, RECENT);
  const rand = mulberry32(seedFor(seed, n));
  // A section spanning several books: a native bank pools their templates (prep/kit.js makePlay
  // takes the list); a published page's makePlay takes one book, so the seeded draw picks it.
  if (drill.native) return drill.bank.makePlay(books.length === 1 ? books[0] : books, recent, rand, opts);
  const book = books.length === 1 ? books[0] : books[Math.floor(rand() * books.length)];
  drill.rng.next = rand;
  try {
    return normalize(drill, drill.bank.makePlay(book, recent));
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

module.exports = { DRILLS, getDrill, listPlaybooks, listSections, sectionsOfLabel, resolvePlaybook, dealPlay, publicPlay, RECENT, _extractBank: extractBank };
