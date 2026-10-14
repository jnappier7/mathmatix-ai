/* ============================================================
   parentGuideBands.js — which Parent Guide fits which child.

   The Parent Learning Center lists every parent mini-course. A parent of a
   9th grader should see the Algebra 1 & Geometry guide first, badged
   "For Jason (grade 9)", not scroll past three elementary guides to find it.

   Pure and DOM-free so it is unit-testable (tests/unit/parentGuideBands.test.js
   requires this file directly). Loaded on parent-dashboard.html inside the
   parent-js1 bundle, before parent-dashboard.js, as window.ParentGuideBands.

   Grade source: the child's SCHOOL grade (user.gradeLevel, from
   /api/parent/children), not an assessed math level — a guide is about the
   class the child is sitting in. Values seen: "K", "1".."12", "9th Grade",
   "Grade 9", "Kindergarten", occasionally a course name ("Algebra 1").
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ParentGuideBands = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var K2 = 'parent-math-k2';
  var G35 = 'parent-math-35';
  var G68 = 'parent-math-68';
  var G910 = 'parent-math-910';
  var TEST_PREP = 'parent-test-prep';

  /** School grade as a number (K = 0), or null when it can't be read. */
  function gradeNumber(level) {
    if (typeof level === 'number') {
      return Number.isInteger(level) && level >= 0 && level <= 12 ? level : null;
    }
    if (typeof level !== 'string') return null;
    var s = level.trim();
    if (!s) return null;
    if (/^(pre-?k|tk|kinder(garten)?|k)$/i.test(s)) return 0;
    var m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+grade)?(?:\s+math)?$/i) ||
            s.match(/^grade\s+(\d{1,2})$/i);
    if (m) {
      var n = parseInt(m[1], 10);
      return n >= 0 && n <= 12 ? n : null;
    }
    if (/^algebra\s*(1|i)$/i.test(s)) return 9;
    if (/^geometry$/i.test(s)) return 10;
    if (/^algebra\s*(2|ii)$/i.test(s)) return 11;
    if (/^pre-?calc(ulus)?$/i.test(s)) return 12;
    return null;
  }

  /**
   * The guides that fit a grade, best first, and whether each earns the
   * child's badge. 11–12 lead with test prep and still list 9–10 (the
   * homework-coaching module applies), unbadged; test prep is badged for
   * every high schooler because the PSAT/PreACT start in 9th–10th.
   */
  function guidesForGrade(grade) {
    if (grade === null || grade === undefined) return [];
    if (grade <= 2) return [{ courseId: K2, badge: true }];
    if (grade <= 5) return [{ courseId: G35, badge: true }];
    if (grade <= 8) return [{ courseId: G68, badge: true }];
    if (grade <= 10) return [{ courseId: G910, badge: true }, { courseId: TEST_PREP, badge: true }];
    return [{ courseId: TEST_PREP, badge: true }, { courseId: G910, badge: false }];
  }

  /** "K" for kindergarten, the number otherwise. */
  function gradeLabel(grade) {
    return grade === 0 ? 'K' : String(grade);
  }

  /**
   * Order the catalog for this parent's children and work out the badges.
   *
   * @param {Array<{courseId:string, sortOrder?:number}>} courses
   * @param {Array<{firstName?:string, username?:string, gradeLevel?:string}>} children
   * @returns {{ courses: Array, badges: Object<string, Array<{name:string, grade:string}>> }}
   *   courses — matching guides first (by best fit across all children, then
   *   catalog order), the rest after in catalog order. badges — courseId →
   *   the children it is badged for, in the order the children were given.
   */
  function rankGuides(courses, children) {
    var list = Array.isArray(courses) ? courses.slice() : [];
    var kids = Array.isArray(children) ? children : [];
    var rank = {};
    var badges = {};

    kids.forEach(function (child) {
      if (!child) return;
      var grade = gradeNumber(child.gradeLevel);
      guidesForGrade(grade).forEach(function (g, i) {
        if (rank[g.courseId] === undefined || i < rank[g.courseId]) rank[g.courseId] = i;
        if (!g.badge) return;
        var name = String(child.firstName || child.username || '').trim();
        if (!name) return;
        (badges[g.courseId] = badges[g.courseId] || []).push({ name: name, grade: gradeLabel(grade) });
      });
    });

    var order = function (c) { return typeof c.sortOrder === 'number' ? c.sortOrder : 99; };
    var keyed = list.map(function (c, i) {
      var r = rank[c && c.courseId];
      return { c: c, i: i, r: r === undefined ? Infinity : r };
    });
    keyed.sort(function (a, b) {
      if (a.r !== b.r) return a.r - b.r;
      if (order(a.c) !== order(b.c)) return order(a.c) - order(b.c);
      return a.i - b.i;
    });
    return { courses: keyed.map(function (k) { return k.c; }), badges: badges };
  }

  /** Fill a "For {name} (grade {grade})" template. Returns UNESCAPED text. */
  function badgeText(template, badge) {
    return String(template || 'For {name} (grade {grade})')
      .split('{name}').join(badge.name)
      .split('{grade}').join(badge.grade);
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    gradeNumber: gradeNumber,
    guidesForGrade: guidesForGrade,
    gradeLabel: gradeLabel,
    rankGuides: rankGuides,
    badgeText: badgeText,
    escapeHtml: escapeHtml,
  };
}));
