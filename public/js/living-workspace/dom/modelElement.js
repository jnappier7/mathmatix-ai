/* ============================================================
   modelElement.js — interactive concept models on the Living Workspace
   board (spec §6.8: linked representations are mandatory, not optional).

   The `model` board verb (CONCEPT_MODELS) carries either a curated model
   name ("slope_intercept_line") or a full spec (JSON string, validated
   before it may render). The engine already lives on the chat page —
   window.ConceptModelRenderer (JSXGraph substrate, lazy-loaded) +
   window.ConceptModelTokenRenderer (discrete chips) — and does the real
   work: sliders, draggable points, equation readouts, all reading and
   writing one shared parameter state. This element is the thin bridge
   that lets the DerivationView embed it as a block.

   Until this file, the P5 adapter DROPPED model commands with
   'no-workspace-element-yet' — the interactives died at the door of the
   new board even with the flag on. Browser-only view; parseSpec is pure
   and exported for tests.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = (root.LWS = root.LWS || {});

  // The structured path ships specs as JSON STRINGS (schema constraint);
  // tolerate an already-parsed object so both paths land here safely.
  function parseSpec(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function makeRenderer() {
    return function (element, ctx) {
      var host = ctx && ctx.host;
      var d = (host && host.ownerDocument) || document;
      var node = d.createElement('div');
      node.className = 'lws-model';
      node.setAttribute('role', 'group');
      node.setAttribute('aria-label', 'Interactive math model');

      var sem = (element && element.semantic) || {};
      var subject = sem.model || parseSpec(sem.spec);
      var CMR = root.ConceptModelRenderer;

      if (!subject || !CMR || typeof CMR.renderModel !== 'function') {
        // Engine not on this page or nothing renderable — degrade to a quiet
        // placeholder rather than a broken block.
        node.className += ' lws-model-unavailable';
        node.textContent = sem.prompt || 'Interactive model unavailable here.';
      } else {
        // renderModel validates the spec itself and paints its own error
        // states; it lazy-loads JSXGraph only when a model actually draws.
        try { CMR.renderModel(node, subject, { prompt: sem.prompt || null }); }
        catch (e) { console.error('[LWS] concept model render failed', e); node.textContent = 'Interactive model error.'; }
      }

      return {
        node: node,
        destroy: function () { try { node.innerHTML = ''; } catch (_) { /* detached */ } },
      };
    };
  }

  LWS.ModelElement = { makeRenderer: makeRenderer, parseSpec: parseSpec };
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeRenderer: makeRenderer, parseSpec: parseSpec };
})(typeof self !== 'undefined' ? self : this);
