// tests/unit/ttsPronunciation.test.js
// Owner report 2026-10-13: TTS mispronounced MATHMATIX. The respelling is
// applied at the Cartesia boundary so every spoken surface gets it.

const { applyPronunciations, BRAND_SPOKEN } = require('../../utils/ttsPronunciation');

describe('applyPronunciations — the brand name', () => {
    test.each([
        ['Welcome to MATHMATIX!', `Welcome to ${BRAND_SPOKEN}!`],
        ['Welcome to Mathmatix.', `Welcome to ${BRAND_SPOKEN}.`],
        ['I love MathMatix', `I love ${BRAND_SPOKEN}`],
        ['Visit mathmatix.ai today', `Visit ${BRAND_SPOKEN} dot A.I. today`],
        ['MATHMATIX.AI rocks', `${BRAND_SPOKEN} dot A.I. rocks`],
    ])('%s', (input, expected) => {
        expect(applyPronunciations(input)).toBe(expected);
    });

    test('leaves the word "mathematics" and other text alone', () => {
        expect(applyPronunciations('I like mathematics and math.')).toBe('I like mathematics and math.');
    });

    test('is safe on empty input', () => {
        expect(applyPronunciations('')).toBe('');
        expect(applyPronunciations(undefined)).toBe(undefined);
    });
});

describe('every Cartesia call path applies it', () => {
    const fs = require('fs');
    const path = require('path');
    test.each(['utils/ttsStream.js', 'utils/ttsProvider.js'])('%s sends no raw transcript', (file) => {
        const src = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
        expect(src).not.toMatch(/transcript:\s*text\b/);
        expect(src).toMatch(/transcript:\s*applyPronunciations\(text\)/);
    });
});
