/* ============================================================
   teacher-school-year.js — the year a teacher is looking at, and the
   once-a-year job of rolling the roster over.

   Server: routes/teacherRoster.js (/api/teacher/roster/*). Archiving is a
   VIEW change — students keep their accounts, history and link; the
   current-year roster, tiles, alerts and recipients stop counting them, and
   anyone who signs in again comes back on their own.

   Surfaces (all self-mounted, no edits to the dashboard's render code):
     • year bar above the stats: "2026-27 ▾" switcher + archived count
     • new-year banner (Aug→Jun, no class for this year, last year's
       students still on the roster) → the 3-step wizard
     • wizard: review who rolls off → create this year's classes → codes
     • archive manager: restore anyone, any time
   Exposes window.TeacherSchoolYear for the dashboard (scope(), currentYear(),
   fillYearSelect()).
   ============================================================ */
(function () {
  'use strict';

  var state = { scope: 'current', info: null, wizard: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') return window.showToast(msg, type);
    var t = document.createElement('div');
    t.className = 'ty-toast ty-toast-' + (type || 'info');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }
  function api(url, opts) {
    var f = typeof window.csrfFetch === 'function' ? window.csrfFetch : fetch;
    return f(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}))
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.message || 'Request failed'); return b; }); });
  }
  function yearLabel(y) { return y ? y.replace('-', '–') : ''; }
  function nextYear(y) {
    var m = /^(\d{4})-/.exec(y || '');
    if (!m) return null;
    var n = Number(m[1]) + 1;
    return n + '-' + String((n + 1) % 100).padStart(2, '0');
  }
  function fmtDate(d) {
    if (!d) return 'never';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---------- year bar ----------
  function mountBar() {
    var anchor = document.getElementById('weekly-comparison');
    if (!anchor || document.getElementById('ty-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'ty-bar';
    bar.className = 'ty-bar';
    anchor.parentNode.insertBefore(bar, anchor);
  }

  function renderBar() {
    var bar = document.getElementById('ty-bar');
    var info = state.info;
    if (!bar || !info) return;
    var archived = info.counts.archived;
    var viewingArchive = state.scope === 'archived';
    var html = '<div class="ty-bar-row">' +
      '<label class="ty-year"><i class="fas fa-calendar-alt" aria-hidden="true"></i>' +
      '<span class="ty-visually-hidden">School year view</span>' +
      '<select id="ty-scope" aria-label="School year view">' +
        '<option value="current"' + (state.scope === 'current' ? ' selected' : '') + '>' + esc(yearLabel(info.currentYear)) + ' · this year (' + info.counts.current + ')</option>' +
        '<option value="archived"' + (viewingArchive ? ' selected' : '') + (archived ? '' : ' disabled') + '>Archived (' + archived + ')</option>' +
        '<option value="all"' + (state.scope === 'all' ? ' selected' : '') + '>Everyone (' + (info.counts.current + archived) + ')</option>' +
      '</select></label>' +
      '<div class="ty-bar-actions">' +
        (info.counts.lastYearCandidates > 0 && !viewingArchive
          ? '<button type="button" class="ty-btn ty-btn-ghost" data-ty="wizard"><i class="fas fa-box-archive" aria-hidden="true"></i> Roll over last year (' + info.counts.lastYearCandidates + ')</button>' : '') +
        (archived ? '<button type="button" class="ty-btn ty-btn-ghost" data-ty="manage"><i class="fas fa-rotate-left" aria-hidden="true"></i> Manage archived</button>' : '') +
      '</div></div>';

    if (info.promptNewYear && !viewingArchive && !sessionDismissed()) {
      html += '<div class="ty-banner" role="region" aria-label="New school year">' +
        '<div class="ty-banner-text"><strong>Welcome to ' + esc(yearLabel(info.currentYear)) + '.</strong> ' +
        info.counts.lastYearCandidates + ' student' + (info.counts.lastYearCandidates === 1 ? ' hasn\'t' : 's haven\'t') +
        ' been active since ' + esc(fmtDate(info.currentYearStartsAt)) + '. Set up this year\'s classes and move last year\'s roster to the archive — nothing is deleted.</div>' +
        '<div class="ty-banner-actions"><button type="button" class="ty-btn ty-btn-primary" data-ty="wizard">Start ' + esc(yearLabel(info.currentYear)) + '</button>' +
        '<button type="button" class="ty-btn ty-btn-link" data-ty="dismiss">Not now</button></div></div>';
    }
    if (viewingArchive) {
      html += '<div class="ty-banner ty-banner-muted" role="status">You\'re viewing archived students. Their history is all here; tiles and alerts reflect this view only. ' +
        '<button type="button" class="ty-btn ty-btn-link" data-ty="back">Back to this year</button></div>';
    }
    bar.innerHTML = html;
    var sel = document.getElementById('ty-scope');
    if (sel) sel.addEventListener('change', function () { setScope(sel.value); });
  }

  function sessionDismissed() {
    try { return sessionStorage.getItem('ty-dismiss-' + (state.info && state.info.currentYear)) === '1'; } catch (e) { return false; }
  }

  function setScope(scope) {
    state.scope = scope;
    try { sessionStorage.setItem('ty-scope', scope); } catch (e) { /* private mode */ }
    renderBar();
    if (window.TeacherDashboard && window.TeacherDashboard.reloadRoster) window.TeacherDashboard.reloadRoster();
  }

  function refresh() {
    return api('/api/teacher/roster/year').then(function (info) {
      state.info = info;
      renderBar();
      return info;
    }).catch(function (err) { console.warn('[SchoolYear] info unavailable:', err.message); });
  }

  // ---------- modal shell ----------
  function openModal(title, bodyHtml, footHtml) {
    closeModal();
    var wrap = document.createElement('div');
    wrap.id = 'ty-modal';
    wrap.className = 'ty-modal-overlay';
    wrap.innerHTML = '<div class="ty-modal" role="dialog" aria-modal="true" aria-labelledby="ty-modal-title">' +
      '<div class="ty-modal-head"><h3 id="ty-modal-title">' + title + '</h3>' +
      '<button type="button" class="ty-close" data-ty="close" aria-label="Close">&times;</button></div>' +
      '<div class="ty-modal-body">' + bodyHtml + '</div>' +
      '<div class="ty-modal-foot">' + (footHtml || '') + '</div></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
    var focusable = wrap.querySelector('input, button.ty-btn-primary, button');
    if (focusable) focusable.focus();
    return wrap;
  }
  function closeModal() {
    var m = document.getElementById('ty-modal');
    if (m) m.remove();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('ty-modal')) closeModal(); });

  // ---------- wizard ----------
  function steps(active) {
    var names = ['Last year\'s students', 'This year\'s classes', 'Share codes'];
    return '<ol class="ty-steps">' + names.map(function (n, i) {
      return '<li class="' + (i === active ? 'is-active' : (i < active ? 'is-done' : '')) + '"' + (i === active ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + n + '</li>';
    }).join('') + '</ol>';
  }

  function startWizard() {
    state.wizard = { candidates: [], keep: 0, created: [] };
    openModal('Start ' + esc(yearLabel(state.info.currentYear)), steps(0) + '<div class="ty-loading">Finding last year\'s students…</div>');
    api('/api/teacher/roster/archive-candidates').then(function (data) {
      state.wizard.candidates = data.students || [];
      state.wizard.keep = data.keep || 0;
      state.wizard.cutoff = data.cutoff;
      wizardStep1();
    }).catch(function (err) { toast(err.message, 'error'); closeModal(); });
  }

  function wizardStep1() {
    var w = state.wizard;
    var list = w.candidates.length
      ? '<div class="ty-checklist-head"><label><input type="checkbox" id="ty-all" checked> Select all (' + w.candidates.length + ')</label></div>' +
        '<ul class="ty-checklist">' + w.candidates.map(function (s) {
          return '<li><label><input type="checkbox" class="ty-pick" value="' + esc(s._id) + '" checked> <span class="ty-name">' + esc(s.name) + '</span>' +
            '<span class="ty-meta">last active ' + esc(fmtDate(s.lastActiveAt)) + '</span></label></li>';
        }).join('') + '</ul>'
      : '<p class="ty-empty">Everyone on your roster has been active since ' + esc(fmtDate(w.cutoff)) + '. Nothing to archive.</p>';
    var body = steps(0) +
      '<p class="ty-lead">These students haven\'t been active since <strong>' + esc(fmtDate(w.cutoff)) + '</strong>. Archive them to start the year with a clean roster. ' +
      '<span class="ty-reassure">Nothing is deleted — their history stays under Archived, you can restore anyone, and a student who signs back in returns automatically.</span></p>' +
      list + (w.keep ? '<p class="ty-keep"><i class="fas fa-user-check" aria-hidden="true"></i> ' + w.keep + ' active student' + (w.keep === 1 ? '' : 's') + ' stay on your roster.</p>' : '');
    var foot = '<button type="button" class="ty-btn ty-btn-link" data-ty="close">Cancel</button>' +
      (w.candidates.length ? '<button type="button" class="ty-btn ty-btn-ghost" data-ty="skip1">Keep everyone</button>' : '') +
      '<button type="button" class="ty-btn ty-btn-primary" data-ty="next1">' + (w.candidates.length ? 'Archive selected & continue' : 'Continue') + '</button>';
    openModal('Start ' + esc(yearLabel(state.info.currentYear)), body, foot);
    var all = document.getElementById('ty-all');
    if (all) all.addEventListener('change', function () {
      document.querySelectorAll('.ty-pick').forEach(function (c) { c.checked = all.checked; });
      syncNext1();
    });
    document.querySelectorAll('.ty-pick').forEach(function (c) { c.addEventListener('change', syncNext1); });
    syncNext1();
  }
  function syncNext1() {
    var n = document.querySelectorAll('.ty-pick:checked').length;
    var btn = document.querySelector('[data-ty="next1"]');
    if (btn) btn.textContent = n ? 'Archive ' + n + ' & continue' : 'Continue';
  }

  function doArchive() {
    var ids = Array.prototype.map.call(document.querySelectorAll('.ty-pick:checked'), function (c) { return c.value; });
    if (!ids.length) return Promise.resolve(0);
    return api('/api/teacher/roster/archive', { method: 'POST', body: JSON.stringify({ studentIds: ids }) })
      .then(function (r) { state.wizard.archived = r.archived; return r.archived; });
  }

  function classRow(i) {
    return '<div class="ty-class-row" data-row="' + i + '">' +
      '<input type="text" class="ty-in ty-cname" placeholder="Class name, e.g. Algebra 1" maxlength="100" aria-label="Class name">' +
      '<input type="text" class="ty-in ty-cperiod" placeholder="Period" maxlength="20" aria-label="Period">' +
      '<select class="ty-in ty-cgrade" aria-label="Grade"><option value="">Grade</option>' +
        ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(function (g) { return '<option value="' + g + '">' + (g === 'K' ? 'K' : g) + '</option>'; }).join('') +
      '</select></div>';
  }

  function wizardStep2() {
    var body = steps(1) +
      (state.wizard.archived ? '<p class="ty-success"><i class="fas fa-check-circle" aria-hidden="true"></i> Archived ' + state.wizard.archived + ' student' + (state.wizard.archived === 1 ? '' : 's') + '.</p>' : '') +
      '<p class="ty-lead">Add the classes you\'re teaching in ' + esc(yearLabel(state.info.currentYear)) + '. Each one gets its own join code.</p>' +
      '<div id="ty-class-rows">' + classRow(0) + '</div>' +
      '<button type="button" class="ty-btn ty-btn-link" data-ty="addrow"><i class="fas fa-plus" aria-hidden="true"></i> Add another class</button>';
    var foot = '<button type="button" class="ty-btn ty-btn-link" data-ty="skip2">Skip for now</button>' +
      '<button type="button" class="ty-btn ty-btn-primary" data-ty="next2">Create classes</button>';
    openModal('Start ' + esc(yearLabel(state.info.currentYear)), body, foot);
    var first = document.querySelector('.ty-cname');
    if (first) first.focus();
  }

  function doCreateClasses() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.ty-class-row'))
      .map(function (r) {
        return { className: r.querySelector('.ty-cname').value.trim(), period: r.querySelector('.ty-cperiod').value.trim(), gradeLevel: r.querySelector('.ty-cgrade').value };
      })
      .filter(function (r) { return r.className; });
    if (!rows.length) { toast('Add a class name, or choose "Skip for now".', 'error'); return Promise.reject(new Error('empty')); }
    var year = state.info.currentYear;
    return rows.reduce(function (p, r) {
      return p.then(function () {
        return api('/api/teacher/classes', { method: 'POST', body: JSON.stringify({ className: r.className, period: r.period || undefined, gradeLevel: r.gradeLevel || undefined, schoolYear: year }) })
          .then(function (res) { state.wizard.created.push(res.class); document.dispatchEvent(new CustomEvent('mm:class-created', { detail: res.class })); });
      });
    }, Promise.resolve());
  }

  function wizardStep3() {
    var created = state.wizard.created;
    var joinBase = window.location.origin + '/signup.html?code=';
    var body = steps(2) + (created.length
      ? '<p class="ty-lead">Share the link (or the code) with each class. The link opens sign-up with the code already filled in.</p>' +
        '<ul class="ty-codes">' + created.map(function (c) {
          return '<li><div><div class="ty-name">' + esc(c.className) + (c.period ? ' · ' + esc(c.period) : '') + '</div>' +
            '<button type="button" class="ty-btn ty-btn-link ty-linkcopy" data-copy="' + esc(joinBase + encodeURIComponent(c.code)) + '"><i class="fas fa-link" aria-hidden="true"></i> Copy join link</button></div>' +
            '<button type="button" class="ty-code" data-copy="' + esc(c.code) + '" aria-label="Copy code ' + esc(c.code) + '">' + esc(c.code) + ' <i class="fas fa-copy" aria-hidden="true"></i></button></li>';
        }).join('') + '</ul>'
      : '<p class="ty-lead">You\'re set. Create classes any time from the Classes tab — each one gets a join code.</p>');
    openModal('You\'re ready for ' + esc(yearLabel(state.info.currentYear)), body,
      '<button type="button" class="ty-btn ty-btn-primary" data-ty="finish">Done</button>');
  }

  // ---------- archive manager ----------
  function openManager() {
    openModal('Archived students', '<div class="ty-loading">Loading…</div>');
    fetch('/api/teacher/students?fields=roster&scope=archived', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (students) {
        students = Array.isArray(students) ? students : [];
        students.sort(function (a, b) { return ((a.firstName || '') + a.lastName).localeCompare((b.firstName || '') + b.lastName); });
        var body = students.length
          ? '<p class="ty-lead">Restore anyone to this year\'s roster. Students who sign in again come back automatically.</p>' +
            '<div class="ty-checklist-head"><label><input type="checkbox" id="ty-all"> Select all (' + students.length + ')</label></div>' +
            '<ul class="ty-checklist">' + students.map(function (s) {
              var name = ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.username;
              var last = s.activity && s.activity.lastActiveAt;
              return '<li><label><input type="checkbox" class="ty-pick" value="' + esc(s._id) + '"> <span class="ty-name">' + esc(name) + '</span>' +
                '<span class="ty-meta">last active ' + esc(fmtDate(last)) + '</span></label></li>';
            }).join('') + '</ul>'
          : '<p class="ty-empty">No archived students.</p>';
        openModal('Archived students', body,
          '<button type="button" class="ty-btn ty-btn-link" data-ty="close">Close</button>' +
          (students.length ? '<button type="button" class="ty-btn ty-btn-primary" data-ty="restore">Restore selected</button>' : ''));
        var all = document.getElementById('ty-all');
        if (all) all.addEventListener('change', function () { document.querySelectorAll('.ty-pick').forEach(function (c) { c.checked = all.checked; }); });
      })
      .catch(function () { toast('Could not load archived students', 'error'); closeModal(); });
  }

  function doRestore() {
    var ids = Array.prototype.map.call(document.querySelectorAll('.ty-pick:checked'), function (c) { return c.value; });
    if (!ids.length) { toast('Choose at least one student.', 'error'); return; }
    api('/api/teacher/roster/restore', { method: 'POST', body: JSON.stringify({ studentIds: ids }) })
      .then(function (r) {
        toast('Restored ' + r.restored + ' student' + (r.restored === 1 ? '' : 's') + '.', 'success');
        closeModal();
        afterRosterChange();
      })
      .catch(function (err) { toast(err.message, 'error'); });
  }

  function afterRosterChange() {
    refresh().then(function () {
      if (window.TeacherDashboard && window.TeacherDashboard.reloadRoster) window.TeacherDashboard.reloadRoster();
    });
  }

  // ---------- one delegated handler ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ty], [data-copy]');
    if (!t) return;
    if (t.hasAttribute('data-copy')) {
      var code = t.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(function () { toast(/^https?:/.test(code) ? 'Join link copied' : 'Copied ' + code, 'success'); })
        .catch(function () { toast('Code: ' + code, 'info'); });
      return;
    }
    var act = t.getAttribute('data-ty');
    var busy = function (on) { t.disabled = on; };
    switch (act) {
      case 'wizard': startWizard(); break;
      case 'manage': openManager(); break;
      case 'close': closeModal(); break;
      case 'back': setScope('current'); break;
      case 'dismiss':
        try { sessionStorage.setItem('ty-dismiss-' + state.info.currentYear, '1'); } catch (err) { /* private mode */ }
        renderBar();
        break;
      case 'skip1': wizardStep2(); break;
      case 'next1':
        busy(true);
        doArchive().then(function () { afterRosterChange(); wizardStep2(); })
          .catch(function (err) { busy(false); toast(err.message, 'error'); });
        break;
      case 'addrow': {
        var rows = document.getElementById('ty-class-rows');
        rows.insertAdjacentHTML('beforeend', classRow(rows.children.length));
        rows.lastElementChild.querySelector('.ty-cname').focus();
        break;
      }
      case 'skip2': wizardStep3(); break;
      case 'next2':
        busy(true);
        doCreateClasses().then(function () { afterRosterChange(); wizardStep3(); })
          .catch(function (err) { busy(false); if (err.message !== 'empty') toast(err.message, 'error'); });
        break;
      case 'finish': closeModal(); break;
      case 'restore': doRestore(); break;
    }
  });

  // ---------- public API ----------
  window.TeacherSchoolYear = {
    scope: function () { return state.scope; },
    currentYear: function () { return state.info && state.info.currentYear; },
    refresh: refresh,
    startWizard: function () { if (state.info) startWizard(); },
    fillYearSelect: function (select) {
      if (!select) return;
      var cur = state.info && state.info.currentYear;
      if (!cur) { select.innerHTML = '<option value="">This year</option>'; return; }
      var nxt = nextYear(cur);
      select.innerHTML = '<option value="' + esc(cur) + '">' + esc(yearLabel(cur)) + '</option>' +
        (nxt ? '<option value="' + esc(nxt) + '">' + esc(yearLabel(nxt)) + '</option>' : '');
      select.value = cur;
    }
  };

  function init() {
    try {
      var saved = sessionStorage.getItem('ty-scope');
      if (saved === 'archived' || saved === 'all') state.scope = saved;
    } catch (e) { /* private mode */ }
    mountBar();
    refresh();
    document.addEventListener('mm:class-created', function () { refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
