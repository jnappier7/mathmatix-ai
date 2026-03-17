/**
 * Analytics loader — Google Analytics 4 + Facebook Pixel
 *
 * Reads config from window.__ANALYTICS (injected by server middleware)
 * or from data attributes on the script tag.
 *
 * Usage: <script src="/js/analytics.js" data-ga="G-XXXXXXXXXX" data-fbp="XXXXXXXXXXXXXXX"></script>
 * Or set window.__ANALYTICS = { ga: 'G-XXXXXXXXXX', fbp: 'XXXXXXXXXXXXXXX' } before loading.
 */
(function() {
  'use strict';

  // Read config from script tag data attributes or window.__ANALYTICS
  var script = document.currentScript;
  var config = window.__ANALYTICS || {};
  var gaId = config.ga || (script && script.getAttribute('data-ga')) || '';
  var fbpId = config.fbp || (script && script.getAttribute('data-fbp')) || '';

  // ── Google Analytics 4 ──────────────────────────────────
  if (gaId) {
    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId;
    document.head.appendChild(gaScript);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', gaId, {
      send_page_view: true,
      cookie_flags: 'SameSite=Lax;Secure'
    });

    // Track key conversion events
    document.addEventListener('DOMContentLoaded', function() {
      // Track signup form submission
      var signupForm = document.getElementById('signupForm');
      if (signupForm) {
        signupForm.addEventListener('submit', function() {
          gtag('event', 'sign_up', { method: 'email' });
        });
      }

      // Track CTA clicks
      document.querySelectorAll('a[href="/signup.html"], a[href="/pricing.html"]').forEach(function(link) {
        link.addEventListener('click', function() {
          gtag('event', 'click', {
            event_category: 'CTA',
            event_label: link.href.includes('pricing') ? 'view_pricing' : 'signup_click',
            value: link.closest('.lp-hero') ? 'hero' : 'page'
          });
        });
      });

      // Track demo link clicks
      document.querySelectorAll('a[href="/demo.html"]').forEach(function(link) {
        link.addEventListener('click', function() {
          gtag('event', 'click', { event_category: 'CTA', event_label: 'try_demo' });
        });
      });
    });
  }

  // ── Facebook Pixel ──────────────────────────────────────
  if (fbpId) {
    !function(f,b,e,v,n,t,s) {
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', fbpId);
    fbq('track', 'PageView');

    // Track signup as Lead event
    document.addEventListener('DOMContentLoaded', function() {
      var signupForm = document.getElementById('signupForm');
      if (signupForm) {
        signupForm.addEventListener('submit', function() {
          fbq('track', 'Lead', { content_name: 'signup' });
          fbq('track', 'CompleteRegistration');
        });
      }
    });
  }

  // ── Simple error tracking (logs to console + sends to /api/client-errors) ──
  window.addEventListener('error', function(e) {
    var payload = {
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };
    // Send to server endpoint (fire-and-forget)
    try {
      navigator.sendBeacon('/api/client-errors', JSON.stringify(payload));
    } catch(err) { /* silently fail */ }
  });
})();
