/**
 * stripVisualTags.js — final safety net for UNRENDERED inline visual tags.
 *
 * The tutor is told (visualCapabilities.js) to emit bracket visual tags like
 * [FUNCTION_GRAPH:...], [DIAGRAM:triangle], [NUMBER_LINE:...]. Each is turned
 * into an element by a client renderer (inlineChatVisuals / diagram-display).
 * But if a renderer isn't loaded (e.g. diagram-display isn't bundled), errors,
 * or doesn't recognize the tag, the RAW bracket text is left in the message and
 * the student sees literal "[DIAGRAM:triangle]" gibberish.
 *
 * This runs LAST, after every renderer has had its chance, and removes any
 * leftover tag whose command name is a known visual command. Because it only
 * matches a fixed whitelist of command names, it can't eat interval notation
 * like [0, 3], coordinate lists, or LaTeX \[ ... \].
 *
 * Dual-export (UMD-lite): require() in Node for tests, window.StripVisualTags
 * in the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StripVisualTags = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Self-closing visual command tags of the form [NAME] or [NAME:params].
  // NOT block tags (e.g. [STEPS]...[/STEPS]) — those are handled elsewhere and
  // stripping only the opener would orphan the content.
  const VISUAL_COMMANDS = [
    'DIAGRAM',
    'FUNCTION_GRAPH', 'SLIDER_GRAPH', 'DERIVATIVE_GRAPH', 'RATIONAL_GRAPH', 'VELOCITY_GRAPH',
    'SYSTEM_GRAPH', 'GRAPH_3D',
    'NUMBER_LINE', 'COORDINATE_PLANE', 'POINTS', 'PARABOLA',
    'FRACTION', 'PIE_CHART', 'BAR_CHART', 'AREA_MODEL', 'PERCENT_BAR', 'PLACE_VALUE',
    'UNIT_CIRCLE', 'ANGLE', 'PYTHAGOREAN', 'RIGHT_TRIANGLE', 'REGULAR_POLYGON', 'SLOPE',
    'COMPARISON', 'INEQUALITY', 'ALGEBRA_TILES', 'MULTI_REP', 'SEARCH_IMAGE',
  ];

  // [NAME] or [NAME:params]. Params can nest ONE level of brackets
  // (points=[-3,3], jumps=[(0,3,"+3")]) — same grammar as visualTokenParser.js;
  // a bare [^\]]* stops at the first inner "]" and leaves ',label="..."]' as
  // literal text. Anchored to the whitelist so plain brackets ([0, 3], [a, b])
  // and LaTeX are never touched.
  const PARAM = '(?:[^\\[\\]]|\\[[^\\]]*\\])';
  const TAG_RE = new RegExp('\\[(?:' + VISUAL_COMMANDS.join('|') + ')(?::' + PARAM + '*)?\\]', 'g');

  /**
   * Remove any leftover (unrendered) visual command tags from a message.
   * @param {string} text
   * @returns {string}
   */
  function stripUnrenderedVisualTags(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.indexOf('[') === -1) return text; // fast path — no brackets at all
    let out = text.replace(TAG_RE, '');
    if (out !== text) {
      // Tidy whitespace a removed tag leaves behind, without disturbing newlines.
      out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    return out;
  }

  return { stripUnrenderedVisualTags, VISUAL_COMMANDS };
});
