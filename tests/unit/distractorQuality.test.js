/**
 * distractorQuality — detects broken multiple-choice options before
 * they reach a student (QA P0-3). Cases mirror the exact defects the
 * QA walkthrough found in the Starting Point screener.
 */

const {
  assessOptions,
  isPlaceholderOption,
  hasBadDistractors,
  PLACEHOLDER_RE,
} = require('../../utils/distractorQuality');

function mc(options, { answer, correctOption } = {}) {
  return {
    answerType: 'multiple-choice',
    options: options.map((text, i) => ({ label: 'ABCDEF'[i], text })),
    answer: { value: answer },
    correctOption,
  };
}
function codes(problem) {
  return assessOptions(problem).issues.map((i) => i.code);
}

describe('placeholder distractors ("Wrong 1/2/3")', () => {
  test('Q5 "0.05 in words" — three placeholder options are flagged', () => {
    // From the report: ["Wrong 3","five hundredths","Wrong 1","Wrong 2"]
    const p = mc(['Wrong 3', 'five hundredths', 'Wrong 1', 'Wrong 2'], {
      answer: 'five hundredths', correctOption: 'B',
    });
    const r = assessOptions(p);
    expect(r.ok).toBe(false);
    expect(codes(p)).toContain('placeholder_option');
    expect(r.issues.find((i) => i.code === 'placeholder_option').detail)
      .toMatch(/Wrong 3.*Wrong 1.*Wrong 2/);
  });

  test('Q6 option D "Wrong 3" flagged even when others are real', () => {
    const p = mc(['4', '-4', '0', 'Wrong 3'], { answer: '-4', correctOption: 'B' });
    expect(hasBadDistractors(p)).toBe(true);
    expect(codes(p)).toContain('placeholder_option');
  });

  test('placeholder regex matches variants but not real answers', () => {
    expect(PLACEHOLDER_RE.test('Wrong')).toBe(true);
    expect(PLACEHOLDER_RE.test('Wrong 1')).toBe(true);
    expect(PLACEHOLDER_RE.test('  wrong  2 ')).toBe(true);
    // A real answer that merely contains the word must NOT be flagged.
    expect(PLACEHOLDER_RE.test('wrong answer')).toBe(false);
    expect(PLACEHOLDER_RE.test('2 wrongs')).toBe(false);
    expect(isPlaceholderOption({ text: 'Wrong 2' })).toBe(true);
    expect(isPlaceholderOption({ text: 'five hundredths' })).toBe(false);
  });
});

describe('wrong-type distractors', () => {
  test('Q21 "4/5 − 1/4" (ans 11/20) with integer distractors 12,13,10', () => {
    const p = mc(['12', '13', '11/20', '10'], { answer: '11/20', correctOption: 'C' });
    const r = assessOptions(p);
    expect(r.ok).toBe(false);
    expect(codes(p)).toContain('wrong_type_distractors');
  });

  test('decimal answer 0.05 among integer distractors is flagged', () => {
    const p = mc(['5', '0.05', '50', '500'], { answer: '0.05', correctOption: 'B' });
    expect(codes(p)).toContain('wrong_type_distractors');
  });

  test('fraction answer WITH fraction distractors is fine', () => {
    const p = mc(['11/20', '9/20', '3/4', '1/2'], { answer: '11/20', correctOption: 'A' });
    expect(assessOptions(p).ok).toBe(true);
  });

  test('integer answer with integer distractors is fine (not wrong-type)', () => {
    const p = mc(['42', '36', '48', '54'], { answer: '42', correctOption: 'A' });
    expect(assessOptions(p).ok).toBe(true);
  });
});

describe('structural defects', () => {
  test('blank option flagged', () => {
    const p = mc(['4', '', '6', '8'], { answer: '4', correctOption: 'A' });
    expect(codes(p)).toContain('blank_option');
  });
  test('duplicate options flagged', () => {
    const p = mc(['4', '4', '6', '8'], { answer: '6', correctOption: 'C' });
    expect(codes(p)).toContain('duplicate_option');
  });
  test('fewer than two options flagged', () => {
    const p = mc(['4'], { answer: '4', correctOption: 'A' });
    expect(codes(p)).toContain('too_few_options');
  });
});

describe('clean and non-MC problems pass', () => {
  test('a well-authored MC question is ok', () => {
    const p = mc(['42', '36', '13', '49'], { answer: '42', correctOption: 'A' });
    expect(assessOptions(p).ok).toBe(true);
    expect(hasBadDistractors(p)).toBe(false);
  });
  test('constructed-response with no options is ok', () => {
    const p = { answerType: 'constructed-response', options: [], answer: { value: '7' } };
    expect(assessOptions(p).ok).toBe(true);
  });
  test('correctOption falls back to matching answer text when letter missing', () => {
    // No correctOption letter; wrong-type check still resolves via answer value.
    const p = mc(['12', '13', '11/20', '10'], { answer: '11/20' });
    expect(codes(p)).toContain('wrong_type_distractors');
  });
});
