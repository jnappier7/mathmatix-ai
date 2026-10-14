/* ============================================================
   teacher-testprep.js — the Test Prep tab: PreACT / PSAT / SAT / ACT
   practice-test results for a teacher's current students.

   One screen, zero setup, plain language:
     • a summary per exam: who has tested, class average, weakest area
     • a grid of students × exams: latest score, change since their first
       fair attempt, and plain flags (Rushed / Unfinished / Easier route)
     • click a cell → a drawer with the attempt: likely range, time used,
       per-area bars, every attempt, and next steps (message, practice,
       one-page printable report for a parent conference)
   Data: GET /api/teacher/test-prep/scores (routes/teacherTestPrep.js); all
   flag and average rules live server-side in utils/testPrepScores.js.
   ============================================================ */
(function () {
  'use strict';

  var state = { exam: '', classId: '', from: '', to: '', data: null, sort: { key: 'name', dir: 1 }, showUntested: false };
  // Junior tests first — the order students take them (utils/testPrepScores EXAM_ORDER).
  var ALL_EXAMS = [{ testId: '', label: 'All tests' }, { testId: 'preact-math', label: 'PreACT' }, { testId: 'psat-math', label: 'PSAT' }, { testId: 'sat-math', label: 'SAT' }, { testId: 'act-math', label: 'ACT' }];
  var FLAG_TEXT = { rushed: 'Rushed', unfinished: 'Unfinished', 'easier-route': 'Easier route' };
  var FLAG_HELP = {
    rushed: 'Finished in under a quarter of the time limit — not a reliable estimate.',
    unfinished: 'Left 5+ questions blank or ran out of time while away.',
    'easier-route': 'Took the easier second module, which caps the top score.'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function D() { return window.TeacherDashboard || {}; }
  function toast(m, t) { if (D().toast) D().toast(m, t || 'success'); }
  function qs() {
    var p = new URLSearchParams();
    if (state.exam) p.set('exam', state.exam);
    if (state.classId) p.set('classId', state.classId);
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    return p.toString();
  }

  function root() { return document.getElementById('testprep-content'); }

  function load() {
    var el = root();
    if (!el) return;
    if (!state.data) el.innerHTML = '<div class="tp-loading">Loading practice-test results…</div>';
    fetch('/api/teacher/test-prep/scores?' + qs(), { credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.message || 'Failed'); return b; }); })
      .then(function (data) { state.data = data; render(); })
      .catch(function (err) { el.innerHTML = '<div class="tp-error">Couldn\'t load practice-test results. ' + esc(err.message) + '</div>'; });
  }

  // ---------- rendering ----------
  function render() {
    var el = root();
    var d = state.data;
    if (!el || !d) return;
    var anyAttempts = d.students.some(function (s) { return Object.keys(s.exams).length; });
    el.innerHTML = toolbar(d) + summaries(d) + (anyAttempts ? grid(d) : emptyState()) +
      '<p class="tp-foot">Flagged attempts (<strong>Rushed</strong>, <strong>Unfinished</strong>) are shown but left out of class averages and growth. ' +
      '<strong>Easier route</strong> scores count — the student just couldn\'t reach the top of the scale on that attempt.</p>';
  }

  function toolbar(d) {
    var exams = ALL_EXAMS;
    return '<div class="tp-toolbar">' +
      '<div class="tp-seg" role="group" aria-label="Which test">' + exams.map(function (e) {
        var on = (state.exam || '') === e.testId;
        return '<button type="button" class="tp-seg-btn' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-tp-exam="' + esc(e.testId) + '">' + esc(e.label) + '</button>';
      }).join('') + '</div>' +
      '<div class="tp-filters">' +
        '<label><span class="tp-visually-hidden">Class</span><select id="tp-class" aria-label="Class"><option value="">All my students</option>' +
          d.classes.map(function (c) { return '<option value="' + esc(c._id) + '"' + (String(c._id) === state.classId ? ' selected' : '') + '>' + esc(c.className) + (c.period ? ' · ' + esc(c.period) : '') + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="tp-date">From <input type="date" id="tp-from" value="' + esc(state.from) + '"></label>' +
        '<label class="tp-date">To <input type="date" id="tp-to" value="' + esc(state.to) + '"></label>' +
        '<a class="tp-btn tp-btn-quiet" href="/api/teacher/test-prep/export.csv?' + esc(qs()) + '" download><i class="fas fa-download" aria-hidden="true"></i> Export CSV</a>' +
      '</div></div>';
  }

  function summaries(d) {
    return '<div class="tp-summaries">' + d.summaries.map(function (s) {
      var tested = s.studentsTested;
      var on = state.exam === s.testId;
      return '<button type="button" class="tp-sum' + (on ? ' is-on' : '') + (tested ? '' : ' is-empty') + '" data-tp-exam="' + esc(s.testId) + '" aria-label="' + esc(s.label) + ': show only this test">' +
        '<span class="tp-sum-label">' + esc(s.label) + '</span>' +
        '<span class="tp-sum-avg">' + (s.classAverage != null ? s.classAverage : '—') + '<span class="tp-sum-unit">class average</span></span>' +
        '<span class="tp-sum-meta">' + tested + ' student' + (tested === 1 ? '' : 's') + ' tested' +
          (s.excludedFlagged ? ' · ' + s.excludedFlagged + ' flagged only' : '') + '</span>' +
        (s.weakestCategory
          ? '<span class="tp-sum-weak">Weakest: <strong>' + esc(s.weakestCategory.label) + '</strong> — ' + s.weakestCategory.pct + '% correct</span>'
          : '<span class="tp-sum-weak tp-muted">' + (tested ? 'Not enough questions yet to name a weak area' : 'No attempts yet') + '</span>') +
      '</button>';
    }).join('') + '</div>';
  }

  function cellValue(s, testId) {
    var e = s.exams[testId];
    return e && e.latest ? (e.latest.scaledScore || 0) : -1;
  }

  function grid(d) {
    var cols = state.exam ? d.exams : d.exams.filter(function (e) { return d.students.some(function (s) { return s.exams[e.testId]; }); });
    // Tested students are the grid; the rest are one line, not 20 rows of dashes.
    var hasCol = function (s) { return cols.some(function (c) { return s.exams[c.testId]; }); };
    var untested = d.students.filter(function (s) { return !hasCol(s); });
    var rows = d.students.filter(hasCol).concat(state.showUntested ? untested : []);
    var k = state.sort.key, dir = state.sort.dir;
    rows.sort(function (a, b) {
      var ta = hasCol(a), tb = hasCol(b);
      if (ta !== tb) return ta ? -1 : 1;
      if (k === 'name') return a.name.localeCompare(b.name) * dir;
      return (cellValue(b, k) - cellValue(a, k)) * dir || a.name.localeCompare(b.name);
    });
    var head = '<th scope="col" aria-sort="' + (k === 'name' ? (dir === 1 ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="tp-th" data-tp-sort="name">Student</button></th>' +
      cols.map(function (c) {
        var on = k === c.testId;
        return '<th scope="col" aria-sort="' + (on ? (dir === 1 ? 'descending' : 'ascending') : 'none') + '"><button type="button" class="tp-th" data-tp-sort="' + esc(c.testId) + '">' + esc(c.label) + '</button></th>';
      }).join('');
    var body = rows.map(function (s) {
      return '<tr><th scope="row" class="tp-name"><span>' + esc(s.name) + '</span>' +
        (s.classes.length ? '<span class="tp-muted">' + esc(s.classes.join(', ')) + '</span>' : (s.gradeLevel ? '<span class="tp-muted">Grade ' + esc(s.gradeLevel) + '</span>' : '')) + '</th>' +
        cols.map(function (c) { return '<td>' + cell(s, c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var more = untested.length
      ? '<div class="tp-untested"><span>' + untested.length + ' student' + (untested.length === 1 ? ' hasn\'t' : 's haven\'t') + ' taken ' + (state.exam ? 'this' : 'a') + ' practice test yet.</span>' +
        '<button type="button" class="tp-btn tp-btn-quiet" data-tp-untested>' + (state.showUntested ? 'Hide them' : 'Show them') + '</button>' +
        '<button type="button" class="tp-btn tp-btn-quiet" data-tp-copy="' + esc(window.location.origin + '/testprep') + '"><i class="fas fa-link" aria-hidden="true"></i> Copy test link</button></div>'
      : '';
    return '<div class="tp-grid-wrap"><table class="tp-grid"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' + more;
  }

  function cell(s, c) {
    var e = s.exams[c.testId];
    if (!e) return '<span class="tp-none" aria-label="No attempts">—</span>';
    var a = e.latest;
    var change = e.change != null && e.change !== 0
      ? '<span class="tp-change ' + (e.change > 0 ? 'up' : 'down') + '">' + (e.change > 0 ? '↑' : '↓') + Math.abs(e.change) + '</span>' : '';
    var flags = a.flags.map(function (f) { return '<span class="tp-flag tp-flag-' + f + '" title="' + esc(FLAG_HELP[f]) + '">' + esc(FLAG_TEXT[f]) + '</span>'; }).join('');
    return '<button type="button" class="tp-cell' + (a.countsTowardAverage ? '' : ' is-flagged') + '" data-tp-open="' + esc(s._id) + '|' + esc(c.testId) + '" aria-label="' +
      esc(s.name + ', ' + c.label + ': ' + a.scaledScore + (a.flags.length ? ' (' + a.flags.map(function (f) { return FLAG_TEXT[f]; }).join(', ') + ')' : '') + '. Open details') + '">' +
      '<span class="tp-score">' + (a.scaledScore != null ? a.scaledScore : '—') + '</span>' + change +
      (e.attemptCount > 1 ? '<span class="tp-count">' + e.attemptCount + ' tries</span>' : '') +
      (flags ? '<span class="tp-flags">' + flags + '</span>' : '') + '</button>';
  }

  function emptyState() {
    var link = window.location.origin + '/testprep';
    return '<div class="tp-empty"><i class="fas fa-clipboard-check" aria-hidden="true"></i>' +
      '<h3>No practice tests yet</h3>' +
      '<p>Scores appear here when your students take a PreACT, PSAT, SAT or ACT practice test while logged in. Share the practice-test page with them:</p>' +
      '<div class="tp-copy"><code>' + esc(link) + '</code><button type="button" class="tp-btn tp-btn-primary" data-tp-copy="' + esc(link) + '"><i class="fas fa-link" aria-hidden="true"></i> Copy link</button></div></div>';
  }

  // ---------- drawer ----------
  function openDrawer(studentId, testId) {
    var s = state.data.students.find(function (x) { return String(x._id) === studentId; });
    var e = s && s.exams[testId];
    if (!e) return;
    var label = (state.data.exams.find(function (x) { return x.testId === testId; }) || {}).label || testId;
    var a = e.latest;
    closeDrawer();
    var w = document.createElement('div');
    w.id = 'tp-drawer';
    w.className = 'tp-drawer-overlay';
    w.innerHTML = '<aside class="tp-drawer" role="dialog" aria-modal="true" aria-labelledby="tp-drawer-h">' +
      '<header><div><h3 id="tp-drawer-h">' + esc(s.name) + '</h3><p class="tp-muted">' + esc(label) + ' practice test · ' + e.attemptCount + ' attempt' + (e.attemptCount === 1 ? '' : 's') + '</p></div>' +
      '<button type="button" class="tp-x" data-tp-close aria-label="Close">&times;</button></header>' +
      attemptBlock(a, 'Latest attempt') +
      (e.attempts.length > 1 ? history(e) : '') +
      '<div class="tp-actions">' +
        '<button type="button" class="tp-btn tp-btn-primary" data-tp-print="' + esc(studentId) + '|' + esc(testId) + '"><i class="fas fa-print" aria-hidden="true"></i> One-page report</button>' +
        '<button type="button" class="tp-btn tp-btn-quiet" data-tp-message="' + esc(studentId) + '" data-name="' + esc(s.name) + '"><i class="fas fa-paper-plane" aria-hidden="true"></i> Message</button>' +
        '<button type="button" class="tp-btn tp-btn-quiet" data-tp-practice><i class="fas fa-dumbbell" aria-hidden="true"></i> Practice these skills</button>' +
      '</div></aside>';
    document.body.appendChild(w);
    w.querySelector('.tp-x').focus();
  }
  function closeDrawer() { var d = document.getElementById('tp-drawer'); if (d) d.remove(); }

  function attemptBlock(a, title) {
    var cats = Object.keys(a.byCategory || {}).filter(function (k) { return k !== 'unknown'; }).map(function (k) {
      var v = a.byCategory[k];
      return { label: v.label || k, pct: Math.round((v.correct / Math.max(1, v.total)) * 100), correct: v.correct, total: v.total };
    }).sort(function (x, y) { return x.pct - y.pct; });
    return '<section class="tp-attempt"><h4>' + esc(title) + ' · ' + esc(fmtDate(a.completedAt)) + '</h4>' +
      '<div class="tp-bigscore"><span>' + (a.scaledScore != null ? a.scaledScore : '—') + '</span>' +
        (a.range ? '<span class="tp-range">likely ' + a.range.low + '–' + a.range.high + '</span>' : '') + '</div>' +
      (a.flags.length ? '<ul class="tp-flag-list">' + a.flags.map(function (f) { return '<li><span class="tp-flag tp-flag-' + f + '">' + esc(FLAG_TEXT[f]) + '</span> ' + esc(FLAG_HELP[f]) + '</li>'; }).join('') + '</ul>' : '') +
      '<dl class="tp-facts">' +
        '<div><dt>Correct</dt><dd>' + (a.rawScore != null ? a.rawScore : '—') + ' of ' + a.totalItems + '</dd></div>' +
        '<div><dt>Time used</dt><dd>' + (a.durationMinutes != null ? a.durationMinutes + ' min' : '—') + (a.timeLimitMinutes ? ' of ' + a.timeLimitMinutes : '') + '</dd></div>' +
        '<div><dt>Left blank</dt><dd>' + a.skippedCount + '</dd></div>' +
        (a.moduleRoute ? '<div><dt>Module 2</dt><dd>' + esc(a.moduleRoute === 'easier' ? 'Easier' : 'Harder') + '</dd></div>' : '') +
      '</dl>' +
      (cats.length ? '<h5>By area (weakest first)</h5><ul class="tp-bars">' + cats.map(function (c) {
        return '<li><span class="tp-bar-label">' + esc(c.label) + '</span><span class="tp-bar" role="img" aria-label="' + c.pct + '% correct"><span style="width:' + c.pct + '%"></span></span><span class="tp-bar-num">' + c.correct + '/' + c.total + '</span></li>';
      }).join('') + '</ul>' : '') +
      '</section>';
  }

  function history(e) {
    var pts = e.attempts.map(function (a) { return a.scaledScore || 0; });
    var max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
    var W = 280, H = 60, n = pts.length;
    var x = function (i) { return n === 1 ? W / 2 : 8 + (i * (W - 16)) / (n - 1); };
    var y = function (v) { return max === min ? H / 2 : 8 + (H - 16) * (1 - (v - min) / (max - min)); };
    var fair = e.attempts.map(function (a, i) { return a.countsTowardAverage ? [x(i), y(pts[i])] : null; }).filter(Boolean);
    var line = fair.length > 1 ? '<polyline points="' + fair.map(function (p) { return p.join(','); }).join(' ') + '" />' : '';
    var dots = e.attempts.map(function (a, i) { return '<circle cx="' + x(i) + '" cy="' + y(pts[i]) + '" r="4" class="' + (a.countsTowardAverage ? 'fair' : 'flagged') + '"><title>' + esc(fmtDate(a.completedAt)) + ': ' + pts[i] + '</title></circle>'; }).join('');
    return '<section class="tp-history"><h4>Every attempt</h4>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tp-spark" role="img" aria-label="Scores over time: ' + esc(pts.join(', ')) + '">' + line + dots + '</svg>' +
      '<ol class="tp-attempts">' + e.attempts.slice().reverse().map(function (a) {
        return '<li><span>' + esc(fmtDate(a.completedAt)) + '</span><strong>' + (a.scaledScore != null ? a.scaledScore : '—') + '</strong>' +
          a.flags.map(function (f) { return '<span class="tp-flag tp-flag-' + f + '">' + esc(FLAG_TEXT[f]) + '</span>'; }).join('') + '</li>';
      }).join('') + '</ol>' +
      (e.change != null ? '<p class="tp-muted">Change since their first fair attempt: <strong>' + (e.change > 0 ? '+' : '') + e.change + '</strong></p>' : '') +
      '</section>';
  }

  // ---------- printable one-page report ----------
  function printReport(studentId, testId) {
    var s = state.data.students.find(function (x) { return String(x._id) === studentId; });
    var e = s && s.exams[testId];
    if (!e) return;
    var label = (state.data.exams.find(function (x) { return x.testId === testId; }) || {}).label || testId;
    var w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print the report', 'error'); return; }
    var styles = 'body{font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;margin:32px}h1{font-size:22px;margin:0}h4{margin:18px 0 6px}' +
      '.tp-muted{color:#64748B}.tp-bigscore{font-size:40px;font-weight:800}.tp-range{font-size:14px;color:#475569;margin-left:10px}' +
      '.tp-facts{display:flex;gap:24px;margin:8px 0}.tp-facts dt{color:#64748B;font-size:12px}.tp-facts dd{margin:0;font-weight:700}' +
      '.tp-bars{list-style:none;padding:0}.tp-bars li{display:grid;grid-template-columns:220px 1fr 50px;gap:8px;align-items:center;margin:4px 0}' +
      '.tp-bar{height:10px;background:#E2E8F0;border-radius:6px;overflow:hidden}.tp-bar span{display:block;height:100%;background:#059669}' +
      '.tp-flag{font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:#FEF3C7;color:#92400E;margin-right:6px}' +
      '.tp-attempts{padding-left:18px}.tp-attempts li span{margin-right:10px}.tp-flag-list{padding-left:18px}' +
      'svg polyline{fill:none;stroke:#059669;stroke-width:2}svg circle.fair{fill:#059669}svg circle.flagged{fill:#CBD5E1}footer{margin-top:28px;font-size:12px;color:#64748B}';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(s.name) + ' — ' + esc(label) + ' practice</title><style>' + styles + '</style></head><body>' +
      '<h1>' + esc(s.name) + '</h1><p class="tp-muted">' + esc(label) + ' practice tests · report printed ' + esc(fmtDate(new Date())) + '</p>' +
      attemptBlock(e.latest, 'Latest attempt') + (e.attempts.length > 1 ? history(e) : '') +
      '<footer>Practice tests on MATHMATIX.AI estimate the real exam; the "likely" range reflects how much a single attempt can vary. Rushed or unfinished attempts are marked and are not used to judge growth.</footer>' +
      '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { w.print(); }, 250);
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-tp-exam]'))) { state.exam = t.getAttribute('data-tp-exam'); return load(); }
    if ((t = e.target.closest('[data-tp-sort]'))) {
      var k = t.getAttribute('data-tp-sort');
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      return render();
    }
    if (e.target.closest('[data-tp-untested]')) { state.showUntested = !state.showUntested; return render(); }
    if ((t = e.target.closest('[data-tp-open]'))) { var p = t.getAttribute('data-tp-open').split('|'); return openDrawer(p[0], p[1]); }
    if (e.target.closest('[data-tp-close]') || e.target.id === 'tp-drawer') return closeDrawer();
    if ((t = e.target.closest('[data-tp-print]'))) { var q = t.getAttribute('data-tp-print').split('|'); return printReport(q[0], q[1]); }
    if ((t = e.target.closest('[data-tp-message]'))) {
      closeDrawer();
      return D().draftMessage && D().draftMessage(t.getAttribute('data-tp-message'), t.getAttribute('data-name'), 'encourage');
    }
    if (e.target.closest('[data-tp-practice]')) {
      closeDrawer();
      var packs = document.getElementById('qa-practice-packs');
      if (packs) packs.click();
      return;
    }
    if ((t = e.target.closest('[data-tp-copy]'))) {
      var link = t.getAttribute('data-tp-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { toast('Link copied'); }).catch(function () { toast(link, 'info'); });
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'tp-class') { state.classId = e.target.value; load(); }
    if (e.target.id === 'tp-from') { state.from = e.target.value; load(); }
    if (e.target.id === 'tp-to') { state.to = e.target.value; load(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  function init() {
    var btn = document.querySelector('.tab-btn[data-tab="testprep"]');
    if (!btn) return;
    btn.addEventListener('click', function () { load(); });
    document.addEventListener('mm:class-created', function () { if (state.data) load(); });
  }
  window.TeacherTestPrep = { reload: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
