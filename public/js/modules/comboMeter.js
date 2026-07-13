// modules/comboMeter.js
// Feature A — Combo Meter (chat, client-side v1). Surfaces answer momentum in
// the chat surface where students actually live. NO XP is attached in v1 (see
// spec Non-Goals); this is pure feedback juice keyed off the per-turn payload.
//
// Pedagogy constraint (non-negotiable): in tutor mode the combo COOLS on a wrong
// answer (rung −1), it never "shatters." Wrongness must stay safe here — a
// dramatic combo-break would punish the exact behavior Tier-3 XP rewards
// (catching your own error). Full break/shatter effects belong to Showdown and
// Fact Fluency Blaster, where speed/accuracy competition is the explicit frame.

const MOUNT_ID = 'combo-chip';
const GLOW_TARGET_ID = 'chat-container';
const MAX_GLOW_RUNG = 5; // visual escalation caps here; the counter keeps counting

// Ascending pentatonic solve-sound ladder (C5 D5 E5 G5 A5). Index by rung,
// sustaining the top pitch past rung 5.
const PITCH_LADDER = [523.25, 587.33, 659.25, 783.99, 880.0];

let rung = 0;
let audioCtx = null;

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function soundEnabled() {
    // Respect an explicit opt-out; default on. Mirrors the conservative pattern
    // used by other client sound (notifications.js).
    if (window.MM_SOUND_ENABLED === false) return false;
    try {
        if (localStorage.getItem('mm_sound_enabled') === 'false') return false;
    } catch { /* localStorage may be unavailable */ }
    return true;
}

function ensureChip() {
    let chip = document.getElementById(MOUNT_ID);
    if (chip) return chip;
    chip = document.createElement('div');
    chip.id = MOUNT_ID;
    chip.className = 'combo-chip';
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    chip.hidden = true;
    chip.innerHTML = '<span class="combo-flame" aria-hidden="true">🔥</span><span class="combo-count"></span>';
    // Mounted on body: the chip is position:fixed, so a parent with overflow or
    // a transform (containing block) would otherwise clip it.
    document.body.appendChild(chip);
    return chip;
}

function renderChip() {
    const chip = ensureChip();
    if (!chip) return;
    if (rung >= 2) {
        // A "combo of 1" is noise — only surface at 2+.
        chip.querySelector('.combo-count').textContent = `x${rung}`;
        chip.hidden = false;
        chip.classList.toggle('combo-reduced', prefersReducedMotion());
        // Re-trigger the tick pop animation on each change.
        chip.classList.remove('combo-pop');
        void chip.offsetWidth;
        if (!prefersReducedMotion()) chip.classList.add('combo-pop');
    } else {
        chip.hidden = true;
    }
}

function renderGlow() {
    const host = document.getElementById(GLOW_TARGET_ID);
    if (!host) return;
    // Rungs 2/3/4/5 → 0.25/0.5/0.75/1.0. Below 2 → 0 (glow eases out via the CSS
    // transition on --combo-intensity, ~600ms).
    let intensity = 0;
    if (rung >= 2) {
        const capped = Math.min(rung, MAX_GLOW_RUNG);
        intensity = (capped - 1) / (MAX_GLOW_RUNG - 1); // rung2→0.25 … rung5→1.0
    }
    host.style.setProperty('--combo-intensity', prefersReducedMotion() ? '0' : String(intensity));
    host.classList.toggle('combo-active', rung >= 2 && !prefersReducedMotion());
}

function playRungSound() {
    if (!soundEnabled()) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const idx = Math.min(rung, PITCH_LADDER.length) - 1; // rung 1..5 → 0..4, sustain top
        const freq = PITCH_LADDER[Math.max(0, idx)];
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
    } catch { /* audio is best-effort; never block the turn */ }
}

/**
 * Advance the combo based on a chat turn's verified problem result.
 * @param {'correct'|'incorrect'|null|undefined} problemResult
 *   From the chat response (D1: reliable, null on neutral/discussion turns).
 */
export function registerTurn(problemResult) {
    if (problemResult === 'correct') {
        rung += 1;
        renderChip();
        renderGlow();
        playRungSound(); // sound only on rung-up
    } else if (problemResult === 'incorrect') {
        // Cool, don't shatter.
        rung = Math.max(0, rung - 1);
        renderChip();
        renderGlow(); // glow eases down via CSS transition; no negative sound, no red
    }
    // Neutral turns (null): hold — no change.
}

/** Reset the combo (session end / conversation switch). */
export function resetCombo() {
    rung = 0;
    renderChip();
    renderGlow();
}

/** Current rung — exposed for instrumentation (combo rung distribution metric). */
export function getComboRung() {
    return rung;
}

// Also expose on window so non-module callers (e.g. conversation-switch hook in
// script.js) can reset without an import cycle.
if (typeof window !== 'undefined') {
    window.comboMeter = { registerTurn, resetCombo, getComboRung };
}
