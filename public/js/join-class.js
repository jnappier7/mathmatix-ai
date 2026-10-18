/* ============================================================
   join-class.js — a student enters a teacher's class code from chat.

   Before: the only places were the sign-up form and a card on
   student-dashboard.html, which nothing in the (redesigned) chat links to —
   so a student who already had an account couldn't join a new teacher's
   class. Now:
     • More menu → "Join a class" opens this dialog;
     • a teacher's link (/join/CODE, config/routes.js) lands here with the
       code ready (?join=CODE, or the mm_join_code cookie after sign-up/login).
   Two steps on purpose: look the code up first (whose class is it?), then
   join — so a mistyped code never silently joins the wrong class.
   API: GET /api/student/preview-class/:code, POST /api/student/join-class.
   ============================================================ */
(function () {
  'use strict';

  var CODE_RE = /^[A-Z0-9-]{3,24}$/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(code) { return String(code || '').trim().toUpperCase().replace(/\s+/g, ''); }
  function api(url, opts) {
    var f = typeof window.csrfFetch === 'function' ? window.csrfFetch : fetch;
    return f(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { b.__status = r.status; return b; }); });
  }

  function takePendingCode() {
    var fromUrl = new URLSearchParams(window.location.search).get('join');
    var m = document.cookie.match(/(?:^|;\s*)mm_join_code=([^;]+)/);
    var fromCookie = m ? decodeURIComponent(m[1]) : null;
    // Clear both so a refresh doesn't re-open the dialog.
    if (fromCookie) document.cookie = 'mm_join_code=; Max-Age=0; path=/; SameSite=Lax';
    if (fromUrl) {
      var u = new URL(window.location.href);
      u.searchParams.delete('join');
      window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    }
    var code = clean(fromUrl || fromCookie);
    return CODE_RE.test(code) ? code : null;
  }

  function close() { var d = document.getElementById('jc-dialog'); if (d) d.remove(); }

  function open(prefill) {
    close();
    var w = document.createElement('div');
    w.id = 'jc-dialog';
    w.className = 'jc-overlay';
    w.innerHTML = '<div class="jc-box" role="dialog" aria-modal="true" aria-labelledby="jc-h">' +
      '<button type="button" class="jc-x" data-jc="close" aria-label="Close">&times;</button>' +
      '<h2 id="jc-h">Join a class</h2>' +
      '<p class="jc-sub">Enter the class code your teacher gave you. Your teacher will see your progress, and your tutor will follow their class settings.</p>' +
      '<form class="jc-row" id="jc-form" autocomplete="off">' +
        '<label class="jc-sr" for="jc-code">Class code</label>' +
        '<input id="jc-code" class="jc-input" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="e.g. ALGE-3F13B0" value="' + esc(prefill || '') + '">' +
        '<button type="submit" class="jc-btn jc-primary" id="jc-look">Find class</button>' +
      '</form>' +
      '<div id="jc-result" aria-live="polite"></div>' +
    '</div>';
    document.body.appendChild(w);
    var input = w.querySelector('#jc-code');
    input.focus();
    w.addEventListener('click', function (e) {
      if (e.target === w || e.target.closest('[data-jc="close"]')) close();
      var join = e.target.closest('[data-jc="join"]');
      if (join) doJoin(join.getAttribute('data-code'), join);
    });
    w.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    w.querySelector('#jc-form').addEventListener('submit', function (e) { e.preventDefault(); lookup(input.value); });
    if (prefill) lookup(prefill);
  }

  function show(html) { var r = document.getElementById('jc-result'); if (r) r.innerHTML = html; }

  function lookup(raw) {
    var code = clean(raw);
    if (!CODE_RE.test(code)) return show('<p class="jc-err">That doesn\'t look like a class code — check the letters and numbers your teacher gave you.</p>');
    show('<p class="jc-muted">Looking it up…</p>');
    api('/api/student/preview-class/' + encodeURIComponent(code)).then(function (b) {
      if (b.__status === 403) return show('<p class="jc-err">Only student accounts can join a class.</p>');
      if (!b.success) return show('<p class="jc-err">' + esc(b.message || 'We couldn\'t find that class.') + '</p>');
      var who = esc(b.className || 'Class') + (b.teacherName ? ' <span class="jc-muted">with ' + esc(b.teacherName) + '</span>' : '');
      if (b.alreadyEnrolled) return show('<div class="jc-card jc-ok"><i class="fas fa-circle-check" aria-hidden="true"></i><div><strong>You\'re already in ' + who + '.</strong></div></div>');
      show('<div class="jc-card"><div><div class="jc-class">' + who + '</div>' +
        (b.mathCourse ? '<div class="jc-muted">' + esc(b.mathCourse) + '</div>' : '') + '</div>' +
        '<button type="button" class="jc-btn jc-primary" data-jc="join" data-code="' + esc(code) + '">Join this class</button></div>');
    }).catch(function () { show('<p class="jc-err">Couldn\'t reach the server. Try again in a moment.</p>'); });
  }

  function doJoin(code, btn) {
    btn.disabled = true;
    api('/api/student/join-class', { method: 'POST', body: JSON.stringify({ code: code }) }).then(function (b) {
      if (!b.success) { btn.disabled = false; return show('<p class="jc-err">' + esc(b.message || 'Couldn\'t join that class.') + '</p>'); }
      show('<div class="jc-card jc-ok"><i class="fas fa-circle-check" aria-hidden="true"></i><div><strong>' + esc(b.message || 'You\'re in!') + '</strong>' +
        (b.teacherName ? '<div class="jc-muted">' + esc(b.teacherName) + ' can now see your progress and send you assignments.</div>' : '') + '</div></div>' +
        '<div class="jc-actions"><button type="button" class="jc-btn jc-primary" data-jc="close">Back to my tutor</button></div>');
      // Assignments from the new class should appear without a reload.
      document.dispatchEvent(new CustomEvent('mm:class-joined', { detail: b }));
    }).catch(function () { btn.disabled = false; show('<p class="jc-err">Couldn\'t reach the server. Try again in a moment.</p>'); });
  }

  function init() {
    var trigger = document.getElementById('open-join-class-btn');
    if (trigger) trigger.addEventListener('click', function () { open(''); });
    var pending = takePendingCode();
    // Let the greeting and onboarding cards settle first.
    if (pending) setTimeout(function () { open(pending); }, 900);
  }

  window.MathmatixJoinClass = { open: open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
