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
 * Build the concept-model prompt section.
 * @param {boolean} structured - true when STRUCTURED_TUTOR_RESPONSE is on, so the
 *        emit syntax is a board_commands JSON object instead of a <BOARD/> tag.
 * @returns {string} A stable prompt section (no per-request data, cache-safe).
 */
function buildConceptModelInstructions(structured) {
  const emit = structured
    ? 'Add it to board_commands as: { action: "model", model: "<name>", prompt: "Slide m up — what happens?" }'
    : 'Emit it as a board command: <BOARD action="model" model="<name>" prompt="Slide m up — what happens?" />';

  return `--- CONCEPT MODELS (interactive, manipulable models on the WorkBoard) ---
You can summon an interactive model the student DRAGS to discover a relationship — correct by construction (the engine measures every value; you never assert one). Summon it WITH INTENT: include a short prompt that frames what to try.

${emit}

Available models — pick the one whose concept matches what you're teaching, and use the name verbatim:
${modelCatalogLines()}

When to summon:
- Reach for it the moment it teaches the concept ("let's see this — drag the intercept and watch the line").
- When the student asks to see or try it ("show me", "can I graph this?", "let me play with it") — honor it and add a light frame.

Rules: use a model name from the list exactly; one model per turn is plenty; keep the prompt to one short sentence (the teaching intention). A concept model is a manipulable concept, never the student's graded answer — so it is always safe to show.`;
}

module.exports = {
  isConceptModelsEnabled,
  buildConceptModelInstructions,
  modelCatalogLines,
  SUMMON_WHEN,
};
