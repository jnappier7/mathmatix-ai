/* --- /js/mathDelimiters.js --- */
// public/js/mathDelimiters.js
//
// Pure, dependency-free LaTeX-delimiter protection for the chat renderer.
//
// WHY THIS EXISTS
// The tutor LLM occasionally emits an UNBALANCED math delimiter — e.g. it
// opens `\[` for a display equation but forgets the closing `\]`. A naive
// non-greedy scan (`/\\\[([\s\S]*?)\\\]/`) then bridges from that stray `\[`
// all the way to the NEXT `\]` several paragraphs later, swallowing the whole
// explanation into a single KaTeX block. KaTeX discards whitespace, so the
// student sees prose collapsed into one space-stripped wall:
//   "y=Asin(B(x−C))+DHere'swhateachpartmeans:−Aistheamplitude..."
// (the bullet dashes "- A" even become math minus signs "−A").
//
// THE RULE
// A math block can never span a paragraph break (a blank line). Real math —
// even multi-line `aligned` / `cases` / `matrix` environments — never contains
// a blank line, so terminating a block at the first blank line is safe and
// bounds the blast radius of one missing delimiter to *nothing*: the stray
// opener simply closes itself at the paragraph break and the prose after it is
// left alone for markdown to render normally.
//
// Loaded as a classic <script> (sets window.MathDelimiters) AND require()-able
// in Node for unit tests — same UMD pattern as graphTitleSync.js.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MathDelimiters = api;
})(typeof window !== 'undefined'
  ? window
  : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  // Open the delimiter, then lazily capture until the FIRST of:
  //   - the matching close delimiter (consumed), OR
  //   - a paragraph break / blank line  (NOT consumed — block auto-closes), OR
  //   - end of string.
  // The lazy quantifier + alternation makes the earliest terminator win, so a
  // well-formed block still closes at its real `\]` / `\)` while a stray opener
  // can never reach past a blank line.
  const DISPLAY_RE = /\\\[([\s\S]*?)(?:\\\]|(?=\n[ \t]*\n)|$)/g;
  const INLINE_RE  = /\\\(([\s\S]*?)(?:\\\)|(?=\n[ \t]*\n)|$)/g;

  /**
   * Replace LaTeX delimiters with placeholders so markdown can be parsed
   * without mangling the math. Display blocks are extracted before inline ones
   * so a `\[ ... \]` region is never re-scanned for `\( ... \)`.
   *
   * @param {string} text                    raw message text
   * @param {(index:number)=>string} placeholder  builds the sentinel, e.g.
   *                                          `i => '@@LATEX_BLOCK_' + i + '@@'`
   * @returns {{ text: string, blocks: Array<{math:string, display:boolean}> }}
   */
  function protectMathBlocks(text, placeholder) {
    const blocks = [];
    let out = (text == null) ? '' : String(text);

    out = out.replace(DISPLAY_RE, (_match, math) => {
      const i = blocks.length;
      blocks.push({ math: math.trim(), display: true });
      return placeholder(i);
    });

    out = out.replace(INLINE_RE, (_match, math) => {
      const i = blocks.length;
      blocks.push({ math: math.trim(), display: false });
      return placeholder(i);
    });

    return { text: out, blocks };
  }

  return { protectMathBlocks };
});

