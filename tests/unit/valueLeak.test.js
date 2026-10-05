/**
 * utils/pipeline/valueLeak.js — solves the student's own equation and looks
 * for that VALUE in a tutor reply. The labelled corpus in
 * tests/eval/valueLeak/corpus.json is the gate: every clean reply must pass
 * (a false alarm rewrites good tutoring) and every leak must be caught.
 * Add each production false alarm or miss to the corpus, not just here.
 */

const {
    extractPosedEquations,
    findValueReveal,
    numberWords,
    creditStudentStatements,
    restatesStudentAnswer,
} = require('../../utils/pipeline/valueLeak');
const { cases } = require('../eval/valueLeak/corpus.json');

describe('labelled corpus', () => {
    test.each(cases.map((c) => [c.id, c]))('%s', (_id, c) => {
        // Same path verify.js takes: values the student stated are credited first.
        const messages = c.student.split('\n');
        const { open } = creditStudentStatements(extractPosedEquations(c.student), messages);
        const found = findValueReveal(c.reply, open);
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

describe('creditStudentStatements / restatesStudentAnswer', () => {
    // Production 2026-10: a student finishing an algebraic proof. Every step
    // they typed is itself an equation solved by 8, so confirming their own
    // "x=8" was read as revealing it.
    const proof = [
        'divide by 2 to get x=8',
        '5x+10-3x=26 distributive property',
        '2x+10=26 combine like terms',
        '-10 on both sides to get 2x=16 subtraction property of equality',
    ];
    const credit = (msgs) => creditStudentStatements(extractPosedEquations(msgs.join('\n')), msgs);

    test('a value the student stated is no longer guarded', () => {
        const { open, answered } = credit(proof);
        expect(open.flatMap((p) => p.values)).not.toContain(8);
        expect(answered.map((a) => a.equation)).toContain('2x+10=26');
    });

    test('a bare "x = 8" never counts as having solved a real equation', () => {
        const { answered } = credit(['x=8']);
        expect(answered).toEqual([]);
    });

    test('a wrong guess credits nothing on the real equation', () => {
        const { open } = credit(['is it x=5?', 'solve 3x - 7 = 20']);
        expect(open.find((p) => p.equation === '3x - 7 = 20').values).toEqual([9]);
    });

    test('several guesses in one message credit nothing', () => {
        const { open, answered } = credit(['solve 3x - 7 = 20', 'x = 1 or x = 9 or x = 20']);
        expect(open.find((p) => p.equation === '3x - 7 = 20').values).toEqual([9]);
        expect(answered).toEqual([]);
    });

    test('a quadratic stays guarded until the student states every root', () => {
        const half = credit(['solve x^2+x-6=0', 'x = 2']);
        expect(half.open.find((p) => p.equation === 'x^2+x-6=0').values).toEqual([-3]);
        expect(half.answered).toEqual([]);
        const both = credit(['solve x^2+x-6=0', 'x = 2 and x = -3']);
        expect(both.open.find((p) => p.equation === 'x^2+x-6=0')).toBeUndefined();
        expect(both.answered.map((a) => a.equation)).toEqual(['x^2+x-6=0']);
    });

    test('restating the student\'s value is a restatement; naming another is not', () => {
        const { answered } = credit(proof);
        expect(restatesStudentAnswer('Exactly! So x = 8 and your proof is complete.', answered)).toBe(true);
        expect(restatesStudentAnswer('Nice. Recap: 2x + 10 = 26, then 2x = 16, so x = 8.', answered)).toBe(true);
        expect(restatesStudentAnswer('So x = 8. For the next one, x = 4.', answered)).toBe(false);
        expect(restatesStudentAnswer('x = 8', [])).toBe(false);
    });
});
