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
    tick: ['on'],       // { on:segmentId, count }
    angle: ['at', 'from', 'to'],
    right: ['at', 'from', 'to'],
    parallel: ['on'],   // { on:[segId, segId] } chevrons
    label: ['on'],      // { on:pointId, text }
  };

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

  return { validateScene, DEPS, MARK_REFS };
});