;
/* --- /js/logout.js --- */
// public/js/logout.js
document.addEventListener('DOMContentLoaded', () => {
  // Select all logout buttons (by class or by ID)
  const logoutButtons = document.querySelectorAll('.logout-button, #logoutBtn');

  logoutButtons.forEach(logoutBtn => {
    if (logoutBtn) {
      console.log(`LOG: Found logout button with ID: ${logoutBtn.id || logoutBtn.className}`);
      logoutBtn.addEventListener('click', async (event) => {
        event.preventDefault(); // Add this line to explicitly prevent any default behavior just in case
        console.log("LOG: Logout button clicked.");

        // Use session manager if available (handles auto-save and session summary)
        if (window.sessionManager) {
          console.log("LOG: Using session manager for logout.");
          window.sessionManager.triggerLogout();
          return;
        }

        // Fallback to direct logout if session manager not available
        console.log("LOG: Initiating fetch POST to /logout.");
        try {
          const res = await csrfFetch('/logout', {
            method: 'POST',
            credentials: 'include'
          });
          console.log("LOG: Logout fetch response:", res.status, res.statusText);
          if (res.ok) {
            console.log("LOG: Logout successful, redirecting.");
            // Use StorageUtils to safely clear storage (prevents tracking prevention errors)
            if (window.StorageUtils) {
              StorageUtils.local.clear();
              StorageUtils.session.clear();
            }
            // Clear UI language cache so next user gets a clean state
            StorageUtils.local.removeItem('mathmatix_ui_lang');
            window.location.href = '/login.html';
          } else {
            const errorText = await res.text();
            console.error('ERROR: Logout failed on server side:', res.status, errorText);
            alert('Logout failed: ' + errorText);
          }
        } catch (err) {
          console.error('CRITICAL ERROR: Logout fetch error (network/client-side):', err);
          alert('An error occurred while logging out. Please check your internet connection.');
        }
      });
    }
  });
});
;
/* --- /js/role-switcher.js --- */
/**
 * Role Switcher - Enables multi-role users to switch their active dashboard.
 *
 * Looks for #roleSwitcher (container) and #roleSwitcherSelect (dropdown) in the DOM.
 * Fetches the current user's roles from /user and shows the switcher only when
 * the user has more than one role.
 */
