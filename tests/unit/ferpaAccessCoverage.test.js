/**
 * FERPA ACCESS LOGGING — coverage and attribution.
 *
 * 34 CFR § 99.32 requires a record of each request for access to a student's
 * education records, and public/privacy.html promises parents they can view
 * that log. Two things were wrong:
 *
 *   1. Coverage. Most routes that serve a named student's records to an adult
 *      carried requireActiveConsent() but no logRecordAccess(). The worst gap
 *      was GET /api/privacy/export/:studentId — it returns the student's ENTIRE
 *      education record in one response and logged nothing at all.
 *
 *   2. Attribution. The middleware recorded req.user.role, which is the
 *      dashboard the user is currently viewing, not the roles they hold. An
 *      admin who had switched to their parent view was logged as 'parent',
 *      understating who actually read the record. This is the role vs roles[]
 *      trap documented in CLAUDE.md.
 */

const fs = require('fs');
const path = require('path');

const { mostPrivilegedRole } = require('../../middleware/ferpaAccessLog');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('access-log attribution uses roles HELD', () => {
    test('a multi-role admin viewing the parent dashboard is logged as admin', () => {
        const adminActingAsParent = { role: 'parent', roles: ['parent', 'admin'] };
        expect(mostPrivilegedRole(adminActingAsParent)).toBe('admin');
    });

    test('a teacher who is also a parent is logged as teacher', () => {
        expect(mostPrivilegedRole({ role: 'parent', roles: ['parent', 'teacher'] })).toBe('teacher');
    });

    test('a single-role user is unchanged', () => {
        expect(mostPrivilegedRole({ role: 'parent', roles: ['parent'] })).toBe('parent');
        expect(mostPrivilegedRole({ role: 'teacher', roles: ['teacher'] })).toBe('teacher');
    });

    test('falls back to legacy role string when roles[] is absent', () => {
        expect(mostPrivilegedRole({ role: 'admin' })).toBe('admin');
    });

    test('always yields a value — accessedByRole is a required field', () => {
        expect(mostPrivilegedRole({})).toBe('student');
        expect(mostPrivilegedRole(null)).toBe('student');
        expect(mostPrivilegedRole({ roles: ['nonsense'] })).toBe('student');
    });
});

describe('access-log coverage on student-record routes', () => {
    // A route that gates on consent is by definition serving a specific
    // student's records to someone else — which is exactly what § 99.32 wants
    // recorded. The two must travel together.
    const FILES = ['routes/teacher.js', 'routes/admin.js'];

    test('every consent-gated route also logs the access', () => {
        const unlogged = [];

        for (const file of FILES) {
            for (const line of read(file).split('\n')) {
                if (!line.includes('requireActiveConsent()')) continue;
                if (line.includes('logRecordAccess(')) continue;
                unlogged.push(`${file}: ${line.trim().slice(0, 90)}`);
            }
        }

        expect(unlogged).toEqual([]);
    });

    test('the full-record export is logged as an export', () => {
        const src = read('routes/dataPrivacy.js');
        expect(src).toContain("logRecordAccess('full_export', 'data_export_request'");
        expect(src).toMatch(/accessType:\s*'export'/);
    });

    test('dataPrivacy imports the middleware it uses', () => {
        expect(read('routes/dataPrivacy.js')).toContain(
            "require('../middleware/ferpaAccessLog')"
        );
    });
});
