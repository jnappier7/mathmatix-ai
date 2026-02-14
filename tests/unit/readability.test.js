/**
 * Readability Scoring & IEP Reading Level Enforcement Tests
 *
 * Verifies that:
 * 1. Coleman-Liau Index produces correct grade-level scores
 * 2. Lexile-to-grade conversion is accurate
 * 3. Reading level checks pass/fail correctly
 * 4. Text stripping handles markdown, LaTeX, emoji, and IEP tags
 * 5. Simplification prompts are correctly formed
 */

const {
    colemanLiauIndex,
    checkReadingLevel,
    buildSimplificationPrompt,
    lexileToGrade,
    stripForScoring
} = require('../../utils/readability');

describe('Readability Scoring', () => {

    describe('stripForScoring', () => {
        test('removes markdown bold and italic', () => {
            const result = stripForScoring('This is **bold** and *italic* text');
            expect(result).not.toContain('**');
            expect(result).not.toContain('*');
            expect(result).toContain('bold');
            expect(result).toContain('italic');
        });

        test('removes markdown headers', () => {
            const result = stripForScoring('## My Header\nSome text');
            expect(result).not.toContain('##');
            expect(result).toContain('My Header');
        });

        test('removes IEP system tags', () => {
            const result = stripForScoring('Good job! <IEP_GOAL_PROGRESS:fractions,+5> Keep going.');
            expect(result).not.toContain('IEP_GOAL_PROGRESS');
            expect(result).toContain('Good job');
            expect(result).toContain('Keep going');
        });

        test('replaces LaTeX math with placeholder', () => {
            const result = stripForScoring('Solve $x + 5 = 10$ for x.');
            expect(result).not.toContain('$');
            expect(result).toContain('[math]');
        });

        test('preserves link text but removes URL', () => {
            const result = stripForScoring('Click [here](https://example.com) for help.');
            expect(result).toContain('here');
            expect(result).not.toContain('https://');
        });

        test('removes code blocks', () => {
            const result = stripForScoring('Try this:\n```\nlet x = 5;\n```\nNow solve.');
            expect(result).not.toContain('```');
            expect(result).not.toContain('let x');
            expect(result).toContain('Now solve');
        });

        test('removes bullet markers', () => {
            const result = stripForScoring('Steps:\n- Step one\n- Step two');
            expect(result).not.toMatch(/^-/m);
            expect(result).toContain('Step one');
        });
    });

    describe('colemanLiauIndex', () => {
        test('returns grade 0 for very short text', () => {
            const result = colemanLiauIndex('Hi there.');
            expect(result.gradeLevel).toBe(0);
            expect(result.wordCount).toBeLessThan(5);
        });

        test('scores simple text at a low grade level', () => {
            // Simple, short sentences with common words
            const simpleText = 'The cat sat on the mat. The dog ran to the park. It was a fun day. The sun was big and hot.';
            const result = colemanLiauIndex(simpleText);
            expect(result.gradeLevel).toBeLessThan(5);
            expect(result.wordCount).toBeGreaterThan(10);
        });

        test('scores complex text at a higher grade level', () => {
            // Complex sentences with advanced vocabulary
            const complexText = 'The implementation of comprehensive mathematical algorithms necessitates understanding sophisticated computational paradigms. Theoretical frameworks encompassing multidimensional analysis require substantial intellectual prerequisites that fundamentally challenge conventional pedagogical methodologies.';
            const result = colemanLiauIndex(complexText);
            expect(result.gradeLevel).toBeGreaterThan(10);
        });

        test('returns expected structure', () => {
            const result = colemanLiauIndex('The quick brown fox jumps over the lazy dog. It ran far away.');
            expect(result).toHaveProperty('gradeLevel');
            expect(result).toHaveProperty('wordCount');
            expect(result).toHaveProperty('sentenceCount');
            expect(result).toHaveProperty('letterCount');
            expect(typeof result.gradeLevel).toBe('number');
        });

        test('handles text with markdown formatting', () => {
            // Should strip markdown before scoring
            const result = colemanLiauIndex('**Good job!** You got the right answer. The answer is ten.');
            expect(result.wordCount).toBeGreaterThan(5);
            expect(result.gradeLevel).toBeLessThan(8);
        });
    });

    describe('lexileToGrade', () => {
        test('maps low Lexile to Grade 1', () => {
            expect(lexileToGrade(100)).toBe(1);
            expect(lexileToGrade(190)).toBe(1);
        });

        test('maps mid-range Lexile correctly', () => {
            expect(lexileToGrade(500)).toBe(3);
            expect(lexileToGrade(650)).toBe(4);
            expect(lexileToGrade(800)).toBe(5);
        });

        test('maps high Lexile to upper grades', () => {
            expect(lexileToGrade(1000)).toBe(8);
            expect(lexileToGrade(1100)).toBe(11);
            expect(lexileToGrade(1200)).toBe(12);
        });

        test('handles boundary values', () => {
            expect(lexileToGrade(420)).toBe(2);
            expect(lexileToGrade(421)).toBe(3);
            expect(lexileToGrade(520)).toBe(3);
            expect(lexileToGrade(521)).toBe(4);
        });
    });

    describe('checkReadingLevel', () => {
        test('passes when no reading level is set', () => {
            const result = checkReadingLevel('Any text here.', null);
            expect(result.passes).toBe(true);
        });

        test('passes when text is empty', () => {
            const result = checkReadingLevel('', 4);
            expect(result.passes).toBe(true);
        });

        test('passes for simple text at Grade 4 target', () => {
            const simpleText = 'Add five and three. You get eight. Good job! Now try the next one. What is two plus six?';
            const result = checkReadingLevel(simpleText, 4);
            expect(result.passes).toBe(true);
            expect(result.targetGrade).toBe(4);
        });

        test('fails for complex text at Grade 3 target', () => {
            const complexText = 'The implementation of comprehensive mathematical algorithms necessitates understanding sophisticated computational paradigms and multidimensional theoretical frameworks.';
            const result = checkReadingLevel(complexText, 3);
            expect(result.passes).toBe(false);
            expect(result.responseGrade).toBeGreaterThan(5);
            expect(result.margin).toBeGreaterThan(0);
        });

        test('converts Lexile to grade before checking', () => {
            const simpleText = 'The cat is big. The dog is small. They play in the sun.';
            const result = checkReadingLevel(simpleText, 500); // Lexile 500 ≈ Grade 3
            expect(result.targetGrade).toBe(3);
            expect(result.passes).toBe(true);
        });

        test('allows 2 grade levels of tolerance', () => {
            // Text that scores around Grade 6 should pass for Grade 4 target (4+2=6)
            const result = checkReadingLevel('The cat is big. The dog is small.', 4);
            // Simple text should be well within tolerance
            expect(result.passes).toBe(true);
        });

        test('returns margin showing how far over target', () => {
            const complexText = 'The implementation of comprehensive mathematical algorithms necessitates understanding sophisticated computational paradigms and multidimensional theoretical analysis.';
            const result = checkReadingLevel(complexText, 3);
            expect(result.margin).toBeGreaterThan(2); // Should be well over tolerance
        });
    });

    describe('buildSimplificationPrompt', () => {
        test('includes original response text', () => {
            const prompt = buildSimplificationPrompt('Some AI response here.', 4, 'Alex');
            expect(prompt).toContain('Some AI response here.');
        });

        test('includes target grade level', () => {
            const prompt = buildSimplificationPrompt('Response text.', 3, 'Alex');
            expect(prompt).toContain('Grade 3');
        });

        test('includes student name', () => {
            const prompt = buildSimplificationPrompt('Response text.', 4, 'Jordan');
            expect(prompt).toContain('Jordan');
        });

        test('sets lower word limit for younger grades', () => {
            const prompt3 = buildSimplificationPrompt('Text.', 3, 'A');
            const prompt7 = buildSimplificationPrompt('Text.', 7, 'A');
            expect(prompt3).toContain('8 words');
            expect(prompt7).toContain('15 words');
        });

        test('sets medium word limit for middle grades', () => {
            const prompt5 = buildSimplificationPrompt('Text.', 5, 'A');
            expect(prompt5).toContain('12 words');
        });
    });
});
