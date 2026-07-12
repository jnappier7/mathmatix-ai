'use strict';
/* ============================================================
   elementTypes.js — the workspace element registry.

   Each type is a first-class element with its own semantic
   model + renderer + gesture interpreter (see the per-element
   Definition of Done in docs/BOARD_LIVING_WORKSPACE_SPEC.md §5.5).
   ============================================================ */

const ELEMENT_TYPES = Object.freeze({
  EQUATION:      'equation',       // KaTeX/MathLive card — the spine (P4)
  ALGEBRA_TILES: 'algebra_tiles',  // the first semantic manipulative (P6/P7)
  NUMBER_LINE:   'number_line',    // P13
  GRAPH:         'graph',          // draggable handles — P14 (AFTER visual-gate extension)
  GEOMETRY:      'geometry',       // narrow models only — P17
  IMAGE:         'image',          // pinned upload — P15
});

const ELEMENT_TYPE_LIST = Object.freeze(Object.values(ELEMENT_TYPES));

// Build order (spec §4). Kept as data so `decide`-stage composition
// and phase gating can reference one source of truth.
const ELEMENT_BUILD_ORDER = Object.freeze([
  ELEMENT_TYPES.EQUATION,
  ELEMENT_TYPES.ALGEBRA_TILES,
  ELEMENT_TYPES.NUMBER_LINE,
  ELEMENT_TYPES.IMAGE,
  ELEMENT_TYPES.GRAPH,
  ELEMENT_TYPES.GEOMETRY,
]);

module.exports = { ELEMENT_TYPES, ELEMENT_TYPE_LIST, ELEMENT_BUILD_ORDER };
