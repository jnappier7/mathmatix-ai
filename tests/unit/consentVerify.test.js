/**
 * Unit cover for the parental-consent verification router.
 *
 * The full round-trip (including the Mongoose strict-mode drop that made the
 * emailed token unstorable) is pinned by
 * tests/integration/parentalConsentVerification.test.js, which needs a real
 * database. This file mocks the User model so the routing, token hashing,
 * single-use semantics and audit-record shape stay verifiable without one.
 */

const express = require('express');
const supertest = require('supertest');
const crypto = require('crypto');

jest.mock('../../models/user', () => ({ findOne: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const User = require('../../models/user');
const consentVerifyRoutes = require('../../routes/consentVerify');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/consent-verify', consentVerifyRoutes);
    return app;
}

function yearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

/**
 * A stand-in student document. `save()` is a spy so we can assert on the state
 * the route left behind without a database.
 */
function fakeStudent({ age = 9, parentEmail = 'parent@example.com' } = {}) {
    return {
        _id: 'student-1',
        firstName: 'Sam',
        dateOfBirth: yearsAgo(age),
        hasParentalConsent: false,
        privacyConsent: {
            status: 'pending',
            consentPathway: 'individual_parent',
            consentToken: 'stored-hash',
            consentTokenExpires: new Date(Date.now() + 86400000),
            pendingParentEmail: parentEmail,
            history: [],
        },
        save: jest.fn().mockResolvedValue(true),
    };
}

beforeEach(() => {
    User.findOne.mockReset();
});

describe('token lookup', () => {
    test('queries by SHA-256 hash and an unexpired window — never the raw token', async () => {
        User.findOne.mockResolvedValue(fakeStudent());
        const raw = 'abc123';

        await supertest(makeApp()).get(`/api/consent-verify/${raw}`);

        const query = User.findOne.mock.calls[0][0];
        const expected = crypto.createHash('sha256').update(raw).digest('hex');
        expect(query['privacyConsent.consentToken']).toBe(expected);
        expect(query['privacyConsent.consentToken']).not.toBe(raw);
        expect(query['privacyConsent.consentTokenExpires'].$gt).toBeInstanceOf(Date);
    });

    test('no match → 400, and nothing is written', async () => {
        User.findOne.mockResolvedValue(null);
        const res = await supertest(makeApp()).get('/api/consent-verify/nope');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

describe('GET /:token', () => {
    test('under 13 is flagged as requiring COPPA consent', async () => {
        User.findOne.mockResolvedValue(fakeStudent({ age: 9 }));
        const res = await supertest(makeApp()).get('/api/consent-verify/tok');
        expect(res.status).toBe(200);
        expect(res.body.studentFirstName).toBe('Sam');
        expect(res.body.requiresCoppaConsent).toBe(true);
    });

    test('15-year-old is not a COPPA case', async () => {
        User.findOne.mockResolvedValue(fakeStudent({ age: 15 }));
        const res = await supertest(makeApp()).get('/api/consent-verify/tok');
        expect(res.body.requiresCoppaConsent).toBe(false);
    });

    test('unknown date of birth does not claim COPPA applies', async () => {
        const student = fakeStudent();
        student.dateOfBirth = null;
        User.findOne.mockResolvedValue(student);
        const res = await supertest(makeApp()).get('/api/consent-verify/tok');
        expect(res.body.requiresCoppaConsent).toBe(false);
    });
});

describe('POST /grant', () => {
    test('activates consent, burns the token, writes a parent-attributed record', async () => {
        const student = fakeStudent();
        User.findOne.mockResolvedValue(student);

        const res = await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .send({ token: 'tok' });

        expect(res.status).toBe(200);
        expect(student.save).toHaveBeenCalled();

        expect(student.privacyConsent.status).toBe('active');
        expect(student.hasParentalConsent).toBe(true);

        // Single use: the token must not survive the grant.
        expect(student.privacyConsent.consentToken).toBeNull();
        expect(student.privacyConsent.consentTokenExpires).toBeNull();
        expect(student.privacyConsent.pendingParentEmail).toBeNull();

        const record = student.privacyConsent.history.at(-1);
        expect(record.consentType).toBe('parent_individual');
        expect(record.grantedByRole).toBe('parent');
        expect(record.verificationMethod).toBe('email_link');
        expect(record.grantedByName).toBe('parent@example.com');
        expect(record.scope).toEqual(expect.arrayContaining(['ai_processing']));
    });

    test('the audit record carries the PARENT request metadata, not the child request', async () => {
        const student = fakeStudent();
        User.findOne.mockResolvedValue(student);

        await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .set('User-Agent', 'ParentBrowser/1.0')
            .send({ token: 'tok' });

        const record = student.privacyConsent.history.at(-1);
        expect(record.userAgent).toBe('ParentBrowser/1.0');
        expect(record.ipAddress).toBeTruthy();
    });

    test('invalid token grants nothing', async () => {
        User.findOne.mockResolvedValue(null);
        const res = await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .send({ token: 'bad' });
        expect(res.status).toBe(400);
    });

    test('missing token body grants nothing', async () => {
        User.findOne.mockResolvedValue(null);
        const res = await supertest(makeApp()).post('/api/consent-verify/grant').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /decline', () => {
    test('records the refusal, revokes, and burns the token', async () => {
        const student = fakeStudent();
        User.findOne.mockResolvedValue(student);

        const res = await supertest(makeApp())
            .post('/api/consent-verify/decline')
            .send({ token: 'tok' });

        expect(res.status).toBe(200);
        expect(res.body.declined).toBe(true);

        expect(student.privacyConsent.status).toBe('revoked');
        expect(student.hasParentalConsent).toBe(false);
        expect(student.privacyConsent.consentToken).toBeNull();

        const record = student.privacyConsent.history.at(-1);
        expect(record.consentType).toBe('parent_declined');
        expect(record.scope).toEqual([]);
        expect(record.revokedAt).toBeInstanceOf(Date);
    });
});

describe('failure handling', () => {
    test('a database error surfaces as 500, not a silent grant', async () => {
        User.findOne.mockRejectedValue(new Error('db down'));
        const res = await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .send({ token: 'tok' });
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });
});
