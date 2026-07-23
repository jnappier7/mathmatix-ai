/* ============================================================
   legacyBoardAdapter.js (CLIENT) — browser twin of
   shared/workspace/legacyBoardAdapter.js.

   shared/ is CommonJS and NOT served to the browser, so the chat
   integration needs a UMD-lite copy on window.LWS. The mapping is
   IDENTICAL to the shared module; tests/unit/workspace/
   legacyBoardAdapterParity.test.js asserts the two stay in lockstep,
   so a change to one without the other fails CI.

   See the shared file for the full rationale (P5, read-only, non-
   authoritative — guards/visual-gate already ran upstream).
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).adaptBoardCommands = mod.adaptBoardCommands; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Mirror of shared/workspace/constants/elementTypes.js (the client does
  // not load the shared constants module).
  const ELEMENT_TYPES = {
    EQUATION: 'equation', ALGEBRA_TILES: 'algebra_tiles', NUMBER_LINE: 'number_line',
    GRAPH: 'graph', GEOMETRY: 'geometry', IMAGE: 'image',
  };

  const COL_X = 60, START_Y = 40, STEP_Y = 120;

  function equationSemantic(latex, role, extra) {
    return Object.assign({ latex, role }, extra || {});
  }

  function texText(phrase) {
    const escaped = String(phrase).replace(/([\\{}$#%&_^~])/g, '\\$1');
    return '\\text{' + escaped + '}';
  }

  function mapCommand(cmd) {
    switch (cmd.action) {
      case 'pose':     return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'problem') } : null;
      case 'resolve':  return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'step') } : null;
      case 'verify':   return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'solution', cmd.check ? { check: cmd.check } : null) } : null;
      case 'scaffold': return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'scaffold', cmd.caption ? { caption: cmd.caption } : null) } : null;
      case 'example':  return cmd.tex ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(cmd.tex, 'example', cmd.caption ? { caption: cmd.caption } : null) } : null;
      case 'apply':    return cmd.op  ? { type: ELEMENT_TYPES.EQUATION, semantic: equationSemantic(texText(cmd.op), 'operation', { op: cmd.op }) } : null;
      case 'graph':    return cmd.fn  ? { type: ELEMENT_TYPES.GRAPH, semantic: Object.assign({ fn: cmd.fn }, cmd.caption ? { caption: cmd.caption } : null) } : null;
      case 'image':    return cmd.query ? { type: ELEMENT_TYPES.IMAGE, semantic: Object.assign({ query: cmd.query }, cmd.caption ? { caption: cmd.caption } : null) } : null;
      case 'diagram':  return (cmd.diagram_type || cmd.diagram_params) ? { type: ELEMENT_TYPES.GEOMETRY, semantic: { diagramType: cmd.diagram_type || null, params: cmd.diagram_params || null } } : null;
      default:         return null;
    }
  }

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
          reason: (cmd.action === 'model' || cmd.action === 'spec') ? 'no-workspace-element-yet' : 'empty-or-unsupported',
        });
        continue;
      }
      const el = {
        id: idPrefix + '-' + placed + '-' + cmd.action,
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

  return { adaptBoardCommands };
});
