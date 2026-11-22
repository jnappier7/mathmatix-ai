/**
 * The SKILL BANK — every catalog skill as a Live Drill game (/drill/skills, the Arcade's "Any skill").
 *
 * The course drills (engine.js DRILLS) are hand-built banks for three courses. This opens the same
 * games — the solo clock, Team Drive, Huddle, King of the Hill, Heist, against computer rivals, and
 * a hosted class game — to the whole catalog (models/skill.js, ~800 skills K → Calc 3) by dealing
 * from the item bank (models/problem.js) instead. A skill becomes a drill the moment it is asked
 * for: `prepare(skillId)` reads its usable items once, shapes them into a native bank with the
 * same `makePlay(book, recent, rand)` contract facts.js honours, and registers it with the engine
 * as `skill:<skillId>` (engine.registerDrill). Nothing else in the game changes: a play dealt from
 * here is graded, scored, revealed and filmed exactly as a Math Facts or Module 5 play is.
 *
 * What is dealt. An item is DRILLABLE when it is multiple choice (two or more options and a key
 * the bank's one rule can resolve — utils/mcOptions.keyLabelOf) or its answer is a plain integer
 * (typed on the number pad, like Math Facts). Fractions, expressions and free text are left out:
 * a two-minute drill grades by equality, not by the tutor's comparison engine. A skill needs
 * MIN_ITEMS of those to be a drill at all. Choices are SHUFFLED with the game's seeded generator
 * and relabelled positionally, so the same seed deals the same order to every player and an item's
 * stored letter never leaks the key.
 *
 * Which items are a skill's. A catalog skill's items live under several `skillId`s (legacy ids,
 * pathway ids — utils/skillCanonicalizer.skillLookupCandidates), so the bank is keyed by the
 * catalog skill and pools every id that resolves to it. Never query the Problem collection by the
 * catalog id alone: a third of the drillable items sit under another spelling.
 *
 * Text. Prompts and explanations are AUTHORED CONTENT, not template output, so unlike the course
 * banks they are HTML-escaped before they reach a page; TeX between $…$, \(…\), \[…\] or $$…$$ is
 * rendered server-side with KaTeX (the drill pages link katex.min.css), so the play HTML the
 * client sets with innerHTML is still never raw user text. A bare "$5" in a word problem stays a
 * dollar sign: inline $…$ counts as math only when it carries a TeX character.
 *
 * Determinism. Items are kept in a fixed order (by id) so play n of a game is a pure function of
 * (seed, n) for a given bank, as the engine promises. A bank is rebuilt when it has not been
 * touched for BANK_TTL (open plays were dealt already and keep their answers); the index of
 * drillable skills refreshes every INDEX_TTL.
 */
const { normalizeOptions, keyLabelOf, LABELS } = require('../mcOptions');
const { skillLookupCandidates } = require('../skillCanonicalizer');
const { lowGrade } = require('../gradeBanding');
const engine = require('./engine');

const PREFIX = 'skill:';
const SKILL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,78}$/;
const MIN_ITEMS = 5;
const MAX_ITEMS = 400; // per skill: a two-minute round is ~30 plays; this is plenty and bounds the read
const INDEX_TTL = 15 * 60 * 1000;
const BANK_TTL = 60 * 60 * 1000;
const INT_RE = /^-?\d{1,5}$/;
const SEARCH_LIMIT = 12;
const MAX_Q = 80;

const isSkillDrill = (id) => typeof id === 'string' && id.startsWith(PREFIX) && SKILL_ID_RE.test(id.slice(PREFIX.length));
const skillIdOf = (drillId) => (isSkillDrill(drillId) ? drillId.slice(PREFIX.length) : null);
const drillIdOf = (skillId) => PREFIX + skillId;

/** Items the bank can deal: multiple choice, or a plain integer answer (string or number). */
const DRILLABLE = {
  isActive: true,
  $or: [
    { 'options.1': { $exists: true } },
    { 'answer.value': { $regex: /^\s*-?\d{1,5}\s*$/ } },
    { 'answer.value': { $type: 'number' } },
  ],
};

