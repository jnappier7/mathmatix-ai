/**
 * Drill search — find a game and playbook by skill or topic.
 *
 * Twenty-six drills with five or six playbooks each is too many tiles to scan when a teacher
 * wants "completing the square" or a student wants "box plots". This indexes every playbook of
 * every drill in engine.js DRILLS (title, section number, name, blurb — the words the bank
 * itself prints) plus a short alias list for the names people actually type (SOHCAHTOA, FOIL,
 * PEMDAS, y = mx + b). Nothing here is a second catalog: a new bank is searchable the moment it
 * is registered, and the solo hub (utils/liveDrill/solo.js) says which course page it lives on.
 *
 * Matching is by word prefix, every query word must hit (AND), and a specific section outranks
 * its "Whole Module" book so "circles" lands on 10.1, not the mixed set. Both pickers — the
 * host's and the solo page's — read the same `GET /api/live-drill/solo/search?q=`.
 */
const { DRILLS, listPlaybooks } = require('./engine');
const { HUBS } = require('./solo');

/** Things people type → the words the banks print. Lowercase, letters/digits only (see `words`). */
const ALIASES = {
  sohcahtoa: ['trig', 'sine', 'cosine', 'tangent', 'ratios'],
  soh: ['trig'], cah: ['trig'], toa: ['trig'],
  trig: ['sine', 'cosine', 'tangent', 'ratios'],
  trigonometry: ['trig'],
  sin: ['sine', 'trig'], cos: ['cosine', 'trig'], tan: ['tangent', 'trig'],
  pythag: ['pythagorean'], pythagoras: ['pythagorean'], hypotenuse: ['pythagorean', 'right'],
  foil: ['multiply', 'binomial', 'polynomials'],
  pemdas: ['order', 'operations'],
  gemdas: ['order', 'operations'],
  mx: ['slope', 'intercept'], // y = mx + b
  'y=mx+b': ['slope', 'intercept'],
  slope: ['lines', 'slope'],
  quadratics: ['quadratic', 'graphing', 'factoring', 'formula'],
  parabola: ['quadratics', 'graphing', 'vertex'],
  discriminant: ['formula'],
  factoring: ['factor'], factorise: ['factor'], factorize: ['factor'],
  exponent: ['exponents', 'powers'], exponents: ['powers', 'exponent'],
  radical: ['radicals', 'roots'], radicals: ['roots', 'simplifying'],
  sqrt: ['square', 'roots'], 'square root': ['roots'],
  inequality: ['inequalities'], inequalities: ['flip', 'compound'],
  system: ['systems'], systems: ['substitution', 'elimination'],
  stats: ['statistics', 'mean', 'median', 'box', 'quartiles'],
  statistics: ['mean', 'median', 'mode', 'range', 'quartiles', 'outliers', 'box'],
  average: ['mean'], iqr: ['quartiles', 'spread'], boxplot: ['box', 'plots'],
  'box and whisker': ['box', 'plots'], whisker: ['box', 'plots'],
  mmm: ['mean', 'median', 'mode'],
  distribute: ['distributive', 'distribute'], distributive: ['distribute', 'properties'],
  combine: ['like', 'terms'],
  'absolute value': ['absolute'], abs: ['absolute'],
  proportion: ['proportions'], ratio: ['proportions', 'scale', 'similar'],
  percent: ['percent', 'proportions'],
  function: ['functions', 'notation'], functions: ['relations', 'notation', 'domain'],
  domain: ['relations', 'functions'], range: ['relations', 'functions', 'spread'],
  arithmetic: ['sequences'], geometric: ['sequences', 'mean'], sequence: ['sequences'],
  exponential: ['growth', 'decay', 'exponential'],
  polynomial: ['polynomials'], trinomial: ['trinomials', 'factor'], binomial: ['multiply', 'special'],
  'difference of squares': ['special', 'products'],
  'completing the square': ['completing'],
  vertex: ['graphing', 'quadratics'],
  'zero product': ['factoring', 'zero'],
  parallel: ['parallel', 'perpendicular'], perpendicular: ['parallel', 'perpendicular'],
  transversal: ['parallel', 'angle', 'pairs'],
  'alternate interior': ['angle', 'pairs', 'parallel'], 'corresponding angles': ['angle', 'pairs'],
  transformation: ['transformations', 'translations', 'reflections', 'rotations'],
  transformations: ['translations', 'reflections', 'rotations', 'symmetry'],
  translation: ['translations'], reflection: ['reflections'], rotation: ['rotations'], slide: ['translations'], flip: ['reflections', 'flip'], turn: ['rotations'],
  congruent: ['congruent', 'criteria'], congruence: ['congruent', 'criteria'],
  sss: ['criteria', 'ssa', 'sss'], sas: ['criteria', 'sas'], asa: ['criteria', 'asa'], aas: ['criteria', 'aas'], hl: ['criteria', 'hl'],
  cpctc: ['cpctc', 'proofs'],
  isosceles: ['isosceles', 'equilateral'], equilateral: ['isosceles', 'equilateral'],
  bisector: ['bisectors'], bisectors: ['perpendicular', 'angle'],
  centroid: ['concurrency', 'centers'], incenter: ['concurrency', 'centers'], circumcenter: ['concurrency', 'centers'], orthocenter: ['concurrency', 'centers'],
  concurrency: ['centers'],
  midsegment: ['midsegments'],
  'triangle inequality': ['inequalities', 'third', 'side'],
  polygon: ['polygons', 'polygon'], polygons: ['angles', 'areas'],
  quadrilateral: ['quadrilaterals', 'parallelograms', 'trapezoids'], quadrilaterals: ['parallelograms', 'rectangle', 'rhombus', 'trapezoids', 'kites'],
  parallelogram: ['parallelograms'], rhombus: ['rhombus', 'special'], trapezoid: ['trapezoids'], kite: ['kites'],
  similar: ['similar', 'similarity', 'scale'], similarity: ['similar', 'scale', 'proportionality'], dilation: ['scale', 'similar'],
  'special right': ['special', 'right'], '45': ['special', 'right'], '30': ['special', 'right'],
  'geometric mean': ['geometric', 'means', 'altitude'],
  'law of sines': ['laws', 'sines'], 'law of cosines': ['laws', 'cosines'],
  circle: ['circles', 'circle'], circles: ['tangents', 'arcs', 'chords', 'inscribed', 'sectors'],
  tangent: ['tangents', 'tangent'], chord: ['chords'], arc: ['arcs'], inscribed: ['inscribed'], secant: ['segment', 'products'],
  radius: ['circle', 'circles'], diameter: ['circle', 'circles'],
  area: ['areas', 'area'], perimeter: ['perimeter', 'areas'], circumference: ['circumference', 'circles'],
  volume: ['prisms', 'pyramids', 'cones', 'spheres', 'volume'], 'surface area': ['prisms', 'pyramids', 'cones', 'spheres'],
  prism: ['prisms'], cylinder: ['cylinders'], pyramid: ['pyramids'], cone: ['cones'], sphere: ['spheres'],
  '3d': ['prisms', 'pyramids', 'cones', 'spheres'], solids: ['prisms', 'cylinders'],
  midpoint: ['midpoints', 'midpoint'], distance: ['coordinate', 'distance'],
  angle: ['angles', 'angle'], angles: ['angle', 'pairs'],
  complementary: ['angle', 'pairs', 'angles'], supplementary: ['angle', 'pairs', 'angles'],
  proof: ['proofs', 'proof', 'reasons'], proofs: ['proof', 'reasons'], reasons: ['proof', 'justify'],
  postulate: ['postulates'], theorem: ['theorems'],
  'times tables': ['multiplication'], 'multiplication tables': ['multiplication'],
  timestables: ['multiplication'], multiplying: ['multiplication', 'multiply'], dividing: ['division', 'dividing'],
  adding: ['addition'], subtracting: ['subtraction'],
  integers: ['integers', 'negatives'], negatives: ['integers', 'negative'],
  squares: ['squares', 'roots'], 'perfect squares': ['squares'],
  facts: ['facts', 'mixed'], fluency: ['facts'], 'math facts': ['facts'],
  'word problems': ['word', 'stories', 'problems'], 'story problems': ['stories', 'word'],
  act: ['act', 'review'], psat: ['psat'], sat: ['act', 'psat'],
  equation: ['equations', 'solving'], equations: ['solving', 'solve'],
  solve: ['solving', 'solve'], solving: ['solve', 'equations'],
  'literal equations': ['literal'], formula: ['literal', 'formula'],
  intercept: ['intercept', 'intercepts'], intercepts: ['intercept'],
  'point slope': ['point', 'slope', 'forms'], 'standard form': ['standard', 'forms'],
  'scatter plot': ['scatter', 'fit'], scatter: ['fit'], correlation: ['fit', 'scatter'], regression: ['fit'],
  'line of best fit': ['fit', 'scatter'],
  'order of operations': ['order', 'operations'],
  expression: ['expressions'], expressions: ['simplify', 'evaluate'],
  simplify: ['simplify', 'simplifying', 'like', 'terms'], evaluate: ['evaluate', 'evaluating'],
  properties: ['properties', 'property'], property: ['properties'],
  'like terms': ['like', 'terms', 'simplify'],
  fraction: ['fractions'], fractions: ['fractions', 'review'], decimals: ['review'],
  growth: ['growth', 'decay', 'exponential'], decay: ['growth', 'decay', 'exponential'],
  'compound interest': ['models', 'growth', 'compounding'],
  'rational exponents': ['rational', 'exponents'],
  rationalize: ['rationalize', 'radicals', 'denominator'],
  'zero exponent': ['zero', 'negative', 'exponents'], 'negative exponent': ['zero', 'negative', 'exponents'],
  gcf: ['gcf', 'factor'], grouping: ['grouping', 'gcf'],
  outlier: ['outliers'], 'five number summary': ['quartiles', 'five', 'number'],
  'set builder': ['set', 'builder'], 'interval notation': ['set', 'builder', 'graph'],
  compound: ['compound'], 'and or': ['compound'],
  'half plane': ['linear', 'inequalities', 'shading'], shading: ['linear', 'inequalities', 'shaded'],
  substitution: ['substitution', 'substituting'], elimination: ['elimination'],
  'skew lines': ['skew', 'lines', 'planes'], skew: ['lines', 'planes'],
  converse: ['converse', 'theorems'],
  'exterior angle': ['exterior', 'angles', 'triangles'], 'triangle sum': ['angles', 'triangles', 'sum'],
  'interior angles': ['interior', 'angles', 'polygons'],
  euler: ['euler', 'solids'], 'cross section': ['cross', 'sections'], cavalieri: ['cavalieri'],
  sector: ['sectors', 'sector'], radians: ['radians'], apothem: ['apothem', 'polygons'],
  hemisphere: ['hemispheres', 'spheres'],
  'circle equation': ['coordinate', 'circles', 'equation'], 'equation of a circle': ['coordinate', 'circles', 'equation'],
};

