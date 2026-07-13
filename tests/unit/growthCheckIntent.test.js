// tests/unit/growthCheckIntent.test.js
//
// Verifies the chat-side detector that routes "yes growth check"
// to the structured FloatingScreener instead of letting the LLM
// improvise freeform questions in the chat bubble.

const { detectGrowthCheckAcceptance, detectStartingPointAcceptance } = require('../../utils/growthCheckIntent');

describe('detectGrowthCheckAcceptance', () => {
    describe('accepts explicit growth check requests', () => {
        const positives = [
            'growth check',
            'Growth Check',
            'growth-check',
            'Yes. Growth check',
            'yes growth check',
            "let's do the growth check",
            'do the growth check',
            'start a growth check',
            'I want a growth check please',
            'GROWTH CHECK!',
        ];

        test.each(positives)('"%s" → true', (message) => {
            expect(detectGrowthCheckAcceptance(message)).toBe(true);
        });
    });

    describe('rejects declines and negations', () => {
        const negatives = [
            'no growth check',
            "I don't want a growth check",
            'skip the growth check',
            'cancel the growth check',
            'maybe later, not the growth check',
            'nope no growth check',
        ];

        test.each(negatives)('"%s" → false', (message) => {
            expect(detectGrowthCheckAcceptance(message)).toBe(false);
        });
    });

    describe('rejects questions about the feature', () => {
        const questions = [
            'what is a growth check?',
            'how does a growth check work?',
            'when is my next growth check?',
            'why do I need a growth check?',
            'is the growth check long?',
            'are growth checks graded?',
            'can I take a growth check later?',
            'do I have to do the growth check?',
        ];

        test.each(questions)('"%s" → false', (message) => {
            expect(detectGrowthCheckAcceptance(message)).toBe(false);
        });
    });

    describe('rejects unrelated messages', () => {
        const irrelevant = [
            'yes',
            'sure',
            "let's jump in",
            'help me with this problem',
            'I want to learn factoring',
            '',
            '   ',
            null,
            undefined,
            42,
            { message: 'growth check' },
        ];

        test.each(irrelevant)('%p → false', (message) => {
            expect(detectGrowthCheckAcceptance(message)).toBe(false);
        });
    });
});

describe('detectStartingPointAcceptance', () => {
    describe('accepts explicit starting point / placement requests', () => {
        const positives = [
            'starting point',
            'Starting Point',
            'starting-point',
            "let's do the starting point",
            'do the starting point',
            'placement test',
            'I want to take the placement test',
            'take my assessment',
            'start the assessment',
            'begin a screener',
            'launch my placement',
        ];

        test.each(positives)('"%s" → true', (message) => {
            expect(detectStartingPointAcceptance(message)).toBe(true);
        });
    });

    describe('rejects declines and negations', () => {
        const negatives = [
            'no starting point',
            "I don't want to take the placement test",
            'skip the starting point',
            'cancel the placement test',
            'not the starting point right now',
            'nope, no placement test',
        ];

        test.each(negatives)('"%s" → false', (message) => {
            expect(detectStartingPointAcceptance(message)).toBe(false);
        });
    });

    describe('rejects questions about the feature', () => {
        const questions = [
            'what is the starting point?',
            'how does the placement test work?',
            'why do I need a starting point?',
            'is the placement test long?',
            'can I take the starting point later?',
            'do I have to take the placement test?',
        ];

        test.each(questions)('"%s" → false', (message) => {
            expect(detectStartingPointAcceptance(message)).toBe(false);
        });
    });

    describe('rejects unrelated messages', () => {
        const irrelevant = [
            'yes',
            'sure',
            "let's jump in",
            'help me with this problem',
            'I want to learn factoring',
            '',
            '   ',
            null,
            undefined,
            42,
            { message: 'starting point' },
        ];

        test.each(irrelevant)('%p → false', (message) => {
            expect(detectStartingPointAcceptance(message)).toBe(false);
        });
    });
});
