/**
 * FERPA ANNUAL NOTIFICATION — 34 CFR § 99.7.
 *
 * generateAnnualNotification and sendAnnualNotifications were fully written and
 * unit-tested, and nothing in the codebase ever called them. The privacy policy
 * has promised the notice "at the start of each school year" the whole time.
 * scripts/ferpaAnnualNotification.js is the missing caller.
 *
 * The school-year boundary also had a real bug. It anchored on the CURRENT
 * calendar year (`new Date(currentYear, 7, 1)`), so from January to July the
 * boundary sat in the future and every prior notification compared as "before
 * this school year" — a parent notified in September would have been re-notified
 * on every run from January onward. Wiring up the caller without fixing that
 * would have turned a dormant function into a spam loop.
 */

const {
    schoolYearStart,
    schoolYearLabel,
    generateAnnualNotification,
} = require('../../utils/ferpaCompliance');

describe('school year boundary', () => {
    test('August through December belongs to the school year starting that August', () => {
        expect(schoolYearStart(new Date(2026, 7, 16))).toEqual(new Date(2026, 7, 1));  // Aug
        expect(schoolYearStart(new Date(2026, 11, 25))).toEqual(new Date(2026, 7, 1)); // Dec
    });

    test('January through July still belongs to the PREVIOUS August — the regression', () => {
        // The old code returned Aug 1 of the current year here, i.e. a date in
        // the future, which defeated the already-notified check entirely.
        expect(schoolYearStart(new Date(2027, 0, 15))).toEqual(new Date(2026, 7, 1)); // Jan
        expect(schoolYearStart(new Date(2027, 6, 31))).toEqual(new Date(2026, 7, 1)); // Jul
    });

    test('a September notification still counts as "already notified" in January', () => {
        const notifiedAt = new Date(2026, 8, 1);            // 1 Sep 2026
        const checkedIn = new Date(2027, 0, 15);            // 15 Jan 2027
        expect(notifiedAt >= schoolYearStart(checkedIn)).toBe(true);
    });

    test('but a notification from the PRIOR school year does not', () => {
        const notifiedAt = new Date(2025, 8, 1);            // 1 Sep 2025
        const checkedIn = new Date(2027, 0, 15);            // 15 Jan 2027
        expect(notifiedAt >= schoolYearStart(checkedIn)).toBe(false);
    });

    test('the label spans the two calendar years', () => {
        expect(schoolYearLabel(new Date(2026, 8, 1))).toBe('2026-2027');
        expect(schoolYearLabel(new Date(2027, 0, 15))).toBe('2026-2027');
    });
});

describe('the notice states the rights FERPA requires', () => {
    const notice = generateAnnualNotification({
        studentName: 'Sam',
        parentName: 'Alex',
        schoolName: 'Lincoln Middle School',
    });

    test('names each of the four rights plus the complaint route', () => {
        const text = notice.textContent.toLowerCase();
        expect(text).toContain('inspect and review');
        expect(text).toContain('amendment');
        expect(text).toContain('consent to disclosure');
        expect(text).toContain('directory information');
        expect(text).toContain('family policy compliance office');
    });

    test('is addressed to the parent and names the school', () => {
        expect(notice.textContent).toContain('Alex');
        expect(notice.textContent).toContain('Sam');
        expect(notice.subject).toContain('Lincoln Middle School');
    });
});

describe('the cron caller exists and is runnable', () => {
    const fs = require('fs');
    const path = require('path');
    const ROOT = path.join(__dirname, '..', '..');

    test('the script calls the sender rather than only generating text', () => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts/ferpaAnnualNotification.js'), 'utf8');
        expect(src).toContain('sendAnnualNotifications');
        expect(src).toContain('sendComposedNotification');
    });

    test('an npm alias exists, matching the other crons', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        expect(pkg.scripts['cron:ferpa-notice']).toBe('node scripts/ferpaAnnualNotification.js');
    });

    test('emailService exposes the generic sender the script depends on', () => {
        const { sendComposedNotification } = require('../../utils/emailService');
        expect(typeof sendComposedNotification).toBe('function');
    });
});
