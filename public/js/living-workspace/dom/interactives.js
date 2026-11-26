/* ============================================================
   interactives.js — the visual library's hands-on pictures.

   Each one is a picture a student can MOVE: drag the point round the unit
   circle, swing a ray to make an angle, slide two points to see rise and
   run, place a point on the coordinate plane, cut and shade fraction bars.
   utils/visualLibrary.js names them (`widget`) and the picture card offers
   one behind its "Explore it" button (imageElement.js); the browsable page
   (/visual-library) mounts them too.

   Rules they all keep:
   - CORRECT BY CONSTRUCTION. Every number shown is computed from where the
     handle is by the pure functions at the top (exported and tested in
     tests/unit/visualLibrary.test.js). Nothing is typed in.
   - A MANIPULATIVE, NOT A CALCULATOR. They show what graph paper, a
     protractor or fraction strips would show. The slope explorer prints
     rise ÷ run as counted, never a decimal; the fraction bars print no
     comparison sign — the bars are the comparison.
   - THEY KNOW NOTHING ABOUT THE STUDENT'S PROBLEM and send nothing anywhere.
   - Touch, mouse and keyboard: every handle is focusable and moves with the
     arrow keys; the readout is a live region.
   - Each paints its own white ground (the chat panel behind may be dark).

   UMD-lite: require() in jest, window.LWS.Interactives in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).Interactives = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── the math (pure) ─────────────────────────────────────────────────────
  const MINUS = '−';
  const signed = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const norm360 = (d) => ((Math.round(d) % 360) + 360) % 360;

  // Degrees as a multiple of π, reduced: 30 → "π/6", 225 → "5π/4", 0 → "0".
  function radLabel(deg) {
    const d = norm360(deg);
    if (d === 0) return '0';
    const g = gcd(d, 180), n = d / g, m = 180 / g;
    return (n === 1 ? '' : n) + 'π' + (m === 1 ? '' : '/' + m);
  }

  // cos/sin of a whole-degree angle: exact for the multiples of 30° and 45°
  // (the ones a unit circle prints), two decimals otherwise.
  const EXACT = [[0, '0'], [0.5, '1/2'], [Math.SQRT1_2, '√2/2'], [Math.sqrt(3) / 2, '√3/2'], [1, '1']];
  function trigLabel(value, exact) {
    const a = Math.abs(value);
    if (exact) {
      const hit = EXACT.find(([v]) => Math.abs(v - a) < 1e-9);
      if (hit) return (value < -1e-9 ? MINUS : '') + hit[1];
    }
    const r = Math.round(value * 100) / 100;
    return (r < 0 ? MINUS : '') + Math.abs(r).toFixed(2);
  }
  function unitCircleRead(deg) {
    const d = norm360(deg), t = d * Math.PI / 180;
    const exact = d % 30 === 0 || d % 45 === 0;
    const cos = trigLabel(Math.cos(t), exact), sin = trigLabel(Math.sin(t), exact);
    return { deg: d, rad: exact || d % 15 === 0 ? radLabel(d) : null, cos, sin, exact, x: Math.cos(t), y: Math.sin(t) };
  }
  // Snap a dragged angle: to a special angle when close, else to the nearest 5°.
  function snapAngle(deg, special, near) {
    const d = ((deg % 360) + 360) % 360;
    for (const s of special) { const gap = Math.abs(d - s); if (Math.min(gap, 360 - gap) <= near) return s % 360; }
    return norm360(Math.round(d / 5) * 5);
  }
  const SPECIAL = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];

  function angleKind(deg) {
    const d = clamp(Math.round(deg), 0, 360);
    if (d === 0) return { name: 'Zero angle', rule: 'the rays lie on top of each other' };
    if (d < 90) return { name: 'Acute', rule: 'less than 90°' };
    if (d === 90) return { name: 'Right', rule: 'exactly 90°' };
    if (d < 180) return { name: 'Obtuse', rule: 'between 90° and 180°' };
    if (d === 180) return { name: 'Straight', rule: 'exactly 180°' };
    if (d < 360) return { name: 'Reflex', rule: 'between 180° and 360°' };
    return { name: 'Full turn', rule: 'exactly 360°' };
  }

  // Rise and run as COUNTED between two grid points, and the slope they make.
  function slopeRead(p1, p2) {
    const rise = p2[1] - p1[1], run = p2[0] - p1[0];
    if (!rise && !run) return { rise, run, same: true, text: 'Move one point — a line needs two different points.' };
    if (!run) return { rise, run, kind: 'undefined', text: `rise = ${signed(rise)} · run = 0 · a vertical line: its slope is undefined (you cannot divide by 0)` };
    const g = gcd(rise, run), n = (rise / g) * Math.sign(run / g || 1), m = Math.abs(run / g);
    const slope = n === 0 ? '0' : m === 1 ? signed(n) : `${signed(n)}/${m}`;
    const kind = n === 0 ? 'zero' : n > 0 ? 'positive' : 'negative';
    const why = n === 0 ? 'a flat line' : n > 0 ? 'it goes up to the right' : 'it goes down to the right';
    return { rise, run, slope, kind, text: `rise = ${signed(rise)} · run = ${signed(run)} · slope = rise ÷ run = ${slope} (${why})` };
  }

  function pointRead(x, y) {
    const where = !x && !y ? 'the origin'
      : !y ? 'on the x-axis' : !x ? 'on the y-axis'
        : `Quadrant ${x > 0 ? (y > 0 ? 'I' : 'IV') : (y > 0 ? 'II' : 'III')}`;
    const across = !x ? 'stay at 0' : `${Math.abs(x)} ${x > 0 ? 'right' : 'left'}`;
    const up = !y ? 'stay level' : `${Math.abs(y)} ${y > 0 ? 'up' : 'down'}`;
    return { where, text: `(${signed(x)}, ${signed(y)}) — ${where}: ${across}, then ${up}` };
  }

  function fractionRead(n, d) {
    d = clamp(Math.round(d), 1, 12); n = clamp(Math.round(n), 0, d);
    return { n, d, text: `${n}/${d}`, words: `${n} of ${d} equal pieces shaded` };
  }

  // ── drawing helpers ─────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#1f2937', SOFT = '#5b6475', GRID = '#e5e7eb', ACCENT = '#6d28d9', TEAL = '#0f766e', AMBER = '#b45309';
  function el(doc, name, attrs, parent) {
    const node = doc.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }
  function label(doc, parent, x, y, text, attrs) {
    const t = el(doc, 'text', Object.assign({ x, y, 'font-size': 13, fill: SOFT, 'text-anchor': 'middle', 'font-family': 'Helvetica, Arial, sans-serif' }, attrs), parent);
    t.textContent = text; return t;
  }
  // The frame every interactive shares: title, a square SVG stage, a live readout.
  function frame(host, title, hint) {
    const doc = host.ownerDocument;
    host.textContent = '';
    const wrap = doc.createElement('div'); wrap.className = 'lws-ix';
    const head = doc.createElement('div'); head.className = 'lws-ix-title'; head.textContent = title;
    const svg = el(doc, 'svg', { viewBox: '0 0 320 320', class: 'lws-ix-stage', role: 'group', 'aria-label': title });
    el(doc, 'rect', { x: 0, y: 0, width: 320, height: 320, fill: '#ffffff' }, svg);
    const out = doc.createElement('div'); out.className = 'lws-ix-readout'; out.setAttribute('aria-live', 'polite');
    const tip = doc.createElement('div'); tip.className = 'lws-ix-hint'; tip.textContent = hint;
    wrap.appendChild(head); wrap.appendChild(svg); wrap.appendChild(out); wrap.appendChild(tip);
    host.appendChild(wrap);
    return { doc, wrap, svg, out };
  }
  // Pointer position in the SVG's own units.
  function toStage(svg, ev) {
    const ctm = svg.getScreenCTM && svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }
  // A draggable, focusable handle. onMove gets stage coordinates; onKey gets (dx, dy) in steps.
  function handle(doc, svg, color, name, onMove, onKey) {
    const g = el(doc, 'g', { class: 'lws-ix-handle', tabindex: 0, role: 'slider', 'aria-label': name }, svg);
    el(doc, 'circle', { r: 22, fill: 'transparent' }, g);               // a finger-sized target
    el(doc, 'circle', { r: 9, fill: color, stroke: '#ffffff', 'stroke-width': 2.5 }, g);
    let dragging = false;
    g.addEventListener('pointerdown', (ev) => { dragging = true; if (g.setPointerCapture) { try { g.setPointerCapture(ev.pointerId); } catch (_) { /* older engines */ } } ev.preventDefault(); });
    g.addEventListener('pointermove', (ev) => { if (!dragging) return; const p = toStage(svg, ev); if (p) onMove(p); });
    const stop = () => { dragging = false; };
    g.addEventListener('pointerup', stop); g.addEventListener('pointercancel', stop);
    g.addEventListener('keydown', (ev) => {
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
      if (!k) return; ev.preventDefault(); onKey(k[0], k[1]);
    });
    return { node: g, at: (x, y, text) => { g.setAttribute('transform', `translate(${x} ${y})`); if (text) g.setAttribute('aria-valuetext', text); } };
  }
  function grid(doc, svg, cx, cy, U, N) {
    for (let i = -N; i <= N; i++) {
      el(doc, 'line', { x1: cx + i * U, y1: cy - N * U, x2: cx + i * U, y2: cy + N * U, stroke: GRID }, svg);
      el(doc, 'line', { x1: cx - N * U, y1: cy + i * U, x2: cx + N * U, y2: cy + i * U, stroke: GRID }, svg);
    }
    el(doc, 'line', { x1: cx - N * U - 6, y1: cy, x2: cx + N * U + 6, y2: cy, stroke: INK, 'stroke-width': 2 }, svg);
    el(doc, 'line', { x1: cx, y1: cy + N * U + 6, x2: cx, y2: cy - N * U - 6, stroke: INK, 'stroke-width': 2 }, svg);
    for (let i = -N; i <= N; i++) {
      if (!i) continue;
      label(doc, svg, cx + i * U, cy + 13, signed(i), { 'font-size': 9.5 });
      label(doc, svg, cx - 5, cy - i * U + 3, signed(i), { 'font-size': 9.5, 'text-anchor': 'end' });
    }
  }

  // ── the interactives ────────────────────────────────────────────────────
  function unitCircle(host) {
    const { doc, svg, out } = frame(host, 'The unit circle', 'Drag the point round the circle, or use the arrow keys.');
    const cx = 160, cy = 160, R = 112; let deg = 30;
    el(doc, 'line', { x1: 24, y1: cy, x2: 296, y2: cy, stroke: SOFT, 'stroke-width': 1.5 }, svg);
    el(doc, 'line', { x1: cx, y1: 24, x2: cx, y2: 296, stroke: SOFT, 'stroke-width': 1.5 }, svg);
    el(doc, 'circle', { cx, cy, r: R, fill: 'none', stroke: INK, 'stroke-width': 2.5 }, svg);
    [[1, 0, '1'], [-1, 0, '−1'], [0, 1, '1'], [0, -1, '−1']].forEach(([x, y, t]) => label(doc, svg, cx + x * (R + 12) + (x ? 0 : 11), cy - y * (R + 12) + (y ? 4 : 15), t, { 'font-size': 11 }));
    const arc = el(doc, 'path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2.5 }, svg);
    const cosLeg = el(doc, 'line', { stroke: TEAL, 'stroke-width': 4 }, svg);
    const sinLeg = el(doc, 'line', { stroke: AMBER, 'stroke-width': 4 }, svg);
    const radius = el(doc, 'line', { x1: cx, y1: cy, stroke: INK, 'stroke-width': 2.5 }, svg);
    const cosT = label(doc, svg, 0, 0, 'cos θ', { fill: TEAL, 'font-weight': 700 });
    const sinT = label(doc, svg, 0, 0, 'sin θ', { fill: AMBER, 'font-weight': 700 });
    const h = handle(doc, svg, ACCENT, 'The point on the circle',
      ([x, y]) => set(snapAngle(Math.atan2(cy - y, x - cx) * 180 / Math.PI, SPECIAL, 4)),
      (dx, dy) => set(deg + (dy - dx) * 5));
    function set(d) {
      deg = norm360(d); const r = unitCircleRead(deg), px = cx + R * r.x, py = cy - R * r.y;
      radius.setAttribute('x2', px); radius.setAttribute('y2', py);
      cosLeg.setAttribute('x1', cx); cosLeg.setAttribute('y1', cy); cosLeg.setAttribute('x2', px); cosLeg.setAttribute('y2', cy);
      sinLeg.setAttribute('x1', px); sinLeg.setAttribute('y1', cy); sinLeg.setAttribute('x2', px); sinLeg.setAttribute('y2', py);
      const ax = cx + 26 * Math.cos(deg * Math.PI / 180), ay = cy - 26 * Math.sin(deg * Math.PI / 180);
      arc.setAttribute('d', deg ? `M ${cx + 26} ${cy} A 26 26 0 ${deg > 180 ? 1 : 0} 0 ${ax} ${ay}` : '');
      cosT.setAttribute('x', (cx + px) / 2); cosT.setAttribute('y', cy + (r.y >= 0 ? 16 : -8));
      sinT.setAttribute('x', px + (r.x >= 0 ? 24 : -24)); sinT.setAttribute('y', (cy + py) / 2 + 4);
      const text = `θ = ${deg}°${r.rad ? ` = ${r.rad}` : ''} · cos θ = ${r.cos} · sin θ = ${r.sin} · the point is (${r.cos}, ${r.sin})`;
      out.textContent = text; h.at(px, py, text);
    }
    set(deg);
    return { get: () => deg, set };
  }

  function angle(host) {
    const { doc, svg, out } = frame(host, 'Make an angle', 'Drag the end of the purple ray, or use the arrow keys.');
    const vx = 160, vy = 176, L = 118; let deg = 50;
    el(doc, 'line', { x1: vx, y1: vy, x2: vx + L, y2: vy, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    const arc = el(doc, 'path', { fill: 'none', stroke: ACCENT, 'stroke-width': 2.5 }, svg);
    const box = el(doc, 'path', { d: `M ${vx + 16} ${vy} V ${vy - 16} H ${vx}`, fill: 'none', stroke: ACCENT, 'stroke-width': 2.5 }, svg);
    const ray = el(doc, 'line', { x1: vx, y1: vy, stroke: ACCENT, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
    el(doc, 'circle', { cx: vx, cy: vy, r: 4.5, fill: INK }, svg);
    const big = label(doc, svg, vx, 40, '', { 'font-size': 26, 'font-weight': 700, fill: INK });
    const h = handle(doc, svg, ACCENT, 'The end of the moving ray',
      ([x, y]) => { let d = Math.atan2(vy - y, x - vx) * 180 / Math.PI; if (d < 0) d += 360; const s = [0, 90, 180, 270, 360].find((q) => Math.abs(q - d) <= 3); set(s != null ? s : Math.round(d)); },
      (dx, dy) => set(deg + (dy - dx) * 1));
    function set(d) {
      deg = clamp(Math.round(d), 0, 360); const t = deg * Math.PI / 180, ex = vx + L * Math.cos(t), ey = vy - L * Math.sin(t);
      ray.setAttribute('x2', ex); ray.setAttribute('y2', ey);
      const k = angleKind(deg);
      box.setAttribute('visibility', deg === 90 ? 'visible' : 'hidden');
      const ax = vx + 30 * Math.cos(t), ay = vy - 30 * Math.sin(t);
      arc.setAttribute('d', deg && deg !== 90 && deg < 360 ? `M ${vx + 30} ${vy} A 30 30 0 ${deg > 180 ? 1 : 0} 0 ${ax} ${ay}` : deg === 360 ? `M ${vx + 30} ${vy} A 30 30 0 1 0 ${vx - 30} ${vy} A 30 30 0 1 0 ${vx + 30} ${vy}` : '');
      big.textContent = `${deg}°`;
      const text = `${deg}° — ${k.name}: ${k.rule}`;
      out.textContent = text; h.at(ex, ey, text);
    }
    set(deg);
    return { get: () => deg, set };
  }

  function slope(host) {
    const { doc, svg, out } = frame(host, 'Slope: rise over run', 'Drag either point. Arrow keys move the one you have selected.');
    const cx = 160, cy = 160, U = 26, N = 5; const X = (x) => cx + x * U, Y = (y) => cy - y * U;
    grid(doc, svg, cx, cy, U, N);
    const P = [[-2, -1], [1, 1]];
    const line = el(doc, 'line', { stroke: INK, 'stroke-width': 2.5 }, svg);
    const runLeg = el(doc, 'line', { stroke: TEAL, 'stroke-width': 4, 'stroke-dasharray': '6 4' }, svg);
    const riseLeg = el(doc, 'line', { stroke: AMBER, 'stroke-width': 4, 'stroke-dasharray': '6 4' }, svg);
    const snap = ([x, y]) => [clamp(Math.round((x - cx) / U), -N, N), clamp(Math.round((cy - y) / U), -N, N)];
    const hs = P.map((_, i) => handle(doc, svg, ACCENT, i ? 'The second point' : 'The first point',
      (p) => { P[i] = snap(p); draw(); },
      (dx, dy) => { P[i] = [clamp(P[i][0] + dx, -N, N), clamp(P[i][1] + dy, -N, N)]; draw(); }));
    function draw() {
      const [a, b] = P, r = slopeRead(a, b);
      if (r.same) line.setAttribute('visibility', 'hidden');
      else {
        // run the line to the edge of the grid in both directions
        const dx = b[0] - a[0], dy = b[1] - a[1], k = (2 * N + 2) / Math.max(Math.abs(dx), Math.abs(dy));
        line.setAttribute('visibility', 'visible');
        line.setAttribute('x1', X(a[0] - dx * k)); line.setAttribute('y1', Y(a[1] - dy * k));
        line.setAttribute('x2', X(a[0] + dx * k)); line.setAttribute('y2', Y(a[1] + dy * k));
      }
      runLeg.setAttribute('x1', X(a[0])); runLeg.setAttribute('y1', Y(a[1])); runLeg.setAttribute('x2', X(b[0])); runLeg.setAttribute('y2', Y(a[1]));
      riseLeg.setAttribute('x1', X(b[0])); riseLeg.setAttribute('y1', Y(a[1])); riseLeg.setAttribute('x2', X(b[0])); riseLeg.setAttribute('y2', Y(b[1]));
      out.textContent = `From (${signed(a[0])}, ${signed(a[1])}) to (${signed(b[0])}, ${signed(b[1])}): ${r.text}`;
      hs.forEach((h, i) => h.at(X(P[i][0]), Y(P[i][1]), `(${signed(P[i][0])}, ${signed(P[i][1])})`));
    }
    // keep the line inside the stage
    const clip = el(doc, 'clipPath', { id: 'lws-ix-clip-' + Math.random().toString(36).slice(2) }, svg);
    el(doc, 'rect', { x: X(-N), y: Y(N), width: 2 * N * U, height: 2 * N * U }, clip);
    line.setAttribute('clip-path', `url(#${clip.getAttribute('id')})`);
    draw();
    return { get: () => P.map((p) => p.slice()), set: (a, b) => { P[0] = a; P[1] = b; draw(); } };
  }

  function coordinatePlane(host) {
    const { doc, svg, out } = frame(host, 'The coordinate plane', 'Drag the point anywhere, or use the arrow keys.');
    const cx = 160, cy = 160, U = 22, N = 6; const X = (x) => cx + x * U, Y = (y) => cy - y * U;
    grid(doc, svg, cx, cy, U, N);
    [['I', 1, 1], ['II', -1, 1], ['III', -1, -1], ['IV', 1, -1]].forEach(([q, sx, sy]) => label(doc, svg, X(sx * 5), Y(sy * 5.4) + 4, q, { 'font-size': 13, 'font-weight': 700, fill: '#c4b5fd' }));
    const guide = el(doc, 'path', { fill: 'none', stroke: AMBER, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
    let p = [3, 2];
    const h = handle(doc, svg, AMBER, 'The point',
      ([x, y]) => set(clamp(Math.round((x - cx) / U), -N, N), clamp(Math.round((cy - y) / U), -N, N)),
      (dx, dy) => set(clamp(p[0] + dx, -N, N), clamp(p[1] + dy, -N, N)));
    function set(x, y) {
      p = [x, y]; const r = pointRead(x, y);
      guide.setAttribute('d', `M ${X(x)} ${cy} V ${Y(y)} H ${cx}`);
      out.textContent = r.text; h.at(X(x), Y(y), r.text);
    }
    set(p[0], p[1]);
    return { get: () => p.slice(), set };
  }

  function fractions(host) {
    const doc = host.ownerDocument; host.textContent = '';
    const wrap = doc.createElement('div'); wrap.className = 'lws-ix';
    const head = doc.createElement('div'); head.className = 'lws-ix-title'; head.textContent = 'Fraction bars';
    wrap.appendChild(head);
    const state = [{ n: 1, d: 2 }, { n: 2, d: 4 }];
    const rows = state.map((s, i) => {
      const row = doc.createElement('div'); row.className = 'lws-ix-frac';
      const svg = el(doc, 'svg', { viewBox: '0 0 300 46', class: 'lws-ix-bar', role: 'img' });
      const out = doc.createElement('div'); out.className = 'lws-ix-readout'; out.setAttribute('aria-live', 'polite');
      const ctl = doc.createElement('div'); ctl.className = 'lws-ix-ctl';
      const btn = (text, name, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', name); b.addEventListener('click', () => { fn(); draw(); }); ctl.appendChild(b); return b; };
      const cap = (text) => { const c = doc.createElement('span'); c.textContent = text; ctl.appendChild(c); };
      const which = i ? 'second' : 'first';
      btn('−', `Fewer pieces in the ${which} bar`, () => { s.d = clamp(s.d - 1, 1, 12); s.n = Math.min(s.n, s.d); }); cap('pieces'); btn('+', `More pieces in the ${which} bar`, () => { s.d = clamp(s.d + 1, 1, 12); });
      btn('−', `Shade one fewer in the ${which} bar`, () => { s.n = clamp(s.n - 1, 0, s.d); }); cap('shaded'); btn('+', `Shade one more in the ${which} bar`, () => { s.n = clamp(s.n + 1, 0, s.d); });
      row.appendChild(svg); row.appendChild(out); row.appendChild(ctl); wrap.appendChild(row);
      return { svg, out };
    });
    const tip = doc.createElement('div'); tip.className = 'lws-ix-hint'; tip.textContent = 'Both bars are the same whole. Cut them and shade them — where do the shaded parts line up?';
    wrap.appendChild(tip); host.appendChild(wrap);
    function draw() {
      state.forEach((s, i) => {
        const { svg, out } = rows[i]; const r = fractionRead(s.n, s.d);
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        el(doc, 'rect', { x: 0, y: 0, width: 300, height: 46, fill: '#ffffff' }, svg);
        for (let k = 0; k < r.d; k++) el(doc, 'rect', { x: 6 + k * 288 / r.d, y: 5, width: 288 / r.d, height: 36, fill: k < r.n ? (i ? '#99f6e4' : '#c4b5fd') : '#ffffff', stroke: INK, 'stroke-width': 1.5 }, svg);
        svg.setAttribute('aria-label', r.words);
        out.textContent = `${r.text} — ${r.words}`;
      });
    }
    draw();
    return { get: () => state.map((s) => ({ n: s.n, d: s.d })), set: (i, n, d) => { const r = fractionRead(n, d); state[i] = { n: r.n, d: r.d }; draw(); } };
  }

  const WIDGETS = { 'unit-circle': unitCircle, angle, slope, 'coordinate-plane': coordinatePlane, fractions };
  const has = (id) => Object.prototype.hasOwnProperty.call(WIDGETS, id);
  function mount(id, host) { return has(id) && host ? WIDGETS[id](host) : null; }

  return {
    has, mount, ids: () => Object.keys(WIDGETS),
    // the math, for the tests
    radLabel, unitCircleRead, snapAngle, angleKind, slopeRead, pointRead, fractionRead, SPECIAL,
  };
});
