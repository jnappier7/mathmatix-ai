/**
 * POST /api/consent/grant/self — complete-profile.html shows a 13-17 student
 * "I agree — continue" beside the date-of-birth field, but the DOB is only
 * saved when the form submits, and the form will not submit a 13-17 without
 * consent. grantSelfConsent requires a stored DOB, so the button always failed
 * (as a 500). The route now takes the DOB with the agreement — write-once, the
 * same rule as every DOB writer in utils/dob.js, so it can never replace a
 * recorded DOB (that would let an under-13 age up).
 */

const express = require('express');
const supertest = require('supertest');

const student = {};
jest.mock('../../middleware/auth', () => ({
    isAuthenticated: (req, _res, next) => { req.user = { _id: 's1', roles: ['student'], role: 'student' }; next(); },
    isAdmin: (_req, _res, next) => next(),
    isParent: (_req, _res, next) => next(),
}));
jest.mock('../../models/user', () => ({ findById: jest.fn() }));
jest.mock('../../models/enrollmentCode', () => ({}));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../utils/emailService', () => ({ sendTeenConsentRequest: jest.fn() }));
jest.mock('../../utils/consentManager', () => ({
    // Mirrors the real precondition: reads the STORED DOB.
    grantSelfConsent: jest.fn(async () => {
        if (!student.dateOfBirth) throw new Error('Date of birth required for self-consent');
        const age = (Date.now() - new Date(student.dateOfBirth)) / (365.25 * 864e5);
        if (age < 13) throw new Error('Student must be 13 or older to self-consent');
        return { status: 'active' };
    }),
    grantParentConsent: jest.fn(),
    issueParentConsentRequest: jest.fn(),
    grantSchoolConsent: jest.fn(),
    revokeConsent: jest.fn(),
    checkConsent: jest.fn(),
    grantBatchSchoolConsent: jest.fn(),
}));

const User = require('../../models/user');
const consentRoutes = require('../../routes/consent');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/consent', consentRoutes);
    return app;
}

function isoYearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 864e5).toISOString().slice(0, 10);
}

beforeEach(() => {
    for (const k of Object.keys(student)) delete student[k];
    Object.assign(student, { _id: 's1', save: jest.fn().mockResolvedValue(true) });
    User.findById.mockResolvedValue(student);
});

test('DOB sent with the agreement is saved, then consent succeeds', async () => {
    const res = await supertest(makeApp()).post('/api/consent/grant/self').send({ dateOfBirth: isoYearsAgo(15) });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(student.dateOfBirth).toBeInstanceOf(Date);
    expect(student.save).toHaveBeenCalled();
});

test('a stored DOB is never replaced — an under-13 cannot age up here', async () => {
    const stored = new Date(isoYearsAgo(10));
    student.dateOfBirth = stored;
    const res = await supertest(makeApp()).post('/api/consent/grant/self').send({ dateOfBirth: isoYearsAgo(15) });
    expect(student.dateOfBirth).toBe(stored);
    expect(student.save).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
});

test('no DOB anywhere is a 400, not a 500', async () => {
    const res = await supertest(makeApp()).post('/api/consent/grant/self').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Date of birth required/);
});

test('an invalid DOB is rejected before anything is saved', async () => {
    const res = await supertest(makeApp()).post('/api/consent/grant/self').send({ dateOfBirth: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(student.save).not.toHaveBeenCalled();
});

test('an under-13 DOB is saved but cannot self-consent', async () => {
    const res = await supertest(makeApp()).post('/api/consent/grant/self').send({ dateOfBirth: isoYearsAgo(11) });
    expect(res.status).toBe(403);
});
