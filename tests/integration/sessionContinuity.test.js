/**
 * THE SESSION-CONTINUITY POLICY (owner, 2026-07-28), against a real database.
 *
 *   1. Returning from voice mode continues the chat exactly where it left off.
 *   2. A NEW login does NOT resume the old transcript.
 *   3. Entering a course chat starts fresh unless it's within the same login.
 *
 * What went wrong: a course view showed three or four sittings at once —
 * duplicate assistant bubbles, 12:02 AM messages rendered above a 12:24 AM
 * continuation. `courseSession.conversationId` was written once and reused
 * forever, with no boundary check of any kind, while the client painted its
 * last 50 messages on entry and the greeting appended a new lesson start
 * underneath. Twenty-two minutes apart, so the 30-minute idle window never
 * fired either; the missing distinction was WHICH LOGIN.
 *
 * These drive the real resolvers and the real /api/course-chat greeting route,
 * not reimplementations — the whole point is that the four course entry points
 * can't drift apart again.
 */

jest.mock('../../utils/llmGateway', () => ({
    callLLM: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Welcome back! Ready for the next step?' } }],
    }),
}));

const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const Conversation = require('../../models/conversation');
const CourseSession = require('../../models/courseSession');

const {
    resolveActiveConversationId,
    appendToActiveConversation,
    loadActiveHistory,
} = require('../../utils/activeConversation');
const { resolveCourseConversation } = require('../../utils/courseConversation');
const { SESSION_IDLE_MS } = require('../../utils/sessionWindow');

// Two distinct sign-ins. Passport regenerates the express session on every
// req.logIn, so these are what two logins actually look like to the server.
const LOGIN_A = 'login-session-aaaa';
const LOGIN_B = 'login-session-bbbb';

let mem;
let courseApp;
let currentUserId;
let currentLoginSessionId;

beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());

    // The real course-chat router, with a stand-in for session+passport that
    // hands it the login marker the way config/middleware.js would.
    const courseChatRouter = require('../../routes/courseChat');
    courseApp = express();
    courseApp.use(express.json());
    courseApp.use((req, _res, next) => {
        req.user = { _id: currentUserId };
        req.session = { loginSessionId: currentLoginSessionId };
        req.isAuthenticated = () => true;
        next();
    });
    courseApp.use('/api/course-chat', courseChatRouter);
}, 60000);

afterAll(async () => {
    await mongoose.disconnect();
    if (mem) await mem.stop();
});

afterEach(async () => {
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await CourseSession.deleteMany({});
});

let seq = 0;
const makeStudent = async () => {
    seq += 1;
    const u = await User.create({
        username: `student${seq}`,
        email: `student${seq}@example.com`,
        firstName: 'Sam',
        lastName: 'Tester',
        role: 'student',
    });
    currentUserId = u._id;
    return u;
};

// ═══════════════════════════════════════════════════════════════════
// RULE 1 — returning from voice continues the chat where it left off
// ═══════════════════════════════════════════════════════════════════
describe('Rule 1: voice returns to the same thread', () => {
    test('a voice turn lands in the conversation chat is already using', async () => {
        const user = await makeStudent();
        const chatConvo = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            messages: [
                { role: 'user', content: 'how do I factor x^2 - 9?' },
                { role: 'assistant', content: 'What two numbers multiply to -9?' },
            ],
        });
        user.activeConversationId = chatConvo._id;
        await user.save();

        const writtenTo = await appendToActiveConversation(
            user,
            [{ role: 'user', content: 'three and negative three' },
             { role: 'assistant', content: 'Exactly.' }],
            { loginSessionId: LOGIN_A },
        );

        expect(String(writtenTo)).toBe(String(chatConvo._id));
        expect(await Conversation.countDocuments({ userId: user._id })).toBe(1);

        // And coming back to chat sees the voice turns in the same transcript.
        const history = await loadActiveHistory(user, 10);
        expect(history.map(m => m.content)).toEqual([
            'how do I factor x^2 - 9?',
            'What two numbers multiply to -9?',
            'three and negative three',
            'Exactly.',
        ]);
    });

    test('voice does NOT roll a long-idle conversation', async () => {
        // The regression this guards: adding an idle check to the voice
        // resolver would cut a student's thread mid-problem the moment they
        // spoke after a long quiet stretch — silently, with no client event.
        // Chat owns the idle boundary; voice must only ever continue.
        const user = await makeStudent();
        const stale = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            lastActivity: new Date(Date.now() - SESSION_IDLE_MS - 60 * 1000),
            messages: [{ role: 'assistant', content: 'take your time' }],
        });
        user.activeConversationId = stale._id;
        await user.save();

        const { conversationId, created } = await resolveActiveConversationId(user, {
            loginSessionId: LOGIN_A,
        });

        expect(created).toBe(false);
        expect(String(conversationId)).toBe(String(stale._id));
    });

    test('a voice socket with no readable marker still continues, never rolls', async () => {
        // peekLoginSessionId deliberately returns null rather than minting on a
        // WS upgrade. An unknown marker must degrade to "continue".
        const user = await makeStudent();
        const convo = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            messages: [{ role: 'assistant', content: 'still here' }],
        });
        user.activeConversationId = convo._id;
        await user.save();

        const { conversationId, created } = await resolveActiveConversationId(user, {
            loginSessionId: null,
        });

        expect(created).toBe(false);
        expect(String(conversationId)).toBe(String(convo._id));
    });
});

