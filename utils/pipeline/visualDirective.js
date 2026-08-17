// utils/pipeline/visualDirective.js
//
// "Draw it" — the missing ASK.
//
// The tutor has a large visual toolkit (utils/visualCapabilities.js documents
// graphs, circle diagrams, sliders, 3D, number lines, algebra tiles, fraction
// models) and knows it has them. What it never had was anything ASKING it to
// use one. The prompt frames the whole toolkit defensively — "Do NOT force
// visuals on every response", "Don't default to tiles" — and no stage ever
// pushed the other way, so the model settled on prose almost every turn. A
// student working through geometry or transformations got paragraphs.
//
// This adds the counterweight, deliberately NARROW so it does not become
// decoration. A visual is asked for on exactly two grounds:
//
//   1. THE MOMENT — the instructional action is one where a picture is doing
//      the teaching: introducing a novel skill, bridging a prerequisite,
//      re-teaching after a misconception, switching representation (which
//      literally means "stop saying it the way that failed"), or scaffolding
//      down after repeated misses.
//   2. THE MATH — the topic is spatial or graphical by nature. Geometry,
//      transformations, slope, systems, fractions, signed numbers and trig
//      are taught with a picture by every good human tutor; text is the
//      degraded version, not the neutral one.
//
// And it stays silent where a picture would be noise: a student who just
// solved it, an off-topic redirect, a pure feelings moment, or a board that
// already carries a visual for this problem (a good tutor points back at the
// drawing rather than redrawing it).
//
// Pure and dependency-free so decide.js stays testable headless.

// ── Moments where a visual is load-bearing ────────────────────────────────
// Keyed to the ACTIONS in decide.js. Kept as a plain set of strings so this
// module does not have to import decide.js (which imports observe.js, and so
// on) — the names are a stable contract, pinned by tests.
const VISUAL_MOMENTS = new Set([
  'direct_instruction',      // novel skill: the first encounter should be seen
  'prerequisite_bridge',     // going back to fundamentals — make them concrete
  'review_prerequisite',
  'reteach_misconception',   // the words already failed once
  'switch_representation',   // the action IS "say it another way"
  'worked_example',
  'scaffold_down',           // prose is not landing
]);

// Moments where a picture is actively wrong: they just got it, or the turn
// is not about math at all.
const NEVER_VISUAL = new Set([
  'confirm_correct',
  'affirm_then_probe',
  'acknowledge_progress',
  'redirect_to_math',
  'acknowledge_frustration',
  'elicit_first',
  'check_understanding',
]);

// The student ASKING to be shown outranks every silence above. "I can't
// picture it, can you show me?" reads as frustration to the decide stage
// (acknowledge_frustration), which is in NEVER_VISUAL — so the one turn where
// the student has explicitly requested a picture was the one turn guaranteed
// not to get one. Nobody has to infer the moment when the student names it.
// Deliberately narrow. A bare /\bshow me\b/ fires on "my teacher will show me
// the test on friday" — so the ask has to be aimed AT THE TUTOR (a modal with
// "you"), or stand as an imperative at the start of a clause, or say outright
// that picturing it is what failed.
const ASKED_TO_SEE = new RegExp([
  /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:show|draw|graph|sketch)\b/,
  /(?:^|[.!?;]\s*)(?:please\s+)?(?:show|draw|graph|sketch)\s+(?:me|it|that|this)\b/,
  /\bcan'?(?:no)?t\s+(?:picture|visualize|see)\s+(?:it|this|that)\b/,
  /\bwhat\s+(?:would|does)\s+(?:it|that|this)\s+look\s+like\b/,
].map((r) => r.source).join('|'), 'i');

