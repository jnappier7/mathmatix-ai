/**
 * public/js/teacher-metrics.js — every number on the teacher dashboard, once.
 *
 * Regressions this pins, all seen on prod 2026-10-13:
 *   • "Avg Mastery 287%" (legacy 0-1 scores multiplied by 100 again)
 *   • "Need Help 100" of 105 (inactive accounts counted as needing help)
 *   • "Active Today" 5 in one panel, 7 in another
 *   • week-over-week trends and the profile 4-week chart were Math.random()
 */
const fs = require('fs');
const path = require('path');
const TM = require('../../public/js/teacher-metrics');

const NOW = new Date('2026-10-14T15:00:00').getTime(); // local time
const DAY = 24 * 60 * 60 * 1000;

const student = (o = {}) => ({
  _id: Math.random().toString(36).slice(2),
  level: 1,
  activity: { lastActiveAt: null, weeklyMinutes: [0, 0, 0, 0] },
  skillSummary: { mastered: 0, inProgress: 0, slipping: 0, total: 0, avgMastery: null, struggling: [], recentlyMastered: [] },
  ...o,
});

describe('studentStatus', () => {
  test('never active → inactive', () => {
    expect(TM.studentStatus(student(), NOW)).toBe('inactive');
  });
  test('active this week with no struggle evidence → active, even at low minutes', () => {
    const s = student({ activity: { lastActiveAt: new Date(NOW - DAY), weeklyMinutes: [3, 0, 0, 0] } });
    expect(TM.studentStatus(s, NOW)).toBe('active');
  });
  test('active with recent struggle evidence → needs help', () => {
    const s = student({
      activity: { lastActiveAt: new Date(NOW - DAY), weeklyMinutes: [20, 0, 0, 0] },
      skillSummary: { struggling: [{ skillId: 'x', reason: 'tutor-flagged' }] },
    });
    expect(TM.studentStatus(s, NOW)).toBe('struggling');
  });
  test('struggle evidence on an inactive student is still inactive (not double-counted)', () => {
    const s = student({ skillSummary: { struggling: [{ skillId: 'x' }] } });
    expect(TM.studentStatus(s, NOW)).toBe('inactive');
  });
  test('falls back to lastLogin for payloads without an activity block', () => {
    expect(TM.studentStatus({ lastLogin: new Date(NOW - DAY) }, NOW)).toBe('active');
  });
});

describe('classMetrics', () => {
  const roster = [
    student({ level: 5, activity: { lastActiveAt: new Date(NOW - 2 * 3600e3), weeklyMinutes: [30, 10, 0, 0] },
      skillSummary: { mastered: 2, inProgress: 1, slipping: 0, total: 3, avgMastery: 80, struggling: [], recentlyMastered: [] } }),
    student({ level: 3, activity: { lastActiveAt: new Date(NOW - 3 * DAY), weeklyMinutes: [12, 0, 5, 0] },
      skillSummary: { mastered: 0, inProgress: 2, slipping: 1, total: 3, avgMastery: 40, struggling: [{ skillId: 'y' }], recentlyMastered: [] } }),
    student({ level: 1, activity: { lastActiveAt: new Date(NOW - 200 * DAY), weeklyMinutes: [0, 0, 0, 0] } }),
    student(),
  ];
  const m = TM.classMetrics(roster, NOW);

  test('one definition of each count', () => {
    expect(m).toMatchObject({ total: 4, activeToday: 1, activeThisWeek: 2, needHelp: 1, inactive: 2, neverActive: 1 });
  });
  test('need help never includes inactive students', () => {
    expect(m.needHelp).toBeLessThanOrEqual(m.activeThisWeek);
  });
  test('real weekly history (not invented)', () => {
    expect(m.minutesByWeek).toEqual([42, 10, 5, 0]);
    expect(m.activeByWeek).toEqual([2, 1, 1, 0]);
  });
  test('average mastery is on 0-100 and never exceeds it', () => {
    expect(m.avgMastery).toBe(60);
  });
  test('legacy full payload: raw 0-1 scores are normalized, not multiplied again', () => {
    const legacy = [{ lastLogin: new Date(NOW - DAY), skillMastery: { a: { masteryScore: 1 }, b: { masteryScore: 1 }, c: { masteryScore: 67 } } }];
    expect(TM.classMetrics(legacy, NOW).avgMastery).toBe(89);
  });
  test('trend has no percentage without a baseline', () => {
    expect(TM.trend(5, 0).pct).toBeNull();
    expect(TM.trend(109, 21).pct).toBe(419);
  });
});

describe('formatLastActive', () => {
  test('never', () => expect(TM.formatLastActive(student(), NOW)).toBe('Never'));
  test('yesterday', () => expect(TM.formatLastActive(student({ activity: { lastActiveAt: new Date(NOW - DAY) } }), NOW)).toBe('Yesterday'));
  test('minutes ago', () => expect(TM.formatLastActive(student({ activity: { lastActiveAt: new Date(NOW - 5 * 60e3) } }), NOW)).toBe('5m ago'));
});