(function () {
  const container = document.getElementById('roleSwitcher');
  const select = document.getElementById('roleSwitcherSelect');
  if (!container || !select) return;

  // Inject minimal styles
  const style = document.createElement('style');
  style.textContent = `
    .role-switcher { display: flex; align-items: center; margin-right: 10px; }
    .role-switcher-select {
      padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.15); color: #fff; font-size: 0.85em;
      cursor: pointer; outline: none; font-weight: 500;
    }
    .role-switcher-select:hover { background: rgba(255,255,255,0.25); }
    .role-switcher-select option { color: #333; background: #fff; }
  `;
  document.head.appendChild(style);

  const roleLabels = {
    admin: 'Admin',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student'
  };

  const roleIcons = {
    admin: 'fa-user-shield',
    teacher: 'fa-chalkboard-teacher',
    parent: 'fa-heart',
    student: 'fa-graduation-cap'
  };

  async function init() {
    try {
      const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
      const res = await fetchFn('/api/role-switch/roles', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const roles = data.roles;
      const activeRole = data.activeRole;
      if (!data.isMultiRole) return; // Single-role user, no switcher needed

      // Build options
      select.innerHTML = roles.map(r =>
        `<option value="${r}" ${r === activeRole ? 'selected' : ''}>${roleLabels[r] || r}</option>`
      ).join('');

      container.style.display = 'flex';

      select.addEventListener('change', async () => {
        const newRole = select.value;
        if (!newRole) return;
        select.disabled = true;

        try {
          // Use csrfFetch if available (admin/teacher dashboards), otherwise plain fetch
          const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
          const res = await fetchFn('/api/role-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
          });
          const result = await res.json();
          if (res.ok && result.success && result.redirect) {
            window.location.href = result.redirect;
          } else {
            alert(result.message || 'Failed to switch role.');
            select.disabled = false;
          }
        } catch (err) {
          alert('Failed to switch role. Please try again.');
          select.disabled = false;
        }
      });
    } catch (err) {
      // Silently fail - role switcher is non-critical
      console.error('Role switcher init error:', err);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

;
/* --- /js/idle-dialog.js --- */
/**
 * idle-dialog.js — the session-timeout dialog, as a real dialog.
 *
 * The idle warning used to be a native confirm() ("⚠️ Inactivity Detected …
 * Click OK to stay logged in, or Cancel to logout now") and the timeout notice
 * a native alert(). Both look like a browser error on an otherwise fully
 * styled product, and both are BLOCKING: confirm() freezes the event loop, so
 * the countdown the copy promises cannot tick, and a student who walks away
 * comes back to a frozen page whose logout fires the instant they dismiss it.
 *
 * This is the shared replacement. Two callers use it — auto-logout.js (the
 * 30-minute timer, the one chat runs) and sessionManager.js (the 20-minute
 * timer on pages auto-logout is not loaded on) — so the same event never shows
 * a student two different dialogs.
 *
 * Self-contained on purpose: it injects its own stylesheet and depends on no
 * page CSS, because it has to render identically on the seven pages that load
 * design-system.css and the eight that don't. Where the --cr-* tokens DO
 * exist it adopts them, so it follows the page's theme instead of fighting it.
 *
 *   MMIdleDialog.warn({ msRemaining, onStay, onSignOut })  -> live countdown
 *   MMIdleDialog.notice({ title, body, actionLabel, onAction, autoMs })
 *   MMIdleDialog.close()
 */
(function (root) {
  'use strict';

  var STYLE_ID = 'mm-idle-dialog-css';
  var CSS = [
    '.mm-idle{',
    // Adopt the page's design tokens when it has them; the fallbacks are the
    // light palette, which is what the token-less pages render in.
    '  --mmi-panel: var(--cr-bg-panel, #ffffff);',
    '  --mmi-ink: var(--cr-text, #18202b);',
    '  --mmi-dim: var(--cr-text-dim, #5b6876);',
    '  --mmi-accent: var(--cr-accent, #6c5ce7);',
    '  --mmi-accent-strong: var(--cr-accent-strong, #4d3dd1);',
    '  --mmi-warn: var(--cr-warning, #d97706);',
    '  --mmi-border: var(--cr-border-strong, rgba(16,24,40,.12));',
    '  position: fixed; inset: 0; z-index: 2147483000;',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px;',
    '  background: rgba(11,15,26,.55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  animation: mm-idle-fade .18s ease both;',
    '}',
    '@keyframes mm-idle-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes mm-idle-rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
    '.mm-idle-card{',
    '  width: 100%; max-width: 420px; box-sizing: border-box;',
    '  background: var(--mmi-panel); color: var(--mmi-ink);',
    '  border: 1px solid var(--mmi-border); border-radius: 18px;',
    '  padding: 26px 26px 22px; text-align: center;',
    '  box-shadow: 0 18px 48px rgba(0,0,0,.28);',
    '  animation: mm-idle-rise .22s cubic-bezier(.2,1,.3,1) both;',
    '}',
    '.mm-idle-ic{',
    '  width: 46px; height: 46px; margin: 0 auto 14px; border-radius: 50%;',
    '  display: flex; align-items: center; justify-content: center; font-size: 22px;',
    '  background: color-mix(in srgb, var(--mmi-warn) 16%, transparent);',
    '}',
    '.mm-idle-t{ margin: 0 0 8px; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }',
    '.mm-idle-b{ margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--mmi-dim); }',
    '.mm-idle-count{',
    '  display: block; margin: 16px auto 4px;',
    '  font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums;',
    '  color: var(--mmi-ink); letter-spacing: .01em;',
    '}',
    '.mm-idle-acts{ display: flex; flex-direction: column; gap: 9px; margin-top: 20px; }',
    '.mm-idle-btn{',
    '  width: 100%; padding: 12px 18px; border-radius: 12px; cursor: pointer;',
    '  font: 600 14.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  border: 1px solid transparent; transition: filter .15s ease, background .15s ease;',
    '}',
    '.mm-idle-btn:focus-visible{ outline: 2px solid var(--mmi-accent); outline-offset: 2px; }',
    '.mm-idle-btn.is-primary{ background: var(--mmi-accent); color: #fff; }',
    '.mm-idle-btn.is-primary:hover{ background: var(--mmi-accent-strong); }',
    '.mm-idle-btn.is-ghost{ background: transparent; color: var(--mmi-dim); border-color: var(--mmi-border); }',
    '.mm-idle-btn.is-ghost:hover{ color: var(--mmi-ink); background: color-mix(in srgb, var(--mmi-ink) 6%, transparent); }',
    '.mm-idle-sr{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }',
    '@media (prefers-reduced-motion: reduce){ .mm-idle, .mm-idle-card{ animation: none; } }',
    '@media (max-width: 420px){ .mm-idle-card{ padding: 22px 18px 18px; } .mm-idle-count{ font-size: 26px; } }',
  ].join('\n');

  function injectCss(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  var open = null;   // { el, tick, restoreFocus, onEscape }

  function close() {
    if (!open) return;
    if (open.tick) clearInterval(open.tick);
    if (open.autoTimer) clearTimeout(open.autoTimer);
    document.removeEventListener('keydown', open.onKeydown, true);
    if (open.el.parentNode) open.el.parentNode.removeChild(open.el);
    var restore = open.restoreFocus;
    open = null;
    // Give focus back to whatever the student was on, so a keyboard user is
    // not dumped at the top of the document.
    try { if (restore && restore.focus) restore.focus(); } catch (_) { /* gone */ }
  }

  function mmss(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Build the shell. `buttons` is [{ label, kind, onClick }] in visual order;
   * the first is the one focus lands on, so it must always be the safe choice.
   */
  function build(opts) {
    close();
    var doc = document;
    injectCss(doc);

    var el = doc.createElement('div');
    el.className = 'mm-idle';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mm-idle-t');
    el.setAttribute('aria-describedby', 'mm-idle-b');

    var card = doc.createElement('div');
    card.className = 'mm-idle-card';

    var ic = doc.createElement('div');
    ic.className = 'mm-idle-ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = opts.icon || '⏳';

    var h = doc.createElement('h2');
    h.className = 'mm-idle-t'; h.id = 'mm-idle-t';
    h.textContent = opts.title;

    var p = doc.createElement('p');
    p.className = 'mm-idle-b'; p.id = 'mm-idle-b';
    p.textContent = opts.body;

    card.appendChild(ic); card.appendChild(h); card.appendChild(p);

    var count = null;
    var live = null;
    if (opts.countdown) {
      count = doc.createElement('strong');
      count.className = 'mm-idle-count';
      // The seconds tick once a second — announcing that would flood a screen
      // reader. The visual number is hidden from AT and a polite region below
      // carries the same information at whole-minute granularity instead.
      count.setAttribute('aria-hidden', 'true');
      live = doc.createElement('span');
      live.className = 'mm-idle-sr';
      live.setAttribute('aria-live', 'polite');
      card.appendChild(count); card.appendChild(live);
    }

    var acts = doc.createElement('div');
    acts.className = 'mm-idle-acts';
    var first = null;
    (opts.buttons || []).forEach(function (b) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-idle-btn is-' + (b.kind || 'ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function (ev) {
        // Never let the click reach the document-level activity listeners that
        // reset the very timer this dialog is asking about — the caller
        // decides what the answer means, not the click.
        ev.stopPropagation();
        var fn = b.onClick;
        close();
        if (fn) fn();
      });
      acts.appendChild(btn);
      if (!first) first = btn;
    });
    card.appendChild(acts);
    el.appendChild(card);

    // The scrim swallows clicks: dismissing by missing the card is not an
    // answer to "are you still there?".
    el.addEventListener('click', function (ev) { ev.stopPropagation(); });

    open = {
      el: el,
      restoreFocus: doc.activeElement,
      count: count,
      live: live,
      onKeydown: function (ev) {
        if (!open) return;
        if (ev.key === 'Escape') {
          // Escape takes the safe branch (stay signed in), never the
          // destructive one.
          ev.preventDefault(); ev.stopPropagation();
          if (first) first.click();
          return;
        }
        if (ev.key !== 'Tab') return;
        // Trap focus: the dialog is the only thing on the page that matters.
        var f = el.querySelectorAll('button');
        if (!f.length) return;
        var lo = f[0], hi = f[f.length - 1];
        if (ev.shiftKey && doc.activeElement === lo) { ev.preventDefault(); hi.focus(); }
        else if (!ev.shiftKey && doc.activeElement === hi) { ev.preventDefault(); lo.focus(); }
      },
    };

    doc.addEventListener('keydown', open.onKeydown, true);
    (doc.body || doc.documentElement).appendChild(el);
    if (first) first.focus();
    return open;
  }

  var api = {
    /**
     * The idle warning, with a countdown that actually counts down.
     * `msRemaining` is re-read from `getRemaining()` every second when the
     * caller supplies one, so the number stays honest if the page was
     * throttled in a background tab.
     */
    warn: function (opts) {
      opts = opts || {};
      var getRemaining = opts.getRemaining || function () { return opts.msRemaining || 0; };
      var state = build({
        icon: '⏳',
        title: opts.title || 'Still there?',
        body: opts.body || 'You’ve been idle for a while, so we’ll sign you out to keep your account safe.',
        countdown: true,
        buttons: [
          { label: opts.stayLabel || 'I’m still here', kind: 'primary', onClick: opts.onStay },
          { label: opts.signOutLabel || 'Sign out now', kind: 'ghost', onClick: opts.onSignOut },
        ],
      });

      var lastMinute = -1;
      function paint() {
        if (!open || open !== state) return;
        var ms = getRemaining();
        state.count.textContent = mmss(ms);
        var mins = Math.ceil(ms / 60000);
        if (mins !== lastMinute) {
          lastMinute = mins;
          state.live.textContent = mins > 1
            ? 'Signing out in about ' + mins + ' minutes.'
            : 'Signing out in less than a minute.';
        }
        if (ms <= 0) { clearInterval(state.tick); state.tick = null; }
      }
      paint();
      state.tick = setInterval(paint, 1000);
      return state;
    },

    /** A one-button notice — what alert() was doing, without blocking. */
    notice: function (opts) {
      opts = opts || {};
      var state = build({
        icon: opts.icon || '👋',
        title: opts.title || 'You’ve been signed out',
        body: opts.body || 'We signed you out after a long stretch of inactivity.',
        buttons: [{ label: opts.actionLabel || 'Sign in again', kind: 'primary', onClick: opts.onAction }],
      });
      // Don't strand someone who never clicks — the page behind them is dead.
      if (opts.autoMs && opts.onAction) {
        state.autoTimer = setTimeout(function () { close(); opts.onAction(); }, opts.autoMs);
      }
      return state;
    },

    close: close,
    isOpen: function () { return !!open; },
  };

  root.MMIdleDialog = api;
})(window);

;
/* --- /js/auto-logout.js --- */
/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in two scenarios:
 * 1. Inactivity timeout (30 minutes default)
 * 2. Manual logout button (handled elsewhere)
 *
 * The idle timeout continues to count even when the tab is hidden/minimized.
 * When the tab becomes visible again, we check if the timeout has already
 * elapsed and immediately log out if so.
 *
 * The warning and the timed-out notice render through MMIdleDialog
 * (js/idle-dialog.js), NOT confirm()/alert(). Beyond looking like the product,
 * that matters behaviourally: confirm() blocks the event loop, so the "2
 * minutes" the copy promised could never tick down, and the logout timer fired
 * the instant a returning student dismissed it. The styled dialog is
 * non-blocking, so the countdown is real and the grace period is real.
 */

(function() {
  'use strict';

  // Configuration
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout
  const SESSION_KEY = 'mathmatix_tab_session_active';

  let inactivityTimer = null;
  let warningTimer = null;
  let warningShown = false;
  let lastActivityTime = Date.now(); // Track the actual wall-clock time of last activity

  /**
   * Perform logout - destroys server session via the CSRF-exempt endpoint
   */
  function performLogout() {
    // Clear ALL session storage (including tab session flag)
    if (window.StorageUtils) {
      StorageUtils.session.clear();
    } else {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
      }
    }

    // Clear UI language cache so next user on shared device gets a clean state.
    // Guarded like the block above it: this line was bare, so on any page that
    // ever loads auto-logout.js without storage-utils.js it throws a
    // ReferenceError, the rest of performLogout never runs, and the timeout
    // silently does nothing at all — no beacon, no redirect. Every page
    // currently loads both; this just stops that being load-bearing.
    if (window.StorageUtils) StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Use the CSRF-exempt /api/session/end endpoint (sendBeacon can't send CSRF headers).
    // This endpoint destroys the express session on the server side.
    const payload = JSON.stringify({ reason: 'auto_logout', destroySession: true });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/session/end', blob);
  }

  /**
   * Log out and tell the student why, without a blocking alert() sitting
   * between them and the login page.
   */
  function logoutWithNotice() {
    performLogout();
    const go = () => { window.location.href = '/login.html'; };
    if (!window.MMIdleDialog) { go(); return; }
    window.MMIdleDialog.notice({
      title: 'You’ve been signed out',
      body: 'We signed you out after a long stretch of inactivity. Your work is saved.',
      actionLabel: 'Sign in again',
      onAction: go,
      autoMs: 8000,
    });
  }

  /**
   * Show inactivity warning.
   *
   * While it is up, `resetInactivityTimer` ignores activity events — answering
   * "are you still there?" is what the buttons are for. The native confirm()
   * this replaced got that for free by freezing the event loop; without the
   * guard, any stray click would silently re-arm the timer and leave the
   * dialog on screen with nothing behind it.
   */
  function showInactivityWarning() {
    if (warningShown) return;
    warningShown = true;

    const deadline = lastActivityTime + INACTIVITY_TIMEOUT;

    const stay = () => {
      warningShown = false;          // must clear BEFORE the reset guard runs
      lastActivityTime = Date.now();
      resetInactivityTimer();
    };
    const signOut = () => {
      performLogout();
      window.location.href = '/login.html';
    };

    if (!window.MMIdleDialog) {
      // idle-dialog.js missing (page didn't load it) — keep the old prompt
      // rather than silently dropping the warning entirely.
      const mins = Math.ceil(WARNING_BEFORE_LOGOUT / 60000);
      if (confirm(`You will be signed out in ${mins} minutes due to inactivity.\n\nOK to stay signed in, Cancel to sign out now.`)) stay();
      else signOut();
      return;
    }

    window.MMIdleDialog.warn({
      // Read the deadline live so the number stays honest even if the tab was
      // throttled while hidden.
      getRemaining: () => deadline - Date.now(),
      onStay: stay,
      onSignOut: signOut,
    });
  }

  /**
   * Reset inactivity timer
   */
  function resetInactivityTimer() {
    // The warning dialog is a question. Until it is answered, a stray click or
    // keypress must not answer it for the student.
    if (warningShown) return;

    // Clear existing timers
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    warningShown = false;
    lastActivityTime = Date.now();

    // Set warning timer (fires before logout)
    warningTimer = setTimeout(() => {
      showInactivityWarning();
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

    // Set logout timer (fires after full timeout)
    inactivityTimer = setTimeout(() => {
      console.log('[Auto-Logout] Session timed out due to inactivity');
      logoutWithNotice();
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Mark tab session as active (set on every protected page load)
   */
  function activateTabSession() {
    if (window.StorageUtils) {
      StorageUtils.session.setItem(SESSION_KEY, 'true');
    } else {
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch (e) {
        console.warn('[Auto-Logout] Could not set sessionStorage:', e);
      }
    }
    console.log('[Auto-Logout] Tab session activated');
  }

  /**
   * Initialize auto-logout
   */
  function initialize() {
    // Skip if on login/signup pages (user not authenticated yet)
    const publicPages = ['/login.html', '/signup.html', '/index.html', '/privacy.html', '/terms.html'];
    const currentPage = window.location.pathname;

    if (publicPages.some(page => currentPage.endsWith(page))) {
      console.log('[Auto-Logout] Skipping - public page');
      return;
    }

    // Activate tab session (set flag in sessionStorage)
    activateTabSession();

    console.log('[Auto-Logout] Initialized with inactivity timeout');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. VISIBILITY CHANGE - check elapsed idle time when tab becomes visible again.
    // Timers are NOT paused when the tab is hidden; they continue running.
    // However, browsers may throttle setTimeout in background tabs, so when the
    // tab becomes visible we check if the timeout has already elapsed.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Tab just became visible - check how long user was actually idle
        const idleMs = Date.now() - lastActivityTime;

        if (idleMs >= INACTIVITY_TIMEOUT) {
          // Already past timeout - log out immediately
          console.log('[Auto-Logout] Tab returned after idle timeout elapsed');
          performLogout();
          window.location.href = '/login.html';
        } else if (idleMs >= INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT) {
          // In the warning window - show warning and restart timer for remaining time
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (warningTimer) clearTimeout(warningTimer);

          const remaining = INACTIVITY_TIMEOUT - idleMs;
          inactivityTimer = setTimeout(() => {
            console.log('[Auto-Logout] Session timed out due to inactivity');
            logoutWithNotice();
          }, remaining);

          showInactivityWarning();
        }
        // If less than warning threshold, timers are still running correctly
      }
    });

    // 3. STORAGE EVENT (for cross-tab logout sync)
    // If user logs out in one tab, logout in all tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'logout-event') {
        console.log('[Auto-Logout] Logout detected in another tab');
        // Clear all session data
        if (window.StorageUtils) {
          StorageUtils.session.clear();
        } else {
          try {
            sessionStorage.clear();
          } catch (e) {
            console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
          }
        }
        window.location.href = '/login.html';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose logout function globally for manual logout buttons
  window.triggerLogout = function() {
    // Set storage event to logout all tabs
    if (window.StorageUtils) {
      StorageUtils.local.setItem('logout-event', Date.now().toString());
      StorageUtils.local.removeItem('logout-event'); // Clean up
    } else {
      try {
        localStorage.setItem('logout-event', Date.now().toString());
        localStorage.removeItem('logout-event'); // Clean up
      } catch (e) {
        console.warn('[Auto-Logout] Could not access localStorage for cross-tab logout:', e);
      }
    }

    performLogout(); // This clears sessionStorage
    window.location.href = '/login.html';
  };

  // Expose session activation for login page
  window.activateTabSession = activateTabSession;

})();
