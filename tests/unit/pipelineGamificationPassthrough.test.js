/**
 * routes/chat.js sends `gamification`, `nextActions` and `reviewSummary` from
 * the pipeline result, but utils/pipeline/index.js used to drop all three from
 * persist's results — so every chat turn carried `gamification: null` and the
 * client's quest-complete toasts, coin fly-in and "streak saved" notice never
 * ran (QA handoff 2026-10-14; confirmed in the live payloads). The streak
 * outcome lives on persist's `streak`, and the client reads it off
 * `gamification`; gamificationForClient joins the two.
 */

jest.mock('../../utils/logger', () => {
    const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    return Object.assign(l, { child: () => l });
});

const fs = require('fs');
const path = require('path');

const { gamificationForClient } = require('../../utils/pipeline/index');

const INDEX_SRC = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');

describe('pipeline result carries the turn\'s rewards to chat.js', () => {
    test.each(['gamification', 'nextActions', 'reviewSummary', 'comeback', 'firstTry'])(
        'the result object includes %s',
        (field) => {
            const returnBlock = INDEX_SRC.slice(INDEX_SRC.indexOf('xpBreakdown: persistResults.xpBreakdown'));
            expect(returnBlock).toMatch(new RegExp(`\\n\\s+${field}:`));
        },
    );
});

describe('gamificationForClient', () => {
    test('nothing to show → null', () => {
        expect(gamificationForClient({ streak: { current: 3, freezeUsed: false, lost: 0 } })).toBeNull();
    });

    test('quest completions pass through', () => {
        const out = gamificationForClient({
            gamification: { questsCompleted: [{ name: 'Bounce Back', xpEarned: 60, coinsEarned: 25 }], challengesCompleted: [], xpAwarded: 60 },
        });
        expect(out.questsCompleted[0].coinsEarned).toBe(25);
    });

    test('a streak saved by the freeze reaches the client, even on an ungraded turn', () => {
        const out = gamificationForClient({ streak: { current: 5, freezeUsed: true, lost: 0 } });
        expect(out.streakFreezeUsed).toBe(true);
        expect(out.questsCompleted).toEqual([]);
    });

    test('a lost streak is reported with its length', () => {
        const out = gamificationForClient({ gamification: { questsCompleted: [] }, streak: { lost: 6 } });
        expect(out.streakLost).toBe(6);
    });
});
