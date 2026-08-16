/**
 * PARENTAL CONSENT VERIFICATION — the emailed link, end to end, against a real DB.
 *
 * What was broken (all three at once, which is why nobody noticed one of them):
 *
 *   1. `privacyConsent.consentToken` / `consentTokenExpires` were never declared
 *      on the user schema. Mongoose is strict, so `request-parent-email` wrote
 *      them and the save silently dropped them — the token in the emailed URL
 *      matched nothing that had ever been stored.
 *   2. `public/parental-consent.html`, the page the email links to, did not
 *      exist. Every parent who clicked got a 404.
 *   3. No route redeemed the token. The in-code comment claimed a "verify-consent
 *      route" handled it; there wasn't one, in any file.
 *
 * Net effect: consent could never move from 'pending' to 'active' through the
 * product, for anyone. These tests drive the real router and the real schema so
 * that stays fixed — #1 in particular is invisible to any test that doesn't
 * round-trip through an actual save().
 */

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const consentVerifyRoutes = require('../../routes/consentVerify');

let mongod;

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/consent-verify', consentVerifyRoutes);
    return app;
}

function yearsAgo(n) {
    return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

/** Mirrors what routes/consent.js request-parent-email does. */
async function seedPendingRequest({ age = 9, parentEmail = 'parent@example.com', expiresInMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const student = await User.create({
        username: `kid_${crypto.randomBytes(4).toString('hex')}`,
        email: `kid_${crypto.randomBytes(4).toString('hex')}@example.com`,
        passwordHash: 'x',
        firstName: 'Sam',
        role: 'student',
        roles: ['student'],
        dateOfBirth: yearsAgo(age),
        privacyConsent: {
            status: 'pending',
            consentPathway: 'individual_parent',
            consentToken: hashedToken,
            consentTokenExpires: new Date(Date.now() + expiresInMs),
            pendingParentEmail: parentEmail,
            history: [],
        },
    });

    return { student, rawToken };
}

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

afterEach(async () => {
    await User.deleteMany({});
});

describe('the token actually persists (regression: strict-mode drop)', () => {
    test('consentToken survives a real save() round-trip', async () => {
        const { student, rawToken } = await seedPendingRequest();

        const reloaded = await User.findById(student._id);
        const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        // Before the schema fix this was undefined — the field was stripped.
        expect(reloaded.privacyConsent.consentToken).toBe(expectedHash);
        expect(reloaded.privacyConsent.consentTokenExpires).toBeInstanceOf(Date);
        expect(reloaded.privacyConsent.pendingParentEmail).toBe('parent@example.com');
    });

    test('the raw token is never stored — only its hash', async () => {
        const { student, rawToken } = await seedPendingRequest();
        const reloaded = await User.findById(student._id);
        expect(reloaded.privacyConsent.consentToken).not.toBe(rawToken);
    });
});

describe('GET /api/consent-verify/:token', () => {
    test('valid token describes the request without leaking PII beyond a first name', async () => {
        const { rawToken } = await seedPendingRequest({ age: 9 });

        const res = await supertest(makeApp()).get(`/api/consent-verify/${rawToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.studentFirstName).toBe('Sam');
        expect(res.body.requiresCoppaConsent).toBe(true);
        // No surname, no email, no id.
        expect(JSON.stringify(res.body)).not.toMatch(/@example\.com.*@example\.com/);
    });

    test('a 13-17 student is flagged as NOT requiring COPPA consent', async () => {
        const { rawToken } = await seedPendingRequest({ age: 15 });
        const res = await supertest(makeApp()).get(`/api/consent-verify/${rawToken}`);
        expect(res.status).toBe(200);
        expect(res.body.requiresCoppaConsent).toBe(false);
    });

    test('unknown token is rejected', async () => {
        const res = await supertest(makeApp()).get('/api/consent-verify/not-a-real-token');
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('expired token is rejected', async () => {
        const { rawToken } = await seedPendingRequest({ expiresInMs: -1000 });
        const res = await supertest(makeApp()).get(`/api/consent-verify/${rawToken}`);
        expect(res.status).toBe(400);
    });

    test('expired and unknown tokens are indistinguishable', async () => {
        const { rawToken } = await seedPendingRequest({ expiresInMs: -1000 });
        const app = makeApp();
        const expired = await supertest(app).get(`/api/consent-verify/${rawToken}`);
        const unknown = await supertest(app).get('/api/consent-verify/deadbeef');
        expect(expired.body).toEqual(unknown.body);
    });
});

describe('POST /api/consent-verify/grant', () => {
    test('grants consent and records a parent-attributed audit entry', async () => {
        const { student, rawToken } = await seedPendingRequest();

        const res = await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .send({ token: rawToken });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const reloaded = await User.findById(student._id);
        expect(reloaded.privacyConsent.status).toBe('active');
        expect(reloaded.privacyConsent.consentPathway).toBe('individual_parent');
        expect(reloaded.hasParentalConsent).toBe(true);

        const record = reloaded.privacyConsent.history.at(-1);
        expect(record.consentType).toBe('parent_individual');
        expect(record.grantedByRole).toBe('parent');
        expect(record.verificationMethod).toBe('email_link');
        expect(record.grantedByName).toBe('parent@example.com');
        expect(record.scope).toEqual(expect.arrayContaining(['ai_processing', 'data_collection']));
    });

    test('token is single use — a replayed link is inert', async () => {
        const { student, rawToken } = await seedPendingRequest();
        const app = makeApp();

        const first = await supertest(app).post('/api/consent-verify/grant').send({ token: rawToken });
        expect(first.status).toBe(200);

        const replay = await supertest(app).post('/api/consent-verify/grant').send({ token: rawToken });
        expect(replay.status).toBe(400);

        // Exactly one grant recorded, not two.
        const reloaded = await User.findById(student._id);
        expect(reloaded.privacyConsent.history).toHaveLength(1);
        expect(reloaded.privacyConsent.consentToken).toBeNull();
    });

    test('an expired token cannot grant consent', async () => {
        const { student, rawToken } = await seedPendingRequest({ expiresInMs: -1000 });

        const res = await supertest(makeApp())
            .post('/api/consent-verify/grant')
            .send({ token: rawToken });

        expect(res.status).toBe(400);
        const reloaded = await User.findById(student._id);
        expect(reloaded.privacyConsent.status).toBe('pending');
        expect(reloaded.hasParentalConsent).toBeFalsy();
    });

    test('a missing token body does not grant anything', async () => {
        const res = await supertest(makeApp()).post('/api/consent-verify/grant').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /api/consent-verify/decline', () => {
    test('records the refusal as an auditable event and leaves consent off', async () => {
        const { student, rawToken } = await seedPendingRequest();

        const res = await supertest(makeApp())
            .post('/api/consent-verify/decline')
            .send({ token: rawToken });

        expect(res.status).toBe(200);
        expect(res.body.declined).toBe(true);

        const reloaded = await User.findById(student._id);
        expect(reloaded.privacyConsent.status).toBe('revoked');
        expect(reloaded.hasParentalConsent).toBe(false);

        const record = reloaded.privacyConsent.history.at(-1);
        expect(record.consentType).toBe('parent_declined');
        expect(record.revokedAt).toBeInstanceOf(Date);
        expect(record.scope).toEqual([]);
    });

    test('declining burns the token too — no second bite', async () => {
        const { rawToken } = await seedPendingRequest();
        const app = makeApp();

        await supertest(app).post('/api/consent-verify/decline').send({ token: rawToken });
        const retry = await supertest(app).post('/api/consent-verify/grant').send({ token: rawToken });

        expect(retry.status).toBe(400);
    });
});
