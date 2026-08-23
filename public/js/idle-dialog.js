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
