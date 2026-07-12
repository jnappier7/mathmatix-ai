/**
 * sceneRenderer.js — SPIKE: draw a declarative geometry scene with JSXGraph.
 *
 * The point of the spike: the scene only DECLARES relations (D = midpoint of AB;
 * X = intersection of t and l1; l2 parallel to l1 through Q). JSXGraph's
 * constructive primitives SOLVE the coordinates. So a figure nobody hand-authored
 * is still correct-by-construction — the midsegment really is parallel, the
 * corresponding angles really are equal — because the engine computed the points,
 * the model didn't place them.
 *
 * Marks (ticks / angle arcs / right angles / parallel chevrons / labels) reference
 * POINTS, so they attach to solved positions.
 *
 * Browser-only (needs JSXGraph). See sceneSpec.js for the pure validate/order.
 */
(function () {
  'use strict';

  var JSXGRAPH_JS = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraphcore.js';
  var JSXGRAPH_CSS = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraph.css';
  var loadPromise = null;
  function loadJSXGraph() {
    if (typeof window !== 'undefined' && window.JXG) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = JSXGRAPH_CSS; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = JSXGRAPH_JS; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('JSXGraph failed to load')); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  var STROKE = '#667eea', MARK = '#e0447a', PAR = '#1a9e8f';

  function ptOpts(name) {
    return { name: name, size: 2, fixed: true, withLabel: true, label: { offset: [7, 7] }, strokeColor: '#b45309', fillColor: '#b45309' };
  }
  function lineOpts() { return { strokeColor: STROKE, strokeWidth: 2, fixed: true }; }

  function buildObject(board, o, objs) {
    switch (o.type) {
      case 'point':        return board.create('point', o.at, ptOpts(o.id));
      case 'midpoint':     return board.create('midpoint', [objs[o.of[0]], objs[o.of[1]]], ptOpts(o.id));
      case 'intersection': return board.create('intersection', [objs[o.of[0]], objs[o.of[1]], 0], ptOpts(o.id));
      case 'glider':       return board.create('glider', [o.at[0], o.at[1], objs[o.on]], ptOpts(o.id));
      case 'segment':      return board.create('segment', [objs[o.from], objs[o.to]], lineOpts());
      case 'line':         return board.create('line', [objs[o.from], objs[o.to]], lineOpts());
      case 'ray':          return board.create('line', [objs[o.from], objs[o.to]], Object.assign(lineOpts(), { straightFirst: false }));
      case 'circle':       return o.through
        ? board.create('circle', [objs[o.center], objs[o.through]], lineOpts())
        : board.create('circle', [objs[o.center], o.radius || 1], lineOpts());
      case 'polygon':      return board.create('polygon', o.points.map(function (id) { return objs[id]; }), {
        fillColor: STROKE, fillOpacity: 0.06, borders: { strokeColor: STROKE, strokeWidth: 2 },
        vertices: { visible: false }, hasInnerPoints: false, fixed: true,
      });
      case 'parallel':     return board.create('parallel', [objs[o.to], objs[o.through]], lineOpts());
      case 'perpendicular':return board.create('perpendicular', [objs[o.to], objs[o.through]], lineOpts());
      default: return null;
    }
  }

  function xy(pt) { return [pt.X(), pt.Y()]; }

  function drawTicks(board, p1, p2, count) {
    var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1;
    var ax = dx / len, ay = dy / len, px = -ay, py = ax;
    var half = 0.16, gap = 0.16;
    for (var i = 0; i < count; i++) {
      var off = (i - (count - 1) / 2) * gap;
      var cx = mx + off * ax, cy = my + off * ay;
      board.create('segment', [[cx - half * px, cy - half * py], [cx + half * px, cy + half * py]], { strokeColor: MARK, strokeWidth: 2, fixed: true });
    }
  }

  function drawAngle(board, from, at, to, arcs) {
    var V = xy(at), P = xy(from), Q = xy(to);
    var aP = Math.atan2(P[1] - V[1], P[0] - V[0]);
    var aQ = Math.atan2(Q[1] - V[1], Q[0] - V[0]);
    var sweep = ((aQ - aP) * 180 / Math.PI + 360) % 360;
    var f = from, l = to; if (sweep > 180) { f = to; l = from; }
    for (var i = 0; i < (arcs || 1); i++) {
      board.create('angle', [f, at, l], { radius: 0.32 + i * 0.13, fillColor: '#f0a', fillOpacity: 0.15, strokeColor: MARK, strokeWidth: 2, name: '', fixed: true, highlight: false });
    }
  }

  function drawParallelMark(board, p1, p2) {
    var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy) || 1;
    var ax = dx / len, ay = dy / len, px = -ay, py = ax, s = 0.2;
    var tip = [mx + s * ax, my + s * ay];
    board.create('segment', [[tip[0] - s * ax - s * px, tip[1] - s * ay - s * py], tip], { strokeColor: PAR, strokeWidth: 2, fixed: true });
    board.create('segment', [[tip[0] - s * ax + s * px, tip[1] - s * ay + s * py], tip], { strokeColor: PAR, strokeWidth: 2, fixed: true });
  }

  function applyMark(board, m, objs) {
    if (m.kind === 'tick') { drawTicks(board, xy(objs[m.on[0]]), xy(objs[m.on[1]]), m.count || 1); }
    else if (m.kind === 'angle') { drawAngle(board, objs[m.from], objs[m.at], objs[m.to], m.arcs || 1); }
    else if (m.kind === 'right') { board.create('angle', [objs[m.from], objs[m.at], objs[m.to]], { type: 'square', fillColor: '#bbb', fillOpacity: 0.4, name: '', fixed: true }); }
    else if (m.kind === 'parallel') { drawParallelMark(board, xy(objs[m.on[0]]), xy(objs[m.on[1]])); drawParallelMark(board, xy(objs[m.on[2]]), xy(objs[m.on[3]])); }
    else if (m.kind === 'label' && objs[m.on] && objs[m.on].setName) { objs[m.on].setName(m.text); }
    else if (m.kind === 'measure') {
      var pts = (m.on || []).map(function (id) { return objs[id]; }).filter(Boolean);
      if (!pts.length) return;
      var cx, cy;
      if (pts.length >= 2) { cx = (pts[0].X() + pts[1].X()) / 2; cy = (pts[0].Y() + pts[1].Y()) / 2; }
      else { cx = pts[0].X(); cy = pts[0].Y(); }
      var shown = (m.value === null || m.value === undefined) ? '?' : (m.value + (m.unit || ''));
      var txt = (m.symbol ? m.symbol + ' = ' : '') + shown;
      board.create('text', [cx + 0.15, cy + 0.3, txt], {
        fontSize: 14, fixed: true, cssStyle: 'font-weight:600', strokeColor: m.redacted ? '#c0392b' : '#333',
      });
    }
  }

  function renderScene(container, scene, opts) {
    if (!container || !window.SceneSpec) return Promise.resolve(false);
    var v = window.SceneSpec.validateScene(scene);
    if (!v.valid) { container.textContent = 'Invalid scene: ' + v.errors.join('; '); return Promise.resolve(false); }
    return loadJSXGraph().then(function () {
      container.innerHTML = '';
      if (!container.id) container.id = 'scene-' + (container.dataset.i || Date.now());
      var e = scene.extent || { xMin: -1, xMax: 11, yMin: -1, yMax: 8 };
      var board = window.JXG.JSXGraph.initBoard(container.id, {
        boundingbox: [e.xMin, e.yMax, e.xMax, e.yMin],
        axis: false, grid: false, showCopyright: false, showNavigation: false,
        keepAspectRatio: true, pan: { enabled: false }, zoom: { enabled: false },
      });
      var byId = {}; scene.objects.forEach(function (o) { byId[o.id] = o; });
      var objs = {};
      v.order.forEach(function (id) { objs[id] = buildObject(board, byId[id], objs); });
      (scene.marks || []).forEach(function (m) { try { applyMark(board, m, objs); } catch (e2) { /* skip a bad mark */ } });
      return { ok: true, objs: objs };
    }).catch(function () { container.textContent = 'Scene engine unavailable.'; return false; });
  }

  if (typeof window !== 'undefined') window.SceneRenderer = { renderScene: renderScene };
})();
