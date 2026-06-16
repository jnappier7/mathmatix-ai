// ============================================================
// conceptModelPrompt.js — teach the tutor to SUMMON interactive
// concept models onto the WorkBoard (CONCEPT_MODELS.md, "Summoned
// with intent").
//
// The `model` board verb is already wired end-to-end — the tag
// parser, the structured-schema normalize, the pedagogy guard, the
// SSE serialization, and the client renderer all handle it. The one
// missing piece is telling the LLM that the verb exists and when to
// reach for it. This module builds that prompt section, gated behind
// the CONCEPT_MODELS flag (default off, like DIAGRAM_BOARD) so
// flag-off traffic sees byte-for-byte today's prompt.
//
// The catalog is derived from the single source of truth
// (public/js/conceptModelSpec.js → MODELS) so a model added there
// shows up here automatically; a per-model "summon when" blurb adds
// the pedagogical framing the bare spec can't.
// ============================================================

'use strict';

const ConceptModelSpec = require('../public/js/conceptModelSpec');

/**
 * Rollout flag. Default OFF. Read at call time (not module load) so a
 * test can flip process.env.CONCEPT_MODELS without reloading modules.
 */
function isConceptModelsEnabled() {
  const v = process.env.CONCEPT_MODELS;
  return v === 'true' || v === '1';
}

/**
 * The GENERATIVE long-tail flag (CONCEPT_MODELS.md step 4). Separate from, and
 * subordinate to, CONCEPT_MODELS: the curated catalog can ship on its own, and
 * only when this is ALSO on does the tutor get taught to author brand-new specs.
 * Default OFF; read at call time. The transport + validation plumbing is always
 * present (inert) — this only controls whether the LLM is told how to use it.
 */
function isConceptModelsGenerativeEnabled() {
  const v = process.env.CONCEPT_MODELS_GENERATIVE;
  return v === 'true' || v === '1';
}

// One-line "summon when" guidance per curated model. Keyed by model name; any
// model without an entry falls back to its spec title, so the catalog never goes
// stale silently.
const SUMMON_WHEN = {
  slope_intercept_line: 'teaching y = mx + b — slide m and b, drag the y-intercept',
  two_point_line: 'slope as rise/run between two points — drag the two points',
  function_transformations: 'transformations a·f(x−h)+k of any parent (x², |x|, x³, √x) — the whole transformations unit in one model',
  inscribed_angle: 'the inscribed angle theorem — drag B, the inscribed angle stays half the central',
  triangle_angle_sum: 'the triangle angle sum — drag a vertex, the three angles re-measure and always total 180°',
  linear_pair_angles: 'a linear pair / supplementary angles on a line (the two angles total 180°)',
};

/** "  • name — blurb" lines for every curated model, from the catalog. */
function modelCatalogLines() {
  return ConceptModelSpec.MODELS.map(function (name) {
    const spec = ConceptModelSpec.getModel(name);
    const blurb = SUMMON_WHEN[name] || (spec && spec.title) || '';
    return '  • ' + name + ' — ' + blurb;
  }).join('\n');
}

/**
 * Worked examples shown to the tutor in the generative section. Defined as real
 * objects (not hand-written JSON text) so that (a) what the LLM sees is ALWAYS
 * valid JSON — JSON.stringify can't emit the `//` comments that would make a
 * copied spec unparseable — and (b) a unit test can run them through the very
 * validator that gates generated output, so the examples can't silently rot.
 *
 * Two cases on purpose: a function/graph model, and a GEOMETRY model — the harder
 * case, where the `angle` element draws the arc while a separate `measures` entry
 * supplies the live number a readout shows.
 */
const GENERATIVE_EXAMPLES = {
  // Function/graph: params drive a curve, readout echoes them.
  fn: {
    model: 'cosine_wave',
    title: 'y = a·cos(bx)',
    params: { a: 2, b: 1 },
    controls: [
      { type: 'slider', param: 'a', label: 'a', range: [-3, 3], step: 0.25 },
      { type: 'slider', param: 'b', label: 'b', range: [0.25, 4], step: 0.25 },
    ],
    elements: [
      { id: 'plane', type: 'plane', x: [-7, 7], y: [-4, 4], grid: true, axisLabels: true },
      { id: 'curve', type: 'function', fn: 'a*cos(b*x)' },
      { id: 'out', type: 'readout', text: 'y = {a}·cos({b}x)', at: 'top' },
    ],
    reveal: ['plane', 'curve', 'out'],
    prompt: 'Slide a and b — how does the wave change?',
  },
  // Geometry: the `angle` element DRAWS the arc; the `measures` entry MEASURES the
  // number; the readout shows the measured value. Three distinct things.
  geometry: {
    model: 'angle_at_a_point',
    title: 'Measuring an angle',
    params: {},
    measures: { ang: { type: 'angle', at: 'O', rays: ['A', 'B'] } },
    elements: [
      { id: 'plane', type: 'plane', x: [-7, 7], y: [-7, 7], grid: false, axisLabels: false },
      { id: 'O', type: 'point', at: [0, 0], label: 'O' },
      { id: 'A', type: 'point', at: [5, 0], label: 'A' },
      { id: 'B', type: 'point', at: [3, 4], draggable: true, label: 'B' },
      { id: 'rayA', type: 'segment', through: ['O', 'A'] },
      { id: 'rayB', type: 'segment', through: ['O', 'B'] },
      { id: 'arc', type: 'angle', at: 'O', rays: ['A', 'B'], measure: true },
      { id: 'out', type: 'readout', text: 'angle = {ang}°', at: 'top' },
    ],
    reveal: ['plane', 'O', 'A', 'B', 'rayA', 'rayB', 'arc', 'out'],
    drag: ['B'],
    prompt: 'Drag B — the angle is measured live, never typed.',
  },
};

