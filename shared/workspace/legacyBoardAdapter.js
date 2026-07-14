'use strict';
/* ============================================================
   legacyBoardAdapter.js — P5: read-only bridge from the LEGACY
   board protocol onto the new Living Workspace.

   The existing pipeline emits `board_commands` (utils/boardResponseSchema
   BOARD_ACTIONS: pose/apply/resolve/verify/clear/graph/image/scaffold/
   diagram/model/example). This pure transform maps each one to a
   WorkspaceElement (or a directive), so today's tutor output renders on
   the new surface UNCHANGED in meaning — proving the workspace can convey
   equivalent content beside the old board (spec §4, P5 DoD).

   Read-only + non-authoritative on purpose:
     - It does NOT re-run the safety gauntlet. Guards / visual-gate /
       mirror-rule already ran UPSTREAM on the board_commands before they
       reached here; this only re-expresses already-approved content.
     - It NEVER silently drops a command it can't map (e.g. concept
       `model` cards, which have no workspace element yet) — those are
       reported in `unmapped` so coverage gaps are visible, not hidden.
     - Elements are `provisional:false`: legacy content is tutor-authored
       and already verified; the provisional/"?" state is reserved for
       unverified STUDENT moves (spec §3.4).
   ============================================================ */

const { ELEMENT_TYPES } = require('./constants/elementTypes');

// Auto-layout: stack cards down a single column so a multi-command turn
// doesn't pile at one point. Bounded-canvas coordinates (spec §3.1); the
// workspace viewport can pan/zoom, so exact values only need to be sane.
const COL_X = 60;
const START_Y = 40;
const STEP_Y = 120;

// Build an equation element's semantic payload. The equation renderer
// (dom/equationElement.js) reads `semantic.latex`; `role` is extra context
// (problem/step/solution/scaffold/example/operation) that the renderer
// ignores today but future styling/a11y can use — safe to carry.
function equationSemantic(latex, role, extra) {
  return Object.assign({ latex, role }, extra || {});
}

// Wrap a prose phrase as KaTeX text so it renders upright with spaces,
// not run-together math italics. Escape the few LaTeX-special chars that
// would break \text{} (backslash first, so we don't double-escape).
function texText(phrase) {
  const escaped = String(phrase).replace(/([\\{}$#%&_^~])/g, '\\$1');
  return `\\text{${escaped}}`;
}

// Map ONE legacy command to a partial element ({ type, semantic }) or null
// when it isn't a placeable element (clear, or an empty/unsupported card).
function mapCommand(cmd) {
  switch (cmd.action) {
    case 'pose':
      return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'problem') } : null;
    case 'resolve':
      return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'step') } : null;
    case 'verify':
      return cmd.tex
        ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'solution', cmd.check ? { check: cmd.check } : null) }
        : null;
    case 'scaffold':
      return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'scaffold') } : null;
    case 'example':
      return cmd.tex
        ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'example', cmd.caption ? { caption: cmd.caption } : null) }
        : null;
    case 'apply':
      // The operation phrase the student named ("subtract 4 from both
      // sides"). It's PROSE, not LaTeX — wrap it in \text{} so KaTeX renders
      // it upright with spaces instead of run-together math italics. The
      // raw phrase is preserved in `op` for non-rendering consumers.
      return cmd.op
        ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(texText(cmd.op), 'operation', { op: cmd.op }) }
        : null;
    case 'graph':
      return cmd.fn
        ? { type: ELEMENT_TYPES.GRAPH, semantic: Object.assign({ fn: cmd.fn }, cmd.caption ? { caption: cmd.caption } : null) }
        : null;
    case 'image':
      return cmd.query
        ? { type: ELEMENT_TYPES.IMAGE, semantic: Object.assign({ query: cmd.query }, cmd.caption ? { caption: cmd.caption } : null) }
        : null;
    case 'diagram':
      return (cmd.diagram_type || cmd.diagram_params)
        ? { type: ELEMENT_TYPES.GEOMETRY, semantic: { diagramType: cmd.diagram_type || null, params: cmd.diagram_params || null } }
        : null;
    default:
      return null; // 'clear' is a directive (handled by caller); 'model'/'spec' have no element yet
  }
}

/**
 * Adapt a legacy board_commands array to Living-Workspace elements.
 *
 * @param {Array} commands - board_commands (already normalized + guarded upstream)
 * @param {Object} [opts]
 * @param {number} [opts.baseZ=0] - z of the first placed element
 * @param {string} [opts.now]     - ISO timestamp to stamp createdAt (caller-supplied;
 *                                  some contexts forbid Date.now())
 * @param {string} [opts.idPrefix='lgc'] - element-id prefix
 * @returns {{ elements: object[], clear: boolean, unmapped: Array<{action:string,reason:string}> }}
 */
function adaptBoardCommands(commands, opts) {
  const options = opts || {};
  const baseZ = typeof options.baseZ === 'number' ? options.baseZ : 0;
  const idPrefix = options.idPrefix || 'lgc';
  const list = Array.isArray(commands) ? commands : [];

  const result = { elements: [], clear: false, unmapped: [] };
  let placed = 0;

  for (const cmd of list) {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.action !== 'string') continue;

    if (cmd.action === 'clear') { result.clear = true; continue; }

    const mapped = mapCommand(cmd);
    if (!mapped) {
      result.unmapped.push({
        action: cmd.action,
        reason: (cmd.action === 'model' || cmd.action === 'spec')
          ? 'no-workspace-element-yet'
          : 'empty-or-unsupported',
      });
      continue;
    }

    const el = {
      id: `${idPrefix}-${placed}-${cmd.action}`,
      type: mapped.type,
      position: { x: COL_X, y: START_Y + placed * STEP_Y },
      z: baseZ + placed,
      semantic: mapped.semantic,
      provisional: false,
    };
    if (options.now) el.createdAt = options.now;

    result.elements.push(el);
    placed += 1;
  }

  return result;
}

module.exports = { adaptBoardCommands };
