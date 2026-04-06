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
  let deferredPrompt = null;
  const DISMISS_KEY = 'mathmatix-pwa-dismiss';
  const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Don't show if already installed (standalone mode) or recently dismissed
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function wasDismissedRecently() {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    return (Date.now() - parseInt(dismissed, 10)) < DISMISS_DURATION;
  }

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

  // Listen for the browser's install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isStandalone() && !wasDismissedRecently()) {
      // Delay showing the banner so it doesn't interrupt initial page load
      setTimeout(createInstallBanner, 3000);
    }
  });

  // If app is installed, clean up
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removeBanner();
  });
})();
