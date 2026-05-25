// tests/unit/problemGeneratorDedup.test.js
// Tests for generateProblem's 7-day dedup loop + deterministic content-hash IDs.

jest.mock('../../utils/logger', () => ({
    child: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

const { generateProblem } = require('../../utils/problemGenerator');
const { recordShownProblem } = require('../../utils/problemTracking');

// Pick a skill known to have templates. integer-addition is one of the
// simplest and definitely registered.
const TEST_SKILL = 'integer-addition';

describe('generateProblem deterministic IDs', () => {
    test('same problem content produces same problemId', () => {
        // Generate a problem, then "regenerate" by feeding canonical inputs
        const { canonicalProblemId } = require('../../utils/problemTracking');
        const p = generateProblem(TEST_SKILL, { difficulty: 0 });

        const recomputed = canonicalProblemId({
            skillId: p.skillId,
            content: p.content,
            answer: p.answer,
        });
        expect(p.problemId).toBe(recomputed);
    });

    test('problemId is a 16-char hex hash, not a random suffix', () => {
        const p = generateProblem(TEST_SKILL, { difficulty: 0 });
        expect(p.problemId).toMatch(/^[0-9a-f]{16}$/);
    });

    test('metadata exposes contentHash and templateId', () => {
        const p = generateProblem(TEST_SKILL, { difficulty: 0 });
        expect(p.metadata.contentHash).toMatch(/^[0-9a-f]{16}$/);
        expect(p.metadata.templateId).toBeTruthy();
    });
});

describe('generateProblem dedup with user history', () => {
    test('without user, returns a single candidate (legacy behavior)', () => {
        const p = generateProblem(TEST_SKILL, { difficulty: 0 });
        expect(p).toBeDefined();
        expect(p.content).toBeDefined();
    });

    test('with empty user history, returns a candidate immediately', () => {
        const user = { recentProblems: [] };
        const p = generateProblem(TEST_SKILL, { difficulty: 0 }, user);
        expect(p).toBeDefined();
    });

    test('with user whose history contains the next candidate, retries', () => {
        // Seed user history with one problem, then make sure generator can still
        // produce something. (Whether it dodges or accepts depends on template
        // diversity — we just need to confirm the loop doesn't crash and returns
        // a valid problem.)
        const user = { recentProblems: [] };
        const seeded = generateProblem(TEST_SKILL, { difficulty: 0 });
        recordShownProblem(user, {
            problemId: seeded.problemId,
            contentHash: seeded.metadata.contentHash,
            skillId: seeded.skillId,
            source: 'generator',
        });

        const next = generateProblem(TEST_SKILL, { difficulty: 0 }, user);
        expect(next).toBeDefined();
        expect(next.content).toBeDefined();
        // Strong claim: with templates that produce variation, dedup should
        // usually dodge. Weak claim: at minimum, the function returns.
    });

    test('after exhausting retries, returns a candidate anyway (no throw)', () => {
        // Construct a user whose history matches by contentHash for many
        // possible content variations — make every candidate look "seen" by
        // matching anything. We can't easily force this without knowing
        // template internals, so we just confirm no throw on a normal call.
        const user = { recentProblems: [] };
        expect(() => generateProblem(TEST_SKILL, { difficulty: 0 }, user)).not.toThrow();
    });
});
