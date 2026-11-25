/**
 * The course catalog's order and its time label (course QA, 2026-11-21).
 *
 * ORDER: the recommended course stayed in its grade band, so a 9th grader
 * opened the catalog on Elementary with Algebra 1 several screens down. It is
 * now hoisted under "Recommended for you", after the student's own courses.
 *
 * TIME: the card printed moduleCount × 45 minutes — "~16h" for a year of
 * Algebra 1. The label now comes from the pacing the modules themselves declare
 * (utils/coursePacing.js), and says nothing when a course declares none.
 */
const fs = require('fs');
const path = require('path');
// courseCatalog.js only auto-instantiates inside a DOMContentLoaded handler, so
// a minimal `document` stub lets it load in node.
global.document = global.document || { addEventListener() {} };
const { CourseManager } = require('../../public/js/courseCatalog');
const { coursePacing, lastWeek } = require('../../utils/coursePacing');

const pathway = (id) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../public/resources', `${id}-pathway.json`), 'utf8'));

const CATALOG = [
  { courseId: 'early', group: 'Elementary' },
  { courseId: 'g6', group: 'Middle School' },
  { courseId: 'alg1', group: 'High School' },
  { courseId: 'geo', group: 'High School' },
];
const ids = (list) => list.map(c => c.courseId);

describe('orderCatalog', () => {
  test('the recommended course leads when the student is in nothing', () => {
    const out = CourseManager.orderCatalog(CATALOG, [], 'alg1');
    expect(ids(out)).toEqual(['alg1', 'early', 'g6', 'geo']);
    expect(out[0].group).toBe('Recommended for you');
    expect(out[1].group).toBe('Elementary');
  });

  test('your courses come first, then the recommendation, then the rest in order', () => {
    const out = CourseManager.orderCatalog(CATALOG, ['geo'], 'alg1');
    expect(ids(out)).toEqual(['geo', 'alg1', 'early', 'g6']);
    expect(out.map(c => c.group)).toEqual(['Your courses', 'Recommended for you', 'Elementary', 'Middle School']);
  });

  test('a recommended course the student is already in is not listed twice', () => {
    const out = CourseManager.orderCatalog(CATALOG, ['alg1'], 'alg1');
    expect(ids(out)).toEqual(['alg1', 'early', 'g6', 'geo']);
    expect(out[0].group).toBe('Your courses');
  });

  test('no recommendation, or one filtered out of the list: server order, nothing invented', () => {
    expect(ids(CourseManager.orderCatalog(CATALOG, [], null))).toEqual(ids(CATALOG));
    expect(ids(CourseManager.orderCatalog(CATALOG, [], 'not-here'))).toEqual(ids(CATALOG));
    expect(CourseManager.orderCatalog(CATALOG, [], null)[0].group).toBe('Elementary');
  });

  test('the input is not mutated', () => {
    const before = JSON.stringify(CATALOG);
    CourseManager.orderCatalog(CATALOG, ['geo'], 'alg1');
    expect(JSON.stringify(CATALOG)).toBe(before);
  });
});

