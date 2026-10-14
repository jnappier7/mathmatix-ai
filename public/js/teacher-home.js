/* ============================================================
   teacher-home.js — the teacher dashboard, organized around one question:
   "Who needs me today, and what do I do about it?"

   What it changes (html.td-v2):
     • TODAY is the landing view: a 4-tile class pulse with real 4-week
       trends, a ranked "Needs you" queue (who · why, in teacher words ·
       one-click next step · snooze), Live now, Teach this next (skills
       several students are stuck on → a mini-lesson), and Wins.
     • STUDENTS is a dense, sortable table instead of 100 identical cards;
       the risky/rare actions (view-as, reset screener) live in a ⋯ menu.
     • Navigation: 11 tabs → Today · Students · Classes · Insights · Assign ·
       Messages, with the rest under More. The two sidebars fold into Today,
       so the page is one uncrowded column.

   It owns no data and no business rules. Numbers come from
   js/teacher-metrics.js (tested, one definition each); data from the
   dashboard's own fetch (mm:roster-updated / mm:roster-rendered) and the
   live-feed poll (mm:live-feed); actions call window.TeacherDashboard, which
   wraps the existing handlers. The classic panels stay in the DOM, hidden —
   `?ui=classic` brings them back for anyone who needs the old layout.
   ============================================================ */
