// public/js/surface-toggle.js
// Wires the in-header glyphs that switch a user between the voice orb
// surface (/voice-tutor.html) and the text bubble surface (/chat.html).
//
// Server-side: POST /api/surface { value } sets the cookie and returns
// the URL to navigate to. The client just follows the redirect.
//
// The button on chat.html (#surface-toggle-voice) takes the user TO voice.
// The button on voice-tutor.html (#surface-toggle-text) takes them TO text.
//
// Free users CAN flip to the voice surface — the visual experience loads
// either way. The actual paywall fires only when they try to open the
// voice WebSocket (utils/voiceUpgrade.js, PR #985), so we don't need to
// disable the toggle for unentitled users here.

(function () {
  function bind(buttonId, targetSurface) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        const fetchFn = typeof window.csrfFetch === 'function' ? window.csrfFetch : window.fetch;
        const res = await fetchFn('/api/surface', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: targetSurface }),
          credentials: 'same-origin',
        });

        if (!res.ok) {
          // 4xx (validation), 5xx (server). Let the user retry.
          console.warn('[surface-toggle] /api/surface returned', res.status);
          btn.disabled = false;
          return;
        }

        const data = await res.json();
        if (data && typeof data.redirect === 'string') {
          window.location.assign(data.redirect);
        } else {
          btn.disabled = false;
        }
      } catch (err) {
        console.error('[surface-toggle] request failed', err);
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    bind('surface-toggle-voice', 'voice'); // chat.html → voice
    bind('surface-toggle-text', 'text');   // voice-tutor.html → text
  }
})();
