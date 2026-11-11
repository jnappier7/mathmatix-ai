/**
 * Visual Motion — the tutor's number lines, inequalities and slope triangles are DRAWN, not shown.
 *
 * A number line with two hops used to appear finished: both arcs, both labels, at once. The
 * student had to reconstruct the order the picture was telling. Here the picture is told in order:
 *
 *   hops        start dot → the arc draws while a dot travels it → it lands → the label
 *   inequality  the endpoint drops in (open or closed) → the shading sweeps out from it
 *   slope       the first point → the line → RISE, straight up → RUN, across → the second point
 *   points      one at a time, left to right
 *
 * How: public/js/inlineChatVisuals.js renders the SVG in its FINAL state and tags the parts with
 * data-m="role". This file only plays those parts in, each animation held back with
 * fill:'backwards', so if it never runs (old browser, reduced motion, script blocked) the picture
 * is simply there, complete. It changes no content and draws nothing the visual did not contain.
 *
 * Plays once per fresh tutor reply (script.js, right after initializeVisuals). History is never
 * animated. Each staged visual gets a small Replay button. Standalone on chat.html — not bundled.
 * The canvas graphs (curves drawing in turn, the ring on an intersection) are mathGraph.js's own.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- the schedule (pure, unit-tested)

  // The order a picture is told in. A role not listed here is not staged.
  const ORDER = ['endpoint', 'sweep', 'after-sweep', 'hop', 'from', 'grow', 'rise', 'rise-label', 'run', 'run-label', 'to', 'point'];
  // [how long the part takes, how long before the next part may start]
  const PACE = {
    endpoint: [380, 300], sweep: [700, 620], 'after-sweep': [250, 150],
    from: [300, 150], grow: [600, 650], rise: [450, 300], 'rise-label': [260, 200],
    run: [450, 300], 'run-label': [260, 150], to: [360, 300],
  };
  const HOP = 760;   // one hop, start to label
  const POINT = 120; // between points

  /**
   * parts: [{ m: role, i?: index }] in document order → [{ part, delay, dur, kind }].
   * Hops play one after another in index order; within a hop the pieces overlap.
   */
  function schedule(parts) {
    const out = [];
    let t = 0;
    const of = (m) => parts.filter((p) => p.m === m);
    for (const role of ORDER) {
      if (role === 'hop') {
        const idx = [...new Set(parts.filter((p) => /^hop-/.test(p.m)).map((p) => Number(p.i) || 0))].sort((a, b) => a - b);
        for (const i of idx) {
          parts.filter((p) => /^hop-/.test(p.m) && (Number(p.i) || 0) === i).forEach((p) => {
            if (p.m === 'hop-start') out.push({ part: p, delay: t, dur: 220, kind: 'pop' });
            if (p.m === 'hop-arc') out.push({ part: p, delay: t + 100, dur: 520, kind: 'draw' });
            if (p.m === 'hop-land') out.push({ part: p, delay: t + 580, dur: 200, kind: 'pop' });
            if (p.m === 'hop-label') out.push({ part: p, delay: t + 330, dur: 280, kind: 'rise' });
          });
          t += HOP;
        }
        continue;
      }
      if (role === 'point') {
        const pts = of('point').sort((a, b) => (Number(a.i) || 0) - (Number(b.i) || 0));
        pts.forEach((p, k) => {
          out.push({ part: p, delay: t + k * POINT, dur: 320, kind: 'pop' });
          parts.filter((q) => q.m === 'point-label' && (Number(q.i) || 0) === (Number(p.i) || 0))
            .forEach((q) => out.push({ part: q, delay: t + k * POINT + 120, dur: 260, kind: 'rise' }));
        });
        t += pts.length * POINT;
        continue;
      }
      const group = of(role);
      if (!group.length) continue;
      const [dur, gap] = PACE[role];
      const kind = role === 'endpoint' ? 'drop' : role === 'sweep' ? 'sweep'
        : role === 'from' || role === 'to' ? 'pop'
          : role === 'grow' || role === 'rise' || role === 'run' ? 'grow' : 'rise';
      group.forEach((p) => out.push({ part: p, delay: t, dur, kind }));
      t += gap;
    }
    return out;
  }
  /** When the last staged part has landed. */
  const totalMs = (plan) => plan.reduce((m, s) => Math.max(m, s.delay + s.dur), 0);

  if (typeof module !== 'undefined' && module.exports) module.exports = { schedule, totalMs, ORDER };
  if (!root || !root.document) return;

  // ---------------------------------------------------------------- the DOM side

  const doc = root.document;
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SPRING = 'cubic-bezier(.3,1.5,.5,1)';
  const live = new WeakMap(); // svg → stop()

  function centre(el) {
    if (el.hasAttribute('cx')) return [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))];
    const b = el.getBBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  }

  function runSvg(svg) {
    if (live.has(svg)) live.get(svg)();
    const els = Array.prototype.slice.call(svg.querySelectorAll('[data-m]'));
    if (!els.length || !svg.animate) return 0;
    const parts = els.map((el) => ({ m: el.getAttribute('data-m'), i: el.getAttribute('data-i'), el }));
    const plan = schedule(parts);
    if (!plan.length) return 0;
    const anims = []; const undo = []; const tweens = [];
    const origin = (el, x, y) => {
      el.style.transformBox = 'view-box';
      el.style.transformOrigin = `${x}px ${y}px`;
      undo.push(() => { el.style.transformBox = ''; el.style.transformOrigin = ''; });
    };
    const go = (el, frames, s, easing) => {
      const a = el.animate(frames, { delay: s.delay, duration: s.dur, easing: easing || 'ease-out', fill: 'backwards' });
      anims.push(a);
      return a;
    };

    plan.forEach((s) => {
      const el = s.part.el;
      if (s.kind === 'pop') {
        const [x, y] = centre(el); origin(el, x, y);
        go(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], s, SPRING);
      } else if (s.kind === 'drop') {
        go(el, [{ transform: 'translateY(-18px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], s, SPRING);
      } else if (s.kind === 'rise') {
        go(el, [{ transform: 'translateY(5px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], s);
      } else if (s.kind === 'sweep') {
        origin(el, Number(el.getAttribute('data-ox')) || 0, 0);
        go(el, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], s, 'cubic-bezier(.4,0,.2,1)');
      } else if (s.kind === 'grow') {
        // A line is grown by moving its far end, not by scaling it: a scale would thin the stroke
        // and stretch the dashes of the rise and the run.
        const x1 = Number(el.getAttribute('x1')); const y1 = Number(el.getAttribute('y1'));
        const x2 = Number(el.getAttribute('x2')); const y2 = Number(el.getAttribute('y2'));
        el.style.opacity = '0';
        undo.push(() => { el.style.opacity = ''; el.setAttribute('x2', x2); el.setAttribute('y2', y2); });
        tweens.push({ el, x1, y1, x2, y2, delay: s.delay, dur: s.dur });
      } else if (s.kind === 'draw' && el.getTotalLength) {
        const L = el.getTotalLength();
        go(el, [{ strokeDasharray: `${L}`, strokeDashoffset: L }, { strokeDasharray: `${L}`, strokeDashoffset: 0 }], s, 'cubic-bezier(.4,0,.3,1)');
        // the hop itself: a dot rides the arc as it is drawn, so the MOVE is what the eye follows
        const dot = doc.createElementNS(NS, 'circle');
        dot.setAttribute('r', '5'); dot.setAttribute('fill', el.getAttribute('stroke') || '#667eea');
        dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', '1.5');
        svg.appendChild(dot);
        undo.push(() => dot.remove());
        const N = 14; const frames = [];
        for (let k = 0; k <= N; k++) {
          const p = el.getPointAtLength((L * k) / N);
          frames.push({ transform: `translate(${p.x}px,${p.y}px)`, opacity: 1 });
        }
        frames.push({ transform: frames[N].transform, opacity: 0 });
        // hidden by its own style before and after; only the animation shows it (no backwards fill:
        // that would park every later hop's dot on the line from the first frame)
        dot.style.opacity = '0';
        const a = dot.animate(frames, { delay: s.delay, duration: s.dur + 120, easing: 'cubic-bezier(.4,0,.3,1)' });
        anims.push(a);
      }
    });

    let raf = 0;
    if (tweens.length) {
      const t0 = performance.now();
      const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      const frame = (now) => {
        let busy = false;
        tweens.forEach((w) => {
          const k = (now - t0 - w.delay) / w.dur;
          if (k < 0) { busy = true; return; }
          const e = ease(Math.min(1, k));
          w.el.style.opacity = '';
          w.el.setAttribute('x2', w.x1 + (w.x2 - w.x1) * e);
          w.el.setAttribute('y2', w.y1 + (w.y2 - w.y1) * e);
          if (k < 1) busy = true;
        });
        if (busy) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
      undo.forEach((f) => f());
      live.delete(svg);
    };
    const timer = setTimeout(stop, totalMs(plan) + 250);
    live.set(svg, stop);
    return totalMs(plan);
  }

  function injectStyle() {
    if (doc.getElementById('mm-vmotion-style')) return;
    const s = doc.createElement('style');
    s.id = 'mm-vmotion-style';
    s.textContent = '.icv-replay{display:inline-flex;align-items:center;gap:6px;margin:4px 0 0;padding:3px 10px;border-radius:999px;'
      + 'border:1px solid currentColor;background:none;color:inherit;opacity:.55;font:inherit;font-size:.78rem;cursor:pointer}'
      + '.icv-replay:hover,.icv-replay:focus-visible{opacity:1}';
    doc.head.appendChild(s);
  }

  /** Stage every tagged visual inside a message. Returns how many were played. */
  function play(container, opts) {
    opts = opts || {};
    if (!container || !container.querySelectorAll) return 0;
    if (reduced() && !opts.force) return 0;
    let n = 0;
    container.querySelectorAll('svg.icv-number-line, svg.icv-inequality, svg.icv-slope').forEach((svg) => {
      if (svg.offsetParent === null && !opts.force) return; // collapsed or hidden
      if (!runSvg(svg)) return;
      n++;
      const box = svg.closest('.icv-container');
      if (box && !box.querySelector('.icv-replay')) {
        injectStyle();
        const b = doc.createElement('button');
        b.type = 'button'; b.className = 'icv-replay';
        b.textContent = '↻ Replay';
        b.setAttribute('aria-label', 'Replay this picture as an animation');
        b.addEventListener('click', (e) => { e.stopPropagation(); runSvg(svg); });
        svg.insertAdjacentElement('afterend', b);
      }
    });
    return n;
  }

  root.VisualMotion = { play, schedule };
})(typeof window !== 'undefined' ? window : null);
