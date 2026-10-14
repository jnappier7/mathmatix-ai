/**
 * The Today view's logic (public/js/teacher-metrics.js) and its wiring
 * (public/js/teacher-home.js). The view itself has no DOM tests here (no jsdom
 * in this repo); it is verified in the browser via scripts/devTeacherSandbox.js.
 */
const fs = require('fs');
const path = require('path');
const TM = require('../../public/js/teacher-metrics');

const NOW = new Date('2026-10-14T15:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const st = (o = {}) => ({
  _id: `s${++n}`, firstName: o.first || `S${n}`, lastName: 'L', createdAt: new Date(NOW - 200 * DAY),
  activity: { lastActiveAt: null, weeklyMinutes: [0, 0, 0, 0] },
  skillSummary: { mastered: 0, inProgress: 0, slipping: 0, total: 0, struggling: [], recentlyMastered: [] },
  ...o,
});
const active = (days = 1, extra = {}) => ({ activity: { lastActiveAt: new Date(NOW - days * DAY), weeklyMinutes: [20, 10, 0, 0] }, ...extra });
const stuckOn = (skillId, name, reason = 'tutor-flagged', detail = 'sign errors') =>
  ({ total: 1, struggling: [{ skillId, name, reason, detail, lastPracticed: new Date(NOW - DAY) }], recentlyMastered: [] });

describe('buildActionQueue', () => {
  const stuck = st({ first: 'Zoe', ...active(1), skillSummary: stuckOn('two-step', 'Two-Step Equations') });
  const lapsed = st({ first: 'Mat', activity: { lastActiveAt: new Date(NOW - 9 * DAY), weeklyMinutes: [0, 0, 15, 0] } });
  const gone = st({ first: 'Old', activity: { lastActiveAt: new Date(NOW - 200 * DAY), weeklyMinutes: [0, 0, 0, 0] } });
  const fresh = st({ first: 'New', createdAt: new Date(NOW - 3 * DAY) });
  const slipping = st({ first: 'Sli', ...active(2), skillSummary: { total: 2, slipping: 1, struggling: [], recentlyMastered: [] } });
  const fine = st({ first: 'Ok', ...active(1) });
  const roster = [fine, gone, fresh, slipping, lapsed, stuck];

  test('stuck → lapsed → slipping → not started; fine and long-gone students are not to-dos', () => {
    const q = TM.buildActionQueue(roster, [], NOW, {});
    expect(q.map(i => `${i.kind}:${i.name.split(' ')[0]}`)).toEqual(['stuck:Zoe', 'lapsed:Mat', 'slipping:Sli', 'not-started:New']);
  });
  test('each item says why, in teacher words', () => {
    const [item] = TM.buildActionQueue([stuck], [], NOW, {});
    expect(item.title).toBe('is stuck on Two-Step Equations');
    expect(item.detail).toBe('tutor noticed: sign errors');
    const lowAcc = TM.buildActionQueue([st({ ...active(1), skillSummary: stuckOn('slope', 'Slope', 'low-accuracy', '33% of 9') })], [], NOW, {})[0];
    expect(lowAcc.detail).toBe('33% of 9 correct');
  });
  test('a live struggle outranks everything and replaces the stuck item for that student', () => {
    const q = TM.buildActionQueue(roster, [{ studentId: stuck._id, isStruggling: true, strugglingWith: 'negative numbers', lastActivity: new Date(NOW) }], NOW, {});
    expect(q[0]).toMatchObject({ kind: 'live', studentId: stuck._id, detail: 'with negative numbers' });
    expect(q.filter(i => i.studentId === stuck._id)).toHaveLength(1);
  });
  test('snoozed items stay hidden until the snooze lapses', () => {
    expect(TM.buildActionQueue([stuck], [], NOW, { [`stuck:${stuck._id}`]: NOW + DAY })).toHaveLength(0);
    expect(TM.buildActionQueue([stuck], [], NOW, { [`stuck:${stuck._id}`]: NOW - 1 })).toHaveLength(1);
  });
});

