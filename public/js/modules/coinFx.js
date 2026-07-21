// modules/coinFx.js
// Coin reward juice — makes earned Coins VISIBLE the moment they land. Kids should
// watch their balance tick up (with a cash-register cha-ching) so the shop economy
// feels alive. Fires wherever the server tells us coins were awarded (level-ups in
// chat, quest/challenge completions).
//
// Three coordinated effects, all best-effort and non-blocking:
//   1. A burst of coin tokens that arc from screen-center to the sidebar counter.
//   2. A count-up animation on the counter number itself + a pop.
//   3. A synthesized "cha-ching" (WebAudio — no asset needed).
//
// Accessibility: honors prefers-reduced-motion (skips the fly + pop, keeps an
// instant number update) and the shared mm_sound_enabled opt-out (mirrors
// comboMeter.js / notifications.js).

const COUNTER_ID = 'sidebar-coins';
let audioCtx = null;

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function soundEnabled() {
    if (window.MM_SOUND_ENABLED === false) return false;
    try {
        if (localStorage.getItem('mm_sound_enabled') === 'false') return false;
    } catch { /* localStorage may be unavailable */ }
    return true;
}

function counterEl() {
    return document.getElementById(COUNTER_ID);
}

/** Cash-register "cha-ching": a bright two-note ring + a little shimmer tail. */
function playChaChing() {
    if (!soundEnabled()) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        // Two quick ascending "ding" notes (the classic register two-tone).
        const notes = [
            { freq: 1318.5, at: 0.0,  dur: 0.12 }, // E6
            { freq: 1760.0, at: 0.08, dur: 0.30 }, // A6 (rings out)
        ];
        for (const n of notes) {
            const t = now + n.at;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.freq, t);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + n.dur + 0.02);
        }

        // Metallic shimmer tail (a hint of coins jingling).
        const shimmer = audioCtx.createOscillator();
        const sGain = audioCtx.createGain();
        shimmer.type = 'square';
        shimmer.frequency.setValueAtTime(2637, now + 0.1); // E7
        sGain.gain.setValueAtTime(0.0001, now + 0.1);
        sGain.gain.exponentialRampToValueAtTime(0.04, now + 0.12);
        sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        shimmer.connect(sGain).connect(audioCtx.destination);
        shimmer.start(now + 0.1);
        shimmer.stop(now + 0.42);
    } catch { /* audio is best-effort; never block the turn */ }
}

/** Count the counter up from its current value to `to` over ~700ms. */
function animateCount(el, to) {
    const from = parseInt(el.textContent, 10) || 0;
    if (to <= from || prefersReducedMotion()) {
        el.textContent = String(to);
        return;
    }
    const start = performance.now();
    const dur = 700;
    function step(t) {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = String(Math.round(from + (to - from) * eased));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = String(to);
    }
    requestAnimationFrame(step);
}

/** Pop the counter pill so the change is impossible to miss. */
function popCounter(el) {
    const pill = el.closest('.sidebar-coins-pill') || el;
    pill.classList.remove('coins-pop');
    void pill.offsetWidth;
    pill.classList.add('coins-pop');
    setTimeout(() => pill.classList.remove('coins-pop'), 650);
}

/** Fly a burst of coins from the origin toward the counter. */
function flyCoins(amount, origin) {
    const el = counterEl();
    if (!el) return;
    const target = el.getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;

    // More coins for bigger rewards, but capped so it stays snappy.
    const count = Math.max(6, Math.min(16, Math.round(amount / 3) + 6));
    const ox = origin?.x ?? window.innerWidth / 2;
    const oy = origin?.y ?? window.innerHeight / 2;

    for (let i = 0; i < count; i++) {
        const coin = document.createElement('div');
        coin.className = 'coin-fly';
        coin.textContent = '🪙';
        // Scatter the start a little so they don't stack.
        const jx = ox + (Math.random() - 0.5) * 80;
        const jy = oy + (Math.random() - 0.5) * 40;
        coin.style.left = `${jx}px`;
        coin.style.top = `${jy}px`;
        coin.style.setProperty('--dx', `${tx - jx}px`);
        coin.style.setProperty('--dy', `${ty - jy}px`);
        coin.style.animationDelay = `${i * 35}ms`;
        document.body.appendChild(coin);
        coin.addEventListener('animationend', () => coin.remove(), { once: true });
        // Safety cleanup in case animationend doesn't fire.
        setTimeout(() => coin.remove(), 1600 + i * 35);
    }
}

/**
 * Celebrate a coin award: chime + fly-in + count-up + pop.
 * @param {number} amount   Coins awarded this event (from the server).
 * @param {{x:number,y:number}} [origin]  Where the coins fly FROM (defaults center).
 * @param {number} [newTotal]  Authoritative new balance; falls back to current+amount.
 */
export function showCoinReward(amount, origin, newTotal) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return;
    const el = counterEl();

    playChaChing();

    if (!el) return; // no counter on this surface — sound only

    const to = Number.isFinite(newTotal)
        ? newTotal
        : (parseInt(el.textContent, 10) || 0) + amount;

    if (prefersReducedMotion()) {
        animateCount(el, to); // instant under reduced motion
        popCounter(el);
        return;
    }

    flyCoins(amount, origin);
    // Land the count-up roughly when the coins arrive at the counter.
    setTimeout(() => { animateCount(el, to); popCounter(el); }, 480);
}

/** Set the counter directly (no animation) — used on initial load/refresh. */
export function setCoinCounter(value) {
    const el = counterEl();
    if (el) el.textContent = String(Math.max(0, Math.floor(Number(value) || 0)));
}

if (typeof window !== 'undefined') {
    window.showCoinReward = showCoinReward;
    window.setCoinCounter = setCoinCounter;
}
