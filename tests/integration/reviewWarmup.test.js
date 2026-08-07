/**
 * The spaced-review warm-up loop, end to end against a real database.
 *
 * Three properties are load-bearing:
 *
 *   1. POST /api/review/submit must update BOTH schedules — the SM-2
 *      reviewSchedule it always wrote AND the FSRS card the smart queue reads.
 *      Without the FSRS write, a finished review never leaves the queue and
 *      the same skills get re-offered every session.
 *   2. GET /api/review/smart-queue?includeProblems=true must attach a problem
 *      to every queue skill it can, so the warm-up UI runs on one round-trip.
 *   3. The chat greeting offers the warm-up CTA when reviews are due — but
 *      never over a higher-priority CTA, and never twice within the ~20h
 *      throttle window.
 */

jest.mock('../../utils/llmGateway', () => ({
    callLLM: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Hey! Ready to warm up?' } }],
    }),
    callLLMStream: jest.fn(),
    callLLMStructured: jest.fn().mockResolvedValue({}),
}));

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Skill = require('../../models/skill');
const Problem = require('../../models/problem');

const SKILL_A = 'REV_WARMUP_A';
const SKILL_B = 'REV_WARMUP_B';

let mem;
let reviewApp;
let chatApp;
let currentUser;

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// An FSRS card that is clearly due: last reviewed 10 days ago on a 3-day interval.
const dueFsrsCard = () => ({
    stability: 3,
    difficulty: 5,
    lastReview: daysAgo(10),
    scheduledDays: 3,
    reps: 3,
    lapses: 0,
    state: 'review',
    elapsedDays: 0,
});

const masteredEntry = () => ({
    status: 'mastered',
    reviewSchedule: {
        nextReviewDate: daysAgo(2),
        interval: 5,
        easeFactor: 2.5,
        repetitionCount: 2,
        lapseCount: 0,
    },
});

beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());

    await Skill.insertMany([
        { skillId: SKILL_A, displayName: 'Two-Step Equations', description: 'Solve two-step linear equations', category: 'addition-subtraction', difficulty: 2 },
        { skillId: SKILL_B, displayName: 'Slope From Two Points', description: 'Find slope from two points', category: 'addition-subtraction', difficulty: 3 },
    ]);

    await Problem.insertMany([
        { problemId: 'rev-a1', skillId: SKILL_A, prompt: 'Solve 2x + 4 = 10', answer: { type: 'exact', value: '3' }, difficulty: 2 },
        { problemId: 'rev-b1', skillId: SKILL_B, prompt: 'Slope through (0,0) and (2,4)?', answer: { type: 'exact', value: '2' }, difficulty: 3 },
    ]);

    const authStub = (req, _res, next) => {
        req.user = currentUser;
        req.session = { loginSessionId: `login-${currentUser?._id}` };
        req.isAuthenticated = () => true;
        next();
    };

    reviewApp = express();
    reviewApp.use(express.json());
    reviewApp.use(authStub);
    reviewApp.use('/api/review', require('../../routes/review'));

    chatApp = express();
    chatApp.use(express.json());
    chatApp.use(authStub);
    chatApp.use('/api/chat', require('../../routes/chat'));
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mem) await mem.stop();
});

afterEach(async () => {
    await User.deleteMany({});
    await mongoose.connection.collection('conversations').deleteMany({});
});

let seq = 0;
const makeStudent = async (overrides = {}) => {
    seq += 1;
    const u = await User.create({
        username: `rev${seq}`,
        email: `rev${seq}@example.com`,
        firstName: 'Riley',
        lastName: 'Tester',
        role: 'student',
        selectedTutorId: 'default',
        // Past the first-session funnel so the Starting Point CTA doesn't own
        // the greeting.
        startingPointOffered: true,
        assessmentCompleted: true,
        skillMastery: { [SKILL_A]: masteredEntry(), [SKILL_B]: masteredEntry() },
        learningEngines: { bkt: {}, fsrs: { [SKILL_A]: dueFsrsCard(), [SKILL_B]: dueFsrsCard() }, consistency: {} },
        ...overrides,
    });
    currentUser = u;
    return u;
};