describe('teachNext', () => {
  test('only skills where two or more active students are stuck', () => {
    const a = st({ first: 'A', ...active(1), skillSummary: stuckOn('two-step', 'Two-Step Equations') });
    const b = st({ first: 'B', ...active(2), skillSummary: stuckOn('two-step', 'Two-Step Equations', 'missed-on-check', null) });
    const c = st({ first: 'C', ...active(1), skillSummary: stuckOn('slope', 'Slope') });
    const inactive = st({ first: 'D', skillSummary: stuckOn('slope', 'Slope') });
    const groups = TM.teachNext([a, b, c, inactive], NOW);
    expect(groups).toEqual([expect.objectContaining({ skillId: 'two-step', name: 'Two-Step Equations' })]);
    expect(groups[0].students.map(s => s.name)).toEqual(['A L', 'B L']);
    expect(groups[0].reasons).toEqual(['sign errors']);
  });
});

describe('recentWins', () => {
  test('newest first, inside the window', () => {
    const s = st({ first: 'W', skillSummary: { total: 2, struggling: [], recentlyMastered: [
      { skillId: 'a', name: 'A', masteredDate: new Date(NOW - 2 * DAY) },
      { skillId: 'b', name: 'B', masteredDate: new Date(NOW - 40 * DAY) },
    ] } });
    expect(TM.recentWins([s], NOW).map(w => w.skill)).toEqual(['A']);
  });
});

describe('plainMath (session summaries)', () => {
  test.each([
    ['the midpoint \\( M(2,1) \\) given', 'the midpoint M(2,1) given'],
    ['\\( \\frac{3}{4} + \\frac{1}{2} \\)', '3/4 + 1/2'],
    ['\\( \\sqrt{20} = 2\\sqrt{5} \\)', '√20 = 2√5'],
    ['$x^{2} \\le 9$', 'x^2 ≤ 9'],
    ['Solved \\(3x - 7 = 11\\), x = 6', 'Solved 3x - 7 = 11, x = 6'],
  ])('%s', (input, out) => expect(TM.plainMath(input)).toBe(out));
});

describe('wiring', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  const manifest = JSON.parse(read('public/dist/page-bundles.manifest.json'))['teacher-dashboard.html'];
  const js = manifest.js.flatMap(b => b.files);

  test('home + year modules load after metrics and BEFORE the dashboard (their DOMContentLoaded must run first)', () => {
    const i = f => js.findIndex(x => x.startsWith(f));
    expect(i('/js/teacher-metrics.js')).toBeLessThan(i('/js/teacher-school-year.js'));
    expect(i('/js/teacher-school-year.js')).toBeLessThan(i('/js/teacher-home.js'));
    expect(i('/js/teacher-home.js')).toBeLessThan(i('/js/teacher-dashboard.js'));
    expect(manifest.css.flatMap(b => b.files)).toContain('/css/teacher-home.css');
  });
  test('the classic layout stays one query param away', () => {
    expect(read('public/js/teacher-home.js')).toMatch(/q === 'classic'/);
  });
  test('home view styles are scoped so classic renders untouched', () => {
    const css = read('public/css/teacher-home.css');
    expect(css).toMatch(/html\.td-v2 \.left-sidebar/);
    expect(css).not.toMatch(/prefers-color-scheme/); // page pins data-theme="light"
  });
  test('messaging a student goes through the sequenced draft (no timer race with the recipient picker)', () => {
    const dash = read('public/js/teacher-dashboard.js');
    expect(dash).toMatch(/TeacherAnnouncements\.draftTo/);
    expect(dash).not.toMatch(/targetSelect\.value = 'individual'/);
    expect(read('public/js/teacher-announcements.js')).toMatch(/await loadRecipientOptions\(\)/);
  });
  test('status sort keeps "needs help" (0) at the top', () => {
    expect(read('public/js/teacher-dashboard.js')).toMatch(/statusOrder\[getStudentStatus\(a\)\] \?\? 1/);
  });
  test('no native confirm() for view-as-student', () => {
    const dash = read('public/js/teacher-dashboard.js');
    const fn = dash.slice(dash.indexOf('async function handleViewAsStudent'), dash.indexOf('async function handleViewIep'));
    expect(fn).not.toMatch(/\bconfirm\(/);
    expect(fn).toMatch(/showConfirmDialog/);
  });
});