describe('timeLabel', () => {
  test('a year-long course says so', () => {
    expect(CourseManager.timeLabel({ paceWeeks: 36, estMinutes: 800 })).toBe('Full-year course · self-paced');
    expect(CourseManager.timeLabel({ paceWeeks: 31 })).toMatch(/^Full-year course/);
  });
  test('Geometry (28 weeks of lessons) is a full-year course like Algebra 1 (31)', () => {
    // The line sat at 30, so two courses a school schedules identically read
    // "Full-year course" and "About 28 weeks at school pace".
    expect(CourseManager.timeLabel({ paceWeeks: 28 })).toBe(CourseManager.timeLabel({ paceWeeks: 31 }));
    expect(CourseManager.timeLabel({ paceWeeks: 27 })).toMatch(/^Full-year course/);
    expect(CourseManager.timeLabel({ paceWeeks: 26 })).toBe('About 26 weeks at school pace · self-paced');
  });
  test('test prep with no weeks says what it is built around, not a number', () => {
    const sat = { courseId: 'sat-prep', paceWeeks: 0, estMinutes: 145 };
    expect(CourseManager.timeLabel(sat)).toBe('Built around your practice tests · self-paced');
    expect(CourseManager.timeLabel({ difficulty: 'Test Prep', paceWeeks: 0 })).toMatch(/practice tests/);
    // ACT prep declares its weeks, so it keeps them.
    expect(CourseManager.timeLabel({ courseId: 'act-prep', paceWeeks: 10 })).toBe('About 10 weeks at school pace · self-paced');
  });
  test('a shorter course gives its weeks', () => {
    expect(CourseManager.timeLabel({ paceWeeks: 10, estMinutes: 410 })).toBe('About 10 weeks at school pace · self-paced');
  });
  test('a one-week guide gives its authored time', () => {
    expect(CourseManager.timeLabel({ paceWeeks: 1, estMinutes: 100 })).toBe('About 1.5 hours');
    expect(CourseManager.timeLabel({ paceWeeks: 1, estMinutes: 60 })).toBe('About 1 hour');
    expect(CourseManager.timeLabel({ paceWeeks: 1, estMinutes: 42 })).toBe('About 40 minutes');
  });
  test('every student course in the catalog has something in the time slot', () => {
    const dir = path.join(__dirname, '../../public/resources');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-pathway.json'))) {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const label = CourseManager.timeLabel({ ...coursePacing(p), courseId: p.courseId });
      expect({ course: p.courseId, blank: label === '' }).toEqual({ course: p.courseId, blank: false });
    }
  });
  test('a course that declares no pacing gets no label, not a guess', () => {
    expect(CourseManager.timeLabel({ paceWeeks: 0, estMinutes: 145, moduleCount: 5 })).toBe('');
    expect(CourseManager.timeLabel({ moduleCount: 21 })).toBe('');
    expect(CourseManager.timeLabel(null)).toBe('');
  });
  test('the 45-minutes-a-module guess is gone from the source', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../public/js/courseCatalog.js'), 'utf8');
    expect(src).not.toMatch(/EST_MINUTES_PER_MODULE/);
  });
});

describe('coursePacing reads the modules', () => {
  test('lastWeek', () => {
    expect(lastWeek('3-5')).toBe(5);
    expect(lastWeek('36+')).toBe(36);
    expect(lastWeek(12)).toBe(12);
    expect(lastWeek('')).toBe(0);
    expect(lastWeek(undefined)).toBe(0);
  });

  test('the shipped courses: year-long ones are year-long, guides are short, SAT prep declares none', () => {
    expect(coursePacing(pathway('algebra-1')).paceWeeks).toBeGreaterThanOrEqual(30);
    expect(coursePacing(pathway('ap-calculus-ab')).paceWeeks).toBe(36);
    const act = coursePacing(pathway('act-prep'));
    expect(act.paceWeeks).toBeGreaterThanOrEqual(2);
    expect(act.paceWeeks).toBeLessThan(30);
    const guide = coursePacing(pathway('parent-math-k2'));
    expect(guide.paceWeeks).toBe(1);
    expect(guide.estMinutes).toBeGreaterThan(0);
    expect(coursePacing(pathway('sat-prep')).paceWeeks).toBe(0);
  });

  test('no student course is labelled in hours any more', () => {
    const dir = path.join(__dirname, '../../public/resources');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('-pathway.json'))) {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p.audience === 'parent') continue;
      expect(CourseManager.timeLabel(coursePacing(p))).not.toMatch(/hour|minute/);
    }
  });

  test('a module path outside public/, or a missing file, contributes nothing', () => {
    expect(coursePacing({ modules: [{ moduleFile: '/../package.json' }, { moduleFile: '/modules/nope.json' }, {}] }))
      .toEqual({ paceWeeks: 0, estMinutes: 0 });
    expect(coursePacing(null)).toEqual({ paceWeeks: 0, estMinutes: 0 });
  });
});