// ---------------------------------------------------------------- levels (how the bank is browsed)

const LEVELS = [
  { id: 'elem', title: 'Elementary', sub: 'K–5' },
  { id: 'ms', title: 'Middle school', sub: '6–8' },
  { id: 'alg1', title: 'Algebra 1', sub: '' },
  { id: 'geo', title: 'Geometry', sub: '' },
  { id: 'alg2', title: 'Algebra 2', sub: '' },
  { id: 'prec', title: 'Precalculus', sub: '' },
  { id: 'hs', title: 'High school', sub: '9–12' },
  { id: 'stat', title: 'Statistics', sub: '' },
  { id: 'calc', title: 'Calculus', sub: '' },
  { id: 'other', title: 'More', sub: '' },
];
const COURSE_LEVEL = { ELEM: 'elem', MS: 'ms', ALG1: 'alg1', GEO: 'geo', ALG2: 'alg2', PREC: 'prec', CALC: 'calc', STAT: 'stat' };
const BAND_LEVEL = { preK: 'elem', 'K-5': 'elem', '5-8': 'ms', '8-12': 'hs', Calculus: 'calc', 'Calc 3': 'calc' };

// A quarter of the legacy skills carry no course, band or grade; their category still says roughly
// where they sit (the enum in models/skill.js is grouped the same way). Arithmetic categories go to
// middle school: the elementary skills proper are the taxonomy's ELEM.* ids, which have a course.
const CATEGORY_LEVEL = {
  'counting-cardinality': 'elem', 'number-recognition': 'elem', 'addition-subtraction': 'elem', 'multiplication-division': 'elem', 'place-value': 'elem', 'shapes-geometry': 'elem', measurement: 'elem', time: 'elem', data: 'elem', money: 'elem', arrays: 'elem', counting: 'elem', 'number-sense': 'elem', 'mental-math': 'elem', estimation: 'elem',
  fractions: 'ms', decimals: 'ms', operations: 'ms', 'number-system': 'ms', numbers: 'ms', 'ratios-proportions': 'ms', percent: 'ms', 'integers-rationals': 'ms', 'scientific-notation': 'ms', 'area-perimeter': 'ms', volume: 'ms', angles: 'ms', 'pythagorean-theorem': 'ms', transformations: 'ms', 'scatter-plots': 'ms', rates: 'ms', conversions: 'ms', 'word-problems': 'ms', 'data-displays': 'ms', exponents: 'ms', 'number-theory': 'ms',
  geometry: 'geo', triangles: 'geo', circles: 'geo', polygons: 'geo', quadrilaterals: 'geo', congruence: 'geo', similarity: 'geo', '3d-geometry': 'geo', 'coordinate-geometry': 'geo', proofs: 'geo', 'parallel-perpendicular': 'geo', 'surface-area': 'geo', 'right-triangles': 'geo',
  statistics: 'stat', probability: 'stat', 'statistics-probability': 'stat',
  limits: 'calc', derivatives: 'calc', differentiation: 'calc', 'applications-derivatives': 'calc', integrals: 'calc', integration: 'calc', 'integration-techniques': 'calc', 'applications-integrals': 'calc', 'differential-equations': 'calc', 'vector-calculus': 'calc', 'parametric-polar': 'calc', 'series-tests': 'calc', 'taylor-series': 'calc', multivariable: 'calc', calc3: 'calc', 'area-approximation': 'calc', optimization: 'calc',
};

