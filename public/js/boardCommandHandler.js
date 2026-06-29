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
    var STAGGER_ACTIONS = { apply: true, resolve: true, verify: true, graph: true, image: true, scaffold: true, model: true, example: true };

    function getWorkspace() {
        return typeof window !== 'undefined' ? window.MathWorkspace : null;
    }

    // Scrub a LaTeX/text field of leaked JSON structure. Upstream a fallback
    // parser can capture a board_commands array boundary into a field — e.g.
    // tex = "3x = 21},{" — which then renders as a red KaTeX error. A real math
    // expression never contains an UNescaped  } , {  or  " , "  (LaTeX braces are
    // \{ \}), so cut at that boundary and drop the residue.
    function cleanField(s) {
        if (typeof s !== 'string') return s;
        // Stray wrapping JSON quotes.
        s = s.replace(/^\s*["']+|["']+\s*$/g, '');
        // Truncate at a JSON object/array boundary that leaked in.
        var cut = s.search(/[}\]"]\s*,\s*["{[]/);
        if (cut !== -1) s = s.slice(0, cut + 1);
        s = s.trim();
        // Drop a trailing unbalanced } (residue from the cut). LaTeX braces pair
        // up; a lone trailing close is junk. Count unescaped braces only.
        var opens = (s.match(/(?:^|[^\\])\{/g) || []).length;
        var closes = (s.match(/(?:^|[^\\])\}/g) || []).length;
        while (closes > opens && /\}\s*$/.test(s)) {
            s = s.replace(/\}\s*$/, '').trim();
            closes--;
        }
        return s;
    }

    function sanitizeCommand(command) {
        if (!command || typeof command !== 'object') return command;
        var out = command;
        ['tex', 'check', 'op', 'caption'].forEach(function (k) {
            if (typeof command[k] === 'string') {
                var cleaned = cleanField(command[k]);
                if (cleaned !== command[k]) {
                    if (out === command) out = Object.assign({}, command);
                    out[k] = cleaned;
                }
            }
        });
        return out;
    }

    function executeOne(command) {
        var W = getWorkspace();
        if (!W) {
            console.warn('[BoardCommandHandler] MathWorkspace not available; dropping command', command);
            return;
        }
        command = sanitizeCommand(command);
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
                case 'scaffold':
                    if (command.tex) W.boardScaffold(command.tex);
                    break;
                case 'verify':
                    if (command.tex) {
                        W.boardVerify(command.tex, command.check || '');
                        // Phase C: celebrate the moment a verify card lands.
                        // Confetti + gold-pulse + "CLEAN SOLUTION!" eyebrow swap.
                        // The card is appended on this tick; wait two frames
                        // so the slide-in animation has started before we
                        // pile the celebration on top of it.
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(function () {
                                requestAnimationFrame(celebrateLatestVerifyCard);
                            });
                        } else {
                            setTimeout(celebrateLatestVerifyCard, 32);
                        }
                    }
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
                case 'example':
                    // Read-only worked-example derivation step. caption is an
                    // optional short label (e.g. "Trig substitution").
                    if (command.tex) W.boardExample(command.tex, command.caption || '');
                    break;
                case 'diagram':
                    // Deterministic JSXGraph geometry (DIAGRAM_BOARD, flag-off).
                    if (command.diagramType && typeof W.boardDiagram === 'function') {
                        W.boardDiagram(command);
                    }
                    break;
                case 'model':
                    // Interactive concept model (CONCEPT_MODELS, flag-off). The
                    // student manipulates it and the relationship holds, correct
                    // by construction. Inert until a caller emits `model`.
                    if (command.model && typeof W.boardModel === 'function') {
                        W.boardModel(command);
                    }
                    break;
                default:
                    console.warn('[BoardCommandHandler] Unknown action', command.action);
            }
        } catch (err) {
            console.error('[BoardCommandHandler] Failed to execute', command, err);
        }
    }

    // Phase C — verify-card celebration.
    // Adds .cr-ws-board-card--celebrating to the newest verify card
    // (which swaps the eyebrow to "CLEAN SOLUTION!" and plays a gold
    // pulse via workspace.css) and fires confetti. Confetti loads lazily
    // through window.ensureConfetti() — the lazy loader was added for
    // other celebrations and is reused here.
    function celebrateLatestVerifyCard() {
        try {
            var cards = document.querySelectorAll('.cr-ws-board-card--verify');
            var card = cards[cards.length - 1];
            if (card) {
                card.classList.add('cr-ws-board-card--celebrating');
                // Strip the class after the animation completes so a later
                // verify on the same problem doesn't double-glow.
                setTimeout(function () {
                    card.classList.remove('cr-ws-board-card--celebrating');
                }, 2400);
            }
        } catch (e) { /* DOM gone — nothing to celebrate */ }

        try {
            var loader = (typeof window !== 'undefined' && typeof window.ensureConfetti === 'function')
                ? window.ensureConfetti()
                : Promise.resolve();
            loader.then(function () {
                if (typeof window === 'undefined' || typeof window.confetti !== 'function') return;
                window.confetti({
                    particleCount: 90,
                    spread: 70,
                    origin: { y: 0.45 },
                    colors: ['#2ECC71', '#8B7BFF', '#FFD66B', '#5BA8FF']
                });
            }).catch(function () { /* confetti vendor not loadable — silent */ });
        } catch (e) { /* confetti shim missing — silent */ }
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
