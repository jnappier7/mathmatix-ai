// tests/unit/transcriptFlags.test.js
// Unit tests for /api/transcript-flags.

jest.mock('../../models/user', () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
}));

jest.mock('../../models/conversation', () => ({
    findById: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
}));

jest.mock('../../models/transcriptFlag', () => ({
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
}));

jest.mock('../../services/userService', () => ({
    getStudentIdsForTeacher: jest.fn(),
}));

jest.mock('../../utils/logger', () => {
    const base = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    return { ...base, child: () => base };
});

const request = require('supertest');
const express = require('express');

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const TranscriptFlag = require('../../models/transcriptFlag');
const { getStudentIdsForTeacher } = require('../../services/userService');

const transcriptFlagsRoutes = require('../../routes/transcriptFlags');

function makeApp(user) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = user;
        req.isAuthenticated = () => !!user;
        next();
    });
    app.use('/api/transcript-flags', transcriptFlagsRoutes);
    return app;
}

const TEACHER_ID = '650000000000000000000001';
const STUDENT_ID = '650000000000000000000002';
const ADMIN_ID = '650000000000000000000003';
const CONVO_ID = '650000000000000000000010';

function mockConversationWithTutorTurn() {
    Conversation.findById.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({
            _id: CONVO_ID,
            userId: STUDENT_ID,
            messages: [
                { role: 'user', content: 'help me', timestamp: new Date() },
                { role: 'assistant', content: 'show me what you tried', timestamp: new Date() },
            ],
        }),
    });
}

function mockActiveStudent() {
    User.findOne.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
            _id: STUDENT_ID,
            hasParentalConsent: true,
            privacyConsent: { status: 'active', consentPathway: 'school_dpa' },
        }),
    });
}

describe('POST /api/transcript-flags', () => {
    beforeEach(() => jest.clearAllMocks());

    test('rejects non-teacher/non-admin callers', async () => {
        const app = makeApp({ _id: 'x', role: 'student' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1 });
        expect(res.status).toBe(403);
    });

    test('rejects bad payloads', async () => {
        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });

        const missingConvo = await request(app)
            .post('/api/transcript-flags')
            .send({ turnIndex: 1 });
        expect(missingConvo.status).toBe(400);

        const negativeTurn = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: -1 });
        expect(negativeTurn.status).toBe(400);
    });

    test('rejects flags on student turns', async () => {
        // turnIndex 0 in the mock is a user message.
        mockConversationWithTutorTurn();
        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 0 });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/tutor turns/i);
    });

    test('denies teachers who do not own the student', async () => {
        mockConversationWithTutorTurn();
        getStudentIdsForTeacher.mockResolvedValue([]);
        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1 });
        expect(res.status).toBe(403);
        expect(TranscriptFlag.create).not.toHaveBeenCalled();
    });

    test('blocks flagging when student consent is revoked', async () => {
        mockConversationWithTutorTurn();
        getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
        User.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: STUDENT_ID,
                hasParentalConsent: false,
                privacyConsent: { status: 'revoked', consentPathway: 'individual_parent' },
            }),
        });

        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1, reason: 'looks off' });

        expect(res.status).toBe(403);
        expect(TranscriptFlag.create).not.toHaveBeenCalled();
    });

    test('creates a flag for a teacher who owns the student', async () => {
        mockConversationWithTutorTurn();
        getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
        mockActiveStudent();
        TranscriptFlag.create.mockResolvedValue({
            _id: 'flag-1',
            conversationId: CONVO_ID,
            turnIndex: 1,
            studentId: STUDENT_ID,
            flaggedBy: TEACHER_ID,
            flaggedByRole: 'teacher',
            reason: 'looks like a solve',
            status: 'open',
        });

        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1, reason: 'looks like a solve' });

        expect(res.status).toBe(201);
        expect(res.body.flag._id).toBe('flag-1');
        expect(TranscriptFlag.create).toHaveBeenCalledWith(expect.objectContaining({
            conversationId: CONVO_ID,
            turnIndex: 1,
            flaggedBy: TEACHER_ID,
            flaggedByRole: 'teacher',
            reason: 'looks like a solve',
            turnSnapshot: expect.objectContaining({ role: 'assistant' }),
        }));
    });

    test('admins can flag any student (no roster check)', async () => {
        mockConversationWithTutorTurn();
        // No getStudentIdsForTeacher call expected for admin.
        mockActiveStudent();
        TranscriptFlag.create.mockResolvedValue({ _id: 'flag-2', flaggedByRole: 'admin' });

        const app = makeApp({ _id: ADMIN_ID, role: 'admin' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1 });

        expect(res.status).toBe(201);
        expect(getStudentIdsForTeacher).not.toHaveBeenCalled();
        expect(TranscriptFlag.create).toHaveBeenCalledWith(expect.objectContaining({
            flaggedByRole: 'admin',
        }));
    });

    test('duplicate flag returns the existing flag as 200', async () => {
        mockConversationWithTutorTurn();
        getStudentIdsForTeacher.mockResolvedValue([STUDENT_ID]);
        mockActiveStudent();

        const dupError = Object.assign(new Error('dup'), { code: 11000 });
        TranscriptFlag.create.mockRejectedValueOnce(dupError);
        TranscriptFlag.findOne.mockResolvedValue({ _id: 'existing', reason: 'prior' });

        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app)
            .post('/api/transcript-flags')
            .send({ conversationId: CONVO_ID, turnIndex: 1, reason: 'second try' });

        expect(res.status).toBe(200);
        expect(res.body.duplicate).toBe(true);
        expect(res.body.flag._id).toBe('existing');
    });
});

describe('GET /api/transcript-flags', () => {
    beforeEach(() => jest.clearAllMocks());

    test('denies teachers', async () => {
        const app = makeApp({ _id: TEACHER_ID, role: 'teacher' });
        const res = await request(app).get('/api/transcript-flags');
        expect(res.status).toBe(403);
    });

    test('admin gets open flags by default', async () => {
        const fakeFlags = [
            { _id: 'a', status: 'open' },
            { _id: 'b', status: 'open' },
        ];
        const chain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            populate: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(fakeFlags),
        };
        TranscriptFlag.find.mockReturnValueOnce(chain);

        const app = makeApp({ _id: ADMIN_ID, role: 'admin' });
        const res = await request(app).get('/api/transcript-flags');

        expect(res.status).toBe(200);
        expect(res.body.flags).toHaveLength(2);
        expect(TranscriptFlag.find).toHaveBeenCalledWith({ status: 'open' });
    });

    test('status=all drops the filter', async () => {
        const chain = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            populate: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        };
        TranscriptFlag.find.mockReturnValueOnce(chain);

        const app = makeApp({ _id: ADMIN_ID, role: 'admin' });
        await request(app).get('/api/transcript-flags?status=all');

        expect(TranscriptFlag.find).toHaveBeenCalledWith({});
    });
});