describe('GET /api/review/smart-queue', () => {
    test('includeProblems=true attaches a distinct problem to every queue skill', async () => {
        await makeStudent();

        const res = await supertest(reviewApp)
            .get('/api/review/smart-queue?max=5&includeProblems=true');

        expect(res.status).toBe(200);
        expect(res.body.queue.length).toBe(2);
        for (const item of res.body.queue) {
            expect(item.problem).toBeTruthy();
            expect(item.problem.prompt).toBeTruthy();
            // The payload must never leak the answer.
            expect(item.problem.answer).toBeUndefined();
        }
        const ids = res.body.queue.map((i) => i.problem.problemId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('without includeProblems the queue items stay lean (legacy contract)', async () => {
        await makeStudent();

        const res = await supertest(reviewApp).get('/api/review/smart-queue');

        expect(res.status).toBe(200);
        expect(res.body.problem).toBeTruthy(); // top-skill problem still served
        for (const item of res.body.queue) {
            expect(item.problem).toBeUndefined();
        }
    });
});

describe('POST /api/review/submit', () => {
    test('a correct answer updates the SM-2 schedule AND the FSRS card, clearing the skill from the queue', async () => {
        const user = await makeStudent();

        const res = await supertest(reviewApp)
            .post('/api/review/submit')
            .send({ skillId: SKILL_A, problemId: 'rev-a1', userAnswer: '3', responseTimeMs: 20000 });

        expect(res.status).toBe(200);
        expect(res.body.correct).toBe(true);
        expect(res.body.correctAnswer).toBeNull(); // never echo the key on a correct answer

        const after = await User.findById(user._id);

        // SM-2 side moved forward
        const entry = after.skillMastery.get(SKILL_A);
        expect(new Date(entry.reviewSchedule.nextReviewDate).getTime()).toBeGreaterThan(Date.now());

        // FSRS side moved forward — lastReview stamped now, interval rescheduled
        const card = after.learningEngines.fsrs.get(SKILL_A);
        expect(new Date(card.lastReview).getTime()).toBeGreaterThan(Date.now() - 60000);
        expect(card.reps).toBe(4);

        // ...which is exactly what clears it from the smart queue
        currentUser = after;
        const queueRes = await supertest(reviewApp).get('/api/review/smart-queue');
        const queuedIds = queueRes.body.queue.map((i) => i.skillId);
        expect(queuedIds).not.toContain(SKILL_A);
        expect(queuedIds).toContain(SKILL_B); // the unreviewed skill stays due
    });

    test('a wrong answer records an FSRS lapse and returns the correct answer', async () => {
        const user = await makeStudent();

        const res = await supertest(reviewApp)
            .post('/api/review/submit')
            .send({ skillId: SKILL_A, problemId: 'rev-a1', userAnswer: '99', responseTimeMs: 20000 });

        expect(res.status).toBe(200);
        expect(res.body.correct).toBe(false);
        expect(res.body.correctAnswer).toBe('3');

        const after = await User.findById(user._id);
        const card = after.learningEngines.fsrs.get(SKILL_A);
        expect(card.lapses).toBe(1);
        expect(card.state).toBe('relearning');
    });
});

describe('greeting warm-up CTA', () => {
    const greet = () => supertest(chatApp).post('/api/chat').send({ isGreeting: true, skipCourse: true });

    test('offers the warm-up when reviews are due and nothing outranks it', async () => {
        await makeStudent();

        const res = await greet();

        expect(res.status).toBe(200);
        expect(res.body.inlineCta).toMatchObject({ type: 'start-review-warmup' });

        // The offer is stamped so the next greeting inside ~20h stays quiet.
        const after = await User.findById(currentUser._id);
        expect(after.reviewWarmupOfferedAt).toBeTruthy();
    });

    test('stays quiet inside the 20h throttle window', async () => {
        await makeStudent({ reviewWarmupOfferedAt: new Date() });

        const res = await greet();

        expect(res.status).toBe(200);
        expect(res.body.inlineCta).toBeUndefined();
    });

    test('offers again once the throttle has lapsed', async () => {
        await makeStudent({ reviewWarmupOfferedAt: daysAgo(2) });

        const res = await greet();

        expect(res.status).toBe(200);
        expect(res.body.inlineCta).toMatchObject({ type: 'start-review-warmup' });
    });

    test('never outranks the Starting Point CTA on a first session', async () => {
        await makeStudent({ startingPointOffered: false, assessmentCompleted: false });

        const res = await greet();

        expect(res.status).toBe(200);
        expect(res.body.inlineCta).toMatchObject({ type: 'launch-starting-point' });
    });

    test('stays quiet when nothing is due', async () => {
        await makeStudent({ learningEngines: { bkt: {}, fsrs: {}, consistency: {} } });

        const res = await greet();

        expect(res.status).toBe(200);
        expect(res.body.inlineCta).toBeUndefined();
    });
});
