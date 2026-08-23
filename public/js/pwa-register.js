// PWA Service Worker Registration & Install Prompt
(function () {
  'use strict';

  // --- Service Worker Registration ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          // Auto-update check every 60 minutes
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch(() => { /* SW registration failed — app works fine without it */ });
    });
  }

  // --- Install Prompt ---
  //
  // WHEN this shows matters more than how it looks. It used to fire 3s after any
  // page load, on every page, which meant a first-time visitor met "Get the
  // MATHMATIX app!" while they were part-way through onboarding and had not yet
  // seen the tutor answer anything. At that moment the banner is not an offer,
  // it is a third thing competing with the decision they came to make — and it
  // asks them to install something they have no evidence is worth installing.
  //
  // The banner is injected on EVERY page (config/middleware.js adds
  // pwa-register.js to every HTML response), so the gating has to live here.
  // Two rules, both about earning the ask:
  //   1. Never on a page where the visitor is mid-decision (SUPPRESSED_PATHS).
  //   2. Not until they have something to install FOR — a tutoring reply landed,
  //      or they came back for a second session.
  let deferredPrompt = null;
  const DISMISS_KEY = 'mathmatix-pwa-dismiss';
  const VALUE_KEY = 'mathmatix-pwa-value-moment';
  const SESSIONS_KEY = 'mathmatix-pwa-sessions';
  const SESSION_COUNTED_KEY = 'mathmatix-pwa-session-counted';
  const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  const SHOW_DELAY_MS = 3000;

  // Pages where the visitor is in the middle of deciding or committing something.
  // An install banner here competes with the primary action on the screen.
  const SUPPRESSED_PATHS = [
    '/onboarding',
    '/signup',
    '/login',
    '/complete-profile',
    '/parental-consent',
    '/role-picker',
    '/pick-tutor',
    '/pick-avatar',
    '/forgot-password',
    '/reset-password',
    '/email-verification',
    '/oauth-enrollment',
    '/pricing',
  ];

  // Surfaces that mean the visitor is actually using the product, as opposed to
  // reading about it. Returning to one of these is the "second visit" signal.
  const PRODUCT_PATHS = [
    '/chat',
    '/student-dashboard',
    '/parent-dashboard',
    '/teacher-dashboard',
    '/mastery-chat',
  ];

  function pathStartsWithAny(list) {
    // Pages are served both as /chat and /chat.html, so match on the stem.
    const stem = (window.location.pathname || '/').replace(/\.html$/, '');
    return list.some((p) => stem === p || stem.indexOf(p + '/') === 0);
  }

  function readNumber(key) {
    try {
      const raw = localStorage.getItem(key);
      const n = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  }

  // Don't show if already installed (standalone mode) or recently dismissed
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function wasDismissedRecently() {
    let dismissed = null;
    try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (_) { return false; }
    if (!dismissed) return false;
    return (Date.now() - parseInt(dismissed, 10)) < DISMISS_DURATION;
  }

  /**
   * The visitor has seen the tutor actually tutor. Called from the chat engine
   * when an AI turn lands (public/js/script.js). One reply is enough — that is
   * the moment the product has proved something, and the moment "keep this one
   * tap away" becomes a useful offer rather than an interruption.
   */
  function markValueMoment() {
    try { localStorage.setItem(VALUE_KEY, '1'); } catch (_) { /* storage off */ }
  }

  /** Count one browsing session per product surface, at most once per tab session. */
  function countSession() {
    if (!pathStartsWithAny(PRODUCT_PATHS)) return;
    try {
      if (sessionStorage.getItem(SESSION_COUNTED_KEY)) return;
      sessionStorage.setItem(SESSION_COUNTED_KEY, '1');
      localStorage.setItem(SESSIONS_KEY, String(readNumber(SESSIONS_KEY) + 1));
    } catch (_) { /* storage off — the value-moment path still works */ }
  }

  function hasEarnedTheAsk() {
    let sawValue = false;
    try { sawValue = localStorage.getItem(VALUE_KEY) === '1'; } catch (_) { /* storage off */ }
    return sawValue || readNumber(SESSIONS_KEY) >= 2;
  }

  /** Every reason the banner may not show, in one place. */
  function mayPrompt() {
    if (isStandalone()) return false;
    if (wasDismissedRecently()) return false;
    if (pathStartsWithAny(SUPPRESSED_PATHS)) return false;
    return hasEarnedTheAsk();
  }

  countSession();

  function createInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <div class="pwa-install-content">
        <img src="/images/icon-192x192.png" alt="MATHMATIX" class="pwa-install-icon" width="40" height="40" />
        <div class="pwa-install-text">
          <strong>Get the MATHMATIX app!</strong>
          <span>Add to your home screen for quick access</span>
        </div>
        <div class="pwa-install-actions">
          <button class="pwa-install-btn" id="pwa-install-accept">Install</button>
          <button class="pwa-dismiss-btn" id="pwa-install-dismiss" aria-label="Dismiss">&times;</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { banner.classList.add('pwa-install-visible'); });
    });

    document.getElementById('pwa-install-accept').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      removeBanner();
      if (outcome === 'dismissed') {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
      }
    });

    document.getElementById('pwa-install-dismiss').addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      removeBanner();
    });
  }

  function removeBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
      banner.classList.remove('pwa-install-visible');
      setTimeout(() => banner.remove(), 300);
    }
  }

  // --- iOS Detection & Install Instructions ---
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function createIOSInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML =
      '<div class="pwa-install-content pwa-ios-content">' +
        '<img src="/images/icon-192x192.png" alt="MATHMATIX" class="pwa-install-icon" width="40" height="40" />' +
        '<div class="pwa-install-text">' +
          '<strong>Get the MATHMATIX app!</strong>' +
          '<span class="pwa-ios-steps">' +
            'Tap <svg class="pwa-share-icon" viewBox="0 0 50 50" width="18" height="18" aria-label="Share"><rect x="15" y="20" width="20" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><line x1="25" y1="6" x2="25" y2="30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><polyline points="18,13 25,6 32,13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg> ' +
            'then <strong>"Add to Home Screen"</strong>' +
          '</span>' +
        '</div>' +
        '<button class="pwa-dismiss-btn" id="pwa-install-dismiss" aria-label="Dismiss">&times;</button>' +
      '</div>';
    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('pwa-install-visible'); });
    });

    document.getElementById('pwa-install-dismiss').addEventListener('click', function () {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      removeBanner();
    });
  }

  // Listen for the browser's install prompt (Android / Chrome / Edge)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Hold the event. If the visitor has not earned the ask yet, we simply never
    // call createInstallBanner — the browser keeps the prompt available for a
    // later page load, when countSession()/markValueMoment() have caught up.
    if (mayPrompt()) {
      // Delay showing the banner so it doesn't interrupt initial page load
      setTimeout(createInstallBanner, SHOW_DELAY_MS);
    }
  });

  // If app is installed, clean up
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removeBanner();
  });

  // iOS: show manual install instructions (beforeinstallprompt never fires)
  if (isIOS() && mayPrompt()) {
    // Wait for page to settle before showing
    setTimeout(createIOSInstallBanner, SHOW_DELAY_MS);
  }

  // The chat engine calls this when a tutor reply lands. Exported rather than
  // inferred from the DOM so the signal stays owned by the code that knows what
  // a completed turn is.
  window.MathmatixPWA = { markValueMoment: markValueMoment };
})();