/** Lowercase words, letters and digits only — "SOH-CAH-TOA" → soh cah toa; "10.1" → 10 1. */
const words = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(Boolean);

let INDEX = null;

/** Every playbook of every drill, with the course page it is played on. Built once. */
function buildIndex() {
  const hubOf = {};
  for (const [hubId, hub] of Object.entries(HUBS)) {
    for (const g of hub.games) hubOf[g.drill] = { hub: hubId, hubTitle: hub.title, game: g.name, gameBlurb: g.blurb || '' };
  }
  const out = [];
  let order = 0;
  for (const [drill, d] of Object.entries(DRILLS)) {
    let books;
    try { books = listPlaybooks(drill); } catch { continue; } // a bank that won't load is not searchable
    const h = hubOf[drill] || { hub: null, hubTitle: '', game: d.title, gameBlurb: '' };
    for (const b of books) {
      const e = {
        drill, title: d.title, hub: h.hub, hubTitle: h.hubTitle, game: h.game,
        key: b.key, name: b.name, ch: b.ch || '', blurb: b.blurb || '',
        whole: b.key === 'all',
        order: order++,
      };
      e.fields = {
        name: words(e.name), ch: words(e.ch), blurb: words(e.blurb),
        title: words(e.title).concat(words(e.game)), hub: words(e.hubTitle),
        // the game's blurb names the module's topics even when a section blurb is terse
        gameBlurb: e.whole ? words(h.gameBlurb) : [],
      };
      out.push(e);
    }
  }
  return out;
}

