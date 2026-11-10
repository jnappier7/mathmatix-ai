/**
 * Math Morph — the carry between two lines of algebra.
 *
 * A tutor message that works a problem is a stack of display equations:
 *
 *     2x + 10 = 26
 *     2x = 26 - 10
 *     2x = 16
 *
 * Printed, each line just appears and the student has to work out what changed. Here each line is
 * BUILT from the one above it: the terms that carried over travel down into place, a term that
 * changed sides arcs across in the accent colour, and whatever is new (the 16) lands last, tinted
 * for a moment. The animation is the algebra move.
 *
 * Presentation only. It reads the KaTeX the message already rendered and never adds, removes or
 * reorders a character — what the tutor may show is decided upstream (the pipeline's verify stage);
 * nothing here can reveal a step the reply did not contain.
 *
 * How: every leaf glyph KaTeX rendered is a token. Two lines are matched in two passes — a longest
 * common subsequence (what stayed, in order) and then leftover numbers/letters by text (what
 * moved). Matched glyphs fly as clones in an overlay, because the real ones are inline (no
 * transforms) and sit inside a horizontally scrollable equation that would clip them. Lines that
 * share too little are left alone.
 *
 * Plays once, when a streamed reply finishes (script.js finalizeStreamingMessage). History is
 * never animated. A tap on the message finishes it at once; prefers-reduced-motion skips it.
 * Standalone on chat.html — not bundled.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- matching (pure, unit-tested)

  /** Index pairs of a longest common subsequence of two string arrays. */
  function lcsPairs(a, b) {
    const n = a.length; const m = b.length;
    const t = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
      }
    }
    const out = [];
    let i = 0; let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
    }
    return out;
  }

  /** Only a number or a letter is worth watching cross the line; a stray "+" flying about is noise. */
  const isTerm = (s) => /[0-9A-Za-zͰ-Ͽ]/.test(s);

  /**
   * How line `b` is made from line `a` (arrays of glyph text).
   *   stay  — [i, j] pairs that kept their order
   *   move  — [i, j] pairs that changed places (a term crossing the equals sign)
   *   fresh — indexes of `b` that are new
   *   score — share of the longer line accounted for; below MIN_SCORE the lines are unrelated
   */
  function matchTokens(a, b) {
    const stay = lcsPairs(a, b);
    const usedA = new Set(stay.map((p) => p[0]));
    const usedB = new Set(stay.map((p) => p[1]));
    const move = [];
    for (let j = 0; j < b.length; j++) {
      if (usedB.has(j) || !isTerm(b[j])) continue;
      for (let i = 0; i < a.length; i++) {
        if (usedA.has(i) || a[i] !== b[j]) continue;
        usedA.add(i); usedB.add(j); move.push([i, j]);
        break;
      }
    }
    const fresh = [];
    for (let j = 0; j < b.length; j++) if (!usedB.has(j)) fresh.push(j);
    const longer = Math.max(a.length, b.length);
    return { stay, move, fresh, score: longer ? (stay.length + move.length) / longer : 0 };
  }

  const MIN_SCORE = 0.33;   // "2x = 16" → "x = 8" keeps 2 of 4 glyphs (0.5); two unrelated equations score ~0.2
  const MAX_TOKENS = 90;    // a wall of algebra is not a step; leave it printed

  /** Per-step duration: a long derivation plays faster, so the whole thing stays near 3 seconds. */
  function stepMs(steps) {
    return Math.round(Math.max(420, Math.min(760, 3000 / Math.max(1, steps))));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { lcsPairs, matchTokens, stepMs, MIN_SCORE };
  }
  if (!root || !root.document) return;

  // ---------------------------------------------------------------- the DOM side

  const doc = root.document;
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const VISIBLE = /[^\s\u200b]/;

  /** The leaf glyphs KaTeX drew for one display equation, in reading order. */
  function glyphsOf(eq) {
    const html = eq.querySelector('.katex-html');
    if (!html) return [];
    const out = [];
    const all = html.getElementsByTagName('span');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.childElementCount === 0 && VISIBLE.test(el.textContent)) out.push(el);
    }
    return out;
  }

  const live = new WeakMap(); // bubble → { finish }

  function injectStyle() {
    if (doc.getElementById('mm-morph-style')) return;
    const s = doc.createElement('style');
    s.id = 'mm-morph-style';
    s.textContent = [
      '.mm-morph-layer{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2}',
      '.mm-morph-ghost{position:absolute;white-space:pre;margin:0;transform-origin:0 0;will-change:transform}',
      '.mm-morph-replay{display:inline-flex;align-items:center;gap:6px;margin:2px 0 8px;padding:4px 10px;border-radius:999px;',
      'border:1px solid currentColor;background:none;color:inherit;opacity:.55;font:inherit;font-size:.8rem;cursor:pointer}',
      '.mm-morph-replay:hover,.mm-morph-replay:focus-visible{opacity:1}',
      '.mm-morph-replay[disabled]{opacity:.3;cursor:default}',
    ].join('');
    doc.head.appendChild(s);
  }

  function accent(el) {
    const v = root.getComputedStyle(el).getPropertyValue('--cr-accent').trim();
    return v || '#8B7BFF';
  }

  /**
   * Play the carry through every related pair of display equations in a message.
   * Returns true if anything was animated.
   */
  function play(bubble, opts) {
    opts = opts || {};
    if (!bubble || !bubble.querySelectorAll || !bubble.animate) return false;
    if (reduced() && !opts.force) return false;
    if (live.has(bubble)) live.get(bubble).finish();

    const eqs = Array.prototype.filter.call(bubble.querySelectorAll('.katex-display'), (e) => e.offsetParent !== null);
    if (eqs.length < 2) return false;
    const glyphs = eqs.map(glyphsOf);
    const steps = [];
    for (let k = 1; k < eqs.length; k++) {
      const a = glyphs[k - 1]; const b = glyphs[k];
      if (a.length < 2 || b.length < 2 || a.length > MAX_TOKENS || b.length > MAX_TOKENS) continue;
      const m = matchTokens(a.map((g) => g.textContent), b.map((g) => g.textContent));
      if (m.score >= MIN_SCORE) steps.push({ k, m });
    }
    if (!steps.length) return false;

    injectStyle();
    if (root.getComputedStyle(bubble).position === 'static') bubble.style.position = 'relative';
    const layer = doc.createElement('div');
    layer.className = 'mm-morph-layer';
    layer.setAttribute('aria-hidden', 'true');
    bubble.appendChild(layer);

    const D = stepMs(steps.length);
    const hue = accent(bubble);
    const anims = [];
    const timers = [];
    const dimmed = [];
    let done = false;

    // every line still to be built waits, in place: opacity only, so the message never reflows
    steps.forEach((s) => { eqs[s.k].style.opacity = '0'; });

    function runStep(s) {
      const eq = eqs[s.k];
      const from = glyphs[s.k - 1]; const to = glyphs[s.k];
      const base = layer.getBoundingClientRect();
      const fly = (pair, moved) => {
        const src = from[pair[0]]; const dst = to[pair[1]];
        const r1 = src.getBoundingClientRect(); const r2 = dst.getBoundingClientRect();
        if (!r2.width || !r2.height || !r1.height) return;
        const cs = root.getComputedStyle(dst);
        const g = doc.createElement('span');
        g.className = 'mm-morph-ghost';
        g.textContent = dst.textContent;
        g.style.cssText = `left:${r2.left - base.left}px;top:${r2.top - base.top}px;line-height:${r2.height}px;`
          + `font-family:${cs.fontFamily};font-size:${cs.fontSize};font-style:${cs.fontStyle};font-weight:${cs.fontWeight};color:${cs.color}`;
        layer.appendChild(g);
        dst.style.opacity = '0';
        dimmed.push(dst);
        const dx = r1.left - r2.left; const dy = r1.top - r2.top; const sc = r1.height / r2.height;
        const frames = moved
          ? [
            { transform: `translate(${dx}px,${dy}px) scale(${sc})`, color: cs.color },
            // a term changing sides lifts off the line and comes down on the other side
            { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 16}px) scale(${(sc + 1) / 2 * 1.12})`, color: hue, offset: 0.5 },
            { transform: 'translate(0,0) scale(1)', color: hue },
          ]
          : [{ transform: `translate(${dx}px,${dy}px) scale(${sc})` }, { transform: 'translate(0,0) scale(1)' }];
        const an = g.animate(frames, { duration: D * (moved ? 0.95 : 0.78), easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
        anims.push(an);
        an.onfinish = () => {
          dst.style.opacity = '';
          g.remove();
          if (moved) anims.push(dst.animate([{ color: hue }, { color: cs.color }], { duration: 900, easing: 'ease-out' }));
        };
      };
      s.m.stay.forEach((p) => fly(p, false));
      s.m.move.forEach((p) => fly(p, true));
      // the line itself (fraction bars, radicals, and whatever is new) arrives as the carried terms land
      eq.style.opacity = '';
      anims.push(eq.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: D * 0.85, easing: 'ease-out' }));
      s.m.fresh.forEach((j) => {
        const el = to[j];
        const c = root.getComputedStyle(el).color;
        anims.push(el.animate([{ color: hue }, { color: hue, offset: 0.55 }, { color: c }], { duration: D + 900, easing: 'ease-out' }));
      });
    }

    function finish() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      anims.forEach((a) => { try { a.cancel(); } catch { /* already gone */ } });
      dimmed.forEach((el) => { el.style.opacity = ''; });
      eqs.forEach((e) => { e.style.opacity = ''; });
      layer.remove();
      bubble.removeEventListener('pointerdown', onTap, true);
      live.delete(bubble);
      addReplay(bubble, eqs[steps[steps.length - 1].k]);
    }
    // a tap means "I'm reading" — stop moving things. (The replay button is not there while it plays.)
    function onTap() { finish(); }

    live.set(bubble, { finish });
    bubble.addEventListener('pointerdown', onTap, true);
    steps.forEach((s, i) => { timers.push(setTimeout(() => { if (!done) runStep(s); }, i * D)); });
    timers.push(setTimeout(finish, steps.length * D + 1100));
    return true;
  }

  /** One quiet button under the last line: watch it again. */
  function addReplay(bubble, afterEq) {
    if (!afterEq || bubble.querySelector('.mm-morph-replay')) return;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'mm-morph-replay';
    b.textContent = '↻ Replay the steps';
    b.setAttribute('aria-label', 'Replay the steps as an animation');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.remove();
      play(bubble, { force: true });
    });
    const host = afterEq.closest('p') || afterEq;
    host.insertAdjacentElement('afterend', b);
  }

  root.MathMorph = { play, matchTokens };
})(typeof window !== 'undefined' ? window : null);
