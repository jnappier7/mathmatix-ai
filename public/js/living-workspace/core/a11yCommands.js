/* ============================================================
   a11yCommands.js — the non-drag path, designed IN (spec §B5/§3.11).

   Pure/no-DOM. Two responsibilities:
     1. Canonical KEYBOARD COMMAND vocabulary — the same command
        objects a keypress, a screen-reader user, the tutor driving
        the board, and the test harness all produce. The Shell binds
        keys to these; nothing about correctness is gated behind a
        gesture a student can't perform.
     2. Text DESCRIPTIONS of elements + view state for aria-live, so
        a screen reader can narrate the workspace.

   Element-specific command-equivalents (e.g. "Select 2x → Combine
   with → 3x") are contributed by each element engine later (P6); this
   module owns the workspace-level navigation/viewport commands that
   exist from day one.

   UMD-lite (jest + browser global LWS.a11y).
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).a11y = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAN_STEP = 80; // screen px per arrow press
  const ZOOM_STEP = 1.2;

  // Canonical workspace commands. `id` is stable (used by tutor/harness);
  // `keys` are the default bindings; `describe` is the human/AT label.
  const COMMANDS = [
    { id: 'pan-left',   keys: ['ArrowLeft'],  describe: 'Pan left' },
    { id: 'pan-right',  keys: ['ArrowRight'], describe: 'Pan right' },
    { id: 'pan-up',     keys: ['ArrowUp'],    describe: 'Pan up' },
    { id: 'pan-down',   keys: ['ArrowDown'],  describe: 'Pan down' },
    { id: 'zoom-in',    keys: ['+', '='],     describe: 'Zoom in' },
    { id: 'zoom-out',   keys: ['-', '_'],     describe: 'Zoom out' },
    { id: 'zoom-reset', keys: ['0'],          describe: 'Reset view' },
    { id: 'focus-next', keys: ['Tab'],        describe: 'Focus next element' },
  ];

  const _byKey = (() => {
    const m = new Map();
    for (const c of COMMANDS) for (const k of c.keys) m.set(k, c.id);
    return m;
  })();

  // Map a raw key to a canonical command id (or null).
  function commandForKey(key) {
    return _byKey.get(key) || null;
  }

  // Apply a workspace-level command to a viewport. Returns true if it
  // changed the view (so the caller can request a repaint + announce).
  // Element-level commands (return false here) are handled by the caller.
  function applyViewportCommand(id, viewport) {
    if (!viewport) return false;
    switch (id) {
      case 'pan-left':  viewport.panByScreen(PAN_STEP, 0); return true;
      case 'pan-right': viewport.panByScreen(-PAN_STEP, 0); return true;
      case 'pan-up':    viewport.panByScreen(0, PAN_STEP); return true;
      case 'pan-down':  viewport.panByScreen(0, -PAN_STEP); return true;
      case 'zoom-in':   viewport.zoomAt(viewport.viewW / 2, viewport.viewH / 2, ZOOM_STEP); return true;
      case 'zoom-out':  viewport.zoomAt(viewport.viewW / 2, viewport.viewH / 2, 1 / ZOOM_STEP); return true;
      case 'zoom-reset': viewport.reset(); return true;
      default: return false;
    }
  }

  // ── descriptions (aria-live text) ──
  function describeElement(el) {
    if (!el || typeof el !== 'object') return '';
    const kind = String(el.type || 'element').replace(/[-_]/g, ' ');
    const s = el.semantic || {};
    let content = '';
    if (typeof s.plain === 'string' && s.plain) content = s.plain;
    else if (typeof s.latex === 'string' && s.latex) content = s.latex;
    const state = el.provisional ? ', provisional' : '';
    return content ? `${kind}: ${content}${state}` : `${kind}${state}`;
  }

  function describeViewport(viewport) {
    if (!viewport) return '';
    const pct = Math.round((viewport.scale || 1) * 100);
    return `Zoom ${pct} percent`;
  }

  function describeWorkspace(registry, viewport) {
    const n = registry ? registry.size : 0;
    const noun = n === 1 ? 'element' : 'elements';
    const view = describeViewport(viewport);
    return `Workspace with ${n} ${noun}. ${view}`.trim();
  }

  return {
    PAN_STEP,
    ZOOM_STEP,
    COMMANDS,
    commandForKey,
    applyViewportCommand,
    describeElement,
    describeViewport,
    describeWorkspace,
  };
});
