/* ============================================================
   teacher-metrics.js — every number on the teacher dashboard, defined ONCE.

   Before this file, three panels each computed "active", "need help" and
   "minutes" their own way and disagreed on screen (Active Today 5 vs 7;
   Need Help 100 vs a list of 6), and the week-over-week trends were
   Math.random(). Now every tile, list, alert and export reads these pure
   functions, which read only what the server sends:
     • student.activity      — utils/studentActivity.js (real per-week minutes
                               from conversations, real lastActiveAt)
     • student.skillSummary  — utils/skillSummary.js (evidence-based struggle)

   Loaded as a plain script in the teacher bundle (window.TeacherMetrics) and
   required directly by jest (module.exports) — no DOM in here, ever.
   ============================================================ */
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var INACTIVE_DAYS = 7;

  function time(d) {
    if (!d) return 0;
    var t = new Date(d).getTime();
    return isFinite(t) ? t : 0;
  }

  function startOfLocalDay(now) {
    var d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** Real last-active time (activity block first, lastLogin as fallback). */
  function lastActiveAt(student) {
    var a = student && student.activity;
    var t = Math.max(time(a && a.lastActiveAt), time(student && student.lastLogin));
    return t > 0 ? t : null;
  }

  /** Minutes in rolling week i (0 = last 7 days). */
  function weekMinutes(student, i) {
    var w = student && student.activity && student.activity.weeklyMinutes;
    if (Array.isArray(w)) return Math.max(0, Number(w[i || 0]) || 0);
    // Old payload (no activity block): only "this week" is knowable.
    return (i || 0) === 0 ? Math.max(0, Number(student && student.weeklyActiveTutoringMinutes) || 0) : 0;
  }

  function strugglingSkills(student) {
    var s = student && student.skillSummary;
    return (s && Array.isArray(s.struggling)) ? s.struggling : [];
  }

  /**
   * 'inactive'   — nothing in 7 days (or never)
   * 'struggling' — active, with recent evidence of struggle on a skill
   *                (string kept for the existing filter/CSS; shown as "Needs help")
   * 'active'     — everyone else
   * Low minutes alone is NOT "needs help": a student who did 8 focused
   * minutes and nailed it is fine. Engagement is its own column.
   */
  function studentStatus(student, now) {
    now = now || Date.now();
    var last = lastActiveAt(student);
    if (!last || now - last > INACTIVE_DAYS * DAY_MS) return 'inactive';
    if (strugglingSkills(student).length > 0) return 'struggling';
    return 'active';
  }

  function isActiveToday(student, now) {
    var last = lastActiveAt(student);
    return !!last && last >= startOfLocalDay(now || Date.now());
  }

  /** "Today", "Yesterday", "3d ago", "Mar 5", or "Never". */
  function formatLastActive(student, now) {
    now = now || Date.now();
    var last = lastActiveAt(student);
    if (!last) return 'Never';
    var today = startOfLocalDay(now);
    if (last >= today) {
      var mins = Math.floor((now - last) / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return mins + 'm ago';
      return Math.floor(mins / 60) + 'h ago';
    }
    if (last >= today - DAY_MS) return 'Yesterday';
    var days = Math.floor((today - last) / DAY_MS) + 1;
    if (days < 7) return days + 'd ago';
    return new Date(last).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: (now - last > 300 * DAY_MS) ? 'numeric' : undefined });
  }

  function daysSinceActive(student, now) {
    var last = lastActiveAt(student);
    return last ? Math.floor(((now || Date.now()) - last) / DAY_MS) : null;
  }

  /** Normalize a raw masteryScore (legacy 0-1 or canonical 0-100) to 0-100. */
  function normalizeMastery(raw) {
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(Math.min(100, n <= 1 ? n * 100 : n));
  }

  /**
   * Class-level figures. Every tile reads this one object.
   * minutesByWeek/activeByWeek are REAL history (conversation-backed), so
   * week-over-week comparisons need no invention.
   */
  function classMetrics(students, now) {
    now = now || Date.now();
    students = students || [];
    var m = {
      total: students.length,
      activeToday: 0,
      activeThisWeek: 0,
      needHelp: 0,
      inactive: 0,
      neverActive: 0,
      minutesByWeek: [0, 0, 0, 0],
      activeByWeek: [0, 0, 0, 0],
      avgLevel: null,
      avgMastery: null,
      skills: { mastered: 0, inProgress: 0, slipping: 0, studentsWithData: 0 }
    };
    var levelSum = 0;
    var masterySum = 0;
    var masteryN = 0;
    students.forEach(function (s) {
      var status = studentStatus(s, now);
      if (status === 'inactive') m.inactive++;
      else {
        m.activeThisWeek++;
        if (status === 'struggling') m.needHelp++;
      }
      if (!lastActiveAt(s)) m.neverActive++;
      if (isActiveToday(s, now)) m.activeToday++;
      for (var i = 0; i < 4; i++) {
        var mins = weekMinutes(s, i);
        m.minutesByWeek[i] += mins;
        if (mins > 0) m.activeByWeek[i]++;
      }
      levelSum += Number(s.level) || 1;
      var sum = s.skillSummary;
      if (sum && sum.total > 0) {
        m.skills.studentsWithData++;
        m.skills.mastered += sum.mastered || 0;
        m.skills.inProgress += sum.inProgress || 0;
        m.skills.slipping += sum.slipping || 0;
        if (typeof sum.avgMastery === 'number') { masterySum += sum.avgMastery; masteryN++; }
      } else if (s.skillMastery) {
        // Full payload without a summary (old server): average the raw map, normalized.
        Object.keys(s.skillMastery).forEach(function (k) {
          var d = s.skillMastery[k];
          if (d && typeof d.masteryScore === 'number') { masterySum += normalizeMastery(d.masteryScore); masteryN++; }
        });
      }
    });
    m.minutesByWeek = m.minutesByWeek.map(Math.round);
    if (students.length) m.avgLevel = Math.round((levelSum / students.length) * 10) / 10;
    if (masteryN) m.avgMastery = Math.round(masterySum / masteryN);
    return m;
  }

  /**
   * LaTeX in tutor-written summaries → readable plain text for teacher views.
   * "\\( M(2,1) \\)" showed up raw in session history. No KaTeX on this page,
   * and a summary is prose, so plain math reads better than typeset islands.
   */
  function plainMath(text) {
    if (text == null) return '';
    var s = String(text);
    s = s.replace(/\\[()\[\]]/g, '').replace(/\$\$?/g, '');
    for (var i = 0; i < 3; i++) {
      s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
           .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
    }
    var sym = { cdot: '·', times: '×', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', pm: '±', pi: 'π',
      theta: 'θ', alpha: 'α', beta: 'β', infty: '∞', approx: '≈', degree: '°', circ: '°', left: '', right: '' };
    s = s.replace(/\\([a-zA-Z]+)/g, function (m, name) { return Object.prototype.hasOwnProperty.call(sym, name) ? sym[name] : name; });
    s = s.replace(/\^\{([^{}]*)\}/g, '^$1').replace(/_\{([^{}]*)\}/g, '_$1').replace(/[{}]/g, '');
    s = s.replace(/\(\(([^()]*)\)\)/g, '($1)').replace(/\(([A-Za-z0-9.]+)\)\/\(([A-Za-z0-9.]+)\)/g, '$1/$2');
    s = s.replace(/√\(([A-Za-z0-9.]+)\)/g, '√$1');
    return s.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;:])/g, '$1').trim();
  }

  function fullName(s) {
    return ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.username || 'Student';
  }

  var REASON_TEXT = {
    'tutor-flagged': function (sk) { return sk.detail ? 'tutor noticed: ' + sk.detail : 'the tutor flagged it'; },
    'missed-on-check': function () { return 'missed it on a direct check'; },
    'low-accuracy': function (sk) { return (sk.detail || 'low accuracy') + ' correct'; }
  };

  /**
   * "Needs you" — the ranked to-do list a teacher opens the dashboard for.
   * Every item says WHO, WHY (evidence, in teacher words) and offers the next
   * action. Order: struggling right now (live) → stuck on a skill → lapsed
   * after working → slipping on review → new and never started. Nothing
   * here is generated for students the teacher can't act on (last year's
   * long tail lives in the archive, not the to-do list).
   *
   * @param live  /api/teacher/live-feed rows (optional)
   * @param snoozed  { [itemKey]: untilMs } — teacher's "not now"s
   */
  function buildActionQueue(students, live, now, snoozed) {
    now = now || Date.now();
    snoozed = snoozed || {};
    var items = [];
    var liveById = {};
    (live || []).forEach(function (l) { if (l && l.studentId) liveById[String(l.studentId)] = l; });

    (students || []).forEach(function (s) {
      var id = String(s._id);
      var name = fullName(s);
      var l = liveById[id];
      var liveAlerts = l ? (l.alerts || []).filter(function (a) { return a && !a.acknowledged; }) : [];
      if (l && (l.isStruggling || liveAlerts.length)) {
        items.push({ kind: 'live', priority: 0, studentId: id, name: name,
          title: 'is struggling right now',
          detail: l.strugglingWith ? 'with ' + l.strugglingWith : (liveAlerts[0] && liveAlerts[0].message) || l.currentTopic || 'in an active session',
          at: time(l.lastActivity) || now, conversationId: l.conversationId || null });
        return;
      }
      var status = studentStatus(s, now);
      if (status === 'struggling') {
        var sk = strugglingSkills(s)[0];
        var more = strugglingSkills(s).length - 1;
        items.push({ kind: 'stuck', priority: 1, studentId: id, name: name,
          title: 'is stuck on ' + (sk.name || sk.skillId),
          detail: (REASON_TEXT[sk.reason] ? REASON_TEXT[sk.reason](sk) : '') + (more > 0 ? ' · +' + more + ' more skill' + (more > 1 ? 's' : '') : ''),
          at: time(sk.lastPracticed) || lastActiveAt(s) || now, skill: sk.name || sk.skillId });
        return;
      }
      if (status === 'inactive') {
        var days = daysSinceActive(s, now);
        var createdAgo = s.createdAt ? (now - time(s.createdAt)) / DAY_MS : Infinity;
        if (days !== null && days <= 30) {
          items.push({ kind: 'lapsed', priority: 2, studentId: id, name: name,
            title: "hasn't been on in " + days + ' days',
            detail: 'last active ' + formatLastActive(s, now) + (weekMinutes(s, 1) + weekMinutes(s, 2) + weekMinutes(s, 3) > 0 ? ' · was working before' : ''),
            at: lastActiveAt(s) });
        } else if (days === null && createdAgo <= 30) {
          items.push({ kind: 'not-started', priority: 4, studentId: id, name: name,
            title: "hasn't started yet", detail: 'joined ' + Math.max(0, Math.round(createdAgo)) + ' day' + (Math.round(createdAgo) === 1 ? '' : 's') + ' ago',
            at: time(s.createdAt) });
        }
        return;
      }
      var sum = s.skillSummary;
      if (sum && sum.slipping > 0) {
        items.push({ kind: 'slipping', priority: 3, studentId: id, name: name,
          title: 'is due for review', detail: sum.slipping + ' skill' + (sum.slipping > 1 ? 's' : '') + ' slipping since they were learned',
          at: lastActiveAt(s) || now });
      }
    });

    return items
      .map(function (it) { it.key = it.kind + ':' + it.studentId; return it; })
      .filter(function (it) { return !(snoozed[it.key] > now); })
      .sort(function (a, b) { return a.priority - b.priority || (b.at || 0) - (a.at || 0); });
  }

  /**
   * "Teach this next": skills where several current students are stuck right
   * now — worth a whole-class or small-group moment rather than N separate
   * nudges. Counts only recent, evidence-backed struggle (skillSummary).
   */
  function teachNext(students, now, limit) {
    now = now || Date.now();
    var bySkill = {};
    (students || []).forEach(function (s) {
      if (studentStatus(s, now) === 'inactive') return;
      strugglingSkills(s).forEach(function (sk) {
        var k = sk.skillId;
        if (!bySkill[k]) bySkill[k] = { skillId: k, name: sk.name || k, students: [], reasons: [] };
        bySkill[k].students.push({ id: String(s._id), name: fullName(s) });
        if (sk.reason === 'tutor-flagged' && sk.detail) bySkill[k].reasons.push(sk.detail);
      });
    });
    // A "group" is two or more — one stuck student is a queue item, not a lesson.
    return Object.keys(bySkill).map(function (k) { return bySkill[k]; })
      .filter(function (g) { return g.students.length >= 2; })
      .sort(function (a, b) { return b.students.length - a.students.length || a.name.localeCompare(b.name); })
      .slice(0, limit || 3);
  }

  /** Skills mastered in the window, newest first. */
  function recentWins(students, now, days) {
    now = now || Date.now();
    var cutoff = now - (days || 30) * DAY_MS;
    var wins = [];
    (students || []).forEach(function (s) {
      ((s.skillSummary && s.skillSummary.recentlyMastered) || []).forEach(function (r) {
        var t = time(r.masteredDate);
        if (t >= cutoff) wins.push({ studentId: String(s._id), name: fullName(s), skill: r.name || r.skillId, at: t });
      });
    });
    return wins.sort(function (a, b) { return b.at - a.at; });
  }

  /** {current, previous, pct} — pct null when there is no baseline to compare to. */
  function trend(current, previous) {
    current = Number(current) || 0;
    previous = Number(previous) || 0;
    return { current: current, previous: previous, pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
  }

  var api = {
    INACTIVE_DAYS: INACTIVE_DAYS,
    lastActiveAt: lastActiveAt,
    weekMinutes: weekMinutes,
    strugglingSkills: strugglingSkills,
    studentStatus: studentStatus,
    isActiveToday: isActiveToday,
    formatLastActive: formatLastActive,
    daysSinceActive: daysSinceActive,
    normalizeMastery: normalizeMastery,
    classMetrics: classMetrics,
    trend: trend,
    plainMath: plainMath,
    fullName: fullName,
    buildActionQueue: buildActionQueue,
    teachNext: teachNext,
    recentWins: recentWins
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TeacherMetrics = api;
})(typeof window !== 'undefined' ? window : null);