/**
 * "Active" means WORK. On prod (2026-11-17) 42 "active" students were 4 who
 * had talked to the tutor, 21 with a few minutes of page time and no
 * message, and 17 who opened it and left. The work clock (lastWorkedAt /
 * workByWeek) decides status; presence is reported beside it, never counted.
 */
describe('the work clock decides "active"', () => {
  const opened = student({ activity: { lastActiveAt: new Date(NOW - DAY), lastWorkedAt: null, weeklyMinutes: [3, 0, 0, 0], workByWeek: [0, 0, 0, 0] } });
  const worked = student({ activity: { lastActiveAt: new Date(NOW - DAY), lastWorkedAt: new Date(NOW - 2 * DAY), weeklyMinutes: [15, 0, 0, 0], workByWeek: [2, 0, 0, 0] } });
  const lapsed = student({ activity: { lastActiveAt: new Date(NOW - DAY), lastWorkedAt: new Date(NOW - 12 * DAY), weeklyMinutes: [2, 0, 0, 0], workByWeek: [0, 1, 0, 0] } });

  test('opened the tutor this week, did nothing → inactive, and flagged as opened-only', () => {
    expect(TM.studentStatus(opened, NOW)).toBe('inactive');
    expect(TM.openedOnly(opened, NOW)).toBe(true);
    expect(TM.formatLastActive(opened, NOW)).toBe('Opened yesterday, no work yet');
    expect(TM.daysSinceActive(opened, NOW)).toBeNull();
  });
  test('sent a message / took a test this week → active; last active is when they worked', () => {
    expect(TM.studentStatus(worked, NOW)).toBe('active');
    expect(TM.openedOnly(worked, NOW)).toBe(false);
    expect(TM.formatLastActive(worked, NOW)).toBe('2d ago');
  });
  test('seen yesterday but last worked 12 days ago → inactive (presence is not engagement)', () => {
    expect(TM.studentStatus(lapsed, NOW)).toBe('inactive');
    expect(TM.daysSinceActive(lapsed, NOW)).toBe(12);
  });
  test('class tile and its trend agree: activeThisWeek is activeByWeek[0]', () => {
    const m = TM.classMetrics([opened, worked, lapsed], NOW);
    expect(m.activeThisWeek).toBe(1);
    expect(m.activeByWeek).toEqual([1, 1, 0, 0]);
    expect(m.openedOnly).toBe(2);
    expect(m.minutesByWeek[0]).toBe(20); // presence minutes still summed, separately
  });
  test('the queue says what happened: lapsed by work, not-started by presence', () => {
    const q = TM.buildActionQueue([opened, lapsed], [], NOW);
    expect(q.find(i => i.kind === 'not-started')).toMatchObject({ detail: 'opened the tutor yesterday, no work yet' });
    expect(q.find(i => i.kind === 'lapsed')).toMatchObject({ title: "hasn't worked in 12 days" });
  });
  test('payloads without the work clock fall back to presence (old server)', () => {
    const old = student({ activity: { lastActiveAt: new Date(NOW - DAY), weeklyMinutes: [3, 0, 0, 0] } });
    expect(TM.studentStatus(old, NOW)).toBe('active');
    expect(TM.workEvents(old, 0)).toBe(1);
  });
  test('placed-out skills are counted apart from mastered', () => {
    const m = TM.classMetrics([student({ skillSummary: { mastered: 2, placedOut: 18, inProgress: 0, slipping: 0, total: 2, avgMastery: 90, struggling: [], recentlyMastered: [] } })], NOW);
    expect(m.skills).toMatchObject({ mastered: 2, placedOut: 18, studentsWithData: 1 });
  });
});

describe('the dashboard reads these, and invents nothing', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/js/teacher-dashboard.js'), 'utf8');
  test('no Math.random() anywhere in the teacher dashboard', () => {
    expect(src).not.toMatch(/Math\.random\s*\(/);
  });
  test('status delegates to the shared definition', () => {
    expect(src).toMatch(/function getStudentStatus\(student\) \{\s*return TeacherMetrics\.studentStatus\(student\);/);
  });
  test('the initial roster load paints the stats (the "--" on load bug)', () => {
    const fn = src.slice(src.indexOf('async function fetchAssignedStudents('), src.indexOf('function sortStudentsList('));
    expect(fn).toMatch(/refreshDashboardStats\(students\)/);
    expect(src).not.toMatch(/fetchAssignedStudents\s*=\s*async function/);
  });
  test('teacher-metrics loads before the dashboard in the page bundle', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/dist/page-bundles.manifest.json'), 'utf8'));
    const files = manifest['teacher-dashboard.html'].js.flatMap(b => b.files);
    const metrics = files.indexOf('/js/teacher-metrics.js');
    const dash = files.findIndex(f => f.startsWith('/js/teacher-dashboard.js'));
    expect(metrics).toBeGreaterThan(-1);
    expect(metrics).toBeLessThan(dash);
  });
});
