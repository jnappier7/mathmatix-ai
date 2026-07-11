/**
 * diagramSpec.js — PURE geometry spec builder for the WorkBoard `diagram` verb.
 *
 * This is the correct-by-construction core of the diagram capability: it turns a
 * { type, params } request into an exact geometric spec (coordinates, angles,
 * labels) with NO rendering and NO DOM/JSXGraph dependency. The render layer
 * (public/js/diagramRenderer.js) is a thin adapter that draws this spec with
 * JSXGraph. Keeping the math here means it's unit-testable in Node and identical
 * in the browser.
 *
 * Dual-export (UMD-lite): `require()` in Node for tests, `window.DiagramSpec`
 * in the browser.
 *
 * Redaction: pass { redact: true } to omit the to-be-found values (labels become
 * "?") — this is how a diagram of the student's OWN problem is shown without
 * leaking the answer. A structured spec can do this; a raster/generated image
 * cannot, which is why this path exists instead of image generation.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DiagramSpec = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const TYPES = ['inscribed_angle', 'congruent_triangles'];

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function round(n) { const r = Math.round(n * 1e4) / 1e4; return r === 0 ? 0 : r; } // normalize -0

  /**
   * Inscribed Angle Theorem figure.
   * params: { inscribedAngleDeg (1..89), radius? (default 5) }
   * Geometry: circle centered at O=(0,0). A and C are placed symmetric about the
   * +y axis so the central angle ∠AOC = 2·θ; B sits at the bottom of the circle,
   * so the inscribed angle ∠ABC subtends the same arc AC and equals θ — i.e. the
   * theorem holds exactly, by construction.
   */
  function buildInscribedAngle(params, opts) {
    params = params || {};
    const theta = num(params.inscribedAngleDeg, NaN);
    const r = num(params.radius, 5);
    const errors = [];
    if (!Number.isFinite(theta) || theta <= 0 || theta >= 90) {
      errors.push('inscribedAngleDeg must be a number strictly between 0 and 90');
    }
    if (!(r > 0)) errors.push('radius must be a positive number');
    if (errors.length) return { valid: false, type: 'inscribed_angle', errors };

    const central = 2 * theta;
    const pt = (deg) => [round(r * Math.cos(deg * DEG)), round(r * Math.sin(deg * DEG))];
    const A = pt(90 + theta);   // upper-left of the top arc
    const C = pt(90 - theta);   // upper-right of the top arc
    const B = pt(270);          // bottom of the circle
    const redact = !!(opts && opts.redact);

    return {
      valid: true,
      type: 'inscribed_angle',
      radius: r,
      points: { O: [0, 0], A, B, C },
      angles: {
        inscribed: { at: 'B', rays: ['A', 'C'], value: redact ? null : theta, label: redact ? '?' : theta + '°' },
        central:   { at: 'O', rays: ['A', 'C'], value: redact ? null : central, label: redact ? '?' : central + '°' },
      },
      caption: redact
        ? 'An inscribed angle and the central angle subtending the same arc.'
        : 'Inscribed angle ' + theta + '° is half the central angle ' + central + '° on the same arc.',
    };
  }

  // --- congruent triangles -------------------------------------------------
  // Two triangles that ARE congruent by construction (triangle DEF is triangle
  // ABC under a rigid motion), with tick/arc marks on the caller-specified
  // corresponding parts. The student decides WHICH postulate (SSS/SAS/ASA/AAS/
  // HL) the marks prove — so the figure shows the GIVENS (marks) and never the
  // answer (the postulate name is never printed; see caption).
  const TRI1 = ['A', 'B', 'C'];
  const TRI2 = ['D', 'E', 'F'];
  // Base scalene triangle (all sides visibly different, so ticks are meaningful).
  const BASE = { A: [1, 3], B: [0, 0], C: [4, 0] };
  const SHIFT = 5.5; // horizontal gap; DEF = ABC translated (A→D, B→E, C→F).

  function triangleOf(v) {
    if (TRI1.indexOf(v) !== -1) return TRI1;
    if (TRI2.indexOf(v) !== -1) return TRI2;
    return null;
  }

  /** 'AB' -> ['A','B'] iff both letters name distinct vertices of ONE triangle. */
  function sideEndpoints(name) {
    if (typeof name !== 'string' || name.length !== 2) return null;
    const p = name[0].toUpperCase();
    const q = name[1].toUpperCase();
    if (p === q) return null;
    const t = triangleOf(p);
    if (!t || triangleOf(q) !== t) return null;
    return [p, q];
  }

  /**
   * params: {
   *   markedSides?:  [['AB','DE'], ['BC','EF'], ...]  // each group → group-index+1 ticks
   *   markedAngles?: [['B','E'], ...]                 // each group → group-index+1 arcs
   *   rightAngles?:  ['B', 'E']                        // square marks (HL)
   * }
   * Names are validated; an unknown side/vertex fails the whole spec (valid:false).
   */
  function buildCongruentTriangles(params, opts) {
    params = params || {};
    const errors = [];

    const points = {
      A: BASE.A.slice(), B: BASE.B.slice(), C: BASE.C.slice(),
      D: [BASE.A[0] + SHIFT, BASE.A[1]],
      E: [BASE.B[0] + SHIFT, BASE.B[1]],
      F: [BASE.C[0] + SHIFT, BASE.C[1]],
    };

    const asGroups = (v) => (Array.isArray(v) ? v : []);

    const sideMarks = [];
    asGroups(params.markedSides).forEach((group, gi) => {
      const names = Array.isArray(group) ? group : [group];
      const ticks = gi + 1;
      names.forEach((nm) => {
        const seg = sideEndpoints(nm);
        if (!seg) { errors.push('invalid side name: ' + nm); return; }
        const P = points[seg[0]];
        const Q = points[seg[1]];
        const mid = [round((P[0] + Q[0]) / 2), round((P[1] + Q[1]) / 2)];
        const dx = Q[0] - P[0];
        const dy = Q[1] - P[1];
        const len = Math.hypot(dx, dy) || 1;
        sideMarks.push({
          seg,
          mid,
          along: [round(dx / len), round(dy / len)],
          perp: [round(-dy / len), round(dx / len)],
          ticks,
        });
      });
    });

    const angleMarks = [];
    asGroups(params.markedAngles).forEach((group, gi) => {
      const names = Array.isArray(group) ? group : [group];
      const arcs = gi + 1;
      names.forEach((v) => {
        const vv = typeof v === 'string' ? v.toUpperCase() : '';
        const t = triangleOf(vv);
        if (!t) { errors.push('invalid angle vertex: ' + v); return; }
        angleMarks.push({ at: vv, rays: t.filter((x) => x !== vv), arcs });
      });
    });

    const rightAngleMarks = [];
    asGroups(params.rightAngles).forEach((v) => {
      const vv = typeof v === 'string' ? v.toUpperCase() : '';
      const t = triangleOf(vv);
      if (!t) { errors.push('invalid right-angle vertex: ' + v); return; }
      rightAngleMarks.push({ at: vv, rays: t.filter((x) => x !== vv) });
    });

    if (errors.length) return { valid: false, type: 'congruent_triangles', errors };

    const xs = Object.keys(points).map((k) => points[k][0]);
    const ys = Object.keys(points).map((k) => points[k][1]);
    const pad = 1;
    const extent = {
      xMin: round(Math.min.apply(null, xs) - pad),
      xMax: round(Math.max.apply(null, xs) + pad),
      yMin: round(Math.min.apply(null, ys) - pad),
      yMax: round(Math.max.apply(null, ys) + pad),
    };

    return {
      valid: true,
      type: 'congruent_triangles',
      points,
      triangles: [TRI1.slice(), TRI2.slice()],
      sideMarks,
      angleMarks,
      rightAngleMarks,
      extent,
      // NEVER name the postulate — that IS the answer the student must find.
      // (redact is irrelevant here: no numeric value is ever shown.)
      caption: 'Which congruence postulate proves △ABC ≅ △DEF?',
    };
  }

  /**
   * Build a render-ready spec for a diagram { type, params }.
   * @returns {{valid:boolean, type:string, ...}} valid:false carries `errors`.
   */
  function buildDiagramSpec(type, params, opts) {
    switch (type) {
      case 'inscribed_angle': return buildInscribedAngle(params, opts);
      case 'congruent_triangles': return buildCongruentTriangles(params, opts);
      default: return { valid: false, type: type || null, errors: ['unknown diagram type: ' + type] };
    }
  }

  return { buildDiagramSpec, TYPES };
});
