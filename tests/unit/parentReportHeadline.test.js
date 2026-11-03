// The Learning Report's headline and activity sentence must not flatter a
// week that slowed down. Live parent dashboard, 2026-11-03: Jason's report
// opened "Jason is doing well — steady and consistent" with an "On Track" chip
// and "Jason has been very active: 5 sessions and 22 minutes", while the same
// modal showed minutes −45 (67 → 22) and problems −72. The headline looked
// only at accuracy, and "very active" only at session count.

const mockAggregate = jest.fn();
jest.mock('../../models/conversation', () => ({ aggregate: (...a) => mockAggregate(...a) }));
jest.mock('../../models/courseSession', () => ({
    find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }),
}));
jest.mock('../../utils/parentSkillPicture', () => ({
    skillPictureFor: async () => ({
        memory: { skills: [], strong: 0 }, growthAreas: [], masteredThisWeek: 0,
        counts: {}, topStrengths: [], categories: [],
    }),
}));
jest.mock('../../utils/parentChildProfile', () => ({
    buildChildProfile: () => ({}),
    readStreak: () => ({ current: 0, longest: 0 }),
}));

const { buildLearningReport } = require('../../utils/parentReport');

const CHILD = { _id: '6883f4b5b8dc90ba0e498f8f', firstName: 'Jason' };
const week = (sessionCount, totalMinutes, totalProblems, totalCorrect) =>
    [{ sessionCount, totalMinutes, totalProblems, totalCorrect }];

async function reportFor(thisWeek, prevWeek) {
    mockAggregate.mockReset();
    mockAggregate.mockResolvedValueOnce(thisWeek).mockResolvedValueOnce(prevWeek);
    return buildLearningReport(CHILD, { now: new Date('2026-11-03T19:00:00Z') });
}

const messages = (r) => r.insights.map(i => i.message);

describe('a week whose practice fell by half or more', () => {
    test('the live case: 67 → 22 minutes is not "steady and consistent"', async () => {
        const r = await reportFor(week(5, 22, 7, 7), week(13, 67, 79, 63));
        expect(r.headline.text).toBe('Jason has practiced less lately');
        expect(r.headline.tone).toBe('building');
        expect(messages(r)).toContain(
            'Jason practiced 22 minutes in the last 7 days, down from 67 the week before. A short, regular routine helps keep skills fresh.');
        expect(messages(r).join(' ')).not.toMatch(/very active/);
    });

    test('a small prior week (< 30 min) is not a drop worth flagging', async () => {
        const r = await reportFor(week(3, 10, 6, 6), week(4, 25, 8, 8));
        expect(messages(r).join(' ')).not.toMatch(/down from/);
    });
});

describe('"very active"', () => {
    test('needs an hour of practice, not just five sessions', async () => {
        const short = await reportFor(week(5, 22, 7, 7), week(5, 20, 7, 7));
        expect(messages(short).join(' ')).not.toMatch(/very active/);
        expect(messages(short)).toContain('Jason had 5 sessions in the last 7 days (22 minutes in total).');

        const busy = await reportFor(week(6, 75, 20, 18), week(5, 60, 15, 12));
        expect(messages(busy).join(' ')).toMatch(/very active: 6 sessions and 75 minutes/);
    });
});

describe('a steady week still reads as one', () => {
    test('strong accuracy without a drop keeps "steady and consistent"', async () => {
        const r = await reportFor(week(5, 70, 20, 18), week(5, 65, 20, 16));
        expect(r.headline.text).toBe('Jason is doing well — steady and consistent');
    });
});
