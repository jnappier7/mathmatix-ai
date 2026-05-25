/* ============================================================
   visualTabTagHandler.js — execute server-emitted <GRAPH> and
   <TILES> commands against the workspace right slot (Phase D).

   The chat pipeline ships a `visualTabCommands` array on the SSE
   `complete` event. Each command is one of:
     { tab: 'graph', fn: 'x^2 - 4', caption?: '...' }
     { tab: 'tiles', expression?: '2x + 3' }

   GRAPH switches the workspace to the Graph tab and plots the
   function (via window.MathWorkspace.showGraph), so the student
   can drag, zoom, and explore. The board-timeline <BOARD action=
   "graph"/> drops a static-ish card inside the board; this is
   the interactive version.

   TILES opens the algebra-tiles workspace (window.openAlgebraTiles).
   The expression= attribute is carried through for a future
   tile-layout-from-expression API; for now the legacy
   [ALGEBRA_TILES:expr] inline syntax handles seeded layouts and
   <TILES/> just launches the workspace.

   Multiple commands stagger so back-to-back tab switches don't
   whipsaw the workspace.
   ============================================================ */

(function () {
    'use strict';

    var STAGGER_MS = 400;

    function executeOne(command) {
        if (!command || typeof command.tab !== 'string') return;

        try {
            if (command.tab === 'graph') {
                if (!command.fn) return;
                if (!window.MathWorkspace || typeof window.MathWorkspace.showGraph !== 'function') {
                    console.warn('[VisualTabTagHandler] MathWorkspace.showGraph not available');
                    return;
                }
                var opts = {};
                if (command.caption) opts.caption = command.caption;
                window.MathWorkspace.showGraph(command.fn, opts);
                return;
            }

            if (command.tab === 'tiles') {
                if (typeof window.openAlgebraTiles === 'function') {
                    window.openAlgebraTiles();
                } else if (window.MathWorkspace && typeof window.MathWorkspace.showTool === 'function') {
                    // Fallback: switch to the Tiles launcher tab if the
                    // standalone workspace isn't bootstrapped yet.
                    window.MathWorkspace.showTool('tiles');
                } else {
                    console.warn('[VisualTabTagHandler] Tiles launcher not available');
                }
                // expression= is captured but not yet applied — the
                // standalone tiles workspace doesn't accept a seed
                // expression. Legacy [ALGEBRA_TILES:expr] handles that
                // path inside the chat bubble.
                return;
            }

            console.warn('[VisualTabTagHandler] Unknown tab', command.tab);
        } catch (err) {
            console.error('[VisualTabTagHandler] Failed to execute', command, err);
        }
    }

    /**
     * Run a batch of visual-tab commands. The pipeline caps the batch
     * at 2 so a single reply can't whipsaw through tabs; stagger lets
     * each switch settle visually before the next one.
     */
    function executeVisualTabCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0) return;
        commands.forEach(function (cmd, i) {
            setTimeout(function () { executeOne(cmd); }, i * STAGGER_MS);
        });
    }

    window.VisualTabTagHandler = { executeVisualTabCommands: executeVisualTabCommands };
})();
