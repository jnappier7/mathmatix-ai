// public/js/signup-onboarding-gate.js
// First-time visitors should answer the open-ended onboarding prompt BEFORE
// filling out the account-creation form. This script runs at the top of
// signup.html and bounces visitors to /onboarding.html unless either:
//   - they've already captured an intent (pending in localStorage), OR
//   - they explicitly skipped (sessionStorage flag), OR
//   - they arrived from /onboarding.html (Referer check).
//
// Anything else — direct deep-link, return visit — gets the voice prompt first.
(function () {
  'use strict';

  var STORAGE_KEY  = 'mathmatix.pendingOnboardingIntent';
  var SKIP_KEY     = 'mathmatix.skipOnboardingGate';
  var ONBOARD_PATH = '/onboarding.html';

  try {
    // Honor an explicit ?skipOnboarding=1 (e.g. internal links, dev/QA).
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('skipOnboarding') === '1') {
      try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (_) {}
      return;
    }
    if (sessionStorage.getItem(SKIP_KEY) === '1') return;

    // If the user already answered (pending intent in localStorage), let them
    // continue to the signup form to finish account creation.
    if (localStorage.getItem(STORAGE_KEY)) return;

    // If they just came from the onboarding page (e.g. they tapped
    // "Continue to sign up"), let them proceed.
    if (document.referrer && document.referrer.indexOf(ONBOARD_PATH) !== -1) return;

    // Forward query string (?trial_tutor=…, ?ref=…) so existing affiliate /
    // trial-tutor flows still work end-to-end.
    var qs = window.location.search || '';
    window.location.replace(ONBOARD_PATH + qs);
  } catch (err) {
    // Storage disabled or other error — fail open so signup still works.
    if (window.console && console.warn) console.warn('[signup-gate] non-fatal:', err);
  }
})();
