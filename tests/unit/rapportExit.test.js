/**
 * POST /api/rapport/respond — every message a new student sends before
 * rapportBuildingComplete flips comes here instead of to the tutor. The prompt
 * asks the model to wrap up by the 2nd message; these pin that the SERVER
 * enforces it, that a reply with no nextMessage never renders as silence, and
 * that the prompt carries the student's real grade (it read `user.grade`,
 * which the schema does not have, so every prompt said "Grade: unknown").
 */

const express = require('express');
const supertest = require('supertest');

const fakeUser = {};
jest.mock('../../middleware/auth', () => ({
    isAuthenticated: (req, _res, next) => { req.user = { _id: 'u1' }; next(); },
}));
jest.mock('../../models/user', () => ({
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../models/conversation', () => {
    const Conversation = jest.fn(function (doc) {
        Object.assign(this, doc, { _id: 'c-new', isActive: true, save: jest.fn().mockResolvedValue(true) });
    });
    Conversation.findById = jest.fn();
    return Conversation;
});
jest.mock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
jest.mock('../../utils/pipeline', () => ({ verify: jest.fn(async (text) => ({ text })) }));
jest.mock('../../utils/prompt', () => ({ generateSystemPrompt: jest.fn(() => 'SYSTEM') }));

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const { callLLM } = require('../../utils/llmGateway');
const rapportRoutes = require('../../routes/rapportBuilding');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/rapport', rapportRoutes);
    return app;
}

function llmReplies(obj) {
    callLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(obj) } }] });
}

function setup({ priorUserMessages = 0 } = {}) {
    Object.assign(fakeUser, {
        _id: 'u1',
        firstName: 'Sam',
        gradeLevel: '9th Grade',
        activeConversationId: 'c1',
        learningProfile: {},
        save: jest.fn().mockResolvedValue(true),
    });
    User.findById.mockResolvedValue(fakeUser);
    const convo = {
        _id: 'c1',
        isActive: true,
        messages: Array.from({ length: priorUserMessages }, () => ({ role: 'user', content: 'hi' })),
        save: jest.fn().mockResolvedValue(true),
    };
    Conversation.findById.mockResolvedValue(convo);
    return convo;
}

beforeEach(() => {
    callLLM.mockReset();
});

test('prompt carries the saved gradeLevel, not "unknown"', async () => {
    setup();
    llmReplies({ extractedInfo: {}, rapportComplete: false, nextMessage: 'What are you working on?' });
    await supertest(makeApp()).post('/api/rapport/respond').send({ message: 'hey' });
    const prompt = callLLM.mock.calls[0][1][1].content;
    expect(prompt).toMatch(/Grade: 9th Grade/);
});

test('first message: the model may keep chatting', async () => {
    setup();
    llmReplies({ extractedInfo: {}, rapportComplete: false, nextMessage: 'What are you working on?' });
    const res = await supertest(makeApp()).post('/api/rapport/respond').send({ message: 'hey' });
    expect(res.body.rapportComplete).toBe(false);
});

test('second message: rapport completes even if the model says not yet', async () => {
    setup({ priorUserMessages: 1 });
    llmReplies({ extractedInfo: {}, rapportComplete: false, nextMessage: 'Tell me more!' });
    const res = await supertest(makeApp()).post('/api/rapport/respond').send({ message: 'can you help me with 2x+5=17' });
    expect(res.body.rapportComplete).toBe(true);
    expect(res.body.triggerAssessment).toBe(true);
    expect(fakeUser.learningProfile.rapportBuildingComplete).toBe(true);
});

test('a reply with no nextMessage still says something', async () => {
    const convo = setup();
    llmReplies({ extractedInfo: {}, rapportComplete: false });
    const res = await supertest(makeApp()).post('/api/rapport/respond').send({ message: 'hey' });
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
    const saved = convo.messages[convo.messages.length - 1];
    expect(saved.role).toBe('assistant');
    expect(saved.content).toBe(res.body.message);
});
