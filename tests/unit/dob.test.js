// tests/unit/dob.test.js
// The shared DOB validator/writer. Three writers (signup, /api/user/settings,
// onboarding /intent) all route through this; the decision table here is what
// keeps every age gate (COPPA consent, under-13 voice block, teen
// self-certification) fed with sane data.

const { parseDateOfBirth, applyDobToUser } = require('../../utils/dob');

function yearsAgo(n) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d;
}

describe('parseDateOfBirth', () => {
    test('accepts a plausible YYYY-MM-DD string', () => {
        const r = parseDateOfBirth('2015-03-14');
        expect(r.error).toBeUndefined();
        expect(r.date).toBeInstanceOf(Date);
        expect(r.date.getUTCFullYear()).toBe(2015);
    });

    test('accepts a Date instance', () => {
        const r = parseDateOfBirth(yearsAgo(10));
        expect(r.error).toBeUndefined();
    });

    test('rejects garbage, empty, and unparseable input', () => {
        expect(parseDateOfBirth('not-a-date').error).toBeTruthy();
        expect(parseDateOfBirth('').error).toBeTruthy();
        expect(parseDateOfBirth(null).error).toBeTruthy();
    });

    test('rejects future dates', () => {
        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        expect(parseDateOfBirth(future).error).toBeTruthy();
    });

    test('rejects implausibly old dates (>120y)', () => {
        expect(parseDateOfBirth('1890-01-01').error).toBeTruthy();
    });
});

describe('applyDobToUser (write-once)', () => {
    test('sets DOB when absent', () => {
        const user = {};
        const r = applyDobToUser(user, '2012-06-01');
        expect(r.ok).toBe(true);
        expect(user.dateOfBirth).toBeInstanceOf(Date);
    });

    test('refuses to CHANGE an existing DOB — the age-up loophole', () => {
        // An age-gated under-13 must not be able to self-serve a new birthday.
        const user = { dateOfBirth: new Date('2015-06-01') };
        const r = applyDobToUser(user, '2000-01-01');
        expect(r.ok).toBe(false);
        expect(r.status).toBe(400);
        expect(user.dateOfBirth.getUTCFullYear()).toBe(2015);
    });

    test('surfaces validation errors without mutating the user', () => {
        const user = {};
        const r = applyDobToUser(user, 'gibberish');
        expect(r.ok).toBe(false);
        expect(r.status).toBe(400);
        expect(user.dateOfBirth).toBeUndefined();
    });
});
