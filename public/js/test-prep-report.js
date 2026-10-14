/* ============================================================
   test-prep-report.js — the pieces of a practice-test read that the teacher's
   Test Prep tab (js/teacher-testprep.js) and the parent dashboard
   (js/parent-dashboard.js) both draw: flag labels, the per-attempt block with
   per-area bars, the attempt history, and the one-page printable report.

   Pure string builders — no fetching, no page state. The numbers and the
   Rushed / Unfinished rules are decided server-side (utils/testPrepScores.js);
   this only renders them, so the two dashboards can never word a flag
   differently.

   Language: every string has an English default in STRINGS. A page that
   translates passes `t(key, english)`; the parent dashboard routes it through
   MathmatixI18n under `parent.testPrep.<key>`. The teacher page passes
   nothing and gets English. Placeholders are {name}-style.

   Loaded as a classic script (window.TestPrepReport) and require()-able from
   jest (module.exports) — tests/unit/testPrepReport.test.js.
   ============================================================ */
(function (root) {
  'use strict';

  var STRINGS = {
    flagRushed: 'Rushed',
    flagUnfinished: 'Unfinished',
    flagEasierRoute: 'Easier route',
    flagRushedHelp: 'Finished in under a quarter of the time limit — not a reliable estimate.',
    flagUnfinishedHelp: 'Left 5+ questions blank or ran out of time while away.',
    flagEasierRouteHelp: 'Took the easier second module, which caps the top score.',
    latestAttempt: 'Latest attempt',
    likelyRange: 'likely {low}–{high}',
    correct: 'Correct',
    nOfM: '{n} of {m}',
    timeUsed: 'Time used',
    minutes: '{n} min',
    ofLimit: 'of {n}',
    leftBlank: 'Left blank',
    module2: 'Module 2',
    easier: 'Easier',
    harder: 'Harder',
    byArea: 'By area (weakest first)',
    barAria: '{label}: {correct} of {total} correct ({pct}%)',
    everyAttempt: 'Every attempt',
    scoresOverTime: 'Scores over time: {scores}',
    changeSinceFirst: 'Change since the first fair attempt: {change}',
    reportTitle: '{name} — {exam} practice',
    reportSubtitle: '{exam} practice tests · report printed {date}',
    reportFooter: 'Practice tests on MATHMATIX.AI estimate the real exam; the "likely" range reflects how much a single attempt can vary. Rushed or unfinished attempts are marked and are not used to judge growth.',
  };
  var FLAG_KEYS = { rushed: 'flagRushed', unfinished: 'flagUnfinished', 'easier-route': 'flagEasierRoute' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fill(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
  }

  /** Per-area rows for one attempt, weakest first ('unknown' dropped). */
  function categoryRows(attempt) {
    var by = (attempt && attempt.byCategory) || {};
    return Object.keys(by).filter(function (k) { return k !== 'unknown'; }).map(function (k) {
      var v = by[k];
      return { key: k, label: v.label || k, correct: v.correct, total: v.total, pct: Math.round((v.correct / Math.max(1, v.total)) * 100) };
    }).sort(function (x, y) { return x.pct - y.pct; });
  }

  /**
   * A renderer bound to one language. opts.t(key, english) → string;
   * opts.locale → date formatting (default en-US).
   */
  function create(opts) {
    opts = opts || {};
    var locale = opts.locale || 'en-US';
    function s(key, vars) {
      var en = STRINGS[key];
      var out = (opts.t && opts.t(key, en)) || en;
      return fill(out, vars);
    }
    function fmtDate(d) {
      if (!d) return '';
      try { return new Date(d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return new Date(d).toLocaleDateString('en-US'); }
    }
    function flagText(f) { return FLAG_KEYS[f] ? s(FLAG_KEYS[f]) : f; }
    function flagHelp(f) { return FLAG_KEYS[f] ? s(FLAG_KEYS[f] + 'Help') : ''; }
    function flagChip(f, withTitle) {
      return '<span class="tp-flag tp-flag-' + esc(f) + '"' + (withTitle ? ' title="' + esc(flagHelp(f)) + '"' : '') + '>' + esc(flagText(f)) + '</span>';
    }

    function barsList(attempt) {
      var cats = categoryRows(attempt);
      if (!cats.length) return '';
      return '<ul class="tp-bars">' + cats.map(function (c) {
        return '<li><span class="tp-bar-label">' + esc(c.label) + '</span>' +
          '<span class="tp-bar" role="img" aria-label="' + esc(s('barAria', { label: c.label, correct: c.correct, total: c.total, pct: c.pct })) + '"><span style="width:' + c.pct + '%"></span></span>' +
          '<span class="tp-bar-num" aria-hidden="true">' + c.correct + '/' + c.total + '</span></li>';
      }).join('') + '</ul>';
    }

    function attemptBlock(a, title) {
      var bars = barsList(a);
      return '<section class="tp-attempt"><h4>' + esc(title || s('latestAttempt')) + ' · ' + esc(fmtDate(a.completedAt)) + '</h4>' +
        '<div class="tp-bigscore"><span>' + (a.scaledScore != null ? esc(a.scaledScore) : '—') + '</span>' +
          (a.range ? '<span class="tp-range">' + esc(s('likelyRange', { low: a.range.low, high: a.range.high })) + '</span>' : '') + '</div>' +
        (a.flags && a.flags.length ? '<ul class="tp-flag-list">' + a.flags.map(function (f) { return '<li>' + flagChip(f) + ' ' + esc(flagHelp(f)) + '</li>'; }).join('') + '</ul>' : '') +
        '<dl class="tp-facts">' +
          '<div><dt>' + esc(s('correct')) + '</dt><dd>' + esc(s('nOfM', { n: a.rawScore != null ? a.rawScore : '—', m: a.totalItems })) + '</dd></div>' +
          '<div><dt>' + esc(s('timeUsed')) + '</dt><dd>' + (a.durationMinutes != null ? esc(s('minutes', { n: a.durationMinutes })) : '—') + (a.timeLimitMinutes ? ' ' + esc(s('ofLimit', { n: a.timeLimitMinutes })) : '') + '</dd></div>' +
          '<div><dt>' + esc(s('leftBlank')) + '</dt><dd>' + esc(a.skippedCount) + '</dd></div>' +
          (a.moduleRoute ? '<div><dt>' + esc(s('module2')) + '</dt><dd>' + esc(a.moduleRoute === 'easier' ? s('easier') : s('harder')) + '</dd></div>' : '') +
        '</dl>' +
        (bars ? '<h5>' + esc(s('byArea')) + '</h5>' + bars : '') +
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
      return '<section class="tp-history"><h4>' + esc(s('everyAttempt')) + '</h4>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tp-spark" role="img" aria-label="' + esc(s('scoresOverTime', { scores: pts.join(', ') })) + '">' + line + dots + '</svg>' +
        '<ol class="tp-attempts">' + e.attempts.slice().reverse().map(function (a) {
          return '<li><span>' + esc(fmtDate(a.completedAt)) + '</span><strong>' + (a.scaledScore != null ? esc(a.scaledScore) : '—') + '</strong>' +
            (a.flags || []).map(function (f) { return flagChip(f); }).join('') + '</li>';
        }).join('') + '</ol>' +
        (e.change != null ? '<p class="tp-muted">' + esc(s('changeSinceFirst', { change: (e.change > 0 ? '+' : '') + e.change })) + '</p>' : '') +
        '</section>';
    }

    var PRINT_CSS = 'body{font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A;margin:32px}h1{font-size:22px;margin:0}h4{margin:18px 0 6px}' +
      '.tp-muted{color:#64748B}.tp-bigscore{font-size:40px;font-weight:800}.tp-range{font-size:14px;color:#475569;margin-left:10px}' +
      '.tp-facts{display:flex;gap:24px;margin:8px 0}.tp-facts dt{color:#64748B;font-size:12px}.tp-facts dd{margin:0;font-weight:700}' +
      '.tp-bars{list-style:none;padding:0}.tp-bars li{display:grid;grid-template-columns:220px 1fr 50px;gap:8px;align-items:center;margin:4px 0}' +
      '.tp-bar{height:10px;background:#E2E8F0;border-radius:6px;overflow:hidden}.tp-bar span{display:block;height:100%;background:#059669}' +
      '.tp-flag{font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;background:#FEF3C7;color:#92400E;margin-right:6px}' +
      '.tp-attempts{padding-left:18px}.tp-attempts li span{margin-right:10px}.tp-flag-list{padding-left:18px}' +
      'svg polyline{fill:none;stroke:#059669;stroke-width:2}svg circle.fair{fill:#059669}svg circle.flagged{fill:#CBD5E1}footer{margin-top:28px;font-size:12px;color:#64748B}' +
      '[dir=rtl] .tp-range{margin-left:0;margin-right:10px}';

    /** The whole printable page for one student × one exam (e = buildStudentExams entry). */
    function reportHtml(name, examLabel, e) {
      var dir = opts.dir === 'rtl' ? ' dir="rtl"' : '';
      return '<!doctype html><html' + dir + '><head><meta charset="utf-8"><title>' + esc(s('reportTitle', { name: name, exam: examLabel })) + '</title><style>' + PRINT_CSS + '</style></head><body>' +
        '<h1>' + esc(name) + '</h1><p class="tp-muted">' + esc(s('reportSubtitle', { exam: examLabel, date: fmtDate(new Date()) })) + '</p>' +
        attemptBlock(e.latest) + (e.attempts.length > 1 ? history(e) : '') +
        '<footer>' + esc(s('reportFooter')) + '</footer></body></html>';
    }

    /** Open + print the report. Returns false when the pop-up was blocked. */
    function printReport(name, examLabel, e) {
      var w = window.open('', '_blank');
      if (!w) return false;
      w.document.write(reportHtml(name, examLabel, e));
      w.document.close();
      w.focus();
      setTimeout(function () { w.print(); }, 250);
      return true;
    }

    return {
      s: s, fmtDate: fmtDate, flagText: flagText, flagHelp: flagHelp, flagChip: flagChip,
      barsList: barsList, attemptBlock: attemptBlock, history: history, reportHtml: reportHtml, printReport: printReport,
    };
  }

  var api = { STRINGS: STRINGS, FLAG_KEYS: FLAG_KEYS, esc: esc, fill: fill, categoryRows: categoryRows, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TestPrepReport = api;
})(typeof window !== 'undefined' ? window : this);
