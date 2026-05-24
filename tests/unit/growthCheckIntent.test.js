// tests/unit/growthCheckIntent.test.js
//
// Verifies the chat-side detector that routes "yes growth check"
// to the structured FloatingScreener instead of letting the LLM
// improvise freeform questions in the chat bubble.

const { detectGrowthCheckAcceptance } = require('../../utils/growthCheckIntent');

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
