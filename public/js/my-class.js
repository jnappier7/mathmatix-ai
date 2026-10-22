/* ============================================================
   my-class.js — "My Class" on the student chat screen.

   Everything tied to a student's class lived in different corners (a Join
   banner only while a game is open, an Assignments item only once something
   is assigned, the class AI settings nowhere) — so "how do I get to my
   classroom?" had no answer. This panel is that answer: one place, from the
   More menu, with each class the student is in:
     • who and when (teacher, period),
     • Live now — a Join button when the teacher is hosting a Two-Minute
       Drill for this class (GET /api/live-drill/mine),
     • Assignments — Class Activities and practice tests, with progress
       (GET /api/activities/mine),
     • Practice — the course's solo drills (/drill/<hub>; the server matches
       the class to its hub in GET /api/student/my-classes).
   A student in no class gets the Join-a-class dialog (js/join-class.js).
   Standalone deferred script, not in the chat bundles — no build step.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function get(url) {
    return fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function dueText(d) {
    if (!d) return '';
    var due = new Date(d);
    if (isNaN(due)) return '';
    var days = Math.ceil((due - Date.now()) / 86400000);
    var when = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (days < 0) return 'was due ' + when;
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
    return 'due ' + when;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    var d = document.getElementById('mc-dialog');
    if (d) d.remove();
    document.removeEventListener('keydown', onKey);
  }

  function open() {
    close();
    var w = document.createElement('div');
    w.id = 'mc-dialog';
    w.className = 'mc-overlay';
    w.innerHTML = '<div class="mc-box" role="dialog" aria-modal="true" aria-labelledby="mc-h">' +
      '<button type="button" class="mc-x" data-mc="close" aria-label="Close">&times;</button>' +
      '<h2 id="mc-h">My Class</h2>' +
      '<div id="mc-body" aria-live="polite"><p class="mc-muted">Loading…</p></div>' +
    '</div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (e) {
      if (e.target === w || e.target.closest('[data-mc="close"]')) close();
      if (e.target.closest('[data-mc="join"]')) { close(); if (window.MathmatixJoinClass) window.MathmatixJoinClass.open(''); }
    });
    // Escape closes even before anything inside has focus (the trigger was a menu item).
    document.addEventListener('keydown', onKey);
    w.querySelector('.mc-x').focus();
    load();
  }

  function load() {
    Promise.all([get('/api/student/my-classes'), get('/api/activities/mine'), get('/api/live-drill/mine')]).then(function (r) {
      var body = document.getElementById('mc-body');
      if (!body) return;
      var mine = r[0];
      if (!mine || !mine.success) { body.innerHTML = '<p class="mc-err">Couldn\'t load your classes. Try again in a moment.</p>'; return; }
      var classes = mine.classes || [];
      var acts = r[1] && r[1].assignments ? r[1].assignments : [];
      var tests = r[1] && r[1].practiceTests ? r[1].practiceTests : [];
      var games = r[2] && r[2].games ? r[2].games : [];
      if (!classes.length) {
        body.innerHTML = '<div class="mc-empty"><p>You\'re not in a class yet. Your teacher can give you a class code — once you\'re in, their assignments and live games show up here.</p>' +
          '<button type="button" class="mc-btn mc-primary" data-mc="join">Enter a class code</button>' +
          '<p class="mc-muted">Want to practice on your own? <a href="/drill">Practice drills</a> need no class.</p></div>';
        return;
      }
      body.innerHTML = classes.map(function (c) { return classHTML(c, acts, tests, games); }).join('') +
        '<p class="mc-foot"><button type="button" class="mc-link" data-mc="join">Join another class</button></p>';
    });
  }

  function classHTML(c, acts, tests, games) {
    var mine = function (x) { return x.className === c.className; };
    var live = games.filter(mine);
    var myActs = acts.filter(mine);
    var myTests = tests.filter(mine);
    var open = myActs.filter(function (a) { return a.itemsSolved < a.itemsTotal; }).length +
      myTests.filter(function (t) { return t.status !== 'done'; }).length;

    var h = '<section class="mc-class">';
    h += '<header><h3>' + esc(c.className) + '</h3><p class="mc-muted">' + esc(c.teacherName) +
      (c.period ? ' · ' + esc(c.period) : '') + (c.mathCourse && c.mathCourse !== c.className ? ' · ' + esc(c.mathCourse) : '') + '</p></header>';

    // Live now
    h += '<div class="mc-row' + (live.length ? ' live' : '') + '"><span class="mc-k">Live now</span><div class="mc-v">';
    if (live.length) {
      h += live.map(function (g) {
        var what = esc(g.drillTitle || 'Two-Minute Drill') + (g.playbookName ? ' · ' + esc(g.playbookName) : '');
        var state = g.phase === 'lobby' ? 'Lobby open' : 'In progress';
        return '<div class="mc-game"><div><b>' + what + '</b><span class="mc-muted"> — ' + state + '</span></div>' +
          '<a class="mc-btn mc-primary" href="/play?code=' + encodeURIComponent(g.code) + '">Join</a></div>';
      }).join('');
    } else h += '<span class="mc-muted">No game right now. When your teacher starts one, Join appears here and at the top of your chat.</span>';
    h += '</div></div>';

    // Assignments
    h += '<div class="mc-row"><span class="mc-k">Assignments' + (open ? ' <span class="mc-badge">' + open + '</span>' : '') + '</span><div class="mc-v">';
    if (!myActs.length && !myTests.length) h += '<span class="mc-muted">Nothing assigned yet.</span>';
    else {
      h += '<ul class="mc-list">' + myActs.map(function (a) {
        var done = a.itemsSolved >= a.itemsTotal;
        return '<li class="' + (done ? 'done' : '') + '"><a href="/activities.html">' + esc(a.activity && a.activity.title || 'Activity') + '</a>' +
          '<span class="mc-muted">' + (done ? 'done' : a.itemsSolved + '/' + a.itemsTotal) + (a.dueDate && !done ? ' · ' + dueText(a.dueDate) : '') + '</span></li>';
      }).join('') + myTests.map(function (t) {
        var done = t.status === 'done';
        return '<li class="' + (done ? 'done' : '') + '"><a href="' + esc(t.url || '/activities.html') + '">' + esc(t.title || t.label || 'Practice test') + '</a>' +
          '<span class="mc-muted">' + (done ? 'done' : (t.statusLabel || t.status || 'to do')) + (t.dueDate && !done ? ' · ' + dueText(t.dueDate) : '') + '</span></li>';
      }).join('') + '</ul>';
    }
    h += '</div></div>';

    // Practice
    var d = c.drills || {};
    h += '<div class="mc-row"><span class="mc-k">Practice</span><div class="mc-v">';
    if (d.hub) {
      h += '<div class="mc-drills">' + (d.games || []).map(function (g) {
        return '<a class="mc-chip" href="' + esc(d.url) + '">' + esc(g) + '</a>';
      }).join('') + '</div><span class="mc-muted">' + esc(d.title) + ' drills — on your own, no code, nothing saved.</span>';
    } else h += '<a class="mc-chip" href="/drill">Practice drills</a>';
    h += '</div></div>';

    return h + '</section>';
  }

  function init() {
    ['open-my-class-btn', 'sidebar-my-class-btn'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
    // Joined a class from the dialog: show it here if the panel is open.
    document.addEventListener('mm:class-joined', function () { if (document.getElementById('mc-dialog')) load(); });
    if (new URLSearchParams(window.location.search).get('class') === '1') setTimeout(open, 600);
  }

  window.MathmatixMyClass = { open: open };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
