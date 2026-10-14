/**
 * Only a student, acting as a student, accrues tutoring time. The dashboards
 * load the same SessionManager, so a teacher browsing the roster was being
 * credited tutoring minutes (prod: a teacher account at 42 min/week) — numbers
 * that feed the efficacy and usage figures sold to schools.
 */
const { shouldCountTutoringTime } = require('../../utils/tutoringTimeEligibility');
const fs = require('fs');
const path = require('path');

describe('shouldCountTutoringTime', () => {
  test('a student counts', () => {
    expect(shouldCountTutoringTime({ user: { role: 'student', roles: ['student'] } })).toBe(true);
  });
  test.each(['teacher', 'parent', 'admin'])('an active %s view does not', role => {
    expect(shouldCountTutoringTime({ user: { role, roles: ['student', role] } })).toBe(false);
  });
  test('a multi-role account counts only in the student view', () => {
    expect(shouldCountTutoringTime({ user: { role: 'student', roles: ['student', 'teacher'] } })).toBe(true);
  });
  test('impersonation never counts (the minutes would land on the student)', () => {
    expect(shouldCountTutoringTime({ user: { role: 'student' }, isImpersonating: true, originalUser: { role: 'teacher' } })).toBe(false);
  });
  test('no user, no time', () => {
    expect(shouldCountTutoringTime({})).toBe(false);
  });
});

describe('wiring', () => {
  test('track-time consults the guard before writing', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
    const route = src.slice(src.indexOf("router.post('/track-time'"));
    expect(route.indexOf('shouldCountTutoringTime(req)')).toBeGreaterThan(-1);
    expect(route.indexOf('shouldCountTutoringTime(req)')).toBeLessThan(route.indexOf('findByIdAndUpdate'));
  });
  test('the client does not post tutoring time from the dashboards', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../public/js/sessionManager.js'), 'utf8');
    const m = src.match(/this\.tracksTutoringTime = !(\/.*\/)\.test/);
    expect(m).toBeTruthy();
    // eslint-disable-next-line no-eval
    const re = eval(m[1]);
    ['/teacher-dashboard.html', '/parent-dashboard.html', '/admin-dashboard.html', '/teacher-celeration-dashboard.html', '/teacher-dashboard']
      .forEach(p => expect(re.test(p)).toBe(true));
    ['/chat.html', '/student-dashboard.html', '/progress.html', '/mastery-chat.html'].forEach(p => expect(re.test(p)).toBe(false));
    expect((src.match(/&& this\.tracksTutoringTime/g) || []).length).toBe(3);
  });
});