// ═══════════════════════════════════════════════════════════════════
// RULE 2 — a new login does not resume the old transcript
// ═══════════════════════════════════════════════════════════════════
describe('Rule 2: a new login starts clean', () => {
    test('the chat greeting refuses to reuse a previous login\'s conversation', async () => {
        const user = await makeStudent();
        const previous = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            lastActivity: new Date(),   // seconds old — the idle rule would keep it
            messages: [
                { role: 'user', content: 'last night I was stuck on slope' },
                { role: 'assistant', content: 'Rise over run.' },
            ],
        });
        user.activeConversationId = previous._id;
        await user.save();

        // The exact predicate routes/chat.js uses to decide whether the
        // greeting may replay the existing transcript.
        const { isForeignLoginSession } = require('../../utils/loginSession');
        const reloaded = await Conversation.findById(previous._id);
        expect(isForeignLoginSession(reloaded, LOGIN_B)).toBe(true);
        expect(isForeignLoginSession(reloaded, LOGIN_A)).toBe(false);
    });

    test('a voice session opened right after re-login does not append to the old thread', async () => {
        const user = await makeStudent();
        const previous = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            messages: [{ role: 'assistant', content: 'from the previous sign-in' }],
        });
        user.activeConversationId = previous._id;
        await user.save();

        const { conversationId, created } = await resolveActiveConversationId(user, {
            loginSessionId: LOGIN_B,
        });

        expect(created).toBe(true);
        expect(String(conversationId)).not.toBe(String(previous._id));

        const fresh = await Conversation.findById(conversationId);
        expect(fresh.messages).toHaveLength(0);
        expect(fresh.loginSessionId).toBe(LOGIN_B);

        // The old transcript is untouched, not merged into the new one.
        const old = await Conversation.findById(previous._id);
        expect(old.messages).toHaveLength(1);
    });

    test('a conversation with no marker is ADOPTED, not thrown away', async () => {
        // Deploy day: every existing conversation is unmarked. Rolling them all
        // would cut live sessions. Claim instead; the NEXT login then sees a
        // marker that doesn't match and rolls properly.
        const user = await makeStudent();
        const legacy = await Conversation.create({
            userId: user._id,
            messages: [{ role: 'assistant', content: 'written before the marker existed' }],
        });
        expect(legacy.loginSessionId).toBeNull();
        user.activeConversationId = legacy._id;
        await user.save();

        const first = await resolveActiveConversationId(user, { loginSessionId: LOGIN_A });
        expect(first.created).toBe(false);
        expect(String(first.conversationId)).toBe(String(legacy._id));
        expect((await Conversation.findById(legacy._id)).loginSessionId).toBe(LOGIN_A);

        // ...and it is not adoptable a second time.
        const second = await resolveActiveConversationId(user, { loginSessionId: LOGIN_B });
        expect(second.created).toBe(true);
        expect(String(second.conversationId)).not.toBe(String(legacy._id));
    });
});

