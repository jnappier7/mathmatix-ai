/* ============================================================
   flags.js — LIVING_WORKSPACE feature gate.

   Modes (spec §P3): off | dev | beta | live. "off" is the default —
   the new surface never shows until explicitly enabled, and the old
   board/chat is untouched. There is no "shadow" mode for a UI.

     off  → not mounted at all
     dev  → mounted for developers / this harness; extra debug affordances
     beta → mounted for opted-in users
     live → mounted for everyone

   Resolution order (first defined wins):
     1. window.MM_FEATURES.livingWorkspace   (server/HTML-injected flag)
     2. ?livingWorkspace=<mode> query param   (dev override)
     3. 'off'                                  (safe default)

   Pure/isomorphic: pass an explicit env object in Node/tests; reads
   window/location in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).flags = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODES = ['off', 'dev', 'beta', 'live'];

  function normalize(mode) {
    return MODES.indexOf(mode) >= 0 ? mode : 'off';
  }

  // env = { features?:object, search?:string } — injectable for tests.
  function resolveMode(env) {
    env = env || {};
    const features = env.features
      || (typeof window !== 'undefined' ? window.MM_FEATURES : null)
      || {};
    if (typeof features.livingWorkspace === 'string') {
      return normalize(features.livingWorkspace);
    }
    const search = env.search != null
      ? env.search
      : (typeof location !== 'undefined' ? location.search : '');
    const m = /[?&]livingWorkspace=([a-z]+)/i.exec(search || '');
    if (m) return normalize(m[1].toLowerCase());
    return 'off';
  }

  function isEnabled(env) { return resolveMode(env) !== 'off'; }
  function isDev(env) { return resolveMode(env) === 'dev'; }

  return { MODES, normalize, resolveMode, isEnabled, isDev };
});
