/**
 * Solo practice — the Live Drill banks, played alone, no host (public/drill.html at /drill/<hub>).
 *
 * A HUB is a course's games on one page: everything Algebra 1 students can drill, everything
 * Geometry students can. Each game is a Live Drill bank (engine.js DRILLS), so the questions,
 * figures and tells are the very ones a class game deals — a new Course Planner publish or a new
 * Test Prep bank shows up here the moment it is added to a hub below.
 *
 * Nothing is graded or saved on the server. The page gets whole plays, answer included, and keeps
 * its own score — the same trust the course site's own drill page runs on (it is all client-side).
 * That is why this can be public with no account: there is no record to protect and no score to
 * cheat. A class game's plays never come through here; a solo seed is the student's own.
 */
const { DRILLS, dealPlay, listPlaybooks, RECENT } = require('./engine');
const { settingsFor, SCORING } = require('./games');
const { FOCUSABLE, FOCUS_MAX, normalizeFocus } = require('./facts');

const HUBS = {
  algebra: {
    title: 'Algebra 1',
    games: [
      { drill: 'algebra', name: 'Two-Minute Drill', blurb: 'Every module of the course, one quick question at a time.' },
      { drill: 'alg1m3', name: 'Module 3 Test Prep', blurb: 'Relations & functions — every question type on the Module 3 test, fresh numbers each time.' },
      { drill: 'alg1m7', name: 'Module 7 Review', blurb: 'Systems of equations and inequalities — graphing, substitution, elimination, one quick move at a time.' },
      { drill: 'alg1m8', name: 'Module 8 Review', blurb: 'Exponents and radicals — the rules, rational exponents, simplifying, one quick move at a time.' },
      { drill: 'alg1m9', name: 'Module 9 Review', blurb: 'Exponential functions and geometric sequences — growth, decay, models, ratios, one quick move at a time.' },
      { drill: 'alg1m10', name: 'Module 10 Review', blurb: 'Polynomials and factoring — add, multiply, FOIL, GCF, trinomials, special products, one quick move at a time.' },
      { drill: 'facts', name: 'Math Facts', blurb: 'Type the answer. Fluent is right in 3 seconds or less.' },
    ],
  },
  geometry: {
    title: 'Honors Geometry',
    games: [
      { drill: 'geometry', name: 'Proof Reasons', blurb: 'Which reason justifies the step? Chapters 2 and 3.' },
      { drill: 'hgeo3', name: 'Chapter 3 Test Prep', blurb: 'Parallel & perpendicular lines — every question type on the Chapter 3 test.' },
      { drill: 'hgeo4', name: 'Chapter 4 Review', blurb: 'Transformations — translations, reflections, rotations and symmetry, one quick move at a time.' },
      { drill: 'hgeo5', name: 'Chapter 5 Review', blurb: 'Congruent triangles — angles, the criteria, isosceles triangles and CPCTC, one quick move at a time.' },
      { drill: 'hgeo6', name: 'Chapter 6 Review', blurb: 'Relationships within triangles — bisectors, the four centers, midsegments, inequalities, one quick move at a time.' },
      { drill: 'hgeo7', name: 'Chapter 7 Review', blurb: 'Quadrilaterals — polygon angles, parallelograms, the special ones, trapezoids and kites, one quick move at a time.' },
    ],
  },
};

const BATCH = 40; // plays per request: a fast Math Facts round is ~60–80 in two minutes
const MAX_PLAY = 400; // a five-minute facts round at a fact a second is 300; bounds the work per request
const SEED_RE = /^[A-Za-z0-9]{8,32}$/;

const scoringOf = (drill) => SCORING[(DRILLS[drill] || {}).scoring] || SCORING.standard;

const hubList = () => Object.entries(HUBS).map(([id, h]) => ({ id, title: h.title, games: h.games.map((g) => g.name) }));

/** One hub, as the page renders it: each game with its playbooks, clock choices and scoring. */
function hubView(hubId) {
  const hub = Object.hasOwn(HUBS, hubId) ? HUBS[hubId] : null;
  if (!hub) return null;
  return {
    id: hubId,
    title: hub.title,
    hubs: hubList(),
    games: hub.games.map((g) => {
      const { drive } = settingsFor(g.drill);
      const s = scoringOf(g.drill);
      return {
        drill: g.drill, name: g.name, blurb: g.blurb, typed: !!DRILLS[g.drill].typed,
        playbooks: listPlaybooks(g.drill),
        clock: { seconds: drive.seconds, defaultSeconds: drive.defaultSeconds },
        scoring: { gains: s.gains, withinMs: s.driveMs, miss: s.sack },
        ...(DRILLS[g.drill].focus ? { focusable: { books: FOCUSABLE, max: FOCUS_MAX } } : {}),
      };
    }),
  };
}

/**
 * Which hub a class belongs to, from its course and name ("Honors Geometry · P3", "Algebra 1").
 * Geometry wins over algebra when both appear ("Algebra-based Geometry" is a geometry class).
 * Null when nothing matches — the My Class page then shows the /drill index instead of a course.
 */
function hubFor(...labels) {
  const text = labels.filter(Boolean).join(' ').toLowerCase();
  if (/geom/.test(text)) return 'geometry';
  if (/alg/.test(text)) return 'algebra';
  return null;
}

/** Is this drill on some hub? Only those are dealt here. */
const onAHub = (drill) => Object.values(HUBS).some((h) => h.games.some((g) => g.drill === drill));

/**
 * Plays from+1 … from+count of a solo round. Dealt from play 1 every time so each play's
 * "recent" list (the bank steers away from the last six templates) is the one an unbroken round
 * would have had — page two continues page one exactly.
 */
function deal(drill, playbook, seed, from, count = BATCH, focus = null) {
  const out = [];
  const deck = [];
  for (let n = 1; n <= from + count; n++) {
    const recent = deck.slice(-RECENT).map((p) => p.id).reverse();
    const play = dealPlay(drill, playbook, seed, n, recent, { focus });
    deck.push(play);
    if (n > from) out.push(play);
  }
  return out;
}

/** Validate a deal request; returns { drill, playbook, seed, from, focus } or { error }. */
function parseDeal(q) {
  const drill = String(q.drill || '');
  if (!onAHub(drill)) return { error: 'Unknown game.' };
  const seed = String(q.seed || '');
  if (!SEED_RE.test(seed)) return { error: 'Bad seed.' };
  const from = Number(q.from || 0);
  if (!Number.isInteger(from) || from < 0 || from > MAX_PLAY - BATCH) return { error: 'Bad position.' };
  const books = listPlaybooks(drill).map((b) => b.key);
  const playbook = books.includes(String(q.book)) ? String(q.book) : 'all';
  // Math Facts: "only 2s, 5s and 10s" — the same focus a teacher sets in a class game.
  const focus = DRILLS[drill].focus && FOCUSABLE.includes(playbook) && q.focus
    ? normalizeFocus(String(q.focus).split(',').slice(0, FOCUS_MAX + 1)) : null;
  return { drill, playbook, seed, from, focus };
}

module.exports = { HUBS, BATCH, MAX_PLAY, hubList, hubView, hubFor, deal, parseDeal, onAHub };
