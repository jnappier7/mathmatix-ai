/**
 * utils/pipeline/valueLeak.js — solves the student's own equation and looks
 * for that VALUE in a tutor reply. The labelled corpus in
 * tests/eval/valueLeak/corpus.json is the gate: every clean reply must pass
 * (a false alarm rewrites good tutoring) and every leak must be caught.
 * Add each production false alarm or miss to the corpus, not just here.
 */

const { extractPosedEquations, findValueReveal, numberWords } = require('../../utils/pipeline/valueLeak');
const { cases } = require('../eval/valueLeak/corpus.json');

describe('labelled corpus', () => {
    test.each(cases.map((c) => [c.id, c]))('%s', (_id, c) => {
        const found = findValueReveal(c.reply, extractPosedEquations(c.student));
        expect(!!found).toBe(c.leaks);
    });

    test('the corpus is weighted toward clean replies', () => {
        const clean = cases.filter((c) => !c.leaks).length;
        expect(clean).toBeGreaterThan(cases.length / 2);
    });
});

describe('extractPosedEquations', () => {
    const eqs = (m) => extractPosedEquations(m).map((p) => [p.equation, p.values]);

    test('pulls an equation out of a sentence and solves it', () => {
        expect(eqs('can you help me with 2x+5=17 please')).toEqual([['2x+5=17', [6]]]);
    });

    test('splits a numbered list without breaking parentheses', () => {
        expect(eqs('do these: 1) x+4=10 2) 2x=18')).toEqual([['x+4=10', [6]], ['2x=18', [9]]]);
        expect(eqs('solve 3(x + 2) = 21')).toEqual([['3(x + 2) = 21', [5]]]);
    });

    test('keeps a leading variable, drops a leading article', () => {
        expect(eqs('solve x - 4 = 17')).toEqual([['x - 4 = 17', [21]]]);
        expect(eqs('here is a 4x + 3 = 31')).toEqual([['4x + 3 = 31', [7]]]);
    });

    test('skips anything with two variables or nothing to solve', () => {
        expect(eqs('graph y = 2x + 3')).toEqual([]);
        expect(eqs('what is a variable?')).toEqual([]);
        expect(eqs('')).toEqual([]);
        expect(eqs(null)).toEqual([]);
    });

    test('records the coefficients of the variable', () => {
        expect(extractPosedEquations('5x + 10 = 45')[0].coefficients).toEqual([5]);
    });
});

describe('findValueReveal', () => {
    const p = (equation, values, coefficients = []) => [{ equation, variable: 'x', values, coefficients }];

    test('names how the value was handed over', () => {
        expect(findValueReveal('so x is seven.', p('4x+3=31', [7])).how).toBe('assignment');
        expect(findValueReveal('Plug in 7 and see.', p('4x+3=31', [7])).how).toBe('substitution');
        expect(findValueReveal('5(7) + 10 = 45', p('5x+10=45', [7], [5])).how).toBe('coefficient-substitution');
        expect(findValueReveal('The answer is 7.', p('4x+3=31', [7])).how).toBe('answer');
    });

    test('± names both roots', () => {
        expect(findValueReveal('x = ±7', p('x^2=49', [7, -7]))).not.toBeNull();
    });

    test('reports the root that actually matched', () => {
        expect(findValueReveal('so x = 2 works', p('x^2-5x+6=0', [3, 2])).value).toBe(2);
    });

    test('decodes base64 before looking', () => {
        const b64 = Buffer.from('x = 8').toString('base64');
        expect(findValueReveal(`here: ${b64}`, p('2x+9=25', [8]))).not.toBeNull();
    });

    test('a different value bound to x is not a reveal', () => {
        expect(findValueReveal('Say x = 3, just to test.', p('2x+5=17', [6]))).toBeNull();
    });

    test('nothing to compare against → nothing found', () => {
        expect(findValueReveal('x = 7', [])).toBeNull();
        expect(findValueReveal('', p('4x+3=31', [7]))).toBeNull();
    });
});

describe('numberWords', () => {
    test('covers teens, tens, compounds and negatives', () => {
        expect(numberWords(13)).toEqual(['thirteen']);
        expect(numberWords(40)).toEqual(['forty']);
        expect(numberWords(21)).toContain('twenty-one');
        expect(numberWords(-7)).toContain('negative seven');
        expect(numberWords(2.5)).toEqual([]);
    });
});
