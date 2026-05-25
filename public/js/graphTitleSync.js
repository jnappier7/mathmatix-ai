/* ============================================================
   graphTitleSync.js — keep a graph card's title/caption math
   in sync with its fn.

   Why this exists
   ---------------
   The tutor sometimes emits a graph tag where the fn is a
   simplification ("x^2") and the title spells out a fuller
   expression ("Graph of y=x^2 + 4x - 12"). Each surface is
   trusted independently, so the rendered parabola disagrees with
   its own label.

   This helper runs at render time: if a title contains a math
   expression on the right of "y =" / "f(x) =" that doesn't match
   the fn the renderer is about to plot, the title is replaced
   with the canonical "Graph of y = ${fn}". Titles that are pure
   descriptions ("Quadratic crossing zero") pass through —
   they're not claims about the math.

   UMD wrapper so the same source backs both the browser (loaded
   via <script src="...">) and Node-side unit tests.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MathmatixGraphTitleSync = factory();
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Pulls the right-hand math out of a title like "Graph of y = x^2 + 4x - 12"
  // or "f(x) = sin(x)". Returns the matched expression or null when the
  // title is purely descriptive.
  function extractMathFromTitle(title) {
    if (!title || typeof title !== 'string') return null;
    // Match "y = expr" or "y=expr" or "f(x) = expr" or "f(x)=expr".
    // Capture lazily, stop at the first comma/semicolon/period that
    // isn't inside a number (so "y = x + 1.5" still captures fully).
    const m = title.match(/(?:y|f\s*\(\s*x\s*\))\s*=\s*([^,;]+?)\s*$/i);
    if (!m) return null;
    return m[1].trim();
  }

  // Normalize a math expression for comparison: lowercase, strip
  // whitespace, fold common Unicode operators and "**" → "^".
  function normalizeMath(s) {
    if (!s || typeof s !== 'string') return '';
    return s.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/\*\*/g, '^')
      .replace(/[−–—]/g, '-')  // U+2212 minus, en/em dash
      .replace(/[×⋅]/g, '*')        // × and ⋅
      .replace(/[÷]/g, '/')              // ÷
      .replace(/[²]/g, '^2')             // ²
      .replace(/[³]/g, '^3');            // ³
  }

  // Decide what title to actually render. Defaults to the canonical
  // "Graph of y = ${fn}" when the LLM provided no title; passes
  // through descriptive titles unchanged; overrides math-bearing
  // titles whose math doesn't match fn.
  function syncGraphTitle(title, fn) {
    const safeFn = (fn || '').toString().trim();
    if (!safeFn) {
      // No fn to anchor against — fall back to whatever the caller
      // supplied (or empty).
      return title || '';
    }

    const canonical = `Graph of y = ${safeFn}`;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return canonical;
    }

    const titleMath = extractMathFromTitle(title);
    if (!titleMath) {
      // Pure description — keep as-is. Titles like "Quadratic Function"
      // or "Position, Velocity & Acceleration" are not claims about
      // the math.
      return title;
    }

    if (normalizeMath(titleMath) === normalizeMath(safeFn)) {
      return title;
    }

    // Mismatch — replace with canonical and log so we can track how
    // often this triggers in real sessions.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        `[graphTitleSync] Title math doesn't match fn — overriding. ` +
        `title="${title}" extracted="${titleMath}" fn="${safeFn}"`
      );
    }
    return canonical;
  }

  // Same logic for the BOARD graph card's caption. Captions on the
  // board are usually short hints ("Where it crosses zero") — pure
  // description. But when a caption embeds y=expr math, we apply the
  // same sync rule. When the caption is replaced, we return null so
  // the caller can render WITHOUT a caption rather than re-showing
  // the same equation that's already visible elsewhere.
  function syncGraphCaption(caption, fn) {
    const safeFn = (fn || '').toString().trim();
    if (!safeFn || !caption || typeof caption !== 'string' || caption.trim() === '') {
      return caption || null;
    }
    const captionMath = extractMathFromTitle(caption);
    if (!captionMath) return caption;
    if (normalizeMath(captionMath) === normalizeMath(safeFn)) return caption;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        `[graphTitleSync] Caption math doesn't match fn — dropping. ` +
        `caption="${caption}" extracted="${captionMath}" fn="${safeFn}"`
      );
    }
    return null;
  }

  return {
    syncGraphTitle,
    syncGraphCaption,
    // Exposed for tests
    _extractMathFromTitle: extractMathFromTitle,
    _normalizeMath: normalizeMath,
  };
}));