// ── Topics that are visual by nature ──────────────────────────────────────
// Each names the tool to reach for, because "use a visual" against a menu of
// forty tags reliably produces nothing. Order matters: the first match wins,
// so the more specific patterns come first.
//
// Every noun carries its plural and every verb its inflections — these match
// SKILL NAMES ("Adding Integers", "Factoring Trinomials") as often as student
// prose, and a bare \binteger\b silently misses every one of them.
//
// Bare "tangent" is deliberately NOT in the circle pattern: it would capture
// the calculus "tangent line to the curve" and answer it with a circle
// diagram. Each sense is claimed by the entry that owns it.
const VISUAL_TOPICS = [
  {
    rx: /\b(circles?|chords?|secants?|arcs?|inscribed|central angles?|circumference|tangent (?:to|line) (?:the )?circle)\b/i,
    tool: '[CIRCLE_DIAGRAM:...] — never a function graph for a circle',
  },
  {
    rx: /\b(unit circle|sine|cosine|tangent function|trig\w*|radians?|amplitude|periodic)\b/i,
    tool: '[UNIT_CIRCLE:...] or a labelled triangle diagram',
  },
  {
    rx: /\b(triangles?|angles?|polygons?|quadrilaterals?|parallel lines|transversals?|congruen\w*|similar figures|pythag\w*|hypotenuse)\b/i,
    tool: '[DIAGRAM:triangle:...] / [DIAGRAM:angle:...] / [TRIANGLE_PROBLEM:...]',
  },
  {
    rx: /\b(area|perimeter|volume|surface area|prisms?|cylinders?|cones?|spheres?|pyramids?)\b/i,
    tool: 'a labelled figure — [DIAGRAM:...], or <BOARD action="image" query="..."/> for a solid',
  },
  {
    rx: /\b(systems? of equations|solve by graphing|point of intersection|simultaneous equations)\b/i,
    tool: '[SYSTEM_GRAPH:eqs="EQ1;EQ2"] — one shared plane, never two separate graphs',
  },
  {
    rx: /\b(transformations?|translat\w*|reflect\w*|rotat\w*|dilat\w*|shift the graph|parent functions?)\b/i,
    tool: '[SLIDER_GRAPH:...] so they can DRAG the parameter and watch it move',
  },
  {
    rx: /\b(slopes?|y-intercepts?|linear functions?|rate of change|graph(?:ing)? (?:the )?lines?|coordinate plane|plot\w*)\b/i,
    tool: '[FUNCTION_GRAPH:...] or [SLIDER_GRAPH:fn=m*x+b,params="m:1:-5:5,b:0:-5:5"]',
  },
  {
    rx: /\b(parabolas?|quadratics?|vertex|axis of symmetry|derivatives?|tangent lines?)\b/i,
    tool: '[DIAGRAM:parabola:...] or [FUNCTION_GRAPH:...] / [DERIVATIVE_GRAPH:...]',
  },
  {
    rx: /\b(fractions?|numerators?|denominators?|mixed numbers?|percents?|percentages?|ratios?|proportions?)\b/i,
    tool: '[FRACTION:...] bar/area model',
  },
  {
    rx: /\b(integers?|negative numbers?|signed numbers?|opposites?|absolute value|zero pairs?|number lines?|inequalit\w*)\b/i,
    tool: '[DIAGRAM:number_line:...] (or counters for zero pairs)',
  },
  {
    rx: /\b(factor\w*|distribut\w*|expand\w*|binomials?|trinomials?|complete the square)\b/i,
    tool: '[TILES:...] — the rectangle model makes factoring visible',
  },
  {
    rx: /\b(histograms?|box plots?|scatter\w*|data sets?|distributions?|mean absolute|dot plots?)\b/i,
    tool: '[POINTS:points=(x,y),...] or an appropriate plot',
  },
];

function matchTopic(text) {
  if (!text) return null;
  for (const t of VISUAL_TOPICS) {
    if (t.rx.test(text)) return t;
  }
  return null;
}

/**
 * Ask for a visual when this turn is one that earns one.
 *
 * @param {Object} input
 * @param {string}  input.action        - decision.action
 * @param {string}  [input.skillName]   - active skill display name
 * @param {string}  [input.studentText] - the student's message this turn
 * @param {boolean} [input.boardHasVisual] - a graph/diagram is already up for
 *        this problem; a good tutor points back at it instead of redrawing
 * @param {number}  [input.recentWrongCount]
 * @returns {string|null} the directive, or null to stay quiet
 */
function buildVisualDirective(input = {}) {
  const action = input.action || '';
  const asked = ASKED_TO_SEE.test(input.studentText || '');
  if (NEVER_VISUAL.has(action) && !asked) return null;
  // Already drawn for this problem — refer to it, don't produce another.
  if (input.boardHasVisual) return null;

  const topic = matchTopic(`${input.skillName || ''} ${input.studentText || ''}`);
  const isMoment = VISUAL_MOMENTS.has(action);
  const struggling = (input.recentWrongCount || 0) >= 2;

  // Neither the moment nor the math calls for one. Say nothing — silence here
  // is what keeps this from becoming decoration.
  if (!isMoment && !topic && !struggling && !asked) return null;

  const why = asked
    ? 'The student ASKED to see it — that request outranks every other read of this turn.'
    : isMoment
      ? 'This is a teaching turn — the kind where a good tutor reaches for paper.'
      : struggling
        ? 'Words have missed twice on this. Change the channel: show it.'
        : 'This topic is spatial by nature — a picture is the normal way to teach it, not a bonus.';

  const how = topic
    ? `Reach for: ${topic.tool}.`
    : 'Pick the tool that fits — a graph, a labelled diagram, a number line, or an area/tile model.';

  return `DRAW IT: ${why} ${how} Emit ONE visual this turn alongside your explanation, and then SAY something about it — point at the part that matters ("see how the line crosses at..."). A picture nobody talks about teaches nothing. Do NOT plot or diagram the student's own unsolved expression in a way that hands them the answer (a server-side gate will strip it); illustrate the IDEA, a simpler case, or a reference figure instead.`;
}

module.exports = {
  buildVisualDirective,
  matchTopic,
  VISUAL_MOMENTS,
  NEVER_VISUAL,
  VISUAL_TOPICS,
};