function index() { if (!INDEX) INDEX = buildIndex(); return INDEX; }

const WEIGHT = { name: 5, ch: 4, title: 3, gameBlurb: 2, blurb: 2, hub: 1 };

/** Does any word of the field start with the token? A bare digit must match a whole word
 *  ("1" must not light up every 10.x, 11.x and 12.x section). */
function hit(field, tok) {
  const whole = /^\d+$/.test(tok);
  return field.some((w) => (whole ? w === tok : w.startsWith(tok)));
}

/** The query as word groups: each typed word with the alias words it (or a two- or three-word
 *  phrase it sits in) stands for. A group is satisfied by ANY of its words, so "sohcahtoa" finds
 *  trig through its aliases while "circles xyzzy" still finds nothing — xyzzy's group is empty-handed. */
function expand(q) {
  const own = words(q);
  const groups = own.map((w) => ({ word: w, aliases: new Set() }));
  for (let i = 0; i < own.length; i++) {
    for (let len = 3; len >= 1; len--) {
      if (i + len > own.length) continue;
      const phrase = own.slice(i, i + len).join(' ');
      if (!ALIASES[phrase]) continue;
      for (let j = i; j < i + len; j++) for (const a of ALIASES[phrase]) groups[j].aliases.add(a);
    }
  }
  const glued = String(q).toLowerCase().replace(/\s+/g, '');
  if (ALIASES[glued] && glued !== own.join(' ')) for (const g of groups) for (const a of ALIASES[glued]) g.aliases.add(a); // "y=mx+b"
  for (const g of groups) g.aliases.delete(g.word);
  return { own, groups: groups.map((g) => ({ word: g.word, aliases: [...g.aliases] })), extra: [...new Set(groups.flatMap((g) => [...g.aliases]))] };
}

