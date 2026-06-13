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
        var l = left, r = right;
        left = op === '+' ? function (s) { return l(s) + r(s); } : function (s) { return l(s) - r(s); };
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      while (peek() && (peek().value === '*' || peek().value === '/')) {
        var op = consume().value; var right = parseUnary();
        var l = left, r = right;
        left = op === '*'
          ? function (s) { return l(s) * r(s); }
          : function (s) { var d = r(s); return d === 0 ? NaN : l(s) / d; };
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
          var right = parseAtom(); var l = left, r = right;
          left = function (s) { return l(s) * r(s); };
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
    }
  };

  // ─── Validator ──────────────────────────────────────────────────────────
  // Structural correctness for a model spec (curated OR generated). Verifies
  // that every reference resolves: control params exist, point binds/at name
  // declared params, function/derived/readout expressions only read declared
  // params or derived names, element ids are unique, and reveal/drag reference
  // real elements. A spec that passes can be rendered without surprises; a spec
  // that fails is rejected before it reaches the engine.

  var ELEMENT_TYPES = { plane: 1, function: 1, point: 1, line: 1, segment: 1, ray: 1, readout: 1 };
  var CONTROL_TYPES = { slider: 1, choice: 1 };

  function isPlainObject(o) { return o && typeof o === 'object' && !Array.isArray(o); }

  // Identifiers a readout template references, e.g. "y = {m}x + {b}" -> [m, b].
  function readoutTokens(text) {
    if (typeof text !== 'string') return [];
    var out = []; var re = /\{([a-zA-Z_][a-zA-Z_0-9.]*)\}/g; var m;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }

  /**
   * Validate a concept-model spec.
   * @param {object} spec
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateModelSpec(spec) {
    var errors = [];
    if (!isPlainObject(spec)) return { valid: false, errors: ['spec must be an object'] };
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

    // derived names are computed from numeric params (and earlier derived);
    // readable by readouts and functions, not user-controlled.
    var derivedSet = {};
    if (spec.derived != null) {
      if (!isPlainObject(spec.derived)) {
        errors.push('spec.derived must be an object when present');
      } else {
        Object.keys(spec.derived).forEach(function (name) {
          if (paramSet[name]) errors.push('derived "' + name + '" collides with a param of the same name');
          try {
            var c = compileExpr(spec.derived[name]);
            c.vars.forEach(function (v) {
              if (!numericSet[v] && !derivedSet[v]) {
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

    // math-readable: what a function/derived/point-coord expression may read.
    var mathSet = {};
    Object.keys(numericSet).forEach(function (k) { mathSet[k] = true; });
    Object.keys(derivedSet).forEach(function (k) { mathSet[k] = true; });
    // name-resolvable: what a readout token may reference (math names + selectors).
    var nameSet = {};
    Object.keys(mathSet).forEach(function (k) { nameSet[k] = true; });
    Object.keys(selectorSet).forEach(function (k) { nameSet[k] = true; });

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
            el.at.forEach(function (coord) {
              if (typeof coord === 'string' && !mathSet[coord]) {
                errors.push('point "' + el.id + '" at references unknown name "' + coord + '"');
              } else if (typeof coord !== 'string' && typeof coord !== 'number') {
                errors.push('point "' + el.id + '" at coordinate must be a number or param name');
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

      // line/segment/ray endpoints must reference real point ids — deferred
      // until all ids are collected so order doesn't matter.
      spec.elements.forEach(function (el) {
        if ((el.type === 'line' || el.type === 'segment' || el.type === 'ray') && Array.isArray(el.through)) {
          el.through.forEach(function (ref) {
            if (!ids[ref]) errors.push(el.type + ' "' + el.id + '" references unknown point "' + ref + '"');
          });
        }
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
    MODELS: Object.keys(CURATED)
  };
});
