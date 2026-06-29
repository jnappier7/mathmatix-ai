/**
 * diagramRenderer.js — thin JSXGraph adapter for the WorkBoard `diagram` verb.
 *
 * ⚠️ BROWSER-VERIFY PENDING: the geometry/spec is unit-tested (diagramSpec.js),
 * but this render layer needs an eyes-on browser pass before the DIAGRAM_BOARD
 * flag is enabled. It is inert until then (no caller emits `diagram` yet).
 *
 * Design: all correctness lives in window.DiagramSpec.buildDiagramSpec() (pure,
 * tested). This file only draws the resulting spec. JSXGraph is lazy-loaded from
 * CDN on first use so it costs nothing until a diagram actually renders.
 * (Vendor it under /vendor before production-enabling, to match KaTeX.)
 */
(function () {
  'use strict';

  // Pin a version for reproducibility. Vendor locally before enabling the flag.
  var JSXGRAPH_JS = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraphcore.js';
  var JSXGRAPH_CSS = 'https://cdn.jsdelivr.net/npm/jsxgraph@1.10.1/distrib/jsxgraph.css';
  var loadPromise = null;

  function loadJSXGraph() {
    if (typeof window !== 'undefined' && window.JXG) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = JSXGRAPH_CSS;
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = JSXGRAPH_JS; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('JSXGraph failed to load')); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  function showFallback(container, msg) {
    container.textContent = msg || "Couldn't render that diagram.";
  }

  // --- per-type drawers (consume a validated spec) ---------------------------
  function drawInscribedAngle(board, spec) {
    var p = spec.points;
    var O = board.create('point', p.O, { name: 'O', size: 1, fixed: true, label: { offset: [-12, -12] } });
    board.create('circle', [O, spec.radius], { strokeColor: '#667eea', strokeWidth: 2, fixed: true });
    var A = board.create('point', p.A, { name: 'A', size: 2, fixed: true });
    var B = board.create('point', p.B, { name: 'B', size: 2, fixed: true });
    var C = board.create('point', p.C, { name: 'C', size: 2, fixed: true });
    // inscribed angle ∠ABC and central angle ∠AOC, same arc AC
    board.create('segment', [B, A], { strokeColor: '#888', fixed: true });
    board.create('segment', [B, C], { strokeColor: '#888', fixed: true });
    board.create('segment', [O, A], { strokeColor: '#f0a', dash: 2, fixed: true });
    board.create('segment', [O, C], { strokeColor: '#f0a', dash: 2, fixed: true });
    board.create('angle', [A, B, C], { name: spec.angles.inscribed.label, radius: 1, fillColor: '#667eea', fixed: true });
    board.create('angle', [A, O, C], { name: spec.angles.central.label, radius: 1.4, fillColor: '#f0a', fixed: true });
  }

  var DRAWERS = { inscribed_angle: drawInscribedAngle };

  /**
   * Render a diagram board command into `container`.
   * @param {HTMLElement} container
   * @param {{diagramType:string, diagramParams:object}} command
   * @param {{redact?:boolean}} [opts]
   * @returns {Promise<boolean>} whether a diagram was drawn
   */
  function renderDiagram(container, command, opts) {
    if (!container || !window.DiagramSpec) { return Promise.resolve(false); }
    var spec = window.DiagramSpec.buildDiagramSpec(command.diagramType, command.diagramParams, opts || {});
    if (!spec || !spec.valid) { showFallback(container); return Promise.resolve(false); }
    var drawer = DRAWERS[spec.type];
    if (!drawer) { showFallback(container); return Promise.resolve(false); }

    return loadJSXGraph().then(function () {
      container.innerHTML = '';
      if (!container.id) {
        // Deterministic-ish id from the spec; avoids Math.random for testability.
        container.id = 'jxg-' + spec.type + '-' + (container.dataset.cardIndex || Date.now());
      }
      var r = spec.radius * 1.4;
      var board = window.JXG.JSXGraph.initBoard(container.id, {
        boundingbox: [-r, r, r, -r],
        axis: false, grid: false, showCopyright: false, showNavigation: false,
        keepAspectRatio: true, pan: { enabled: false }, zoom: { enabled: false },
      });
      drawer(board, spec);
      return true;
    }).catch(function () {
      showFallback(container, 'Diagram engine unavailable.');
      return false;
    });
  }

  if (typeof window !== 'undefined') {
    window.DiagramRenderer = { renderDiagram: renderDiagram };
  }
})();
