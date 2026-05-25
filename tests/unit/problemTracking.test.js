// tests/unit/problemTracking.test.js
// Tests for the problem-tracking helpers — canonical IDs, recording with
// cap, recently-shown lookup with 7-day window, source/skill filtering.

jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const {
    canonicalProblemId,
    contentHash,
    recordShownProblem,
    wasRecentlyShown,
    getRecentlyShown,
    MAX_HISTORY,
    SNIPPET_MAX_CHARS,
} = require('../../utils/problemTracking');

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(12, 0, 0, 0);
    return d;
}

describe('canonicalProblemId', () => {
    test('same inputs produce same ID', () => {
        const id1 = canonicalProblemId({ skillId: 'calculus-limits', content: 'lim x→1 (x²-1)/(x-1)', answer: 2 });
        const id2 = canonicalProblemId({ skillId: 'calculus-limits', content: 'lim x→1 (x²-1)/(x-1)', answer: 2 });
        expect(id1).toBe(id2);
    });

    test('whitespace and case differences do not change the ID', () => {
        const id1 = canonicalProblemId({ skillId: 'calc', content: '2 + 3', answer: 5 });
        const id2 = canonicalProblemId({ skillId: 'CALC', content: '2+3', answer: '  5  ' });
        expect(id1).toBe(id2);
    });

    test('different answers produce different IDs', () => {
        const id1 = canonicalProblemId({ skillId: 'addition', content: '2+3', answer: 5 });
        const id2 = canonicalProblemId({ skillId: 'addition', content: '2+3', answer: 6 });
        expect(id1).not.toBe(id2);
    });

    test('returns a non-empty hex string', () => {
        const id = canonicalProblemId({ skillId: 'x', content: 'y', answer: 'z' });
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe('recordShownProblem', () => {
    test('initializes recentProblems array when missing', () => {
        const user = {};
        recordShownProblem(user, { problemId: 'abc', skillId: 's1', source: 'generator' });
        expect(user.recentProblems).toHaveLength(1);
        expect(user.recentProblems[0].problemId).toBe('abc');
    });

    test('truncates content to SNIPPET_MAX_CHARS', () => {
        const user = { recentProblems: [] };
        const longContent = 'x'.repeat(SNIPPET_MAX_CHARS + 100);
        recordShownProblem(user, { problemId: 'a', source: 'ai-text', content: longContent });
        expect(user.recentProblems[0].contentSnippet).toHaveLength(SNIPPET_MAX_CHARS);
    });

    test('caps at MAX_HISTORY entries, keeping most recent', () => {
        const user = { recentProblems: [] };
        for (let i = 0; i < MAX_HISTORY + 50; i++) {
            recordShownProblem(user, { problemId: `p${i}`, source: 'generator' });
        }
        expect(user.recentProblems).toHaveLength(MAX_HISTORY);
        // First entry should be p50 (we kept the last 500)
        expect(user.recentProblems[0].problemId).toBe('p50');
        expect(user.recentProblems[MAX_HISTORY - 1].problemId).toBe(`p${MAX_HISTORY + 49}`);
    });

    test('silently skips when problemId missing', () => {
        const user = { recentProblems: [] };
        recordShownProblem(user, { source: 'generator' });
        expect(user.recentProblems).toHaveLength(0);
    });
});

describe('wasRecentlyShown', () => {
    test('returns false on empty history', () => {
        expect(wasRecentlyShown({}, { problemId: 'x' })).toBe(false);
    });

    test('returns true when problemId matches within window', () => {
        const user = { recentProblems: [{ problemId: 'abc', shownAt: daysAgo(3) }] };
        expect(wasRecentlyShown(user, { problemId: 'abc' })).toBe(true);
    });

    test('returns false when problemId is older than window', () => {
        const user = { recentProblems: [{ problemId: 'abc', shownAt: daysAgo(8) }] };
        expect(wasRecentlyShown(user, { problemId: 'abc' })).toBe(false);
    });

    test('matches by contentHash when problemId differs', () => {
        const user = { recentProblems: [{ problemId: 'gen-001', contentHash: 'hashX', shownAt: daysAgo(1) }] };
        expect(wasRecentlyShown(user, { problemId: 'ai-002', contentHash: 'hashX' })).toBe(true);
    });

    test('respects custom window', () => {
        const user = { recentProblems: [{ problemId: 'abc', shownAt: daysAgo(5) }] };
        expect(wasRecentlyShown(user, { problemId: 'abc' }, 7)).toBe(true);
        expect(wasRecentlyShown(user, { problemId: 'abc' }, 3)).toBe(false);
    });
});

describe('getRecentlyShown', () => {
    test('filters by skillId', () => {
        const user = {
            recentProblems: [
                { problemId: 'a', skillId: 'algebra', source: 'ai-text', shownAt: daysAgo(1) },
                { problemId: 'b', skillId: 'calculus', source: 'ai-text', shownAt: daysAgo(1) },
            ],
        };
        const calc = getRecentlyShown(user, { skillId: 'calculus' });
        expect(calc).toHaveLength(1);
        expect(calc[0].problemId).toBe('b');
    });

    test('filters by source', () => {
        const user = {
            recentProblems: [
                { problemId: 'a', source: 'ai-text', shownAt: daysAgo(1) },
                { problemId: 'b', source: 'generator', shownAt: daysAgo(1) },
            ],
        };
        expect(getRecentlyShown(user, { source: 'ai-text' })).toHaveLength(1);
        expect(getRecentlyShown(user, { source: 'generator' })).toHaveLength(1);
    });

    test('excludes entries outside the window', () => {
        const user = {
            recentProblems: [
                { problemId: 'recent', source: 'ai-text', shownAt: daysAgo(2) },
                { problemId: 'old', source: 'ai-text', shownAt: daysAgo(20) },
            ],
        };
        const recent = getRecentlyShown(user, { withinDays: 7 });
        expect(recent).toHaveLength(1);
        expect(recent[0].problemId).toBe('recent');
    });

    test('returns empty array for user with no history', () => {
        expect(getRecentlyShown({})).toEqual([]);
        expect(getRecentlyShown({ recentProblems: [] })).toEqual([]);
    });
});