/** Where a skill sits for browsing: its taxonomy course, else its grade band, else its nominal grade, else its category. */
function levelOf(s) {
  if (s.courseLevel && COURSE_LEVEL[s.courseLevel]) return COURSE_LEVEL[s.courseLevel];
  if (s.gradeBand && BAND_LEVEL[s.gradeBand]) return BAND_LEVEL[s.gradeBand];
  if (/^\s*(?:pre-?k|k)\b/i.test(String(s.grade || ''))) return 'elem';
  const g = lowGrade(s.grade);
  if (g != null) return g <= 5 ? 'elem' : g <= 8 ? 'ms' : 'hs';
  if (CATEGORY_LEVEL[s.category]) return CATEGORY_LEVEL[s.category];
  // the rest of the enum is high-school algebra through precalculus (equations, functions, trig, vectors, matrices…)
  return s.category ? 'hs' : 'other';
}

const titleCase = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------- text

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let katex = null;
try { katex = require('katex'); } catch { katex = null; } // the page then shows the TeX source, escaped

function tex2html(tex, display) {
  if (katex) {
    try { return katex.renderToString(tex, { throwOnError: false, displayMode: !!display, strict: 'ignore' }); } catch { /* fall through */ }
  }
  return `<code class="tex">${esc(tex)}</code>`;
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
const TEXY = /[\\^_{}=]/; // an inline $…$ is math only when it looks like TeX, so "$5 and $3" stays money

/** Authored text as play HTML: escaped, TeX rendered, newlines kept. */
function render(text) {
  const s = String(text == null ? '' : text);
  const out = [];
  let last = 0;
  let m;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(s))) {
    const inline = m[4] !== undefined;
    if (inline && !TEXY.test(m[4])) continue; // a dollar amount, not a formula
    out.push(esc(s.slice(last, m.index)));
    out.push(tex2html(m[1] || m[2] || m[3] || m[4], !inline && m[3] === undefined));
    last = MATH_RE.lastIndex;
  }
  out.push(esc(s.slice(last)));
  return out.join('').replace(/\r?\n/g, '<br>');
}

/** A figure the bank drew: the item's own SVG, with anything scripted refused outright. */
function figure(svg) {
  const s = String(svg || '').trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return '';
  if (/<script|javascript:|on[a-z]+\s*=|<foreignObject|<iframe|<object|<embed/i.test(s)) return '';
  return s;
}

