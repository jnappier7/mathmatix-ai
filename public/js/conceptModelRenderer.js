/**
 * conceptModelRenderer.js — JSXGraph adapter for WorkBoard concept models.
 *
 * ⚠️ BROWSER-VERIFY PENDING: the spec/vocabulary is pure + unit-tested
 * (conceptModelSpec.js), but this render + binding layer wants an eyes-on
 * browser pass before the CONCEPT_MODELS capability is enabled in chat. Use
 * /concept-model-demo.html for that pass. It is inert in chat until a caller
 * emits a `model` board command.
 *
 * Design: all correctness lives in window.ConceptModelSpec (pure, tested) — the
 * primitive vocabulary, the curated catalog, the safe expression compiler, and
 * the validator. This file only *draws* a validated spec and wires the keystone:
 *
 *   Two-way param binding. A named `param` is the single source of truth. The
 *   sliders, the draggable points, the function curve and the readouts all
 *   read/write the same `P` object. Drag the point -> param changes -> slider
 *   moves, line slides, equation updates. Move the slider -> point moves, line
 *   slides, equation updates. Any *measured* quantity (a derived value, the
 *   curve) is evaluated live from P by the engine, never asserted.
 *
 * JSXGraph is lazy-loaded on first use (shared with diagramRenderer via the
 * global window.JXG) so it costs nothing until a model actually renders. We load
 * the locally-vendored copy under /vendor/jsxgraph (pinned to 1.10.1), to match
 * KaTeX — no third-party CDN at render time.
 */
