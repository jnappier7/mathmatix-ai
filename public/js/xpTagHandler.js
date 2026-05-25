/* ============================================================
   xpTagHandler.js — execute server-emitted <XP> ceremony
   commands against the chat surface (Phase C).

   The chat pipeline ships an `xpCommands` array on the SSE
   `complete` event. Each command is:
     { size: 'small' | 'medium' | 'large', reason?: string }

   Purely VISUAL. Does NOT grant XP — that stays the job of
   <CORE_BEHAVIOR_XP> (server-side) and the Tier 1/2 auto-paths.
   This handler:
     • fires confetti scaled to `size`
     • optionally floats a brief gold caption with `reason`

   Multiple commands in one batch are staggered so back-to-back
   ceremonies feel deliberate, not chaotic.
   ============================================================ */

(function () {
    'use strict';

    var STAGGER_MS = 450;

    var SIZE_PROFILES = {
        small:  { particleCount: 32,  spread: 55, duration: 600,  yOrigin: 0.5 },
        medium: { particleCount: 80,  spread: 75, duration: 900,  yOrigin: 0.45 },
        large:  { particleCount: 150, spread: 95, duration: 1300, yOrigin: 0.4 }
    };

    // Brand palette — matches the verify-card celebration so the two
    // ceremonies feel like one visual family.
    var CONFETTI_COLORS = ['#2ECC71', '#8B7BFF', '#FFD66B', '#5BA8FF', '#E879F9'];

    function fireConfetti(profile) {
        try {
            var loader = (typeof window !== 'undefined' && typeof window.ensureConfetti === 'function')
                ? window.ensureConfetti()
                : Promise.resolve();
            loader.then(function () {
                if (typeof window === 'undefined' || typeof window.confetti !== 'function') return;
                window.confetti({
                    particleCount: profile.particleCount,
                    spread: profile.spread,
                    origin: { y: profile.yOrigin },
                    colors: CONFETTI_COLORS,
                    ticks: Math.round(profile.duration / 16)
                });
            }).catch(function () { /* vendor unavailable — silent */ });
        } catch (e) { /* silent */ }
    }

    function showCeremonyCaption(text, size) {
        if (!text || typeof document === 'undefined') return;
        try {
            var el = document.createElement('div');
            el.className = 'cr-xp-caption cr-xp-caption--' + (size || 'medium');
            el.textContent = text;
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
            // Trigger the CSS enter animation on the next frame.
            requestAnimationFrame(function () {
                el.classList.add('cr-xp-caption--enter');
            });
            // Remove after the animation cycle. Match the size's duration
            // so small ceremonies don't outlast their confetti.
            var ttl = (SIZE_PROFILES[size] && SIZE_PROFILES[size].duration)
                ? SIZE_PROFILES[size].duration + 900
                : 1800;
            setTimeout(function () {
                el.classList.add('cr-xp-caption--exit');
                setTimeout(function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 400);
            }, ttl);
        } catch (e) { /* DOM missing — silent */ }
    }

    function executeOne(command) {
        if (!command || typeof command.size !== 'string') return;
        var profile = SIZE_PROFILES[command.size];
        if (!profile) return; // unknown size — drop
        fireConfetti(profile);
        if (command.reason) showCeremonyCaption(command.reason, command.size);
    }

    /**
     * Run a batch of XP ceremony commands. Stagger them so a "small +
     * medium" pair lands as two distinct moments, not one overlapping
     * blur. Pipeline already caps the batch at 3.
     */
    function executeXpCommands(commands) {
        if (!Array.isArray(commands) || commands.length === 0) return;
        commands.forEach(function (cmd, i) {
            setTimeout(function () { executeOne(cmd); }, i * STAGGER_MS);
        });
    }

    window.XpTagHandler = { executeXpCommands: executeXpCommands };
})();
