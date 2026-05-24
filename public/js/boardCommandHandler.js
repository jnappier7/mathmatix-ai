/* ============================================================
   boardCommandHandler.js — execute server-emitted <BOARD>
   commands against the embedded WorkBoard (Phase A).

   The chat pipeline ships a `boardCommands` array on the SSE
   `complete` event. Each command is one of:
     { action: 'pose',    tex: '...' }
     { action: 'apply',   op:  '...' }
     { action: 'resolve', tex: '...' }
     { action: 'verify',  tex: '...', check: '...' }
     { action: 'clear' }

   `pose` and `clear` fire immediately (structural / one-shot).
   `apply`, `resolve`, `verify` stagger at 250ms between consecutive
   cards so the Phase A slide-in animation completes before the
   next card starts. Stagger is local to the *current* batch — a
   fresh batch in a future response queues from t=0 again.
   ============================================================ */

(function () {
    'use strict';

    var STAGGER_MS = 250;
    var STAGGER_ACTIONS = { apply: true, resolve: true, verify: true, graph: true, image: true };

    function getWorkspace() {
        return typeof window !== 'undefined' ? window.MathWorkspace : null;
    }

    function executeOne(command) {
        var W = getWorkspace();
        if (!W) {
            console.warn('[BoardCommandHandler] MathWorkspace not available; dropping command', command);
            return;
        }
        try {
            switch (command.action) {
                case 'pose':
                    if (command.tex) W.boardPose(command.tex);
                    break;
                case 'apply':
                    if (command.op) W.boardApply(command.op);
                    break;
                case 'resolve':
                    if (command.tex) W.boardResolve(command.tex);
                    break;
                case 'verify':
                    if (command.tex) W.boardVerify(command.tex, command.check || '');
                    break;
                case 'clear':
                    W.boardClear();
                    break;
                case 'graph':
                    if (command.fn) W.boardGraph(command.fn, command.caption || '');
                    break;
                case 'image':
                    if (command.query) W.boardImage(command.query, command.caption || '');
                    break;
                default:
                    console.warn('[BoardCommandHandler] Unknown action', command.action);
            }
        } catch (err) {
            console.error('[BoardCommandHandler] Failed to execute', command, err);
        }
    }

    /**
     * Execute a batch of board commands. Structural commands (pose,
     * clear) fire on the current tick; animated card commands
     * (apply, resolve, verify) stagger at STAGGER_MS intervals so the
     * slide-in animation can land before the next card arrives.
     *
     * @param {Array<{action:string, tex?:string, op?:string, check?:string}>} commands
     */
    function executeBoardCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0) return;
        var W = getWorkspace();
        if (!W) {
            console.warn('[BoardCommandHandler] MathWorkspace not loaded; cannot execute', commands.length, 'commands');
            return;
        }

        var animatedIndex = 0; // count of staggered commands seen so far
        for (var i = 0; i < commands.length; i++) {
            var command = commands[i];
            if (!command || typeof command.action !== 'string') continue;

            if (STAGGER_ACTIONS[command.action]) {
                // Wrap to capture the current command reference.
                (function (cmd, delay) {
                    setTimeout(function () { executeOne(cmd); }, delay);
                })(command, animatedIndex * STAGGER_MS);
                animatedIndex++;
            } else {
                executeOne(command);
            }
        }
    }

    window.BoardCommandHandler = {
        executeBoardCommands: executeBoardCommands,
    };
})();