/** The explanation, trimmed to a few sentences: the film room shows it under every miss. */
function tellText(explanation) {
  const s = String(explanation || '').trim();
  if (s.length <= 420) return s;
  const cut = s.slice(0, 420);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return (end > 120 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`);
}

// ---------------------------------------------------------------- items → bank

/** One Problem as the bank keeps it, or null when the game cannot deal it. */
function toItem(row) {
  if (!row || !row.prompt) return null;
  const id = String(row.problemId || row._id || '');
  if (!id) return null;
  const base = { id, prompt: String(row.prompt), svg: figure(row.svg), alt: String(row.figureAlt || ''), tell: tellText(row.explanation), difficulty: Number(row.difficulty) || 3 };
  const opts = normalizeOptions(row.options);
  if (opts.length >= 2) {
    const label = keyLabelOf(row);
    const ci = label ? LABELS.indexOf(label) : -1;
    if (ci < 0 || ci >= opts.length) return null; // the item does not say which option is right
    const texts = opts.map((o) => String(o.text));
    if (new Set(texts.map((t) => t.trim().toLowerCase())).size !== texts.length) return null; // two choices alike: no fair pick
    return { ...base, kind: 'mc', options: texts, correct: ci };
  }
  const v = row.answer && row.answer.value;
  const s = String(v == null ? '' : v).trim();
  if (!INT_RE.test(s)) return null;
  return { ...base, kind: 'typed', answer: String(Number(s)) };
}

const TIERS = [
  { key: 'easier', name: 'Easier', ch: '★', test: (d) => d <= 2 },
  { key: 'medium', name: 'Medium', ch: '★★', test: (d) => d === 3 },
  { key: 'harder', name: 'Harder', ch: '★★★', test: (d) => d >= 4 },
];

function cardFor(it, revealed) {
  const fig = it.svg ? `<div class="fig"${it.alt ? ` role="img" aria-label="${esc(it.alt)}"` : ''}>${it.svg}</div>` : '';
  const shown = revealed != null ? `<div class="posed-ans">${revealed}</div>` : '';
  return `${fig}<div class="card-body"><div class="posed"><div class="posed-q">${render(it.prompt)}</div>${shown}</div></div>`;
}

function summaryOf(it) {
  const text = String(it.prompt || '').replace(/\s+/g, ' ').trim();
  return esc(text.length > 140 ? `${text.slice(0, 139)}…` : text);
}

/**
 * A native bank for one skill: BOOKS (all, plus whichever difficulty tiers have enough items) and
 * makePlay. Every draw comes from `rand`, the engine's seeded generator.
 */
function buildBank(entry, rows) {
  const items = rows.map(toItem).filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (items.length < MIN_ITEMS) return null;
  const pools = { all: items };
  const BOOKS = { all: { name: 'All problems', ch: `${items.length} items`, blurb: entry.blurb || '' } };
  for (const t of TIERS) {
    const pool = items.filter((it) => t.test(it.difficulty));
    if (pool.length >= MIN_ITEMS && pool.length < items.length) { pools[t.key] = pool; BOOKS[t.key] = { name: t.name, ch: t.ch, blurb: `${pool.length} of the ${items.length} items.` }; }
  }
  const neg = items.some((it) => it.kind === 'typed' && it.answer.startsWith('-'));

  function makePlay(book, recentIds, rand) {
    const keys = (Array.isArray(book) ? book : [book]).filter((k) => pools[k]);
    const pool = keys.length === 1 ? pools[keys[0]] : keys.length ? items.filter((it) => keys.some((k) => pools[k].includes(it))) : items;
    const pb = keys.length === 1 ? keys[0] : 'all';
    let it = pool[0];
    for (let i = 0; i < 12; i++) {
      it = pool[Math.floor(rand() * pool.length)];
      if (!(recentIds || []).includes(it.id)) break;
    }
    const common = { id: it.id, playbook: pb, playbookName: BOOKS[pb].name, card: cardFor(it, null), summary: summaryOf(it) };
    if (it.kind === 'typed') {
      const shown = it.answer.replace('-', '−');
      return {
        ...common,
        head: 'Type the answer.',
        choices: [],
        input: 'number',
        ...(neg ? { neg: true } : {}),
        answer: it.answer,
        answerHtml: shown,
        tell: `<b>${shown}</b>${it.tell ? ` &mdash; ${render(it.tell)}` : ''}`,
        revealCard: cardFor(it, shown),
      };
    }
    // shuffle the choices with the game's generator; the key follows its text
    const order = it.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const choices = order.map((oi, pos) => ({ k: LABELS[pos], html: render(it.options[oi]) }));
    const answer = LABELS[order.indexOf(it.correct)];
    const answerHtml = render(it.options[it.correct]);
    return {
      ...common,
      head: 'Pick the answer.',
      choices,
      answer,
      answerHtml,
      tell: `<b>${answerHtml}</b>${it.tell ? ` &mdash; ${render(it.tell)}` : ''}`,
      revealCard: cardFor(it, answerHtml),
    };
  }

  return { BOOKS, makePlay, size: items.length, typed: items.every((it) => it.kind === 'typed') };
}

// ---------------------------------------------------------------- the index (which skills are drills)

let INDEX = null; // { at, list, bySkill }
let indexing = null;
let _models = null; // injected by tests; in life, the Mongoose models
const models = () => _models || { Skill: require('../../models/skill'), Problem: require('../../models/problem') };
let _now = () => Date.now();

async function buildIndex() {
  // Without a database there is no bank — say so at once. Mongoose would otherwise buffer the query
  // for ten seconds, and the search box (which also answers for the course drills, which need no
  // database) would hang with it.
  if (!_models && require('mongoose').connection.readyState !== 1) throw new Error('database not connected');
  const { Skill, Problem } = models();
  const [skills, counts] = await Promise.all([
    Skill.find({ isActive: true, provisional: { $ne: true } }).select('skillId displayName studentLabel description category gradeBand grade courseLevel').lean(),
    Problem.aggregate([{ $match: DRILLABLE }, { $group: { _id: '$skillId', n: { $sum: 1 } } }]),
  ]);
  const n = new Map(counts.map((c) => [c._id, c.n]));
  const hub = require('./solo').SKILLS_HUB;
  const list = [];
  for (const s of skills) {
    if (!SKILL_ID_RE.test(String(s.skillId || ''))) continue;
    const ids = skillLookupCandidates(s.skillId);
    const items = ids.reduce((t, id) => t + (n.get(id) || 0), 0);
    if (items < MIN_ITEMS) continue;
    const name = String(s.studentLabel || s.displayName || s.skillId).trim();
    list.push({
      skillId: s.skillId, drill: drillIdOf(s.skillId), name, formal: String(s.displayName || name).trim(),
      blurb: String(s.description || '').trim(), category: String(s.category || 'other'), level: levelOf(s),
      grade: s.grade ? String(s.grade) : '', items, ids, url: `/drill/${hub}?skill=${encodeURIComponent(s.skillId)}`,
    });
  }
  const order = new Map(LEVELS.map((l, i) => [l.id, i]));
  list.sort((a, b) => (order.get(a.level) - order.get(b.level)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { at: _now(), list, bySkill: new Map(list.map((e) => [e.skillId, e])) };
}

/** The drillable skills, cached. A rebuild that fails keeps the last index rather than emptying the bank. */
async function index() {
  if (INDEX && _now() - INDEX.at < INDEX_TTL) return INDEX;
  if (!indexing) {
    indexing = buildIndex().then((i) => { INDEX = i; return i; }).catch((err) => { if (INDEX) return INDEX; throw err; }).finally(() => { indexing = null; });
  }
  return indexing;
}

/** The skill, if it is a drill: name, items, level — from the index, so no Problem read. */
async function entryOf(skillId) {
  const i = await index();
  return i.bySkill.get(String(skillId || '')) || null;
}

// ---------------------------------------------------------------- search & browse

/** The words of a text, lowercase, accents and punctuation gone — the tokens the query is matched on. */
const words = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean);

function fieldsOf(e) {
  if (!e._f) e._f = { name: words(e.name), formal: words(e.formal), cat: words(titleCase(e.category)), blurb: words(e.blurb), id: words(e.skillId), grade: words(e.grade) };
  return e._f;
}
const hit = (field, tok) => (field.includes(tok) ? 2 : field.some((w) => w.startsWith(tok)) ? 1 : 0);

/**
 * Skills whose name, formal name, category, description or id carry every typed word (by prefix).
 * Sync over the loaded index; the route awaits `index()` first. Name hits outrank description hits.
 */
function search(q, opts = {}) {
  if (!INDEX) return [];
  const limit = Math.max(1, Math.min(50, opts.limit || SEARCH_LIMIT));
  const toks = words(String(q || '').slice(0, MAX_Q));
  if (!toks.length) return [];
  const scored = [];
  for (const e of INDEX.list) {
    const f = fieldsOf(e);
    let score = 0;
    let missed = false;
    for (const t of toks) {
      const s = hit(f.name, t) * 3 + hit(f.formal, t) * 2 + hit(f.cat, t) * 1.5 + hit(f.id, t) + hit(f.blurb, t) * 0.7 + (f.grade.includes(t) ? 1.5 : 0);
      if (!s) { missed = true; break; }
      score += s;
    }
    if (missed) continue;
    scored.push({ e, score: score + Math.min(e.items, 40) / 100 }); // a deeper bank edges out a thin one on a tie
  }
  scored.sort((a, b) => (b.score - a.score) || a.e.name.localeCompare(b.e.name));
  return scored.slice(0, limit).map(({ e, score }) => publicEntry(e, Math.round(score * 10) / 10));
}

const publicEntry = (e, score) => ({ drill: e.drill, skillId: e.skillId, name: e.name, formal: e.formal, blurb: e.blurb, category: e.category, categoryTitle: titleCase(e.category), level: e.level, grade: e.grade, items: e.items, url: e.url, ...(score != null ? { score } : {}) });

/** The whole bank for browsing: levels → categories → skills. */
function browse() {
  const list = INDEX ? INDEX.list : [];
  const levels = [];
  for (const L of LEVELS) {
    const mine = list.filter((e) => e.level === L.id);
    if (!mine.length) continue;
    const cats = new Map();
    for (const e of mine) {
      if (!cats.has(e.category)) cats.set(e.category, { id: e.category, title: titleCase(e.category), skills: [] });
      cats.get(e.category).skills.push({ drill: e.drill, skillId: e.skillId, name: e.name, items: e.items, url: e.url });
    }
    const categories = [...cats.values()].sort((a, b) => b.skills.length - a.skills.length || a.title.localeCompare(b.title));
    levels.push({ id: L.id, title: L.title, sub: L.sub, skills: mine.length, categories });
  }
  return { skills: list.length, levels };
}

// ---------------------------------------------------------------- prepare (a skill becomes a drill)

const pending = new Map();

/**
 * Make `skill:<skillId>` a drill the engine can deal, reading its items once. Returns the drill's
 * definition, or null when the skill is not in the bank (unknown, withheld, too few usable items).
 * Idempotent and cheap once built; concurrent callers share one read.
 */
async function prepare(skillId) {
  const id = String(skillId || '').trim();
  if (!SKILL_ID_RE.test(id)) return null;
  const drillId = drillIdOf(id);
  const have = engine.defOf(drillId);
  if (have && have.dynamic && _now() - have.builtAt < BANK_TTL) return have;
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    const entry = await entryOf(id);
    if (!entry) { if (have) engine.unregisterDrill(drillId); return null; }
    const rows = await models().Problem.find({ skillId: { $in: entry.ids }, ...DRILLABLE })
      .select('_id problemId prompt svg figureAlt explanation answer options correctOption difficulty').limit(MAX_ITEMS).lean();
    const bank = buildBank(entry, rows);
    if (!bank) { if (have) engine.unregisterDrill(drillId); return null; }
    engine.sweepDynamic(BANK_TTL * 2);
    return engine.registerDrill(drillId, { native: bank, title: entry.name, skillId: id, items: bank.size, typed: bank.typed, builtAt: _now(), entry: publicEntry(entry) });
  })().finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

/** Prepare whatever drill a request names, when it is a skill drill; true/false whether it can be played. */
async function ready(drillId) {
  if (!isSkillDrill(drillId)) return false;
  return !!(await prepare(skillIdOf(drillId)));
}

/**
 * The skill-bank hub as the solo page renders it: one game (this skill), the same picks every hub
 * offers (playbooks, clock, how to play, levels), and the course hubs to hop to.
 */
function hubView(def) {
  const solo = require('./solo');
  const e = def.entry;
  return {
    id: solo.SKILLS_HUB,
    title: e.name,
    skill: e,
    hubs: solo.hubList(),
    versus: solo.versusView(),
    games: [solo.gameView({ drill: drillIdOf(def.skillId), name: e.name, blurb: e.blurb || `${e.items} problems from the Mathmatix bank.` })],
  };
}

function _reset() { INDEX = null; indexing = null; pending.clear(); for (const id of [...engine._dynamic.keys()]) engine.unregisterDrill(id); }

module.exports = {
  PREFIX, MIN_ITEMS, LEVELS, DRILLABLE, MAX_Q, SEARCH_LIMIT,
  isSkillDrill, skillIdOf, drillIdOf, levelOf, render, toItem, buildBank,
  index, entryOf, search, browse, prepare, ready, hubView,
  _reset, _setModels: (m) => { _models = m || null; }, _setNow: (f) => { _now = f; }, _words: words,
};
