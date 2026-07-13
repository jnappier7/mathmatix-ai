'use strict';
/* ============================================================
   workspaceElement.schema.js — the base shape every element
   serializes to. This is the BASE envelope only; each element
   type owns and validates its own `semantic` payload (an
   equation's latex/role, a tile-set's counts, a graph's fn…).

   Base is deliberately thin so it stays snapshot-serializable
   from day one (spec §3bis "design-in-parallel"): persistence
   comes for free because every element already serializes here.
   ============================================================ */

const { makeValidator } = require('./_validator');
const { ELEMENT_TYPE_LIST } = require('../constants/elementTypes');

const WorkspaceElement = makeValidator('WorkspaceElement', {
  id:   { type: 'string', required: true },
  type: { type: 'string', required: true, enum: ELEMENT_TYPE_LIST },

  // bounded-canvas coordinates (spec §3.1 — free-feeling but bounded)
  position: { type: 'object', required: true }, // { x, y }
  size:     { type: 'object', required: false }, // { width, height } — some elements auto-size
  z:        { type: 'number', required: false },

  // element-owned math meaning (validated by the element's engine)
  semantic: { type: 'object', required: true },

  // provisional vs committed (spec §3.4 transaction model). A wrong
  // move renders with provisional:true + a visible "?" until the
  // server verifies — the board never asserts unverified math as fact.
  provisional: { type: 'boolean', required: false, default: false },

  createdAt: { type: 'iso', required: false },
});

module.exports = { WorkspaceElement };
