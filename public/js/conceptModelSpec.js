/**
 * conceptModelSpec.js — PURE vocabulary + validator for WorkBoard concept models.
 *
 * A "concept model" is a *manipulable* model of a math idea: the student drags
 * something and the relationship holds, correct by construction (see
 * CONCEPT_MODELS.md). This module is the correct-by-construction core — it holds
 * the declarative primitive vocabulary, the curated model catalog, a safe
 * param-scoped expression compiler, and a structural validator. It has NO DOM /
 * JSXGraph dependency; the render layer (public/js/conceptModelRenderer.js) is a
 * thin adapter that draws a validated spec and wires the live param binding.
 *
 * Keeping the math + structure here means it is unit-testable in Node and
 * identical in the browser, and that an LLM-authored spec (the long-tail path)
 * can be validated before it ever reaches a renderer: a spec that references a
 * param/element/identifier that doesn't resolve is rejected, so a generated spec
 * "can pick a weird layout but cannot display wrong math."
 *
 * The keystone property: any *measured* quantity (a derived value, the function
 * curve) is computed live by the engine from the params, never asserted by the
 * spec or the LLM. The spec says "plot m*x + b" / "slope = (y2-y1)/(x2-x1)"; the
 * engine evaluates it.
 *
 * Dual-export (UMD-lite): `require()` in Node for tests, `window.ConceptModelSpec`
 * in the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ConceptModelSpec = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── Safe param-scoped expression compiler ──────────────────────────────
  // Adapted from the recursive-descent evaluator in public/js/mathGraph.js, but
  // scope-based: every identifier that is not a known function/constant resolves
  // from a `scope` object at eval time (e.g. { x: 3, m: 2, b: -1 }). No eval(),
  // no new Function(). compile() returns { eval(scope) -> number, vars: [names] }
  // where `vars` is the set of free identifiers the expression reads (minus the
  // graphing variable `x` and known functions/constants) — that list is what the
  // validator checks against the declared params/derived names.

  var KNOWN_CONSTS = { pi: Math.PI, e: Math.E };
  var FN_MAP = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
    log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
    exp: Math.exp, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    sec: function (v) { return 1 / Math.cos(v); },
    csc: function (v) { return 1 / Math.sin(v); },
    cot: function (v) { return 1 / Math.tan(v); }
  };

  // Binary-op combiners. These take (l, r) as PARAMETERS so each call gets a
  // fresh closure — critical inside the parser's left-associative while-loops,
  // where a shared `var l = left` binding would make a 3+ term expression's
  // closures reference themselves and recurse infinitely.
  function fAdd(l, r) { return function (s) { return l(s) + r(s); }; }
  function fSub(l, r) { return function (s) { return l(s) - r(s); }; }
  function fMul(l, r) { return function (s) { return l(s) * r(s); }; }
  function fDiv(l, r) { return function (s) { var d = r(s); return d === 0 ? NaN : l(s) / d; }; }

  function tokenize(expr) {
    var tokens = [];
    var i = 0;
    while (i < expr.length) {
      var ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[\d.]/.test(ch)) {
        var num = '';
        while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
        tokens.push({ type: 'num', value: parseFloat(num) });
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        var id = '';
        while (i < expr.length && /[a-zA-Z_\d]/.test(expr[i])) id += expr[i++];
        tokens.push({ type: 'id', value: id });
        continue;
      }
      if (ch === '*' && expr[i + 1] === '*') { tokens.push({ type: 'op', value: '**' }); i += 2; continue; }
      if ('+-*/^(),|'.indexOf(ch) !== -1) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      throw new Error('Unexpected character: ' + ch);
    }
    return tokens;
  }

  /**
   * Compile an expression string into a scope-evaluated function.
   * @param {string} src e.g. "m*x + b" or "(y2 - y1)/(x2 - x1)"
   * @returns {{ eval: (scope:object)=>number, vars: string[], src: string }}
   * @throws on a syntax error / unknown function.
   */
  function compileExpr(src) {
    if (typeof src !== 'string' || !src.trim()) throw new Error('empty expression');
    var normalised = src.replace(/\s+/g, '')
      .replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/π/g, 'pi');

    var tokens = tokenize(normalised);
    var pos = 0;
    var vars = Object.create(null); // free identifier set (excl. x / known)
    var peek = function () { return tokens[pos] || null; };
    var consume = function (expected) {
      var t = tokens[pos];
      if (expected && (!t || t.value !== expected)) {
        throw new Error("Expected '" + expected + "' got '" + (t ? t.value : 'EOF') + "'");
      }
      pos++; return t;
    };

    function parseExpr() {
      var left = parseTerm();
      while (peek() && (peek().value === '+' || peek().value === '-')) {
        var op = consume().value; var right = parseTerm();
        left = op === '+' ? fAdd(left, right) : fSub(left, right);
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      while (peek() && (peek().value === '*' || peek().value === '/')) {
        var op = consume().value; var right = parseUnary();
        left = op === '*' ? fMul(left, right) : fDiv(left, right);
      }
      return left;
    }
    function parseUnary() {
      if (peek() && peek().value === '-') { consume(); var inner = parseUnary(); return function (s) { return -inner(s); }; }
      if (peek() && peek().value === '+') { consume(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      var base = parseImplicitMult();
      if (peek() && (peek().value === '^' || peek().value === '**')) {
        consume(); var exp = parseUnary(); var b = base;
        return function (s) { return Math.pow(b(s), exp(s)); };
      }
      return base;
    }
    function parseImplicitMult() {
      var left = parseAtom();
      while (peek()) {
        var t = peek();
        if (t.type === 'num' || t.type === 'id' || t.value === '(' || t.value === '|') {
          left = fMul(left, parseAtom());
        } else break;
      }
      return left;
    }
    function parseAtom() {
      var t = peek();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.value === '(') { consume('('); var inner = parseExpr(); consume(')'); return inner; }
      if (t.value === '|') { consume('|'); var ab = parseExpr(); consume('|'); return function (s) { return Math.abs(ab(s)); }; }
      if (t.type === 'num') { consume(); var val = t.value; return function () { return val; }; }
      if (t.type === 'id') {
        consume();
        // Functions/constants match case-insensitively (SIN == sin, PI == pi),
        // but VARIABLE names preserve case — so a param/placeholder named `P` is
        // distinct from `p`, and `s[name]` lookups in the renderer line up
        // exactly with the declared param keys.
        var raw = t.value;
        var lower = raw.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(KNOWN_CONSTS, lower) && !(peek() && peek().value === '(')) {
          var cval = KNOWN_CONSTS[lower]; return function () { return cval; };
        }
        if (Object.prototype.hasOwnProperty.call(FN_MAP, lower)) {
          var fn = FN_MAP[lower];
          if (peek() && peek().value === '(') {
            consume('('); var args = [parseExpr()];
            while (peek() && peek().value === ',') { consume(','); args.push(parseExpr()); }
            consume(')');
            return function (s) { return fn.apply(null, args.map(function (a) { return a(s); })); };
          }
          return function (s) { return fn(s.x); };
        }
        // Otherwise it's a scope variable (the graphing var x, or a param/derived).
        if (lower !== 'x') vars[raw] = true;
        return function (s) {
          var v = s ? s[raw] : undefined;
          return typeof v === 'number' ? v : NaN;
        };
      }
      throw new Error('Unexpected token: ' + t.value);
    }

    var rootFn = parseExpr();
    if (pos < tokens.length) throw new Error("Unexpected trailing token: '" + tokens[pos].value + "'");
    return { eval: rootFn, vars: Object.keys(vars), src: src };
  }

  // ─── Curated catalog (Tier-1 — forges the core vocabulary) ──────────────
  // These are the hand-built, pedagogically tuned models. The long-tail path
  // (LLM authors a spec in the same vocabulary -> validateModelSpec -> render)
  // reuses the exact same shape; nothing here is special-cased in the renderer.

  var CURATED = {
    // PhET "Graphing Lines" class. The flagship that forges plane / slider /
    // function / point / readout + the two-way param binding.
    slope_intercept_line: {
      model: 'slope_intercept_line',
      title: 'y = mx + b',
      params: { m: 1, b: 0 },
      controls: [
        { type: 'slider', param: 'm', label: 'm', range: [-5, 5], step: 0.25, ticks: false },
        { type: 'slider', param: 'b', label: 'b', range: [-5, 5], step: 0.5, ticks: true }
      ],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10], grid: true, axisLabels: true },
        { id: 'line', type: 'function', fn: 'm*x + b' },
        { id: 'bDot', type: 'point', at: [0, 'b'], on: 'yAxis', draggable: true, binds: 'b' },
        { id: 'eq', type: 'readout', text: 'y = {m}x + {b}', format: 'smartFraction', at: 'top' }
      ],
      reveal: ['plane', 'line', 'bDot', 'eq'],
      drag: ['bDot'],
      prompt: 'Slide m up — what happens? Then try both, and grab the dot where it crosses.'
    },

    // Sibling: slope as rise/run *derived from two draggable points* (the
    // geometric origin of slope) vs the slider's algebraic "m is a knob". The
    // slope readout is measured live, never asserted — `derived` proves the
    // measuring-engine property with a second primitive shape.
    two_point_line: {
      model: 'two_point_line',
      title: 'A line through two points',
      params: { x1: -3, y1: -2, x2: 3, y2: 4 },
      derived: { slope: '(y2 - y1) / (x2 - x1)' },
      controls: [],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10], grid: true, axisLabels: true },
        { id: 'p1', type: 'point', at: ['x1', 'y1'], draggable: true, binds: ['x1', 'y1'], label: 'A' },
        { id: 'p2', type: 'point', at: ['x2', 'y2'], draggable: true, binds: ['x2', 'y2'], label: 'B' },
        { id: 'line', type: 'line', through: ['p1', 'p2'] },
        { id: 'slopeOut', type: 'readout', text: 'slope = {slope}', format: 'smartFraction', at: 'top' }
      ],
      reveal: ['plane', 'line', 'p1', 'p2', 'slopeOut'],
      drag: ['p1', 'p2'],
      prompt: 'Drag A and B. Watch the slope — it is rise over run between the two points.'
    },

    // The universal-parent model — highest leverage in the catalog. `a·f(x−h)+k`
    // is parent-agnostic: `a` stretches/flips, `h` shifts left/right, `k` shifts
    // up/down, for ANY parent f. Swap the parent (x², |x|, x³, √x) and the SAME
    // rules hold — which is exactly the concept. One model = the whole
    // transformations unit (subsumes the standalone quadratic). The faint parent
    // is ALWAYS shown so the transform reads as a change from the original.
    //
    // New vocabulary it forges (no new primitives, just attributes):
    //   • a string-valued "selector" param + a `choice` control to pick it
    //   • a `parents` library (named fn + anchor + label + optional domain)
    //   • `compose` on a function: evaluate the SELECTED parent at a shifted
    //     argument, exposed to the outer fn as a placeholder (so a*P + k means
    //     "a times the parent of (x-h), plus k") — generic, no per-parent code
    //   • `role:"reference"` + `always:true` (the faint, fixed comparison curve)
    //   • a point that binds a PAIR of params (the draggable key point ↔ h,k)
    //   • `{selector.field}` readout tokens (resolve to the parent's label, …)
    function_transformations: {
      model: 'function_transformations',
      title: 'a · f(x − h) + k',
      params: { parent: 'quadratic', a: 1, h: 0, k: 0 },
      parents: {
        quadratic:   { fn: 'x^2',     anchor: 'vertex',     label: 'x²' },
        absolute:    { fn: 'abs(x)',  anchor: 'vertex',     label: '|x|' },
        cubic:       { fn: 'x^3',     anchor: 'inflection', label: 'x³' },
        square_root: { fn: 'sqrt(x)', anchor: 'endpoint',   label: '√x', domain: [0, null] }
      },
      controls: [
        { type: 'choice', param: 'parent', label: 'parent' },
        { type: 'slider', param: 'a', label: 'a', range: [-3, 3], step: 0.25, ticks: false },
        { type: 'slider', param: 'h', label: 'h', range: [-6, 6], step: 0.5, ticks: true },
        { type: 'slider', param: 'k', label: 'k', range: [-6, 6], step: 0.5, ticks: true }
      ],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10], grid: true, axisLabels: true },
        // The faint parent f(x), always shown; switches with the selection.
        { id: 'parentCurve', type: 'function', fn: 'P', compose: { P: { parent: 'parent', arg: 'x' } }, role: 'reference', always: true },
        // The transform a·f(x−h)+k of the SELECTED parent.
        { id: 'curve', type: 'function', fn: 'a*P + k', compose: { P: { parent: 'parent', arg: 'x - h' } } },
        // The parent's key point (vertex / inflection / endpoint) lives at (h,k).
        { id: 'anchor', type: 'point', at: ['h', 'k'], draggable: true, binds: ['h', 'k'] },
        { id: 'eq', type: 'readout', text: 'f = {parent.label}   ·   a = {a},  h = {h},  k = {k}', at: 'top' }
      ],
      reveal: ['plane', 'parentCurve', 'curve', 'anchor', 'eq'],
      drag: ['anchor'],
      prompt: 'Drag the key point and slide a/h/k. Now switch the parent — do the SAME rules still work?'
    },

    // First geometry model — folds in the diagramSpec.js inscribed-angle work as
    // a LIVE interactive (Tier 2). A and C are fixed on the circle and define the
    // arc; B is a draggable glider on the major arc. The inscribed angle ∠ABC and
    // the central angle ∠AOC are MEASURED live by the engine from the point
    // positions (never asserted). Two theorems fall out, correct by construction:
    // the inscribed angle is invariant as B moves, and it is always half the
    // central angle on the same arc.
    inscribed_angle: {
      model: 'inscribed_angle',
      title: 'Inscribed Angle Theorem',
      params: {},
      controls: [],
      measures: {
        inscribed: { type: 'angle', at: 'B', rays: ['A', 'C'] },
        central:   { type: 'angle', at: 'O', rays: ['A', 'C'] }
      },
      elements: [
        { id: 'plane', type: 'plane', x: [-7, 7], y: [-7, 7], grid: false, axisLabels: false },
        { id: 'circ', type: 'circle', center: [0, 0], radius: 5, role: 'reference' },
        { id: 'O', type: 'point', at: [0, 0], label: 'O' },                 // center (fixed)
        { id: 'A', type: 'point', at: [-4.3301, 2.5], label: 'A' },         // fixed arc endpoints
        { id: 'C', type: 'point', at: [4.3301, 2.5], label: 'C' },
        { id: 'B', type: 'point', at: [0, -5], on: 'circle:circ', draggable: true, label: 'B' },
        { id: 'segOA', type: 'segment', through: ['O', 'A'], role: 'reference' },
        { id: 'segOC', type: 'segment', through: ['O', 'C'], role: 'reference' },
        { id: 'segBA', type: 'segment', through: ['B', 'A'] },
        { id: 'segBC', type: 'segment', through: ['B', 'C'] },
        { id: 'angB', type: 'angle', at: 'B', rays: ['A', 'C'], measure: true },
        { id: 'angO', type: 'angle', at: 'O', rays: ['A', 'C'], measure: true },
        { id: 'out', type: 'readout', text: 'inscribed = {inscribed}°   ·   central = {central}°', at: 'top' }
      ],
      reveal: ['plane', 'circ', 'O', 'A', 'C', 'B', 'segOA', 'segOC', 'segBA', 'segBC', 'angB', 'angO', 'out'],
      drag: ['B'],
      prompt: 'Drag B around the arc. The inscribed angle never changes — and it is always half the central angle.'
    },

    // Drag any vertex; the three interior angles are measured live and ALWAYS
    // sum to 180°. Reuses the geometry vocabulary (polygon + angle measures +
    // a derived sum) with no new primitives.
    triangle_angle_sum: {
      model: 'triangle_angle_sum',
      title: 'Angles of a triangle sum to 180°',
      params: {},
      controls: [],
      measures: {
        angA: { type: 'angle', at: 'A', rays: ['B', 'C'] },
        angB: { type: 'angle', at: 'B', rays: ['A', 'C'] },
        angC: { type: 'angle', at: 'C', rays: ['A', 'B'] }
      },
      derived: { sum: 'angA + angB + angC' },
      elements: [
        { id: 'plane', type: 'plane', x: [-8, 8], y: [-6, 6], grid: true, axisLabels: false },
        { id: 'A', type: 'point', at: [-4, -2], draggable: true, label: 'A' },
        { id: 'B', type: 'point', at: [4, -2], draggable: true, label: 'B' },
        { id: 'C', type: 'point', at: [1, 4], draggable: true, label: 'C' },
        { id: 'tri', type: 'polygon', vertices: ['A', 'B', 'C'], fill: true },
        { id: 'angA', type: 'angle', at: 'A', rays: ['B', 'C'], measure: true },
        { id: 'angB', type: 'angle', at: 'B', rays: ['A', 'C'], measure: true },
        { id: 'angC', type: 'angle', at: 'C', rays: ['A', 'B'], measure: true },
        { id: 'out', type: 'readout', text: '{angA}° + {angB}° + {angC}° = {sum}°', at: 'top' }
      ],
      reveal: ['plane', 'tri', 'A', 'B', 'C', 'angA', 'angB', 'angC', 'out'],
      drag: ['A', 'B', 'C'],
      prompt: 'Drag any corner. The three angles change — but watch the sum.'
    },

    // A straight line A—O—A′ with a ray O—B. The two adjacent angles (a linear
    // pair) are measured live and always sum to 180°. Reuses the geometry
    // vocabulary — no new primitives.
    linear_pair_angles: {
      model: 'linear_pair_angles',
      title: 'Linear pair: angles on a line sum to 180°',
      params: {},
      controls: [],
      measures: {
        ang1: { type: 'angle', at: 'O', rays: ['A', 'B'] },
        ang2: { type: 'angle', at: 'O', rays: ['A2', 'B'] }
      },
      derived: { sum: 'ang1 + ang2' },
      elements: [
        { id: 'plane', type: 'plane', x: [-7, 7], y: [-3, 7], grid: false, axisLabels: false },
        { id: 'circ', type: 'circle', center: [0, 0], radius: 5, role: 'reference' },
        { id: 'O', type: 'point', at: [0, 0], label: 'O' },
        { id: 'A', type: 'point', at: [5, 0], label: 'A' },        // straight line A—O—A′
        { id: 'A2', type: 'point', at: [-5, 0], label: 'A′' },
        { id: 'B', type: 'point', at: [3, 4], on: 'circle:circ', draggable: true, label: 'B' },
        { id: 'lineA', type: 'segment', through: ['A', 'A2'] },
        { id: 'rayB', type: 'segment', through: ['O', 'B'] },
        { id: 'ang1', type: 'angle', at: 'O', rays: ['A', 'B'], measure: true },
        { id: 'ang2', type: 'angle', at: 'O', rays: ['A2', 'B'], measure: true },
        { id: 'out', type: 'readout', text: '{ang1}° + {ang2}° = {sum}°', at: 'top' }
      ],
      reveal: ['plane', 'circ', 'O', 'A', 'A2', 'B', 'lineA', 'rayB', 'ang1', 'ang2', 'out'],
      drag: ['B'],
      prompt: 'Drag B along the arc. The two angles on the line always add to 180° — a linear pair.'
    },

    // First DISCRETE model (engine:"tokens", not JSXGraph). Two-color counters
    // for integer arithmetic: type an expression -> chips appear (yellow = +1,
    // red = −1) -> drag a red onto a yellow to make a zero pair -> what's left is
    // the answer. The Sum is MEASURED from the chips on the mat (never asserted)
    // and is invariant as zero pairs cancel — that invariance is the lesson.
    integer_counters: {
      model: 'integer_counters',
      engine: 'tokens',
      title: 'Integer counters — zero pairs',
      input: { expression: true, placeholder: '-7 + 10' },
      tokens: [
        { value: 1, color: 'yellow', label: '+' },
        { value: -1, color: 'red', label: '−' }
      ],
      rules: [{ when: 'overlap-opposite', do: 'annihilate' }],
      readout: { text: 'Sum: {net}', format: 'signedInt' },
      prompt: 'Type an expression, then drag a red onto a yellow to cancel — what is left?'
    }
  };

  // ─── Validator ──────────────────────────────────────────────────────────
  // Structural correctness for a model spec (curated OR generated). Verifies
  // that every reference resolves: control params exist, point binds/at name
  // declared params, function/derived/readout expressions only read declared
  // params or derived names, element ids are unique, and reveal/drag reference
  // real elements. A spec that passes can be rendered without surprises; a spec
  // that fails is rejected before it reaches the engine.

  var ELEMENT_TYPES = {
    plane: 1, function: 1, point: 1, line: 1, segment: 1, ray: 1, readout: 1,
    circle: 1, polygon: 1, angle: 1
  };
  var CONTROL_TYPES = { slider: 1, choice: 1 };
  // Quantities the engine can MEASURE off the live geometry. Each needs its own
  // point refs (validated below) and a pure measurement fn (used by the renderer).
  var MEASURE_TYPES = { angle: 1, length: 1, area: 1 };

  function isPlainObject(o) { return o && typeof o === 'object' && !Array.isArray(o); }

  // Identifiers a readout template references, e.g. "y = {m}x + {b}" -> [m, b].
  function readoutTokens(text) {
    if (typeof text !== 'string') return [];
    var out = []; var re = /\{([a-zA-Z_][a-zA-Z_0-9.]*)\}/g; var m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }

  // ─── Geometry measurement (pure, so the engine MEASURES, never asserts) ───
  // The non-reflex angle at vertex `at` subtended by points `p` and `q`, in
  // degrees. All three are [x, y]. This is the correctness core of the geometry
  // models: the spec says "measure angle A-B-C", the engine computes it from the
  // live point positions — a curated OR generated geometry spec cannot show a
  // wrong angle. Returns NaN for a degenerate (zero-length) ray.
  function measureAngle(at, p, q) {
    if (!at || !p || !q) return NaN;
    var v1x = p[0] - at[0], v1y = p[1] - at[1];
    var v2x = q[0] - at[0], v2y = q[1] - at[1];
    var m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
    if (m1 === 0 || m2 === 0) return NaN;
    var c = (v1x * v2x + v1y * v2y) / (m1 * m2);
    c = Math.max(-1, Math.min(1, c)); // clamp FP drift outside acos domain
    return Math.acos(c) * 180 / Math.PI;
  }

  // The distance between two points [x,y]. The length analog of measureAngle:
  // the spec says "measure the segment A-B", the engine reads it off the live
  // positions — so a side length / radius / perimeter term is never asserted.
  function measureDistance(a, b) {
    if (!a || !b) return NaN;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  // The (unsigned) area of the polygon through `points` ([x,y] each), via the
  // shoelace formula. Absolute value so vertex winding (CW/CCW) doesn't flip the
  // sign — a generated area readout reads the same regardless of order. NaN for
  // fewer than three points.
  function measureArea(points) {
    if (!Array.isArray(points) || points.length < 3) return NaN;
    var sum = 0;
    for (var i = 0; i < points.length; i++) {
      var p = points[i], q = points[(i + 1) % points.length];
      if (!p || !q) return NaN;
      sum += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(sum) / 2;
  }

  // ─── Discrete / token engine (the second substrate) ─────────────────────
  // Integer counters & algebra tiles: discrete draggable CHIPS the student
  // arranges, with zero-pair cancellation. The "measure, never assert" property
  // holds here too — the net (the sum of the chips on the mat) is COMPUTED from
  // what's present, never typed. This module owns the pure logic + validation;
  // the inline chip renderer is public/js/conceptModelTokenRenderer.js.

  var TOKEN_RULE_WHEN = { 'overlap-opposite': 1 };
  var TOKEN_RULE_DO = { annihilate: 1 };
  var MAX_TOKENS = 60; // cap chips spawned from one expression (UI + DoS guard)

  // Expand an integer add/subtract expression into chip counts:
  // "-7 + 10" -> { positives: 10, negatives: 7, net: 3 }. Returns null for
  // anything that isn't a sum/difference of integers (the only thing integer
  // counters model). `net` is the live measured quantity a {net} readout shows —
  // and it is INVARIANT under zero-pair cancellation, which is the whole lesson.
  function expandIntegerExpression(str) {
    if (typeof str !== 'string') return null;
    var s = str.replace(/[−–—]/g, '-').replace(/\s+/g, '');
    if (!/^[+-]?\d+([+-]\d+)*$/.test(s)) return null;
    var terms = s.match(/[+-]?\d+/g).map(Number);
    var positives = 0, negatives = 0;
    terms.forEach(function (t) { if (t >= 0) positives += t; else negatives += -t; });
    return { positives: positives, negatives: negatives, net: positives - negatives, terms: terms };
  }

  // Validate a token-engine spec (engine:"tokens"). Different shape from the
  // JSXGraph path: chip TYPES (value + color), an optional expression input,
  // optional interaction rules (zero-pair cancel), and a readout that may show
  // the live {net}.
  function validateTokenSpec(spec) {
    var errors = [];
    if (typeof spec.model !== 'string' || !spec.model) errors.push('spec.model must be a non-empty string');

    if (!Array.isArray(spec.tokens) || spec.tokens.length === 0) {
      errors.push('token spec needs a non-empty tokens array');
    } else {
      spec.tokens.forEach(function (t, i) {
        if (!isPlainObject(t)) { errors.push('token[' + i + '] must be an object'); return; }
        if (typeof t.value !== 'number') errors.push('token[' + i + '] needs a numeric value');
        if (typeof t.color !== 'string' || !t.color) errors.push('token[' + i + '] needs a color');
      });
    }

    if (spec.input != null) {
      if (!isPlainObject(spec.input)) errors.push('token spec input must be an object');
      else if (spec.input.placeholder != null && typeof spec.input.placeholder !== 'string') {
        errors.push('token input placeholder must be a string');
      }
    }

    if (spec.rules != null) {
      if (!Array.isArray(spec.rules)) {
        errors.push('token spec rules must be an array');
      } else {
        spec.rules.forEach(function (r, i) {
          if (!isPlainObject(r)) { errors.push('rule[' + i + '] must be an object'); return; }
          if (!TOKEN_RULE_WHEN[r.when]) errors.push('rule[' + i + '] has unknown when "' + r.when + '"');
          if (!TOKEN_RULE_DO[r.do]) errors.push('rule[' + i + '] has unknown do "' + r.do + '"');
        });
      }
    }

    if (spec.readout != null) {
      if (!isPlainObject(spec.readout)) {
        errors.push('token spec readout must be an object');
      } else if (typeof spec.readout.text !== 'string') {
        errors.push('token readout needs text');
      } else {
        readoutTokens(spec.readout.text).forEach(function (tok) {
          if (tok !== 'net') errors.push('token readout references unknown name "' + tok + '" (only {net})');
        });
      }
    }

    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Validate a concept-model spec.
   * @param {object} spec
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateModelSpec(spec) {
    var errors = [];
    if (!isPlainObject(spec)) return { valid: false, errors: ['spec must be an object'] };
    // The discrete/token substrate has a different shape (chips, not a plane of
    // elements), so it validates on its own path.
    if (spec.engine === 'tokens') return validateTokenSpec(spec);
    if (typeof spec.model !== 'string' || !spec.model) errors.push('spec.model must be a non-empty string');
    if (!isPlainObject(spec.params)) errors.push('spec.params must be an object');

    // Params come in two flavours:
    //   • numeric  — a quantity the math reads (m, b, a, h, k). Slider-driven.
    //   • selector — a STRING key naming a choice (e.g. parent: "quadratic").
    //     Choice-driven; not a math quantity, so it can't appear inside an fn,
    //     but it can be read by `{selector.field}` readout tokens and used by a
    //     function's `compose` to pick which parent to evaluate.
    var paramNames = isPlainObject(spec.params) ? Object.keys(spec.params) : [];
    var paramSet = {};      // all params (numeric + selector)
    var numericSet = {};    // numeric params only — the math-readable ones
    var selectorSet = {};   // string-valued selector params
    paramNames.forEach(function (p) {
      paramSet[p] = true;
      var d = spec.params[p];
      if (typeof d === 'number') numericSet[p] = true;
      else if (typeof d === 'string') selectorSet[p] = true;
      else errors.push('param "' + p + '" must default to a number or a selector string');
    });

    // parents library — named pure functions of x (the swappable f). Each entry
    // is { fn, label?, anchor?, domain? }; the fn may only read x / constants.
    var parentSet = {};
    if (spec.parents != null) {
      if (!isPlainObject(spec.parents)) {
        errors.push('spec.parents must be an object when present');
      } else {
        Object.keys(spec.parents).forEach(function (key) {
          parentSet[key] = true;
          var entry = spec.parents[key];
          if (!isPlainObject(entry)) { errors.push('parent "' + key + '" must be an object'); return; }
          try {
            var pc = compileExpr(entry.fn);
            pc.vars.forEach(function (v) {
              errors.push('parent "' + key + '" fn may only use x; references "' + v + '"');
            });
          } catch (e) {
            errors.push('parent "' + key + '" fn does not compile: ' + e.message);
          }
        });
      }
    }
    // A selector's default must name a real parent (when a parents library exists).
    Object.keys(selectorSet).forEach(function (s) {
      if (spec.parents && !parentSet[spec.params[s]]) {
        errors.push('selector "' + s + '" default "' + spec.params[s] + '" is not a parent');
      }
    });

    // measures are quantities the engine reads off the LIVE geometry (an angle
    // between three points) — never params, never asserted. Collected before
    // `derived` so a derived value (e.g. a triangle's angle sum) may read them;
    // their point refs are validated in the deferred pass (after ids exist).
    var measureSet = {};
    if (spec.measures != null) {
      if (!isPlainObject(spec.measures)) {
        errors.push('spec.measures must be an object when present');
      } else {
        Object.keys(spec.measures).forEach(function (name) {
          if (paramSet[name]) errors.push('measure "' + name + '" collides with a param of the same name');
          var def = spec.measures[name];
          if (!isPlainObject(def) || !MEASURE_TYPES[def.type]) {
            errors.push('measure "' + name + '" needs a known type (' + Object.keys(MEASURE_TYPES).join(', ') + ')');
          } else if (def.type === 'angle') {
            if (typeof def.at !== 'string' || !Array.isArray(def.rays) || def.rays.length !== 2) {
              errors.push('measure "' + name + '" (angle) needs at:<point> and rays:[ptA, ptB]');
            }
          } else if (def.type === 'length') {
            if (!Array.isArray(def.between) || def.between.length !== 2) {
              errors.push('measure "' + name + '" (length) needs between:[ptA, ptB]');
            }
          } else if (def.type === 'area') {
            if (!Array.isArray(def.of) || def.of.length < 3) {
              errors.push('measure "' + name + '" (area) needs of:[ptA, ptB, ptC, …]');
            }
          }
          measureSet[name] = true;
        });
      }
    }

    // derived names are computed from numeric params, measures, and earlier
    // derived; readable by readouts and functions, not user-controlled.
    var derivedSet = {};
    if (spec.derived != null) {
      if (!isPlainObject(spec.derived)) {
        errors.push('spec.derived must be an object when present');
      } else {
        Object.keys(spec.derived).forEach(function (name) {
          if (paramSet[name] || measureSet[name]) errors.push('derived "' + name + '" collides with a param/measure name');
          try {
            var c = compileExpr(spec.derived[name]);
            c.vars.forEach(function (v) {
              if (!numericSet[v] && !measureSet[v] && !derivedSet[v]) {
                errors.push('derived "' + name + '" references unknown name "' + v + '"');
              }
            });
          } catch (e) {
            errors.push('derived "' + name + '" does not compile: ' + e.message);
          }
          derivedSet[name] = true;
        });
      }
    }

    // math-readable: what a function/point-coord expression may read.
    var mathSet = {};
    Object.keys(numericSet).forEach(function (k) { mathSet[k] = true; });
    Object.keys(derivedSet).forEach(function (k) { mathSet[k] = true; });

    // name-resolvable: what a readout token may reference (math + selectors + measures).
    var nameSet = {};
    Object.keys(mathSet).forEach(function (k) { nameSet[k] = true; });
    Object.keys(selectorSet).forEach(function (k) { nameSet[k] = true; });
    Object.keys(measureSet).forEach(function (k) { nameSet[k] = true; });

    // controls
    if (spec.controls != null) {
      if (!Array.isArray(spec.controls)) {
        errors.push('spec.controls must be an array when present');
      } else {
        spec.controls.forEach(function (c, i) {
          if (!isPlainObject(c)) { errors.push('control[' + i + '] must be an object'); return; }
          if (!CONTROL_TYPES[c.type]) errors.push('control[' + i + '] has unknown type "' + c.type + '"');
          if (!paramSet[c.param]) errors.push('control[' + i + '] binds unknown param "' + c.param + '"');
          if (c.type === 'slider') {
            if (!numericSet[c.param]) errors.push('slider for "' + c.param + '" must drive a numeric param');
            if (!Array.isArray(c.range) || c.range.length !== 2 ||
              typeof c.range[0] !== 'number' || typeof c.range[1] !== 'number' || c.range[0] >= c.range[1]) {
              errors.push('slider for "' + c.param + '" needs range [lo, hi] with lo < hi');
            }
            if (c.step != null && !(typeof c.step === 'number' && c.step > 0)) {
              errors.push('slider for "' + c.param + '" has a non-positive step');
            }
          }
          if (c.type === 'choice') {
            if (!selectorSet[c.param]) errors.push('choice for "' + c.param + '" must drive a selector param');
            var opts = Array.isArray(c.options) ? c.options : Object.keys(parentSet);
            if (!opts.length) errors.push('choice for "' + c.param + '" has no options');
            opts.forEach(function (o) {
              if (spec.parents && !parentSet[o]) errors.push('choice option "' + o + '" is not a parent');
            });
          }
        });
      }
    }

    // elements
    var ids = {};
    if (!Array.isArray(spec.elements) || spec.elements.length === 0) {
      errors.push('spec.elements must be a non-empty array');
    } else {
      spec.elements.forEach(function (el, i) {
        if (!isPlainObject(el)) { errors.push('element[' + i + '] must be an object'); return; }
        if (typeof el.id !== 'string' || !el.id) errors.push('element[' + i + '] needs a string id');
        else if (ids[el.id]) errors.push('duplicate element id "' + el.id + '"');
        else ids[el.id] = el;
        if (!ELEMENT_TYPES[el.type]) errors.push('element "' + (el.id || i) + '" has unknown type "' + el.type + '"');

        if (el.type === 'function') {
          // `compose` lets the fn call the SELECTED parent at a shifted argument,
          // exposing the result as a placeholder var. Validate the placeholders
          // first, then allow the outer fn to read them.
          var fnReadable = {};
          Object.keys(mathSet).forEach(function (k) { fnReadable[k] = true; });
          if (el.compose != null) {
            if (!isPlainObject(el.compose)) {
              errors.push('function "' + el.id + '" compose must be an object');
            } else {
              Object.keys(el.compose).forEach(function (ph) {
                var spec2 = el.compose[ph];
                if (!isPlainObject(spec2) || !spec2.parent) {
                  errors.push('function "' + el.id + '" compose."' + ph + '" needs { parent, arg }');
                  return;
                }
                if (!selectorSet[spec2.parent]) {
                  errors.push('function "' + el.id + '" compose parent "' + spec2.parent + '" is not a selector');
                }
                try {
                  var ac = compileExpr(spec2.arg);
                  ac.vars.forEach(function (v) {
                    if (!mathSet[v]) errors.push('function "' + el.id + '" compose arg references unknown name "' + v + '"');
                  });
                } catch (e) {
                  errors.push('function "' + el.id + '" compose arg does not compile: ' + e.message);
                }
                fnReadable[ph] = true;
              });
            }
          }
          try {
            var cf = compileExpr(el.fn);
            cf.vars.forEach(function (v) {
              if (!fnReadable[v]) errors.push('function "' + el.id + '" references unknown name "' + v + '"');
            });
          } catch (e) {
            errors.push('function "' + el.id + '" does not compile: ' + e.message);
          }
        }

        if (el.type === 'point') {
          if (!Array.isArray(el.at) || el.at.length !== 2) {
            errors.push('point "' + el.id + '" needs at:[x,y]');
          } else {
            // Coords resolve live from the param object (P) in the renderer, so a
            // string coord must be a NUMERIC param — not a derived/measure (those
            // aren't in P, so they'd render as NaN). Tighter than mathSet on
            // purpose: keep the validator from passing a spec the renderer breaks.
            el.at.forEach(function (coord) {
              if (typeof coord === 'string' && !numericSet[coord]) {
                errors.push('point "' + el.id + '" at references unknown numeric param "' + coord + '"');
              } else if (typeof coord !== 'string' && typeof coord !== 'number') {
                errors.push('point "' + el.id + '" at coordinate must be a number or numeric param');
              }
            });
          }
          if (el.binds != null) {
            var binds = Array.isArray(el.binds) ? el.binds : [el.binds];
            binds.forEach(function (p) {
              if (!numericSet[p]) errors.push('point "' + el.id + '" binds unknown numeric param "' + p + '"');
            });
          }
        }

        if (el.type === 'line' || el.type === 'segment' || el.type === 'ray') {
          if (!Array.isArray(el.through) || el.through.length !== 2) {
            errors.push(el.type + ' "' + el.id + '" needs through:[idA, idB]');
          }
        }

        if (el.type === 'circle') {
          if (!Array.isArray(el.center) || el.center.length !== 2) {
            errors.push('circle "' + el.id + '" needs center:[x,y]');
          } else {
            // Same as point coords: numeric params or literals only (renderer
            // resolves these from the live param object, not derived/measures).
            el.center.forEach(function (coord) {
              if (typeof coord === 'string' && !numericSet[coord]) {
                errors.push('circle "' + el.id + '" center references unknown numeric param "' + coord + '"');
              } else if (typeof coord !== 'string' && typeof coord !== 'number') {
                errors.push('circle "' + el.id + '" center must be numbers or numeric params');
              }
            });
          }
          if (typeof el.radius === 'string') {
            if (!numericSet[el.radius]) errors.push('circle "' + el.id + '" radius references unknown numeric param "' + el.radius + '"');
          } else if (!(typeof el.radius === 'number' && el.radius > 0)) {
            errors.push('circle "' + el.id + '" needs a positive radius (number or numeric param)');
          }
        }

        if (el.type === 'polygon') {
          if (!Array.isArray(el.vertices) || el.vertices.length < 3) {
            errors.push('polygon "' + el.id + '" needs vertices:[idA, idB, idC, …] (3+)');
          }
        }

        if (el.type === 'angle') {
          if (typeof el.at !== 'string') errors.push('angle "' + el.id + '" needs at: <point id>');
          if (!Array.isArray(el.rays) || el.rays.length !== 2) {
            errors.push('angle "' + el.id + '" needs rays:[idA, idB]');
          }
        }

        if (el.type === 'readout') {
          readoutTokens(el.text).forEach(function (tok) {
            var parts = tok.split('.');
            var base = parts[0];
            if (parts.length > 1) {
              // "{selector.field}" — the base must be a selector param; the field
              // resolves against the chosen parent (e.g. {parent.label}).
              if (!selectorSet[base]) errors.push('readout "' + el.id + '" token "' + tok + '" needs a selector before the dot');
            } else if (!nameSet[base]) {
              errors.push('readout "' + el.id + '" references unknown name "' + tok + '"');
            }
          });
        }
      });

      // Cross-element references (point/circle ids) — deferred until all ids are
      // collected so element order doesn't matter.
      var isPoint = function (ref) { return ids[ref] && ids[ref].type === 'point'; };
      spec.elements.forEach(function (el) {
        if ((el.type === 'line' || el.type === 'segment' || el.type === 'ray') && Array.isArray(el.through)) {
          el.through.forEach(function (ref) {
            if (!isPoint(ref)) errors.push(el.type + ' "' + el.id + '" references unknown point "' + ref + '"');
          });
        }
        if (el.type === 'polygon' && Array.isArray(el.vertices)) {
          el.vertices.forEach(function (ref) {
            if (!isPoint(ref)) errors.push('polygon "' + el.id + '" references unknown point "' + ref + '"');
          });
        }
        if (el.type === 'angle') {
          if (el.at && !isPoint(el.at)) errors.push('angle "' + el.id + '" vertex "' + el.at + '" is not a point');
          if (Array.isArray(el.rays)) el.rays.forEach(function (ref) {
            if (!isPoint(ref)) errors.push('angle "' + el.id + '" ray "' + ref + '" is not a point');
          });
        }
        // A point constrained on a circle: on:"circle:<id>".
        if (el.type === 'point' && typeof el.on === 'string' && el.on.indexOf('circle:') === 0) {
          var cid = el.on.slice('circle:'.length);
          if (!ids[cid] || ids[cid].type !== 'circle') {
            errors.push('point "' + el.id + '" on references unknown circle "' + cid + '"');
          }
        }
      });

      // measure point refs (deferred for the same reason).
      Object.keys(measureSet).forEach(function (name) {
        var def = spec.measures[name];
        if (!isPlainObject(def)) return;
        if (def.at && !isPoint(def.at)) errors.push('measure "' + name + '" vertex "' + def.at + '" is not a point');
        if (Array.isArray(def.rays)) def.rays.forEach(function (ref) {
          if (!isPoint(ref)) errors.push('measure "' + name + '" ray "' + ref + '" is not a point');
        });
        if (Array.isArray(def.between)) def.between.forEach(function (ref) {
          if (!isPoint(ref)) errors.push('measure "' + name + '" endpoint "' + ref + '" is not a point');
        });
        if (Array.isArray(def.of)) def.of.forEach(function (ref) {
          if (!isPoint(ref)) errors.push('measure "' + name + '" vertex "' + ref + '" is not a point');
        });
      });
    }

    ['reveal', 'drag'].forEach(function (key) {
      if (spec[key] == null) return;
      if (!Array.isArray(spec[key])) { errors.push('spec.' + key + ' must be an array when present'); return; }
      spec[key].forEach(function (ref) {
        if (!ids[ref]) errors.push('spec.' + key + ' references unknown element "' + ref + '"');
      });
    });

    return { valid: errors.length === 0, errors: errors };
  }

  // ─── Catalog accessor ───────────────────────────────────────────────────
  // Returns a deep copy so a caller (or the renderer's live params) can never
  // mutate the shared catalog entry.
  function getModel(name) {
    var spec = CURATED[name];
    return spec ? JSON.parse(JSON.stringify(spec)) : null;
  }

  return {
    compileExpr: compileExpr,
    validateModelSpec: validateModelSpec,
    getModel: getModel,
    readoutTokens: readoutTokens,
    measureAngle: measureAngle,
    measureDistance: measureDistance,
    measureArea: measureArea,
    expandIntegerExpression: expandIntegerExpression,
    MAX_TOKENS: MAX_TOKENS,
    MODELS: Object.keys(CURATED)
  };
});