// ═══════════════════════════════════════════════════════════════════
// RULE 3 — a course chat starts fresh unless it's the same login
// ═══════════════════════════════════════════════════════════════════
describe('Rule 3: entering a course starts fresh across logins', () => {
    const makeCourseSession = async (user, conversationId = null) => CourseSession.create({
        userId: user._id,
        courseId: 'algebra-1',
        pathwayId: 'algebra-1',
        courseName: 'Algebra 1',
        currentModuleId: 'foundations_algebra',
        status: 'active',
        conversationId,
    });

    test('mid-sitting turns keep the same conversation', async () => {
        const user = await makeStudent();
        const convo = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            conversationType: 'topic',
            messages: [{ role: 'assistant', content: 'Problem 1: solve for x.' }],
        });
        const courseSession = await makeCourseSession(user, convo._id);

        const { conversation, rolled, reason } = await resolveCourseConversation({
            user, courseSession, loginSessionId: LOGIN_A,
        });

        expect(rolled).toBe(false);
        expect(reason).toBeNull();
        expect(String(conversation._id)).toBe(String(convo._id));
        expect(conversation.messages).toHaveLength(1);
    });

    test('a new login gets an empty conversation and the course session is repointed', async () => {
        const user = await makeStudent();
        const previous = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            conversationType: 'topic',
            lastActivity: new Date(),
            messages: [
                { role: 'assistant', content: 'Welcome to Algebra 1!' },
                { role: 'user', content: 'ok' },
                { role: 'assistant', content: 'Great — first problem.' },
            ],
        });
        const courseSession = await makeCourseSession(user, previous._id);

        const { conversation, rolled, reason } = await resolveCourseConversation({
            user, courseSession, loginSessionId: LOGIN_B,
        });

        expect(rolled).toBe(true);
        expect(reason).toBe('new_login');
        expect(conversation.messages).toHaveLength(0);
        expect(conversation.loginSessionId).toBe(LOGIN_B);

        const savedSession = await CourseSession.findById(courseSession._id);
        expect(String(savedSession.conversationId)).toBe(String(conversation._id));

        // The previous sitting is closed out, not deleted and not merged.
        const old = await Conversation.findById(previous._id);
        expect(old.isActive).toBe(false);
        expect(old.messages).toHaveLength(3);
    });

    test('THE REPORTED BUG: four sittings never accumulate in one document', async () => {
        const user = await makeStudent();
        const courseSession = await makeCourseSession(user);
        const seen = [];

        for (const login of ['login-1', 'login-2', 'login-3', 'login-4']) {
            const { conversation } = await resolveCourseConversation({
                user, courseSession, loginSessionId: login,
            });
            conversation.messages.push(
                { role: 'assistant', content: `greeting for ${login}` },
                { role: 'user', content: 'ok' },
            );
            await conversation.save();
            seen.push(String(conversation._id));
        }

        // Four distinct sittings...
        expect(new Set(seen).size).toBe(4);
        // ...and every one holds only its own exchange, so the view the owner
        // saw (three or four transcripts at once, duplicate assistant bubbles)
        // cannot be assembled.
        const all = await Conversation.find({ userId: user._id });
        expect(all).toHaveLength(4);
        for (const c of all) expect(c.messages).toHaveLength(2);

        // Exactly one is live: the current sitting.
        expect(all.filter(c => c.isActive)).toHaveLength(1);
    });

    test('the real /api/course-chat greeting rolls on a new login and tells the client', async () => {
        const user = await makeStudent();
        const previous = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            conversationType: 'topic',
            lastActivity: new Date(),
            messages: [
                { role: 'user', content: 'from an earlier sitting' },
                { role: 'assistant', content: 'and the tutor reply to it' },
            ],
        });
        const courseSession = await makeCourseSession(user, previous._id);
        user.activeCourseSessionId = courseSession._id;
        await user.save();

        currentLoginSessionId = LOGIN_B;
        const res = await supertest(courseApp)
            .post('/api/course-chat')
            .send({ isGreeting: true });

        expect(res.status).toBe(200);
        expect(res.body.sessionRolled).toBe(true);
        // The client paints the transcript from a switchSession that ran BEFORE
        // this request, so it needs to be told which conversation to clear to —
        // without this the fresh greeting lands under the old bubbles.
        expect(res.body.conversationId).toBeTruthy();
        expect(String(res.body.conversationId)).not.toBe(String(previous._id));

        const fresh = await Conversation.findById(res.body.conversationId);
        // Only the new greeting — none of the earlier sitting came along.
        expect(fresh.messages).toHaveLength(1);
        expect(fresh.messages[0].role).toBe('assistant');
    });

    test('the same login re-entering the course does NOT roll', async () => {
        const user = await makeStudent();
        const convo = await Conversation.create({
            userId: user._id,
            loginSessionId: LOGIN_A,
            conversationType: 'topic',
            lastActivity: new Date(),
            messages: [
                { role: 'assistant', content: 'Welcome to Algebra 1!' },
                { role: 'user', content: 'ok' },
                { role: 'assistant', content: 'Here is problem 1.' },
            ],
        });
        const courseSession = await makeCourseSession(user, convo._id);
        user.activeCourseSessionId = courseSession._id;
        await user.save();

        currentLoginSessionId = LOGIN_A;
        const res = await supertest(courseApp)
            .post('/api/course-chat')
            .send({ isGreeting: true });

        expect(res.status).toBe(200);
        expect(res.body.sessionRolled).toBe(false);
        expect(String(res.body.conversationId)).toBe(String(convo._id));

        // Idempotent greeting: the tutor spoke last, so it replays rather than
        // generating and appending a second lesson start.
        expect(res.body.text).toBe('Here is problem 1.');
        const after = await Conversation.findById(convo._id);
        expect(after.messages).toHaveLength(3);
    });
});
