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
  const TYPES = ['inscribed_angle'];

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

  /**
   * Build a render-ready spec for a diagram { type, params }.
   * @returns {{valid:boolean, type:string, ...}} valid:false carries `errors`.
   */
  function buildDiagramSpec(type, params, opts) {
    switch (type) {
      case 'inscribed_angle': return buildInscribedAngle(params, opts);
      default: return { valid: false, type: type || null, errors: ['unknown diagram type: ' + type] };
    }
  }

  return { buildDiagramSpec, TYPES };
});
