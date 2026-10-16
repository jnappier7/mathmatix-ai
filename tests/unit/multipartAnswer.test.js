/**
 * Lettered multipart keys and the audit's challenge run.
 *
 * Student audit, 2026-10-14: a "Systems by substitution" challenge scored five
 * correct answers 2 of 5. The pair answers were fixed in the comparator
 * (#1734); the multipart word problem — "a) system; b) 16 nickels and 14 dimes"
 * — could not be matched as one string by any answer. These pin both.
 */

const { gradeMultipart, splitParts } = require('../../utils/multipartAnswer');
const { gradeChallenge, gradeOne } = require('../../utils/skillChallenge');

const COINS = 'a) n + d = 30 and 0.05n + 0.10d = 2.20; b) 16 nickels and 14 dimes';
const MIX = 'a) x + y = 40 and 0.10x + 0.30y = 0.25(40) = 10; b) 10 liters of the 10% drink and 30 liters of the 30% drink';

describe('the audit run scores 5 of 5', () => {
  const problems = [
    { _id: 'p1', skillId: 'S', prompt: 'y = 3x − 4; 2x + y = 11', answer: { value: '(3, 5)', equivalents: [] } },
    { _id: 'p2', skillId: 'S', prompt: 'x + y = 10; x − y = 4. Find x.', options: [{ label: 'A', text: '3' }, { label: 'B', text: '6' }, { label: 'C', text: '7' }, { label: 'D', text: '14' }], correctOption: 'C', answer: { value: '7' } },
    { _id: 'p3', skillId: 'S', prompt: 'Theo has 30 nickels and dimes worth $2.20…', answer: { value: COINS, equivalents: [] } },
    { _id: 'p4', skillId: 'S', prompt: '40 questions worth 2 or 4 points; 100 total…', options: [{ label: 'A', text: '5' }, { label: 'B', text: '10' }, { label: 'C', text: '20' }, { label: 'D', text: '30' }], correctOption: 'B', answer: { value: '10' } },
    { _id: 'p5', skillId: 'S', prompt: 'y = 2x + 3; 4x + y = 27', answer: { value: '(4, 11)', equivalents: [] } }
  ];
  const submissions = [
    { problemId: 'p1', answer: 'x=3, y=5' },
    { problemId: 'p2', answer: 'C' },
    { problemId: 'p3', answer: 'n nickels, d dimes; n+d=30; 5n+10d=220; n=16,d=14' },
    { problemId: 'p4', answer: 'B' },
    { problemId: 'p5', answer: 'x=4, y=11' }
  ];

  test('every answer is graded correct and the run passes', () => {
    const r = gradeChallenge(problems, submissions);
    expect(r.items.map((i) => i.correct)).toEqual([true, true, true, true, true]);
    expect(r).toMatchObject({ correct: 5, total: 5, passed: true });
  });

  test('each item carries what was submitted, for the per-item review', () => {
    const r = gradeChallenge(problems, submissions);
    expect(r.items[2].submitted).toBe('n nickels, d dimes; n+d=30; 5n+10d=220; n=16,d=14');
  });
});

describe('word-problem systems', () => {
  test.each([
    ['the audit answer', 'n nickels, d dimes; n+d=30; 5n+10d=220; n=16,d=14'],
    ['lettered parts and decimals', 'a) n+d=30, .05n+.1d=2.2 b) n=16, d=14'],
    ['the key’s own variables', null]
  ])('accepts %s', (_, answer) => {
    if (answer) expect(gradeMultipart(COINS, answer)).toEqual({ correct: true, reason: null });
    else expect(gradeMultipart(MIX, 'x+y=40; 0.1x+0.3y=10; x=10, y=30')).toEqual({ correct: true, reason: null });
  });

  test('rejects swapped unknowns — by noun initial and by the key’s equations', () => {
    expect(gradeMultipart(COINS, 'n+d=30; 5n+10d=220; n=14, d=16').correct).toBe(false);
    expect(gradeMultipart(MIX, 'x+y=40; 0.1x+0.3y=10; x=30, y=10').correct).toBe(false);
  });

  test('rejects a written equation that does not hold at the solution', () => {
    expect(gradeMultipart(COINS, 'n+d=30; 5n+10d=200; n=16, d=14')).toEqual({ correct: false, reason: null });
  });

  test('a bare solution to a "write the system" item is incomplete, not right', () => {
    expect(gradeMultipart(COINS, 'n=16, d=14')).toEqual({ correct: false, reason: 'incomplete' });
  });
});

describe('part-by-part keys', () => {
  const FACTOR = 'a) (x + 4)(x + 5)  b) (3x + 2)(x + 3)  c) PRIME';
  const SLOPE = 'a) m = 3  b) b = −4  c) y = 3x − 4';

  test('splits only on a, b, c… in order', () => {
    expect(splitParts(FACTOR).map((p) => p.text)).toEqual(['(x + 4)(x + 5)', '(3x + 2)(x + 3)', 'PRIME']);
    expect(splitParts('f(x) = 3x + b)')).toBeNull();
  });

  test('grades each part on value, with ; or letters separating them', () => {
    expect(gradeMultipart(FACTOR, '(x+5)(x+4); (x+3)(3x+2); prime').correct).toBe(true);
    expect(gradeMultipart(SLOPE, 'm=3; b=-4; y=3x-4').correct).toBe(true);
    expect(gradeMultipart(SLOPE, 'a) 3 b) -4 c) y=3x-4').correct).toBe(true);
  });

  test('a readable part that disagrees is wrong', () => {
    expect(gradeMultipart(FACTOR, '(x+5)(x+4); (x+3)(3x+1); prime')).toEqual({ correct: false, reason: null });
    expect(gradeMultipart(SLOPE, 'm=3; b=4; y=3x+4')).toEqual({ correct: false, reason: null });
  });

  test('a prose part is undecided, so the item is ungradable rather than wrong', () => {
    const key = 'a) slope = −25, y-intercept = 300  b) the pool loses 25 gallons each minute  c) 150 gallons';
    expect(gradeMultipart(key, 'slope -25 intercept 300; loses 25 gal per min; 150')).toEqual({ correct: false, reason: 'ungradable' });
    expect(gradeOne({ _id: 'x', answer: { value: key } }, 'slope -25 intercept 300; loses 25 gal per min; 150').reason).toBe('ungradable');
  });

  test('a key without lettered parts is not this module’s business', () => {
    expect(gradeMultipart('(3, 5)', 'x=3, y=5')).toBeNull();
  });
});
