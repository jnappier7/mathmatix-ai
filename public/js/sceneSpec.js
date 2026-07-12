/**
 * sceneSpec.js — SPIKE: declarative geometry scene validator + dependency order.
 *
 * Proof-of-concept for a general diagram engine (see docs/DIAGRAM_SCENE_SPIKE.md).
 * A "scene" is a list of geometry OBJECTS that reference each other by id
 * (midpoint of [A,B]; intersection of [l1,l2]; line parallel to l through P) plus
 * a list of MARKS (ticks, angle arcs, right angles, parallel chevrons, labels).
 *
 * This module does the PURE part — the part you can unit-test in Node without a
 * browser: validate references, reject cycles, and return a topological build
 * ORDER so the renderer can construct each object after its dependencies. The
 * actual coordinate SOLVING is delegated to JSXGraph's constructive primitives
 * in sceneRenderer.js (midpoint/intersection/parallel/perpendicular/glider),
 * which is what keeps a novel composition correct-by-construction.
 *
 * Dual-export (UMD-lite): require() in Node for tests, window.SceneSpec browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SceneSpec = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // For each object type, which fields hold ids this object depends on.
  // (Fields may be a single id or an array of ids.)
  const DEPS = {
    point: [],           // free point: { at:[x,y] } — no deps
    midpoint: ['of'],    // { of:[id,id] }
    intersection: ['of'],// { of:[lineId,lineId] }
    glider: ['on'],      // { on:circleId, at:[x,y] } — point constrained to a curve
    segment: ['from', 'to'],
    line: ['from', 'to'],
    ray: ['from', 'to'],
    circle: ['center', 'through'], // through optional if radius given
    polygon: ['points'],
    parallel: ['through', 'to'],   // line through point, parallel to another line
    perpendicular: ['through', 'to'],
  };

  const MARK_REFS = {
    tick: ['on'],       // { on:[ptId, ptId], count }
    angle: ['at', 'from', 'to'],
    right: ['at', 'from', 'to'],
    parallel: ['on'],   // { on:[p1,p2,p3,p4] } chevrons
    label: ['on'],      // { on:pointId, text }
    // A displayed MEASUREMENT — a length/angle/coordinate value shown on the
    // figure: { on:[ptId(s)], symbol:'x'|'AB'|'∠B', value:Number, unit?, solve? }.
    // `value` is the LEAK VECTOR the scene gate inspects/redacts; `symbol` is safe.
    measure: ['on'],
  };

  const NUM_RE = /-?\d+(?:\.\d+)?/g;
  function numbersIn(s) {
    if (typeof s !== 'string') return [];
    const m = s.match(NUM_RE);
    return m ? m.map(Number).filter((n) => Number.isFinite(n)) : [];
  }

  /**
   * Every numeric value the scene would DISPLAY to the student (measurement
   * values + any digits in measure/label text). This is "what the figure
   * reveals" — the scene gate compares it against the known answer.
   * @param {object} scene
   * @returns {number[]}
   */
  function extractSceneValues(scene) {
    const out = [];
    for (const m of (scene && scene.marks) || []) {
      if (m.kind === 'measure') {
        if (typeof m.value === 'number' && Number.isFinite(m.value)) out.push(m.value);
        out.push.apply(out, numbersIn(m.symbol));
      } else if (m.kind === 'label') {
        out.push.apply(out, numbersIn(m.text));
      }
    }
    return out;
  }

  /**
   * Return a copy of the scene with the RIGHT values hidden (rendered as "?"),
   * keeping geometry AND givens intact. Pure. Two independent triggers:
   *   - opts.redactSolve: hide measures flagged `solve:true` — the to-be-found
   *     unknowns when the figure depicts the student's own problem (givens stay,
   *     so the picture is still useful).
   *   - opts.answerValues: hide any measure/label value that equals a known
   *     answer value — the deterministic leak net, regardless of `solve`.
   * A structured scene can redact selectively; a raster/generated image can't,
   * which is why the diagram engine is structured.
   * @param {object} scene
   * @param {{redactSolve?:boolean, answerValues?:number[]}} [opts]
   * @returns {object}
   */
  function redactScene(scene, opts) {
    if (!scene || !Array.isArray(scene.marks)) return scene;
    opts = opts || {};
    const redactSolve = !!opts.redactSolve;
    const answerVals = Array.isArray(opts.answerValues) ? opts.answerValues : [];
    const matchesAnswer = (v) => typeof v === 'number' && answerVals.some((a) => Math.abs(a - v) <= 1e-6);
    const marks = scene.marks.map((m) => {
      if (m.kind === 'measure') {
        const hide = (redactSolve && m.solve === true) || matchesAnswer(m.value);
        return hide ? Object.assign({}, m, { value: null, redacted: true }) : m;
      }
      if (m.kind === 'label' && typeof m.text === 'string' && answerVals.length && numbersIn(m.text).some(matchesAnswer)) {
        // Blank only answer-matching numbers; leave given numbers readable.
        const t = m.text.replace(NUM_RE, (d) => (matchesAnswer(Number(d)) ? '?' : d));
        return Object.assign({}, m, { text: t });
      }
      return m;
    });
    return Object.assign({}, scene, { marks });
  }

  function idsFrom(obj, fields) {
    const out = [];
    for (const f of fields) {
      const v = obj[f];
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((x) => { if (typeof x === 'string') out.push(x); });
      else if (typeof v === 'string') out.push(v);
    }
    return out;
  }

  /**
   * Validate a scene and return a topological build order for its objects.
   * @param {{objects:Array, marks?:Array}} scene
   * @returns {{valid:boolean, errors:string[], order:string[]}}
   */
  function validateScene(scene) {
    const errors = [];
    if (!scene || !Array.isArray(scene.objects)) {
      return { valid: false, errors: ['scene.objects must be an array'], order: [] };
    }

    const byId = new Map();
    for (const o of scene.objects) {
      if (!o || typeof o.id !== 'string' || !o.id) { errors.push('every object needs a string id'); continue; }
      if (byId.has(o.id)) errors.push('duplicate id: ' + o.id);
      if (!(o.type in DEPS)) errors.push('unknown object type: ' + o.type + ' (id ' + o.id + ')');
      byId.set(o.id, o);
    }

    // Edges: object -> its dependency ids (must exist).
    const deps = new Map();
    for (const o of scene.objects) {
      if (!o || !byId.has(o.id)) continue;
      const need = idsFrom(o, DEPS[o.type] || []);
      for (const d of need) if (!byId.has(d)) errors.push(o.id + ' references missing id: ' + d);
      deps.set(o.id, need.filter((d) => byId.has(d)));
    }

    // Marks reference objects too (no ordering impact — rendered last).
    for (const m of (scene.marks || [])) {
      if (!m || !(m.kind in MARK_REFS)) { errors.push('unknown mark kind: ' + (m && m.kind)); continue; }
      for (const d of idsFrom(m, MARK_REFS[m.kind])) {
        if (!byId.has(d)) errors.push('mark "' + m.kind + '" references missing id: ' + d);
      }
    }

    // Kahn topological sort — also detects cycles ("D midpoint of D").
    const order = [];
    const indeg = new Map();
    for (const id of byId.keys()) indeg.set(id, 0);
    for (const [id, ds] of deps) for (const d of ds) indeg.set(id, indeg.get(id)); // placeholder
    // Build reverse adjacency + indegree = number of deps.
    const outAdj = new Map();
    for (const id of byId.keys()) outAdj.set(id, []);
    for (const [id, ds] of deps) {
      indeg.set(id, ds.length);
      for (const d of ds) outAdj.get(d).push(id);
    }
    const queue = [];
    for (const [id, n] of indeg) if (n === 0) queue.push(id);
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const nxt of outAdj.get(id)) {
        indeg.set(nxt, indeg.get(nxt) - 1);
        if (indeg.get(nxt) === 0) queue.push(nxt);
      }
    }
    if (order.length !== byId.size) errors.push('dependency cycle detected among objects');

    return { valid: errors.length === 0, errors, order };
  }

  return { validateScene, extractSceneValues, redactScene, DEPS, MARK_REFS };
});