(function () {
  'use strict';

  var TM = window.TeacherMetrics;
  var CLASSIC_KEY = 'mm-teacher-ui';
  var SNOOZE_KEY = 'mm-teacher-snoozed';
  var SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
  var state = { students: [], rendered: null, live: [], sort: { key: null, dir: 1 }, firstName: '' };

  // ---------- opt-out ----------
  function classicMode() {
    var q = new URLSearchParams(window.location.search).get('ui');
    try {
      if (q === 'classic') localStorage.setItem(CLASSIC_KEY, 'classic');
      if (q === 'new') localStorage.removeItem(CLASSIC_KEY);
      return localStorage.getItem(CLASSIC_KEY) === 'classic';
    } catch (e) { return q === 'classic'; }
  }

  // ---------- tiny helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '')[0] || '').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : '') || '').toUpperCase();
  }
  // FNV-1a over the name: ObjectIds share long prefixes, so hashing them put
  // every avatar in the same green band.
  function hue(key) {
    var h = 2166136261; key = String(key);
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h % 360;
  }
  function avatar(id, name) {
    return '<span class="td-avatar" style="--h:' + hue(name || id) + '" aria-hidden="true">' + esc(initials(name)) + '</span>';
  }
  function ago(ms) {
    if (!ms) return '';
    var m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : d + 'd ago';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function D() { return window.TeacherDashboard || {}; }

  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.w || 84, h = opts.h || 26, gap = 4;
    var n = values.length, max = Math.max.apply(null, values.concat([1]));
    var bw = (w - gap * (n - 1)) / n;
    var bars = values.map(function (v, i) {
      var bh = Math.max(2, Math.round((v / max) * (h - 2)));
      return '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (h - bh) + '" width="' + bw.toFixed(1) + '" height="' + bh + '" rx="2" class="' + (i === n - 1 ? 'is-now' : '') + '"/>';
    }).join('');
    return '<svg class="td-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(opts.label || '') + '">' + bars + '</svg>';
  }

  // ---------- snooze ----------
  function snoozed() {
    try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function snooze(key) {
    var s = snoozed(), now = Date.now();
    Object.keys(s).forEach(function (k) { if (s[k] < now) delete s[k]; });
    s[key] = now + SNOOZE_MS;
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  // ============================================================
  // LAYOUT: nav, hero, Today container, table container
  // ============================================================
  var PRIMARY = ['today', 'students', 'classes', 'insights', 'activities', 'messages'];
  var LABELS = { today: 'Today', activities: 'Assign', insights: 'Insights', classes: 'Classes', students: 'Students', messages: 'Messages' };

  function restructureNav() {
    var tabs = document.getElementById('dashboard-tabs');
    if (!tabs) return;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Dashboard sections');

    // Today, first and active.
    var todayBtn = document.createElement('button');
    todayBtn.className = 'tab-btn active';
    todayBtn.dataset.tab = 'today';
    todayBtn.innerHTML = '<i class="fas fa-sun" aria-hidden="true"></i> Today <span class="td-tab-badge" id="td-today-badge" hidden></span>';
    tabs.insertBefore(todayBtn, tabs.firstChild);

    // Rename in place so existing listeners and counters keep working.
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab-btn'), function (b) {
      var t = b.dataset.tab;
      if (t === 'students') {
        var count = b.querySelector('#tab-student-count');
        var ic = b.querySelector('i');
        b.innerHTML = (ic ? ic.outerHTML + ' ' : '') + 'Students ';
        if (count) b.appendChild(count);
      }
      if (t === 'activities') {
        var icon = b.querySelector('i');
        b.innerHTML = (icon ? icon.outerHTML + ' ' : '') + 'Assign';
      }
      if (t !== 'today') b.classList.remove('active');
    });

    // Secondary tabs → a More menu (they stay .tab-btn, so the dashboard's
    // own tab handler still drives them).
    var more = document.createElement('div');
    more.className = 'td-more';
    more.innerHTML = '<button type="button" class="tab-btn td-more-btn" aria-haspopup="true" aria-expanded="false" id="td-more-btn">More <i class="fas fa-chevron-down" aria-hidden="true"></i></button>' +
      '<div class="td-more-menu" id="td-more-menu" role="menu" hidden></div>';
    tabs.appendChild(more);
    var menu = more.querySelector('#td-more-menu');
    Array.prototype.slice.call(tabs.querySelectorAll('.tab-btn[data-tab]')).forEach(function (b) {
      if (PRIMARY.indexOf(b.dataset.tab) === -1) {
        b.setAttribute('role', 'menuitem');
        menu.appendChild(b);
      } else {
        b.setAttribute('role', 'tab');
      }
    });
    var moreBtn = more.querySelector('#td-more-btn');
    function setMenu(open) {
      menu.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
      if (open) { var first = menu.querySelector('.tab-btn'); if (first) first.focus(); }
    }
    moreBtn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(menu.hidden); });
    menu.addEventListener('click', function () { setMenu(false); });
    document.addEventListener('click', function (e) { if (!more.contains(e.target)) setMenu(false); });
    menu.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('.tab-btn'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { setMenu(false); moreBtn.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    });

    // Keep aria-selected and the More button's "active" in sync.
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn[data-tab]');
      if (!b) return;
      setTimeout(syncTabState, 0);
    });
    syncTabState();
  }

  function syncTabState() {
    var tabs = document.getElementById('dashboard-tabs');
    if (!tabs) return;
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab-btn[data-tab]'), function (b) {
      b.setAttribute('aria-selected', String(b.classList.contains('active')));
    });
    var inMenu = !!tabs.querySelector('#td-more-menu .tab-btn.active');
    var moreBtn = document.getElementById('td-more-btn');
    if (moreBtn) moreBtn.classList.toggle('active', inMenu);
  }

  function mountToday() {
    var students = document.getElementById('students-tab');
    if (!students) return;
    students.classList.remove('active');
    var today = document.createElement('div');
    today.className = 'tab-content active';
    today.id = 'today-tab';
    today.setAttribute('role', 'tabpanel');
    today.innerHTML =
      '<section class="td-pulse" id="td-pulse" aria-label="Class pulse"></section>' +
      '<div class="td-grid">' +
        '<section class="td-card td-queue" aria-labelledby="td-queue-h">' +
          '<header class="td-card-head"><h2 id="td-queue-h">Needs you</h2><span class="td-count" id="td-queue-count"></span></header>' +
          '<ol class="td-queue-list" id="td-queue-list"><li class="td-skeleton"></li><li class="td-skeleton"></li><li class="td-skeleton"></li></ol>' +
          '<footer class="td-card-foot" id="td-queue-foot"></footer>' +
        '</section>' +
        '<div class="td-side">' +
          '<section class="td-card" aria-labelledby="td-live-h"><header class="td-card-head"><h2 id="td-live-h"><span class="td-live-dot" aria-hidden="true"></span>Live now</h2></header><div id="td-live" class="td-live"></div></section>' +
          '<section class="td-card" aria-labelledby="td-teach-h"><header class="td-card-head"><h2 id="td-teach-h">Teach this next</h2></header><div id="td-teach"></div></section>' +
          '<section class="td-card" aria-labelledby="td-wins-h"><header class="td-card-head"><h2 id="td-wins-h">Wins this month</h2></header><div id="td-wins"></div></section>' +
        '</div>' +
      '</div>';
    students.parentNode.insertBefore(today, students);
  }

  function mountHero() {
    var center = document.querySelector('.center-content');
    if (!center || document.getElementById('td-hero')) return;
    var hero = document.createElement('div');
    hero.id = 'td-hero';
    hero.className = 'td-hero';
    var now = new Date();
    var part = now.getHours() < 12 ? 'morning' : (now.getHours() < 17 ? 'afternoon' : 'evening');
    hero.innerHTML =
      '<div class="td-hero-text"><h1 class="td-hello">Good ' + part + '<span id="td-hello-name"></span></h1>' +
      '<p class="td-date">' + esc(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + ' · <span id="td-summary">Loading your class…</span></p></div>' +
      '<div class="td-hero-actions">' +
        '<button type="button" class="td-btn td-btn-quiet" data-td-act="ai-settings"><i class="fas fa-sliders" aria-hidden="true"></i> AI settings</button>' +
        '<button type="button" class="td-btn td-btn-quiet" data-td-act="practice-packs"><i class="fas fa-print" aria-hidden="true"></i> Practice packs</button>' +
        '<button type="button" class="td-btn td-btn-quiet" data-td-act="export"><i class="fas fa-download" aria-hidden="true"></i> Export</button>' +
        '<button type="button" class="td-btn td-btn-primary" data-open-create-class><i class="fas fa-plus" aria-hidden="true"></i> New class</button>' +
      '</div>';
    center.insertBefore(hero, center.firstChild);
    loadName();
  }

  function loadName() {
    var u = window.currentUser;
    if (u && u.firstName) return setName(u.firstName);
    fetch('/user', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (b) { var user = b.user || b; if (user && user.firstName) setName(user.firstName); })
      .catch(function () { /* greeting without a name is fine */ });
  }
  function setName(n) {
    state.firstName = n;
    var el = document.getElementById('td-hello-name');
    if (el) el.textContent = ', ' + n;
  }

  function mountTable() {
    var list = document.getElementById('student-list');
    if (!list || document.getElementById('td-roster')) return;
    var wrap = document.createElement('div');
    wrap.id = 'td-roster';
    wrap.className = 'td-roster';
    list.parentNode.insertBefore(wrap, list);
    // Honest labels on the existing filter (it filters by the shared status).
    var filter = document.getElementById('student-filter');
    if (filter) {
      filter.setAttribute('aria-label', 'Filter students');
      var labels = { all: 'All students', active: 'Active this week', struggling: 'Needs help', inactive: 'Inactive' };
      Array.prototype.forEach.call(filter.options, function (o) { if (labels[o.value]) o.textContent = labels[o.value]; });
    }
    var search = document.getElementById('student-search');
    if (search) search.setAttribute('aria-label', 'Search students');
  }

  // ============================================================
  // TODAY
  // ============================================================
  function renderPulse() {
    var el = document.getElementById('td-pulse');
    if (!el) return;
    var m = TM.classMetrics(state.students);
    var wins = TM.recentWins(state.students);
    var mins = TM.trend(m.minutesByWeek[0], m.minutesByWeek[1]);
    var act = TM.trend(m.activeByWeek[0], m.activeByWeek[1]);
    function delta(t, unit) {
      if (t.pct === null) return t.current > 0 ? '<span class="td-delta">new this week</span>' : '<span class="td-delta">—</span>';
      var cls = t.pct > 0 ? 'up' : (t.pct < 0 ? 'down' : 'flat');
      var sign = t.pct > 0 ? '+' : '';
      return '<span class="td-delta td-' + cls + '">' + (cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■') + ' ' + sign + t.pct + '% <span class="td-vs">vs ' + t.previous + (unit || '') + '</span></span>';
    }
    var hist = function (arr) { return arr.slice().reverse(); }; // oldest → newest
    el.innerHTML =
      tile('active', 'Active this week', m.activeThisWeek + '<span class="td-of"> of ' + m.total + '</span>', delta(act), sparkline(hist(m.activeByWeek), { label: 'Students active, last 4 weeks: ' + hist(m.activeByWeek).join(', ') }), 'active') +
      tile('minutes', 'Minutes this week', m.minutesByWeek[0].toLocaleString(), delta(mins, 'm'), sparkline(hist(m.minutesByWeek), { label: 'Minutes, last 4 weeks: ' + hist(m.minutesByWeek).join(', ') }), null) +
      tile('help', 'Need help', String(m.needHelp), m.needHelp ? '<span class="td-delta">stuck on a skill, with evidence</span>' : '<span class="td-delta td-up">nobody stuck</span>', '', 'struggling') +
      tile('wins', 'Skills mastered', String(wins.length), '<span class="td-delta">last 30 days</span>', '', null);
    var sum = document.getElementById('td-summary');
    if (sum) {
      sum.textContent = m.total === 0 ? 'No students yet'
        : plural(m.activeToday, 'student') + ' on today · ' + plural(m.needHelp, 'needs', 'need') + ' help';
    }
  }
  function tile(kind, label, value, delta, spark, filter) {
    var tag = filter ? 'button type="button" data-td-filter="' + filter + '"' : 'div';
    var close = filter ? 'button' : 'div';
    return '<' + tag + ' class="td-tile td-tile-' + kind + '"' + (filter ? ' aria-label="' + esc(label) + ': show these students"' : '') + '>' +
      '<span class="td-tile-label">' + esc(label) + '</span>' +
      '<span class="td-tile-value">' + value + '</span>' +
      '<span class="td-tile-foot">' + delta + spark + '</span></' + close + '>';
  }

  var KIND_META = {
    live: { label: 'Right now', icon: 'fa-bolt', primary: ['profile', 'Open session'] },
    stuck: { label: 'Stuck', icon: 'fa-life-ring', primary: ['history', 'See their work'], secondary: ['encourage', 'Message'] },
    lapsed: { label: 'Missing', icon: 'fa-user-clock', primary: ['remind', 'Nudge'], secondary: ['profile', 'Profile'] },
    slipping: { label: 'Review', icon: 'fa-rotate', primary: ['profile', 'Profile'], secondary: ['encourage', 'Message'] },
    'not-started': { label: 'New', icon: 'fa-seedling', primary: ['start', 'Send a welcome'] }
  };

  function renderQueue() {
    var list = document.getElementById('td-queue-list');
    if (!list) return;
    var items = TM.buildActionQueue(state.students, state.live, Date.now(), snoozed());
    var count = document.getElementById('td-queue-count');
    if (count) count.textContent = items.length ? String(items.length) : '';
    var badge = document.getElementById('td-today-badge');
    if (badge) { badge.textContent = String(items.length); badge.hidden = !items.length; }
    var foot = document.getElementById('td-queue-foot');

    if (!state.students.length) {
      list.innerHTML = '<li class="td-empty"><strong>No students yet.</strong> Create a class and share its join link — this list fills in as they start working.' +
        '<div><button type="button" class="td-btn td-btn-primary" data-open-create-class><i class="fas fa-plus" aria-hidden="true"></i> Create a class</button></div></li>';
      if (foot) foot.innerHTML = '';
      return;
    }
    if (!items.length) {
      list.innerHTML = '<li class="td-empty td-allclear"><i class="fas fa-circle-check" aria-hidden="true"></i><div><strong>All clear.</strong> No one is stuck, missing, or due for review. ' +
        'Check <button type="button" class="td-link" data-td-tab="insights">Insights</button> for what to teach next.</div></li>';
      if (foot) foot.innerHTML = '';
      return;
    }
    var SHOW = 7;
    var expanded = list.dataset.expanded === '1';
    list.innerHTML = items.slice(0, expanded ? items.length : SHOW).map(function (it) {
      var meta = KIND_META[it.kind];
      var btn = function (pair, cls) {
        return pair ? '<button type="button" class="td-btn ' + cls + '" data-td-do="' + pair[0] + '" data-id="' + esc(it.studentId) + '" data-name="' + esc(it.name) + '">' + esc(pair[1]) + '</button>' : '';
      };
      return '<li class="td-item td-k-' + it.kind + '">' +
        avatar(it.studentId, it.name) +
        '<div class="td-item-main">' +
          '<div class="td-item-title"><button type="button" class="td-name" data-td-do="profile" data-id="' + esc(it.studentId) + '">' + esc(it.name) + '</button> ' + esc(it.title) + '</div>' +
          '<div class="td-item-detail"><span class="td-chip td-chip-' + it.kind + '"><i class="fas ' + meta.icon + '" aria-hidden="true"></i> ' + meta.label + '</span>' + esc(it.detail || '') + (it.at && it.kind !== 'lapsed' ? '<span class="td-when"> · ' + esc(ago(it.at)) + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="td-item-actions">' + btn(meta.secondary, 'td-btn-quiet') + btn(meta.primary, 'td-btn-soft') +
          '<button type="button" class="td-icon-btn td-snooze" data-td-do="snooze" data-key="' + esc(it.key) + '" aria-label="Not now — hide for 3 days" title="Not now (3 days)"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
        '</div></li>';
    }).join('');
    if (foot) {
      foot.innerHTML = items.length > SHOW
        ? '<button type="button" class="td-link" data-td-do="expand">' + (expanded ? 'Show fewer' : 'Show all ' + items.length) + '</button>'
        : '';
    }
  }

  function renderLive() {
    var el = document.getElementById('td-live');
    if (!el) return;
    var live = (state.live || []).slice(0, 5);
    if (!live.length) {
      var last = state.students.map(function (s) { return { s: s, t: TM.lastActiveAt(s) }; })
        .filter(function (x) { return x.t; }).sort(function (a, b) { return b.t - a.t; })[0];
      el.innerHTML = '<p class="td-muted">No one is in a session right now.' +
        (last ? ' Last: <button type="button" class="td-link" data-td-do="profile" data-id="' + esc(last.s._id) + '">' + esc(TM.fullName(last.s)) + '</button>, ' + esc(ago(last.t)) + '.' : '') + '</p>';
      return;
    }
    el.innerHTML = '<ul class="td-live-list">' + live.map(function (l) {
      var acc = l.problemsAttempted ? Math.round((l.problemsCorrect / l.problemsAttempted) * 100) + '% on ' + l.problemsAttempted : '';
      return '<li>' + avatar(l.studentId, l.studentName) +
        '<div><button type="button" class="td-name" data-td-do="profile" data-id="' + esc(l.studentId) + '">' + esc(l.studentName) + '</button>' +
        (l.isStruggling ? ' <span class="td-chip td-chip-stuck">needs a hand</span>' : '') +
        '<div class="td-muted">' + esc(l.currentTopic || 'In a session') + (l.duration ? ' · ' + l.duration + ' min' : '') + (acc ? ' · ' + acc : '') + '</div></div></li>';
    }).join('') + '</ul>';
  }

  function renderTeach() {
    var el = document.getElementById('td-teach');
    if (!el) return;
    var groups = TM.teachNext(state.students, Date.now(), 3);
    if (!groups.length) {
      el.innerHTML = '<p class="td-muted">When two or more students get stuck on the same skill, it shows up here, ready for a small-group lesson.</p>';
      return;
    }
    el.innerHTML = '<ul class="td-teach-list">' + groups.map(function (g, i) {
      var names = g.students.map(function (s) { return s.name.split(' ')[0]; });
      var who = names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + ' +' + (names.length - 3);
      return '<li><div class="td-teach-skill">' + esc(g.name) + '</div>' +
        '<div class="td-muted">' + plural(g.students.length, 'student') + ' · ' + esc(who) + '</div>' +
        (g.reasons.length ? '<div class="td-teach-why">“' + esc(g.reasons[0]) + '”</div>' : '') +
        '<button type="button" class="td-btn td-btn-soft td-btn-sm" data-td-do="plan" data-i="' + i + '"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Plan a mini-lesson</button></li>';
    }).join('') + '</ul>';
    el.dataset.groups = JSON.stringify(groups.map(function (g) { return { name: g.name, n: g.students.length, why: g.reasons[0] || '' }; }));
  }

  function renderWins() {
    var el = document.getElementById('td-wins');
    if (!el) return;
    var wins = TM.recentWins(state.students).slice(0, 5);
    if (!wins.length) {
      el.innerHTML = '<p class="td-muted">Skills your students master show up here — a good list to celebrate out loud.</p>';
      return;
    }
    el.innerHTML = '<ul class="td-wins-list">' + wins.map(function (w) {
      return '<li><span class="td-trophy" aria-hidden="true">★</span><div><button type="button" class="td-name" data-td-do="profile" data-id="' + esc(w.studentId) + '">' + esc(w.name) + '</button>' +
        '<div class="td-muted">' + esc(w.skill) + ' · ' + esc(ago(w.at)) + '</div></div>' +
        '<button type="button" class="td-icon-btn" data-td-do="celebrate" data-id="' + esc(w.studentId) + '" data-name="' + esc(w.name) + '" aria-label="Congratulate ' + esc(w.name) + '" title="Congratulate"><i class="fas fa-hands-clapping" aria-hidden="true"></i></button></li>';
    }).join('') + '</ul>';
  }

  function renderToday() {
    renderPulse();
    renderQueue();
    renderLive();
    renderTeach();
    renderWins();
  }

  // ============================================================
  // STUDENTS TABLE
  // ============================================================
  var COLS = [
    { key: 'name', label: 'Student', sort: function (s) { return TM.fullName(s).toLowerCase(); } },
    { key: 'status', label: 'Status', sort: function (s) { return { struggling: 0, active: 1, inactive: 2 }[TM.studentStatus(s)]; } },
    { key: 'last', label: 'Last active', sort: function (s) { return -(TM.lastActiveAt(s) || 0); } },
    { key: 'week', label: 'Last 4 weeks', sort: function (s) { return -TM.weekMinutes(s, 0); } },
    { key: 'skills', label: 'Skills', sort: function (s) { return -((s.skillSummary && s.skillSummary.mastered) || 0); } },
    { key: 'focus', label: 'Needs help with', sort: function (s) { var k = TM.strugglingSkills(s)[0]; return k ? (k.name || k.skillId).toLowerCase() : '~'; } }
  ];
  var STATUS_LABEL = { active: 'Active', struggling: 'Needs help', inactive: 'Inactive' };

  function classNamesById() {
    var map = {};
    ((D().classes && D().classes()) || []).forEach(function (c) {
      (c.studentIds || []).forEach(function (id) { (map[id] = map[id] || []).push(c.className + (c.period ? ' · ' + c.period : '')); });
    });
    return map;
  }

  function renderTable() {
    var wrap = document.getElementById('td-roster');
    if (!wrap || !state.rendered) return;
    var rows = state.rendered.students.slice();
    if (state.sort.key) {
      var col = COLS.filter(function (c) { return c.key === state.sort.key; })[0];
      rows.sort(function (a, b) { var x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * state.sort.dir; });
    }
    if (!rows.length) { wrap.innerHTML = ''; return; }
    var cls = classNamesById();
    var head = COLS.map(function (c) {
      var on = state.sort.key === c.key;
      var aria = on ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none';
      return '<th scope="col" aria-sort="' + aria + '"><button type="button" class="td-th" data-td-sort="' + c.key + '">' + esc(c.label) +
        '<i class="fas ' + (on ? (state.sort.dir === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort') + '" aria-hidden="true"></i></button></th>';
    }).join('') + '<th scope="col"><span class="td-visually-hidden">Actions</span></th>';
    var body = rows.map(function (s) {
      var id = String(s._id), name = TM.fullName(s), status = TM.studentStatus(s);
      var weeks = [3, 2, 1, 0].map(function (i) { return TM.weekMinutes(s, i); });
      var sum = s.skillSummary || {};
      var focus = TM.strugglingSkills(s)[0];
      var iep = s.iepPlan && s.iepPlan.accommodations && Object.keys(s.iepPlan.accommodations).some(function (k) { return s.iepPlan.accommodations[k] === true; });
      var sub = [s.gradeLevel ? 'Grade ' + esc(s.gradeLevel) : '', (cls[id] || []).map(esc).join(', ')].filter(Boolean).join(' · ');
      return '<tr data-id="' + esc(id) + '" tabindex="0" aria-label="' + esc(name) + ', ' + STATUS_LABEL[status] + '">' +
        '<td class="td-c-name">' + avatar(id, name) + '<div><span class="td-row-name">' + esc(name) + '</span>' + (iep ? ' <span class="td-iep" title="Has IEP accommodations">IEP</span>' : '') +
          (sub ? '<div class="td-muted">' + sub + '</div>' : '') + '</div></td>' +
        '<td><span class="td-status td-s-' + status + '">' + STATUS_LABEL[status] + '</span></td>' +
        '<td class="td-c-last">' + esc(TM.formatLastActive(s)) + '</td>' +
        '<td class="td-c-week">' + sparkline(weeks, { w: 64, h: 22, label: 'Minutes per week: ' + weeks.join(', ') }) + '<span class="td-mins">' + weeks[3] + 'm</span></td>' +
        '<td class="td-c-skills"><span title="Mastered">' + (sum.mastered || 0) + ' ✓</span><span class="td-muted" title="In progress"> · ' + ((sum.inProgress || 0) + (sum.slipping || 0)) + ' in progress</span></td>' +
        '<td class="td-c-focus">' + (focus ? '<span class="td-focus">' + esc(focus.name || focus.skillId) + '</span>' : '<span class="td-muted">—</span>') + '</td>' +
        '<td class="td-c-menu"><button type="button" class="td-icon-btn" data-td-menu="' + esc(id) + '" data-name="' + esc(name) + '" aria-haspopup="true" aria-label="More actions for ' + esc(name) + '"><i class="fas fa-ellipsis" aria-hidden="true"></i></button></td>' +
        '</tr>';
    }).join('');
    wrap.innerHTML = '<div class="td-table-meta">' + plural(rows.length, 'student') + (state.rendered.total !== rows.length ? ' of ' + state.rendered.total : '') + '</div>' +
      '<div class="td-table-scroll"><table class="td-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // ⋯ menu for a row: frequent first, risky last and separated.
  function openRowMenu(btn) {
    closeRowMenu();
    var id = btn.getAttribute('data-td-menu'), name = btn.getAttribute('data-name');
    var m = document.createElement('div');
    m.className = 'td-row-menu';
    m.id = 'td-row-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML =
      item('profile', 'fa-user', 'Open profile') + item('history', 'fa-clock-rotate-left', 'Session history') +
      item('iep', 'fa-universal-access', 'IEP & accommodations') + item('encourage', 'fa-paper-plane', 'Message') +
      '<hr>' + item('view-as', 'fa-eye', 'View as student') + item('reset', 'fa-rotate-left', 'Reset placement screener…', 'td-danger');
    function item(act, icon, label, extra) {
      return '<button type="button" role="menuitem" class="' + (extra || '') + '" data-td-do="' + act + '" data-id="' + esc(id) + '" data-name="' + esc(name) + '"><i class="fas ' + icon + '" aria-hidden="true"></i> ' + esc(label) + '</button>';
    }
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 4, left = Math.max(8, r.right + window.scrollX - m.offsetWidth);
    if (r.bottom + m.offsetHeight > window.innerHeight - 8) top = r.top + window.scrollY - m.offsetHeight - 4;
    m.style.top = top + 'px';
    m.style.left = left + 'px';
    m.querySelector('button').focus();
    m.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(m.querySelectorAll('button'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { closeRowMenu(); btn.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    });
  }
  function closeRowMenu() { var m = document.getElementById('td-row-menu'); if (m) m.remove(); }

  // ============================================================
  // ACTIONS (one delegated handler)
  // ============================================================
  function act(kind, id, name, el) {
    var d = D();
    switch (kind) {
      case 'profile': return d.openProfile && d.openProfile(id);
      case 'history': return d.openHistory && d.openHistory(id, name);
      case 'iep': return d.openIep && d.openIep(id, name);
      case 'view-as': return d.viewAsStudent && d.viewAsStudent(id, name);
      case 'reset': return d.resetScreener && d.resetScreener(id, name);
      case 'encourage': case 'remind': case 'celebrate': case 'start':
        return d.draftMessage && d.draftMessage(id, name, kind);
      case 'snooze':
        snooze(el.getAttribute('data-key'));
        if (d.toast) d.toast('Hidden for 3 days', 'info');
        return renderQueue();
      case 'expand': {
        var list = document.getElementById('td-queue-list');
        list.dataset.expanded = list.dataset.expanded === '1' ? '' : '1';
        return renderQueue();
      }
      case 'plan': return planMiniLesson(Number(el.getAttribute('data-i')));
    }
  }

  function planMiniLesson(i) {
    var groups = [];
    try { groups = JSON.parse(document.getElementById('td-teach').dataset.groups || '[]'); } catch (e) { /* none */ }
    var g = groups[i];
    if (!g) return;
    D().openTab && D().openTab('insights');
    setTimeout(function () {
      var input = document.getElementById('planner-input');
      if (!input) return;
      input.value = 'Plan a 10-minute small-group mini-lesson on ' + g.name + ' for ' + plural(g.n, 'student') + ' who are stuck' +
        (g.why ? ' (the tutor noticed: ' + g.why + ')' : '') + '. Include one worked example and three quick checks.';
      input.focus();
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
  }

  function onClick(e) {
    var sortBtn = e.target.closest('[data-td-sort]');
    if (sortBtn) {
      var key = sortBtn.getAttribute('data-td-sort');
      state.sort = { key: key, dir: state.sort.key === key ? -state.sort.dir : 1 };
      return renderTable();
    }
    var menuBtn = e.target.closest('[data-td-menu]');
    if (menuBtn) { e.stopPropagation(); return openRowMenu(menuBtn); }
    var doBtn = e.target.closest('[data-td-do]');
    if (doBtn) {
      closeRowMenu();
      return act(doBtn.getAttribute('data-td-do'), doBtn.getAttribute('data-id'), doBtn.getAttribute('data-name'), doBtn);
    }
    var filterBtn = e.target.closest('[data-td-filter]');
    if (filterBtn) {
      var sel = document.getElementById('student-filter');
      if (sel) { sel.value = filterBtn.getAttribute('data-td-filter'); sel.dispatchEvent(new Event('change')); }
      return D().openTab && D().openTab('students');
    }
    var tabLink = e.target.closest('[data-td-tab]');
    if (tabLink) return D().openTab && D().openTab(tabLink.getAttribute('data-td-tab'));
    var heroAct = e.target.closest('[data-td-act]');
    if (heroAct) {
      var map = { 'ai-settings': 'qa-ai-settings', 'practice-packs': 'qa-practice-packs', 'export': 'qa-export-progress' };
      var target = document.getElementById(map[heroAct.getAttribute('data-td-act')]);
      if (target) target.click();
      return;
    }
    var row = e.target.closest('.td-table tbody tr');
    if (row && !e.target.closest('button, a, input')) return D().openProfile && D().openProfile(row.getAttribute('data-id'));
    if (!e.target.closest('#td-row-menu')) closeRowMenu();
  }

  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var row = e.target.closest && e.target.closest('.td-table tbody tr');
    if (row && e.target === row) { e.preventDefault(); D().openProfile && D().openProfile(row.getAttribute('data-id')); }
  }

  // ============================================================
  // MOBILE: Today · Students · Insights · More
  // ============================================================
  function rewireMobileNav() {
    var nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    var spec = [
      ['today', 'fa-sun', 'Today', function () { D().openTab('today'); }],
      ['students', 'fa-users', 'Students', function () { D().openTab('students'); }],
      ['insights', 'fa-lightbulb', 'Insights', function () { D().openTab('insights'); }],
      ['more', 'fa-ellipsis', 'More', function () { document.getElementById('mobile-actions-drawer') ? openMobileMore() : D().openTab('classes'); }]
    ];
    nav.innerHTML = spec.map(function (s, i) {
      return '<button class="mobile-nav-btn' + (i === 0 ? ' active' : '') + '" data-td-mobile="' + s[0] + '" aria-label="' + s[2] + '">' +
        '<i class="fas ' + s[1] + '" aria-hidden="true"></i><span>' + s[2] + '</span>' + (s[0] === 'today' ? '<span class="mobile-badge" id="td-mobile-badge" hidden></span>' : '') + '</button>';
    }).join('');
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-td-mobile]');
      if (!b) return;
      var s = spec.filter(function (x) { return x[0] === b.getAttribute('data-td-mobile'); })[0];
      Array.prototype.forEach.call(nav.querySelectorAll('.mobile-nav-btn'), function (x) { x.classList.toggle('active', x === b); });
      s[3]();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  function openMobileMore() {
    var drawer = document.getElementById('mobile-actions-drawer');
    if (!drawer) return;
    if (!drawer.querySelector('.td-mobile-tabs')) {
      var box = document.createElement('div');
      box.className = 'td-mobile-tabs';
      box.innerHTML = ['classes', 'activities', 'messages', 'announcements', 'curriculum', 'resources', 'schedule', 'analytics', 'monitor'].map(function (t) {
        var b = document.querySelector('.tab-btn[data-tab="' + t + '"]');
        return b ? '<button type="button" data-td-goto="' + t + '">' + esc(b.textContent.trim().replace(/\s+\d+$/, '').replace(/\s*\(\d+\)$/, '')) + '</button>' : '';
      }).join('');
      drawer.insertBefore(box, drawer.children[1] || null);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-td-goto]');
        if (!b) return;
        drawer.classList.remove('open', 'is-open', 'active');
        D().openTab(b.getAttribute('data-td-goto'));
      });
    }
    drawer.classList.add('open', 'is-open', 'active');
  }

  // ============================================================
  // WIRING
  // ============================================================
  function onRoster(e) {
    state.students = (e.detail && e.detail.students) || [];
    renderToday();
    var badge = document.getElementById('td-mobile-badge');
    if (badge) { var n = TM.buildActionQueue(state.students, state.live, Date.now(), snoozed()).length; badge.textContent = String(n); badge.hidden = !n; }
  }
  function onRendered(e) {
    state.rendered = e.detail;
    renderTable();
  }
  function onLive(e) {
    state.live = (e.detail && e.detail.feed) || [];
    renderLive();
    renderQueue();
  }

  function init() {
    if (!TM || classicMode()) return;
    document.documentElement.classList.add('td-v2');
    mountHero();
    restructureNav();
    mountToday();
    mountTable();
    document.addEventListener('mm:roster-updated', onRoster);
    document.addEventListener('mm:roster-rendered', onRendered);
    document.addEventListener('mm:live-feed', onLive);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closeRowMenu, { passive: true });
    // After the dashboard has bound its own mobile handlers.
    window.addEventListener('load', rewireMobileNav);
  }

  window.TeacherHome = { classic: function () { try { localStorage.setItem(CLASSIC_KEY, 'classic'); } catch (e) { /* */ } location.reload(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