/**
 * The GENERATED long-tail authoring section. Teaches the tutor to write a
 * brand-new spec in the fixed vocabulary when NO curated model fits. The spec is
 * validated before it can render (every id/param/ref must resolve, and any
 * measured quantity is computed live), so a generated model can pick a weird
 * layout but cannot display wrong math. Only appended when the generative flag is
 * on (see buildConceptModelInstructions).
 * @param {boolean} structured
 * @returns {string}
 */
function buildGenerativeSection(structured) {
  const emit = structured
    ? 'Put the WHOLE spec, as a JSON string, in the spec field: { action: "model", spec: "{ ...spec JSON... }", prompt: "Slide a and b — how does the wave change?" }'
    : 'Put the WHOLE spec JSON inside the tag body: <BOARD action="model" prompt="Slide a and b — how does the wave change?">{ ...spec JSON... }</BOARD>';

  const fnExample = JSON.stringify(GENERATIVE_EXAMPLES.fn, null, 2);
  const geoExample = JSON.stringify(GENERATIVE_EXAMPLES.geometry, null, 2);

  return `
GENERATIVE LONG-TAIL — author a NEW model when none above fits:
Only when no curated model matches the concept, you may write your OWN spec in this vocabulary. It is validated before it renders: every id/param/reference must resolve, and any MEASURED quantity is computed live by the engine — so you literally cannot make it show wrong math. Prefer a curated model whenever one fits; reach for this only for the long tail.

${emit}
The spec is strict JSON — no comments, no trailing commas. Emit only the JSON object.

Example — a function/graph model:
${fnExample}

Example — a geometry model (note how the angle is shown):
${geoExample}

Vocabulary you may use:
- elements: plane, function (fn: an expression of x + numeric params, e.g. "a*x^2 + b"), point (at:[x,y] of NUMBERS or numeric-param names; draggable; binds a param), line/segment/ray (through:[ptId,ptId]), circle (center:[x,y], radius), polygon (vertices:[ptIds]), angle (at: ptId, rays:[ptId,ptId]) — DRAWS the arc, readout (text with {param}/{derived}/{measure} tokens).
- controls: slider (numeric param; needs range:[lo,hi]).
- measures: a quantity read off the LIVE geometry — currently ANGLES ONLY: "ang": { "type":"angle", "at":"B", "rays":["A","C"] }. A readout/derived then uses {ang}. To SHOW an angle you need BOTH: an angle element (draws the arc) AND a measures entry (supplies the number) — the angle element alone shows no value. (Lengths/areas aren't measurable yet, so don't build a model that needs them.)
- derived: a value computed from params/measures, e.g. "sum": "ang1 + ang2".

Hard rules: every "through"/"vertices"/"rays"/"at"(angle) must name a point id you defined; every name in an fn/derived/readout must be a declared param, derived, or measure; point/circle coordinates must be NUMBERS or numeric-param names (not derived/measures); numeric params only inside fn; give sliders a valid range. NEVER write a measured value as a literal — declare a measure and let the engine compute it. Keep it to one focused model. Like every concept model, it's a manipulable idea, never the student's graded answer.`;
}

/**
 * Build the concept-model prompt section.
 * @param {boolean} structured - true when STRUCTURED_TUTOR_RESPONSE is on, so the
 *        emit syntax is a board_commands JSON object instead of a <BOARD/> tag.
 * @param {{ generative?: boolean }} [opts] - when generative is true, append the
 *        long-tail authoring section (the tutor may write a brand-new spec).
 * @returns {string} A stable prompt section (no per-request data, cache-safe).
 */
function buildConceptModelInstructions(structured, opts) {
  const generative = !!(opts && opts.generative);
  const emit = structured
    ? 'Add it to board_commands as: { action: "model", model: "<name>", prompt: "Slide m up — what happens?" }'
    : 'Emit it as a board command: <BOARD action="model" model="<name>" prompt="Slide m up — what happens?" />';

  let section = `--- CONCEPT MODELS (interactive, manipulable models on the WorkBoard) ---
You can summon an interactive model the student DRAGS to discover a relationship — correct by construction (the engine measures every value; you never assert one). Summon it WITH INTENT: include a short prompt that frames what to try.

${emit}

Available models — pick the one whose concept matches what you're teaching, and use the name verbatim:
${modelCatalogLines()}

When to summon:
- Reach for it the moment it teaches the concept ("let's see this — drag the intercept and watch the line").
- When the student asks to see or try it ("show me", "can I graph this?", "let me play with it") — honor it and add a light frame.

Rules: use a model name from the list exactly; one model per turn is plenty; keep the prompt to one short sentence (the teaching intention). A concept model is a manipulable concept, never the student's graded answer — so it is always safe to show.`;

  if (generative) section += '\n' + buildGenerativeSection(structured);
  return section;
}

module.exports = {
  isConceptModelsEnabled,
  isConceptModelsGenerativeEnabled,
  buildConceptModelInstructions,
  buildGenerativeSection,
  GENERATIVE_EXAMPLES,
  modelCatalogLines,
  SUMMON_WHEN,
};