(function () {
  'use strict';

  var JSXGRAPH_JS = '/vendor/jsxgraph/jsxgraphcore.js';
  var JSXGRAPH_CSS = '/vendor/jsxgraph/jsxgraph.css';
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

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function round4(n) { var r = Math.round(n * 1e4) / 1e4; return r === 0 ? 0 : r; }

  // ── number formatting ────────────────────────────────────────────────────
  // Continued-fraction rational approximation, bounded denominator. Used for
  // the smart-fraction readout so a slope of 1.5 reads as the rise/run 3/2.
  function decimalToFraction(value, maxDen) {
    maxDen = maxDen || 64;
    var sign = value < 0 ? -1 : 1;
    var x = Math.abs(value);
    var h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    do {
      var a = Math.floor(b);
      var h2 = a * h1 + h0; var k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      b = 1 / (b - a);
    } while (Math.abs(x - h1 / k1) > 1e-9 && isFinite(b));
    return { num: sign * h1, den: k1 };
  }

  function toFractionTex(value) {
    if (!isFinite(value)) return '\\text{undefined}';
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    var f = decimalToFraction(value);
    if (f.den === 1) return String(f.num);
    var sign = f.num < 0 ? '-' : '';
    return sign + '\\frac{' + Math.abs(f.num) + '}{' + f.den + '}';
  }

  function toPlainNumber(value) {
    if (!isFinite(value)) return '—';
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return String(Math.round(value * 100) / 100);
  }

  function renderTex(target, tex) {
    if (!target) return;
    if (window.katex && typeof window.katex.render === 'function') {
      try { window.katex.render(tex, target, { throwOnError: false, displayMode: false, output: 'html' }); return; }
      catch (_) { /* fall through */ }
    }
    target.textContent = tex;
  }

  // ── core render ───────────────────────────────────────────────────────────
  /**
   * Render a concept model into `container`.
   * @param {HTMLElement} container
   * @param {string|object} modelOrSpec  curated model name OR a full spec object
   * @param {{prompt?:string}} [opts]
   * @returns {Promise<boolean>} whether a model was drawn
   */
  function renderModel(container, modelOrSpec, opts) {
    opts = opts || {};
    if (!container || !window.ConceptModelSpec) return Promise.resolve(false);

    var spec = typeof modelOrSpec === 'string'
      ? window.ConceptModelSpec.getModel(modelOrSpec)
      : modelOrSpec;
    if (!spec) { container.textContent = 'Unknown concept model.'; return Promise.resolve(false); }

    var check = window.ConceptModelSpec.validateModelSpec(spec);
    if (!check.valid) {
      container.textContent = "Couldn't build that model.";
      if (window.console) console.warn('[ConceptModel] invalid spec', spec.model, check.errors);
      return Promise.resolve(false);
    }

    return loadJSXGraph().then(function () {
      try {
        build(container, spec, opts);
        return true;
      } catch (e) {
        if (window.console) console.error('[ConceptModel] render failed', e);
        container.textContent = 'Concept-model engine error.';
        return false;
      }
    }).catch(function () {
      container.textContent = 'Concept-model engine unavailable.';
      return false;
    });
  }

  function build(container, spec, opts) {
    var CMS = window.ConceptModelSpec;
    container.innerHTML = '';

    // Live state: P is the single source of truth.
    var P = {};
    Object.keys(spec.params).forEach(function (k) { P[k] = spec.params[k]; });

    // Compile the function curves and the derived (measured) quantities.
    var compiledFns = {};   // elementId -> {eval}
    spec.elements.forEach(function (e) {
      if (e.type === 'function') compiledFns[e.id] = CMS.compileExpr(e.fn);
    });
    var compiledDerived = {}; // name -> {eval}
    if (spec.derived) Object.keys(spec.derived).forEach(function (n) {
      compiledDerived[n] = CMS.compileExpr(spec.derived[n]);
    });
    // Parent library (named pure functions of x) for the universal-parent model.
    var compiledParents = {}; // parentKey -> {eval}
    if (spec.parents) Object.keys(spec.parents).forEach(function (key) {
      compiledParents[key] = CMS.compileExpr(spec.parents[key].fn);
    });

    function scope() {
      var s = {};
      Object.keys(P).forEach(function (k) { s[k] = P[k]; });
      // derived read numeric params (and earlier derived) — evaluate in order.
      Object.keys(compiledDerived).forEach(function (n) { s[n] = compiledDerived[n].eval(s); });
      return s;
    }

    // Per-param step (for snapping a draggable point to its slider's grid, so
    // the dot, slider and equation never disagree — "b snaps to ticks").
    var paramStep = {};
    var paramRange = {};
    (spec.controls || []).forEach(function (c) {
      if (c.type === 'slider') {
        if (typeof c.step === 'number') paramStep[c.param] = c.step;
        if (Array.isArray(c.range)) paramRange[c.param] = c.range;
      }
    });
    function snapParam(name, v) {
      var step = paramStep[name];
      var r = paramRange[name];
      if (step) v = Math.round(v / step) * step;
      if (r) v = Math.min(r[1], Math.max(r[0], v));
      return round4(v);
    }

    // ── DOM scaffold: prompt frame · readout row · board · controls row ──────
    var root = el('div', 'cr-cm');

    var promptText = opts.prompt || spec.prompt;
    if (promptText) {
      var frame = el('div', 'cr-cm-prompt');
      frame.textContent = promptText;
      root.appendChild(frame);
    }

    var readoutRow = el('div', 'cr-cm-readouts');
    root.appendChild(readoutRow);

    var boardHost = el('div', 'cr-cm-board');
    boardHost.id = 'cr-cm-' + spec.model + '-' + Date.now();
    root.appendChild(boardHost);

    var controlsRow = el('div', 'cr-cm-controls');
    root.appendChild(controlsRow);

    container.appendChild(root);

    // ── board ────────────────────────────────────────────────────────────────
    var plane = spec.elements.filter(function (e) { return e.type === 'plane'; })[0];
    var bx = (plane && plane.x) || [-10, 10];
    var by = (plane && plane.y) || [-10, 10];
    var board = window.JXG.JSXGraph.initBoard(boardHost.id, {
      boundingbox: [bx[0], by[1], bx[1], by[0]],
      axis: true,
      grid: !!(plane && plane.grid),
      keepAspectRatio: true,
      showCopyright: false,
      showNavigation: false,
      pan: { enabled: false },
      zoom: { enabled: false }
    });

    var jpoints = {};    // elementId -> JSXGraph point
    var bindMap = {};    // elementId -> { xParam, yParam }
    var readouts = [];   // { el, element }

    function resolveCoord(coord) {
      return typeof coord === 'string' ? P[coord] : coord;
    }
    // Map a point's `binds` onto x/y by matching against its `at` slots.
    function computeBindMap(elDef) {
      var map = { xParam: null, yParam: null };
      if (elDef.binds == null) return map;
      var binds = Array.isArray(elDef.binds) ? elDef.binds : [elDef.binds];
      binds.forEach(function (p) {
        if (elDef.at[0] === p) map.xParam = p;
        else if (elDef.at[1] === p) map.yParam = p;
        else if (!map.yParam) map.yParam = p; // single free-coordinate fallback
      });
      return map;
    }

    // First pass: points (lines reference them by id).
    spec.elements.forEach(function (e) {
      if (e.type !== 'point') return;
      var x0 = resolveCoord(e.at[0]);
      var y0 = resolveCoord(e.at[1]);
      var attrs = {
        name: e.label || '', size: 3, fixed: !e.draggable,
        strokeColor: '#5B3DF6', fillColor: '#8B7BFF',
        withLabel: !!e.label, label: { offset: [8, 8] }
      };
      var pt;
      if (e.on === 'yAxis') pt = board.create('glider', [0, y0, board.defaultAxes.y], attrs);
      else if (e.on === 'xAxis') pt = board.create('glider', [x0, 0, board.defaultAxes.x], attrs);
      else pt = board.create('point', [x0, y0], attrs);
      jpoints[e.id] = pt;
      bindMap[e.id] = computeBindMap(e);

      if (e.draggable) {
        pt.on('drag', function () {
          var m = bindMap[e.id];
          if (m.xParam) P[m.xParam] = snapParam(m.xParam, pt.X());
          if (m.yParam) P[m.yParam] = snapParam(m.yParam, pt.Y());
          pushParamsToControls();
          pushParamsToPoints();   // land on the snapped grid value
          redraw();
        });
      }
    });

    // Second pass: functions, lines, readouts.
    spec.elements.forEach(function (e) {
      if (e.type === 'function') {
        var c = compiledFns[e.id];
        // `compose` evaluates the SELECTED parent at a shifted argument and
        // exposes it to the outer fn as a placeholder var (a*P + k where P is the
        // parent of (x-h)). Generic — no per-parent code.
        var composers = [];
        if (e.compose) Object.keys(e.compose).forEach(function (ph) {
          composers.push({ ph: ph, sel: e.compose[ph].parent, argFn: CMS.compileExpr(e.compose[ph].arg) });
        });
        var evalCurve = function (x) {
          var s = scope(); s.x = x;
          for (var ci = 0; ci < composers.length; ci++) {
            var cm = composers[ci];
            var pf = compiledParents[P[cm.sel]];
            s[cm.ph] = pf ? pf.eval({ x: cm.argFn.eval(s) }) : NaN;
          }
          return c.eval(s);
        };
        var isRef = e.role === 'reference';
        board.create('functiongraph', [evalCurve], {
          strokeColor: isRef ? '#b9b2e6' : '#5B3DF6',
          strokeWidth: isRef ? 2 : 3,
          dash: isRef ? 2 : 0,
          fixed: true, highlight: false
        });
      } else if (e.type === 'line' || e.type === 'segment' || e.type === 'ray') {
        var a = jpoints[e.through[0]], b2 = jpoints[e.through[1]];
        if (a && b2) {
          var straight = e.type === 'segment'
            ? { straightFirst: false, straightLast: false }
            : e.type === 'ray' ? { straightFirst: false, straightLast: true } : {};
          board.create('line', [a, b2], Object.assign({
            strokeColor: '#5B3DF6', strokeWidth: 3, fixed: true, highlight: false
          }, straight));
        }
      } else if (e.type === 'readout') {
        var host = el('div', 'cr-cm-readout');
        var math = el('span', 'cr-cm-readout-math');
        host.appendChild(math);
        readoutRow.appendChild(host);
        readouts.push({ el: math, element: e });
      }
    });

    // ── controls (sliders for numeric params, choice for selectors) ──────────
    var sliderInputs = {};  // param -> { input, valueEl }
    var choiceGroups = {};  // param -> [ { key, btn } ]
    (spec.controls || []).forEach(function (c) {
      if (c.type === 'slider') {
        var wrap = el('div', 'cr-cm-slider');
        var label = el('label', 'cr-cm-slider-label');
        label.textContent = c.label || c.param;
        var valueEl = el('span', 'cr-cm-slider-value');
        label.appendChild(valueEl);

        var input = document.createElement('input');
        input.type = 'range';
        input.className = 'cr-cm-slider-input';
        input.min = c.range[0]; input.max = c.range[1];
        input.step = c.step || 'any';
        input.value = P[c.param];
        input.setAttribute('aria-label', (c.label || c.param) + ' control');

        input.addEventListener('input', function () {
          P[c.param] = round4(parseFloat(input.value));
          pushParamsToPoints();
          pushParamsToControls();
          redraw();
        });

        wrap.appendChild(label);
        wrap.appendChild(input);
        controlsRow.appendChild(wrap);
        sliderInputs[c.param] = { input: input, valueEl: valueEl };
      } else if (c.type === 'choice') {
        // Segmented selector: pick the parent f. Options come from the spec or
        // default to the parents-library keys; the button label is the parent's
        // display label.
        var crow = el('div', 'cr-cm-choice');
        var clabel = el('span', 'cr-cm-slider-label');
        clabel.textContent = c.label || c.param;
        crow.appendChild(clabel);
        var group = el('div', 'cr-cm-choice-group');
        var options = Array.isArray(c.options) ? c.options : Object.keys(spec.parents || {});
        choiceGroups[c.param] = [];
        options.forEach(function (key) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cr-cm-choice-btn';
          btn.textContent = (spec.parents && spec.parents[key] && spec.parents[key].label) || key;
          btn.addEventListener('click', function () {
            P[c.param] = key;
            pushParamsToControls();
            redraw();
          });
          group.appendChild(btn);
          choiceGroups[c.param].push({ key: key, btn: btn });
        });
        crow.appendChild(group);
        controlsRow.appendChild(crow);
      }
    });

    // ── sync helpers (the binding glue) ──────────────────────────────────────
    function pushParamsToControls() {
      Object.keys(sliderInputs).forEach(function (param) {
        var si = sliderInputs[param];
        si.input.value = P[param];
        si.valueEl.textContent = ' = ' + toPlainNumber(P[param]);
      });
      Object.keys(choiceGroups).forEach(function (param) {
        choiceGroups[param].forEach(function (opt) {
          var on = opt.key === P[param];
          opt.btn.classList.toggle('is-active', on);
          opt.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
    }
    function pushParamsToPoints() {
      spec.elements.forEach(function (e) {
        if (e.type !== 'point' || !e.draggable) return;
        var pt = jpoints[e.id]; if (!pt) return;
        var x = resolveCoord(e.at[0]);
        var y = resolveCoord(e.at[1]);
        pt.setPosition(window.JXG.COORDS_BY_USER, [x, y]);
      });
    }
    function renderReadouts() {
      var s = scope();
      readouts.forEach(function (r) {
        var fmt = r.element.format;
        var tex = String(r.element.text || '').replace(/\{([a-zA-Z_][a-zA-Z_0-9.]*)\}/g, function (_, key) {
          var parts = key.split('.');
          // {selector.field} → look the field up on the chosen parent (e.g.
          // {parent.label} → the selected parent's display label).
          if (parts.length > 1) {
            var entry = spec.parents && spec.parents[P[parts[0]]];
            var field = entry && entry[parts[1]];
            return field == null ? '?' : String(field);
          }
          var val = s[parts[0]];
          if (typeof val !== 'number') return typeof val === 'string' ? val : '?';
          return fmt === 'smartFraction' ? toFractionTex(val) : toPlainNumber(val);
        });
        // Collapse "+ -" / "+ \frac{-…" into a clean minus so "y = 2x + -3"
        // reads "y = 2x - 3".
        tex = tex.replace(/\+\s*-/g, '- ');
        renderTex(r.el, tex);
      });
    }
    function redraw() {
      board.update();
      renderReadouts();
    }

    // initial paint
    pushParamsToControls();
    renderReadouts();
    board.update();
  }

  if (typeof window !== 'undefined') {
    window.ConceptModelRenderer = { renderModel: renderModel };
  }
})();
