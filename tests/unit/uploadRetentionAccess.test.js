// tests/unit/uploadRetentionAccess.test.js
//
// Who may read or change a student's upload-retention setting.
//
// routes/settings.js carried this rule twice — once on POST /upload-retention
// and once on GET /upload-retention/:studentId — and both copies keyed on
// `currentUser.role`, the ACTIVE role, i.e. whichever dashboard the account
// currently has open (CLAUDE.md §12). Two separate defects came out of that:
//
//   1. An admin who also holds parent could not touch the setting from any
//      view but the admin dashboard.
//   2. The grants were an if/else-if chain, so an account only ever received
//      the reach of whichever role matched FIRST. A teacher who also holds
//      parent landed in the parent branch, failed the children check, and was
//      refused a student plainly on their own roster — the teacher branch
//      never ran at all.
//
// The rule now lives in utils/uploadRetentionAccess.js and unions the grants.
// studentId arrives off req.params / req.body, so it is a STRING here while
// actor.children entries and student.teacherId are ObjectIds; every case below
// keeps that asymmetry rather than comparing like to like, because a rule that
// only held for matching types would pass this file and 403 in production.

const mongoose = require('mongoose');
const { uploadRetentionAccess } = require('../../utils/uploadRetentionAccess');

const oid = () => new mongoose.Types.ObjectId();

const TEACHER = oid();
const STUDENT = oid();

const studentDoc = (extra = {}) => ({ _id: STUDENT, teacherId: TEACHER, ...extra });
const asParam = (id) => String(id); // as it arrives off the request

describe('uploadRetentionAccess — single-role accounts are unchanged', () => {
    test('an admin may set it for anyone', () => {
        expect(uploadRetentionAccess(
            { _id: oid(), role: 'admin', roles: ['admin'] }, studentDoc(), asParam(STUDENT)
        )).toEqual({ allowed: true, reason: 'admin' });
    });

    test('a teacher may set it for their own student', () => {
        expect(uploadRetentionAccess(
            { _id: TEACHER, role: 'teacher', roles: ['teacher'] }, studentDoc(), asParam(STUDENT)
        )).toEqual({ allowed: true, reason: 'teacher' });
    });

    test('a teacher may NOT set it for another teacher’s student', () => {
        expect(uploadRetentionAccess(
            { _id: oid(), role: 'teacher', roles: ['teacher'] }, studentDoc(), asParam(STUDENT)
        ).allowed).toBe(false);
    });

    test('a parent may set it for their own child', () => {
        expect(uploadRetentionAccess(
            { _id: oid(), role: 'parent', roles: ['parent'], children: [STUDENT] },
            studentDoc(), asParam(STUDENT)
        )).toEqual({ allowed: true, reason: 'parent' });
    });

    test('a parent may NOT set it for someone else’s child', () => {
        expect(uploadRetentionAccess(
            { _id: oid(), role: 'parent', roles: ['parent'], children: [oid()] },
            studentDoc(), asParam(STUDENT)
        ).allowed).toBe(false);
    });

    test('a student may set their own, and only their own', () => {
        const self = { _id: STUDENT, role: 'student', roles: ['student'] };
        expect(uploadRetentionAccess(self, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: true, reason: 'self' });
        expect(uploadRetentionAccess(self, studentDoc({ _id: oid() }), asParam(oid())).allowed)
            .toBe(false);
    });
});

describe('uploadRetentionAccess — roles HELD, not the active dashboard', () => {
    test('an admin viewing the parent dashboard keeps the admin grant', () => {
        const actor = { _id: oid(), role: 'parent', roles: ['admin', 'parent'], children: [] };
        expect(actor.role === 'admin').toBe(false); // the old comparison, explicit

        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: true, reason: 'admin' });
    });

    test('a teacher viewing the parent dashboard still reaches their own student', () => {
        const actor = { _id: TEACHER, role: 'parent', roles: ['teacher', 'parent'], children: [] };
        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: true, reason: 'teacher' });
    });

    test('THE ELSE-IF BUG: a teacher-parent reaches their roster even on the parent branch', () => {
        // roles=['parent','teacher'] with role='parent': the old chain tested
        // parent first, found the student was not their child, and stopped —
        // never reaching the teacher branch that would have allowed it.
        const actor = {
            _id: TEACHER,
            role: 'parent',
            roles: ['parent', 'teacher'],
            children: [oid()], // some OTHER child, not this student
        };
        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: true, reason: 'teacher' });
    });

    test('and the mirror: a teacher-parent reaches their own child off-roster', () => {
        const ownChild = oid();
        const actor = {
            _id: TEACHER,
            role: 'teacher',
            roles: ['teacher', 'parent'],
            children: [ownChild],
        };
        // This child is on a DIFFERENT teacher's roster.
        expect(uploadRetentionAccess(
            actor, { _id: ownChild, teacherId: oid() }, asParam(ownChild)
        )).toEqual({ allowed: true, reason: 'parent' });
    });

    test('a student viewing their parent dashboard still reaches their own setting', () => {
        const actor = { _id: STUDENT, role: 'parent', roles: ['student', 'parent'], children: [] };
        expect(actor.role === 'student').toBe(false);

        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: true, reason: 'self' });
    });
});

describe('uploadRetentionAccess — widening must not reach further than the grants', () => {
    test('a multi-role account with no link to the student is still refused', () => {
        const actor = {
            _id: oid(),
            role: 'teacher',
            roles: ['teacher', 'parent', 'student'],
            children: [oid()],
        };
        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)))
            .toEqual({ allowed: false, reason: null });
    });

    test('a student cannot reach another student by also holding parent', () => {
        // Holding parent is a grant only for accounts actually linked as one.
        const actor = { _id: oid(), role: 'student', roles: ['student', 'parent'], children: [] };
        expect(uploadRetentionAccess(actor, studentDoc(), asParam(STUDENT)).allowed).toBe(false);
    });

    test('missing actor or studentId is refused rather than throwing', () => {
        expect(uploadRetentionAccess(null, studentDoc(), asParam(STUDENT)).allowed).toBe(false);
        expect(uploadRetentionAccess({ _id: oid(), roles: ['admin'] }, studentDoc(), undefined).allowed).toBe(false);
    });

    test('a teacher grant does not fire when the student has no teacher at all', () => {
        const actor = { _id: TEACHER, role: 'teacher', roles: ['teacher'] };
        expect(uploadRetentionAccess(actor, { _id: STUDENT }, asParam(STUDENT)).allowed).toBe(false);
    });
});