/** "chapter 9", "module 11", "mod 4", "ch 10", "unit 7": the number names the drill. */
const DRILL_WORDS = new Set(['chapter', 'ch', 'module', 'mod', 'unit']);

const MAX_Q = 80;
const LIMIT = 12;

function bestHit(e, tok) {
  let best = 0;
  for (const [f, w] of Object.entries(WEIGHT)) if (hit(e.fields[f], tok)) best = Math.max(best, w);
  // A bare number that names the drill ("chapter 9", "module 11") outranks the same digit
  // inside a section's question range ("Q4–9"): the student means the chapter.
  if (best && /^\d+$/.test(tok) && hit(e.fields.title, tok)) best = 6;
  return best;
}

/**
 * @param {string} q  what was typed
 * @param {object} [opts]  { limit }
 * @returns {Array<{drill,title,hub,hubTitle,game,key,name,ch,blurb,score}>} best first
 */
function search(q, opts = {}) {
  const limit = Math.max(1, Math.min(50, opts.limit || LIMIT));
  const { own, groups } = expand(String(q || '').slice(0, MAX_Q));
  if (!own.length) return [];
  // "chapter 9": the drill whose title carries the 9, and only that drill
  const drillNums = own.filter((w, i) => i > 0 && DRILL_WORDS.has(own[i - 1]) && /^\d+$/.test(w));
  const scored = [];
  for (const e of index()) {
    if (drillNums.length && !drillNums.every((n) => hit(e.fields.title, n))) continue;
    let score = 0;
    let missed = false;
    for (const g of groups) {
      // The typed word itself counts in full; each alias it stands for adds a little, so a
      // book that carries several of a topic's words ("circles" → tangents, arcs, chords,
      // inscribed) rises above one that carries a single one.
      const direct = bestHit(e, g.word);
      let viaAlias = 0;
      for (const a of g.aliases) viaAlias += bestHit(e, a) * 0.4;
      if (!direct && !viaAlias) { missed = true; break; }
      score += direct + Math.min(viaAlias, 6);
    }
    if (missed) continue;
    if (e.whole) score -= 1.5; // a section beats its "Whole Module" on the same words
    scored.push({ e, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.e.order - b.e.order));
  return scored.slice(0, limit).map(({ e, score }) => ({
    drill: e.drill, title: e.title, hub: e.hub, hubTitle: e.hubTitle, game: e.game,
    key: e.key, name: e.name, ch: e.ch, blurb: e.blurb, score: Math.round(score * 10) / 10,
  }));
}

module.exports = { search, buildIndex, expand, words, ALIASES, MAX_Q, LIMIT, _reset: () => { INDEX = null; } };
