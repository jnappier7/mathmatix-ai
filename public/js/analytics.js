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

  // Captured at parse time: billing.js calls history.replaceState() to strip
  // the Stripe redirect params as soon as its (deferred) module runs, and this
  // classic script is the only code guaranteed to see them first.
  var pageSearch = window.location.search;

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

    var gaConfig = {
      send_page_view: true,
      cookie_flags: 'SameSite=Lax;Secure'
    };

    // SSO logins (Google / Microsoft / Clever) bounce through the provider's
    // consent screen and back, so GA sees the provider as the referrer —
    // splitting one visit into two sessions and crediting the provider as a
    // traffic source. ignore_referrer suppresses that. Client-side twin of
    // GA admin's "List unwanted referrals"; keep both in sync.
    var SSO_HOSTS = ['accounts.google.com', 'login.microsoftonline.com', 'clever.com'];
    try {
      var refHost = document.referrer ? new URL(document.referrer).hostname : '';
      for (var h = 0; h < SSO_HOSTS.length; h++) {
        if (refHost === SSO_HOSTS[h] || refHost.slice(-(SSO_HOSTS[h].length + 1)) === '.' + SSO_HOSTS[h]) {
          gaConfig.ignore_referrer = true;
          break;
        }
      }
    } catch (e) { /* no URL() support — leave referrer attribution as-is */ }

    gtag('config', gaId, gaConfig);

    // Completed-signup event. The server drops a short-lived mm_signup_method
    // cookie only when an account is actually created (email form, Google,
    // Microsoft or Clever — see config/routes.js / routes/signup.js); the
    // first tagged page after the redirect fires sign_up with the real
    // method, then clears the cookie so each account counts exactly once.
    // This replaces the old signup-form submit listener, which counted
    // attempts (including rejected ones) and missed every SSO signup.
    var signupMethod = (document.cookie.match(/(?:^|;\s*)mm_signup_method=([a-z]+)/) || [])[1];
    if (signupMethod) {
      gtag('event', 'sign_up', { method: signupMethod });
      document.cookie = 'mm_signup_method=; Max-Age=0; path=/';
    }

    // Stripe checkout returns to chat.html?upgraded=true&session_id=…&pack=…
    // &value=… (routes/billing.js). transaction_id = the Stripe checkout
    // session id, so GA dedupes a replayed URL server-side too.
    try {
      var qp = new URLSearchParams(pageSearch);
      if (qp.get('upgraded') === 'true' && qp.get('session_id')) {
        var purchase = { transaction_id: qp.get('session_id'), currency: 'USD' };
        var amount = parseFloat(qp.get('value'));
        if (!isNaN(amount)) purchase.value = amount;
        if (qp.get('pack')) {
          purchase.items = [{ item_id: qp.get('pack'), item_name: qp.get('pack'), quantity: 1 }];
        }
        gtag('event', 'purchase', purchase);
      }
    } catch (e2) { /* no URLSearchParams — skip purchase tracking */ }

    // Track key conversion events
    document.addEventListener('DOMContentLoaded', function() {
      // (Signup tracking moved to the mm_signup_method cookie above —
      // form-submit fired on attempts, not created accounts.)

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
