// A turn the student saw must reach the transcript even when its full save
// fails. Production, 2026-10-28: "1" → "Great choice! For problem 1…" streamed
// to the student, never landed, and the tutor later read a history without it
// and walked him through problem 7. Pinned here against a REAL VersionError —
// the conflict that rejects persist's whole-document save.
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Sentry = require('@sentry/node');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Conversation = require('../../models/conversation');
const { rescueTurnMessages } = require('../../utils/pipeline/turnRescue');

let mem;
beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
}, 60000);
afterAll(async () => {
    await mongoose.disconnect();
    if (mem) await mem.stop();
});
beforeEach(() => jest.clearAllMocks());

const at = (s) => new Date(`2026-10-28T14:${s}Z`);

async function seed() {
    return Conversation.create({
        userId: new mongoose.Types.ObjectId(),
        messages: [
            { role: 'user', content: 'help me one at a time', timestamp: at('28:36') },
            { role: 'assistant', content: 'Which problem would you like to start with?', timestamp: at('28:39') },
        ],
    });
}

describe('rescueTurnMessages', () => {
    test('a turn whose save hits a VersionError still lands its messages', async () => {
        const { _id } = await seed();
        const turn = await Conversation.findById(_id);
        // Another writer gets in first and bumps __v under this turn.
        const other = await Conversation.findById(_id);
        other.messages.push({ role: 'assistant', content: 'nudge', timestamp: at('28:50') });
        await other.save();

        turn.messages.push({ role: 'user', content: '1', timestamp: at('28:55') });
        turn.messages.push({ role: 'assistant', content: 'Great choice! For problem 1…', timestamp: at('28:59') });
        const err = await turn.save().catch(e => e);
        expect(err.name).toBe('VersionError');

        const rescued = await rescueTurnMessages(turn, { responseText: 'Great choice! For problem 1…', cause: err });
        expect(rescued).toBe(2);
        const after = await Conversation.findById(_id).lean();
        expect(after.messages.map(m => m.content)).toEqual([
            'help me one at a time',
            'Which problem would you like to start with?',
            'nudge',
            '1',
            'Great choice! For problem 1…',
        ]);
        expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.objectContaining({
            tags: expect.objectContaining({ kind: 'turn_save_failed', rescued: 'yes' }),
        }));
    });

    test('persist threw before pushing the reply: the reply the student saw is added', async () => {
        const { _id } = await seed();
        const turn = await Conversation.findById(_id);
        turn.messages.push({ role: 'user', content: '1', timestamp: at('28:55') });

        await rescueTurnMessages(turn, { responseText: '  Great choice!  ', cause: new Error('boom') });
        const after = await Conversation.findById(_id).lean();
        expect(after.messages.slice(-2).map(m => [m.role, m.content])).toEqual([
            ['user', '1'],
            ['assistant', 'Great choice!'],
        ]);
    });

    test('nothing missing (the save landed, persist failed later): no write, no alarm', async () => {
        const { _id } = await seed();
        const turn = await Conversation.findById(_id);
        turn.messages.push({ role: 'user', content: '1', timestamp: at('28:55') });
        turn.messages.push({ role: 'assistant', content: 'Great choice!', timestamp: at('28:59') });
        await turn.save();

        expect(await rescueTurnMessages(turn, { responseText: 'Great choice!', cause: new Error('xp') })).toBe(0);
        expect((await Conversation.findById(_id).lean()).messages).toHaveLength(4);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    test('if the rescue itself fails it never throws, and reports the lost turn as fatal', async () => {
        const { _id } = await seed();
        const turn = await Conversation.findById(_id);
        turn.messages.push({ role: 'user', content: '1', timestamp: at('28:55') });
        jest.spyOn(Conversation, 'updateOne').mockRejectedValueOnce(new Error('db down'));

        await expect(rescueTurnMessages(turn, { responseText: 'Great choice!' })).resolves.toBe(0);
        expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
            level: 'fatal',
            tags: expect.objectContaining({ rescued: 'no' }),
        }));
    });
});

describe('the rescue is wired into both swallowed-save paths', () => {
    const src = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

    test('pipeline persist failure', () => {
        const s = src('utils/pipeline/index.js');
        const block = s.slice(s.indexOf('} catch (persistErr) {'), s.indexOf('} catch (persistErr) {') + 600);
        expect(block).toMatch(/await rescueTurnMessages\(ctx\.conversation/);
    });

    test('chat.js pipeline-fallback save failure', () => {
        const s = src('routes/chat.js');
        const block = s.slice(s.indexOf("'Pipeline fallback conversation save failed'"), s.indexOf("'Pipeline fallback conversation save failed'") + 300);
        expect(block).toMatch(/await rescueTurnMessages\(activeConversation/);
    });
});
