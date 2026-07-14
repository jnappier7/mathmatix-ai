/* ============================================================
   graphElement.js — the graph element (P14).

   Renders y = f(x) as an SVG curve with axes on the workspace, plus a
   draggable TRACER that slides along the curve and reads off (x, f(x)).
   The tracer is the interactive handle that made the visual-gate vertex/
   y-intercept extension a prerequisite (a student could otherwise drag to
   the vertex / axis crossing and read the answer) — that guard now covers
   those leaks server-side; this element renders the (already gate-approved)
   graph and lets the student explore it.

   Uses window.MathEval (mathGraph.js, already on the chat page) to evaluate
   f(x). Degrades gracefully to the raw fn text if MathEval is absent.

   semantic: { fn:'x^2 - 4', xMin:-6, xMax:6, tracer?: <x value> }

   Pure geometry (sampleCurve / fitYWindow / mapping) is exported for
   headless tests. UMD-lite: require() in jest, window.LWS.GraphElement.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).GraphElement = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const W = 300, H = 220, PAD = 10;

  function clampNum(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // Sample f over [xMin,xMax]; returns [{x, y|null}] (null = undefined/±inf).
  function sampleCurve(evaluator, xMin, xMax, n) {
    const pts = [];
    const steps = n || 240;
    for (let i = 0; i <= steps; i++) {
      const x = xMin + (i / steps) * (xMax - xMin);
      let y = null;
      try { const v = evaluator(x); if (Number.isFinite(v) && Math.abs(v) < 1e6) y = v; } catch (_) { /* undefined here */ }
      pts.push({ x, y });
    }
    return pts;
  }

  // Frame the y-window to the curve's FEATURES (turning points + intercepts),
  // not the exploding tails — same heuristic as mathGraph P1-3, so a parabola
  // doesn't crush its vertex into a sliver.
  function fitYWindow(pts) {
    const ys = pts.filter((p) => p.y !== null);
    if (!ys.length) return { yMin: -10, yMax: 10 };
    let min = Infinity, max = -Infinity;
    const extrema = [];
    let prevY = null, prevSlope = null, sawCross = false, yAt0 = null;
    for (const p of pts) {
      if (p.y === null) { prevY = null; prevSlope = null; continue; }
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
      if (Math.abs(p.x) < 1e-9) yAt0 = p.y;
      if (prevY !== null) {
        const slope = p.y - prevY;
        if (prevSlope !== null && prevSlope !== 0 && slope !== 0 && Math.sign(slope) !== Math.sign(prevSlope)) extrema.push(prevY);
        if ((prevY < 0) !== (p.y < 0)) sawCross = true;
        prevSlope = slope;
      }
      prevY = p.y;
    }
    if (extrema.length) {
      const anchors = extrema.slice();
      if (yAt0 !== null) anchors.push(yAt0);
      if (sawCross) anchors.push(0);
      let fMin = Math.min.apply(null, anchors), fMax = Math.max.apply(null, anchors);
      if (fMax === fMin) { fMax += 1; fMin -= 1; }
      const pad = Math.max((fMax - fMin) * 0.75, 2);
      return { yMin: fMin - pad, yMax: fMax + pad };
    }
    const pad = Math.max((max - min) * 0.15, 1);
    return { yMin: min - pad, yMax: max + pad };
  }

  function xToPx(x, xMin, xMax) { return PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD); }
  function yToPx(y, yMin, yMax) { return H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD); }
  function pxToX(px, xMin, xMax) { return xMin + ((px - PAD) / (W - 2 * PAD)) * (xMax - xMin); }

  function makeRenderer(hooks) {
    const onChange = (hooks && typeof hooks.onChange === 'function') ? hooks.onChange : function () {};
    const doc = typeof document !== 'undefined' ? document : null;

    return function graphFactory(element) {
      const card = doc.createElement('div');
      card.className = 'lws-graph-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-graph-header';
      header.dataset.role = 'reposition-handle';
      header.textContent = 'Graph';

      const body = doc.createElement('div');
      body.className = 'lws-graph-body';
      body.dataset.role = 'content';

      const readout = doc.createElement('div');
      readout.className = 'lws-graph-readout';

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(readout);

      let current = Object.assign({}, element);

      function sem() {
        const s = current.semantic || {};
        return {
          fn: typeof s.fn === 'string' ? s.fn : '',
          xMin: typeof s.xMin === 'number' ? s.xMin : -6,
          xMax: typeof s.xMax === 'number' ? s.xMax : 6,
          tracer: typeof s.tracer === 'number' ? s.tracer : null,
        };
      }

      function render() {
        body.textContent = '';
        readout.textContent = '';
        const { fn, xMin, xMax } = sem();
        const ME = (typeof window !== 'undefined') ? window.MathEval : null;
        let evaluator = null;
        if (ME && fn) { try { evaluator = ME.parse(fn); } catch (_) { evaluator = null; } }
        if (!evaluator) { body.textContent = fn ? ('y = ' + fn) : '(no function)'; return; }

        const pts = sampleCurve(evaluator, xMin, xMax);
        const { yMin, yMax } = fitYWindow(pts);

        const svg = doc.createElementNS(SVGNS, 'svg');
        svg.setAttribute('class', 'lws-graph-svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));

        // axes
        if (yMin <= 0 && yMax >= 0) axisLine(svg, PAD, yToPx(0, yMin, yMax), W - PAD, yToPx(0, yMin, yMax));
        if (xMin <= 0 && xMax >= 0) axisLine(svg, xToPx(0, xMin, xMax), PAD, xToPx(0, xMin, xMax), H - PAD);

        // curve (break the path at undefined samples so asymptotes don't join)
        let d = '', pen = false;
        for (const p of pts) {
          if (p.y === null) { pen = false; continue; }
          const px = xToPx(p.x, xMin, xMax), py = yToPx(clampNum(p.y, yMin, yMax), yMin, yMax);
          d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
          pen = true;
        }
        const path = doc.createElementNS(SVGNS, 'path');
        path.setAttribute('d', d.trim()); path.setAttribute('class', 'lws-graph-curve');
        path.setAttribute('fill', 'none'); path.style.stroke = '#12b3b3'; path.style.strokeWidth = '2.5';
        svg.appendChild(path);

        // tracer handle
        const tx = sem().tracer !== null ? sem().tracer : (xMin + xMax) / 2;
        const marker = doc.createElementNS(SVGNS, 'circle');
        marker.setAttribute('r', '7'); marker.setAttribute('class', 'lws-graph-tracer');
        marker.setAttribute('tabindex', '0'); marker.setAttribute('role', 'slider');
        marker.style.fill = '#ff3b7f'; marker.style.stroke = '#fff'; marker.style.strokeWidth = '2'; marker.style.cursor = 'grab';
        svg.appendChild(marker);   // append BEFORE wiring so ownerSVGElement resolves
        positionTracer(marker, tx, evaluator, xMin, xMax, yMin, yMax);
        wireTracer(marker, evaluator, xMin, xMax, yMin, yMax);

        body.appendChild(svg);
      }

      function positionTracer(marker, x, evaluator, xMin, xMax, yMin, yMax) {
        const xc = clampNum(x, xMin, xMax);
        let y = null; try { const v = evaluator(xc); if (Number.isFinite(v)) y = v; } catch (_) {}
        marker.setAttribute('cx', String(xToPx(xc, xMin, xMax)));
        marker.setAttribute('cy', String(y === null ? H / 2 : yToPx(clampNum(y, yMin, yMax), yMin, yMax)));
        marker.setAttribute('aria-valuenow', String(Number(xc.toFixed(3))));
        marker.dataset.x = String(xc);
        readout.textContent = y === null ? ('x = ' + fmt(xc)) : ('(' + fmt(xc) + ', ' + fmt(y) + ')');
      }

      function wireTracer(marker, evaluator, xMin, xMax, yMin, yMax) {
        const svg = marker.ownerSVGElement || marker.parentNode;
        let dragging = false;
        marker.addEventListener('pointerdown', function (e) {
          e.stopPropagation(); marker.setPointerCapture && marker.setPointerCapture(e.pointerId);
          dragging = true; marker.style.cursor = 'grabbing';
        });
        marker.addEventListener('pointermove', function (e) {
          if (!dragging) return;
          const rect = (svg.getBoundingClientRect ? svg.getBoundingClientRect() : { left: 0, width: W });
          const localPx = (e.clientX - rect.left) * (W / (rect.width || W));
          const x = clampNum(pxToX(localPx, xMin, xMax), xMin, xMax);
          positionTracer(marker, x, evaluator, xMin, xMax, yMin, yMax);
        });
        marker.addEventListener('pointerup', function () {
          if (!dragging) return; dragging = false; marker.style.cursor = 'grab';
          commit(marker, evaluator);
        });
        marker.addEventListener('keydown', function (e) {
          const step = (xMax - xMin) / 40;
          if (e.key === 'ArrowLeft') { e.preventDefault(); positionTracer(marker, parseFloat(marker.dataset.x) - step, evaluator, xMin, xMax, yMin, yMax); commit(marker, evaluator); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); positionTracer(marker, parseFloat(marker.dataset.x) + step, evaluator, xMin, xMax, yMin, yMax); commit(marker, evaluator); }
        });
      }

      function commit(marker, evaluator) {
        const x = parseFloat(marker.dataset.x);
        let y = null; try { const v = evaluator(x); if (Number.isFinite(v)) y = v; } catch (_) {}
        onChange(x, y, current);
      }

      render();

      return {
        node: card,
        update: function (el) { current = Object.assign({}, el); render(); },
        destroy: function () {},
      };
    };

    function axisLine(svg, x1, y1, x2, y2) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', String(x1)); l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2)); l.setAttribute('y2', String(y2));
      l.setAttribute('class', 'lws-graph-axis');
      l.style.stroke = 'rgba(120,130,145,0.5)'; l.style.strokeWidth = '1';
      svg.appendChild(l);
    }
  }

  function fmt(n) { return Number(n).toFixed(Math.abs(n) < 10 ? 2 : 1).replace(/\.00$/, ''); }

  return { makeRenderer, sampleCurve, fitYWindow, xToPx, yToPx, pxToX };
});
