// tests/unit/answerComparison.test.js
// The shared answer-comparison engine. problem.checkAnswer() and
// assessmentService.checkAnswer() both delegate here, so this suite pins the
// canonical grading semantics for the whole app.

const {
  compareAnswer,
  valuesMatch,
  textAnswerMatch,
  expressionMatch,
  parseFractionOrDecimal,
} = require('../../utils/answerComparison');

describe('parseFractionOrDecimal', () => {
  test('parses simple fractions, decimals, and mixed numbers', () => {
    expect(parseFractionOrDecimal('2/3')).toBeCloseTo(2 / 3);
    expect(parseFractionOrDecimal('-3/4')).toBeCloseTo(-0.75);
    expect(parseFractionOrDecimal('.5')).toBe(0.5);
    expect(parseFractionOrDecimal('1 1/2')).toBe(1.5);
    expect(parseFractionOrDecimal('-1 1/2')).toBe(-1.5);
  });

  test('returns null for zero denominators and non-numbers', () => {
    expect(parseFractionOrDecimal('1/0')).toBeNull();
    expect(parseFractionOrDecimal('abc')).toBeNull();
  });
});

describe('valuesMatch', () => {
  test('exact match is case- and whitespace-insensitive', () => {
    expect(valuesMatch('X = 5', 'x=5')).toBe(true);
  });

  test('fraction/decimal equivalence', () => {
    expect(valuesMatch('2/4', '1/2')).toBe(true);
    expect(valuesMatch('0.5', '1/2')).toBe(true);
    expect(valuesMatch('1/2', '0.5')).toBe(true);
    expect(valuesMatch('1/3', '1/2')).toBe(false);
  });

  test('numeric equivalence across formats', () => {
    expect(valuesMatch('.5', '0.50')).toBe(true);
    expect(valuesMatch('0.51', '0.5')).toBe(false);
  });

  test('relative tolerance mode', () => {
    const tol = { relative: 0.015, zeroAbsolute: 0.01 };
    expect(valuesMatch('7.95', '8', tol)).toBe(true);   // 0.6% off
    expect(valuesMatch('7.85', '8', tol)).toBe(false);  // 1.9% off
    expect(valuesMatch('0.001', '0', tol)).toBe(true);
    expect(valuesMatch('1', '0', tol)).toBe(false);
  });

  test('a stray letter never matches a number', () => {
    expect(valuesMatch('a', '0')).toBe(false);
    expect(valuesMatch('e', '2.718')).toBe(false);
  });
});

describe('textAnswerMatch', () => {
  test('answer embedded in student prose (forward direction)', () => {
    expect(textAnswerMatch('it is 42', '42')).toBe(true);
    expect(textAnswerMatch('I think the answer is 3/4', '3/4')).toBe(true);
  });

  test('bare value against a key phrase (reverse direction)', () => {
    expect(textAnswerMatch('42', 'the answer is 42')).toBe(true);
  });

  test('no substring false positives in either direction', () => {
    expect(textAnswerMatch('it is 425', '42')).toBe(false);
    expect(textAnswerMatch('4', 'the answer is 42')).toBe(false);
    expect(textAnswerMatch('a', 'the answer is 42')).toBe(false);
    expect(textAnswerMatch('answer', 'the answer is 42')).toBe(false);
  });

  test('comparison-symbol synonyms', () => {
    expect(textAnswerMatch('>', 'greater than')).toBe(true);
    expect(textAnswerMatch('less than', '<')).toBe(true);
  });
});

describe('expressionMatch', () => {
  test('normalized equality (whitespace, case, ** vs ^)', () => {
    expect(expressionMatch('8x ** 2 + x', '8x^2+x')).toBe(true);
    expect(expressionMatch('(X+3)(X-3)', '(x+3)(x-3)')).toBe(true);
  });

  test('bounded containment', () => {
    expect(expressionMatch('f(x)=(x+3)(x-3)', '(x+3)(x-3)')).toBe(true);
    expect(expressionMatch('y = 2x', '2x')).toBe(true);
  });

  test('containment must not cross an alphanumeric boundary', () => {
    expect(expressionMatch('12x', '2x')).toBe(false);
    expect(expressionMatch('x^2 + 3x + 25', 'x^2+3x+2')).toBe(false);
  });
});

describe('compareAnswer (the problem.checkAnswer engine)', () => {
  const mcSpec = {
    value: '35',
    equivalents: [],
    answerType: 'multiple-choice',
    options: [{ text: '30' }, { text: '35' }, { text: '40' }, { text: '45' }],
    correctOption: 'B',
  };

  test('MC: matches by option letter', () => {
    expect(compareAnswer('B', mcSpec)).toBe(true);
    expect(compareAnswer('b', mcSpec)).toBe(true);
  });

  test('MC: a wrong letter is wrong — never falls through to value matching', () => {
    expect(compareAnswer('A', mcSpec)).toBe(false);
    // 'C' maps to option '40' ≠ 35, and must not be salvaged numerically
    expect(compareAnswer('C', mcSpec)).toBe(false);
  });

  test('MC: letter whose option text equals the answer value', () => {
    // correctOption missing — grade via the selected option's text
    const spec = { ...mcSpec, correctOption: undefined };
    expect(compareAnswer('B', spec)).toBe(true);
    expect(compareAnswer('C', spec)).toBe(false);
  });

  test('MC: typed free-form value matches the correct option text', () => {
    // chat-rendered screener shows no A–D labels; students type the value
    expect(compareAnswer('35', mcSpec)).toBe(true);
    expect(compareAnswer('40', mcSpec)).toBe(false);
  });

  test('MC: string options (not {text} objects) work too', () => {
    const spec = { ...mcSpec, options: ['30', '35', '40', '45'] };
    expect(compareAnswer('B', spec)).toBe(true);
  });

  test('MC: options keyed `id` instead of `label` still grade', () => {
    // scripts/convertToMC.js wrote `{ id, text, isCorrect }` straight into the
    // bank via $set, which Mongoose does not strip. Every surface serving those
    // items now labels them positionally, so the engine has to read them too.
    const spec = {
      ...mcSpec,
      options: [{ id: 'A', text: '30', isCorrect: false }, { id: 'B', text: '35', isCorrect: true },
        { id: 'C', text: '40', isCorrect: false }, { id: 'D', text: '45', isCorrect: false }],
    };
    expect(compareAnswer('B', spec)).toBe(true);
    expect(compareAnswer('C', spec)).toBe(false);
  });

  test('MC: a shuffled stored letter resolves to the slot the student saw', () => {
    // generate-all-pattern-problems.js shuffles options with their labels
    // attached, so correctOption:'C' here means SLOT A. Comparing the submitted
    // letter to the raw stored letter would mark slot C correct and slot A
    // wrong — both verdicts backwards.
    const spec = {
      value: '100',
      answerType: 'multiple-choice',
      options: [{ label: 'C', text: '100' }, { label: 'A', text: '102' }, { label: 'B', text: '99' }],
      correctOption: 'C',
    };
    expect(compareAnswer('A', spec)).toBe(true);
    expect(compareAnswer('C', spec)).toBe(false);
  });

  test('MC: a typed value is graded against the CORRECT option, not a mis-indexed one', () => {
    // The old `correctOption.charCodeAt(0) - 65` index read slot C's text ('99')
    // on the spec above and pushed it into the acceptable set — so a student
    // typing the wrong number graded correct.
    const spec = {
      value: '100',
      answerType: 'multiple-choice',
      options: [{ label: 'C', text: '100' }, { label: 'A', text: '102' }, { label: 'B', text: '99' }],
      correctOption: 'C',
    };
    expect(compareAnswer('100', spec)).toBe(true);
    expect(compareAnswer('99', spec)).toBe(false);
  });

  test('MC: comparison-symbol options', () => {
    const spec = {
      value: 'greater than',
      answerType: 'multiple-choice',
      options: [{ text: '<' }, { text: '>' }, { text: '=' }],
      correctOption: undefined,
    };
    expect(compareAnswer('B', spec)).toBe(true);
    expect(compareAnswer('A', spec)).toBe(false);
  });

  describe('items that carry options but are not DECLARED multiple-choice', () => {
    // ~774 items in the bank. Every MC-rendering client draws radio buttons from
    // options being present and never looks at answerType, so the student clicks
    // a letter — but this branch used to be gated on answerType, so "C" was
    // compared against the answer value as a raw string and always lost.
    // gradeOne never had the gate, which is why the skill-map challenge graded
    // these fine while review / challenges / actTest did not.
    const undeclared = {
      value: '100',
      equivalents: [],
      answerType: 'constructed-response',
      options: [{ label: 'A', text: '102' }, { label: 'B', text: '101' },
        { label: 'C', text: '100' }, { label: 'D', text: '99' }],
    };

    test('clicking the correct option now grades correct', () => {
      expect(compareAnswer('C', undeclared)).toBe(true);
    });

    test('clicking a wrong option still grades wrong', () => {
      expect(compareAnswer('A', undeclared)).toBe(false);
      expect(compareAnswer('D', undeclared)).toBe(false);
    });

    test('typing the value still works — the change only adds verdicts', () => {
      expect(compareAnswer('100', undeclared)).toBe(true);
      expect(compareAnswer('99', undeclared)).toBe(false);
    });

    test('a letter that is a legitimate free-response ANSWER is not stolen', () => {
      // This is why the "explicit letter is wrong, no fall-through" rule stays
      // scoped to declared MC. Here 'A' is the answer, not a choice — applying
      // that rule would take away a verdict value comparison gets right today.
      const pointLabel = {
        value: 'A', equivalents: [], answerType: 'constructed-response',
        options: [{ label: 'A', text: 'P' }, { label: 'B', text: 'Q' }],
      };
      expect(compareAnswer('A', pointLabel)).toBe(true);
    });

    test('declared multiple-choice behaviour is untouched', () => {
      // The rule still bites where it was designed to: a stray letter must
      // never be salvaged by value matching on a real MC item.
      expect(compareAnswer('C', mcSpec)).toBe(false);   // 'C' is '40', not 35
      expect(compareAnswer('B', mcSpec)).toBe(true);
    });

    test('an item with no options at all is unaffected', () => {
      const plain = { value: '42', equivalents: [], answerType: 'constructed-response' };
      expect(compareAnswer('42', plain)).toBe(true);
      expect(compareAnswer('A', plain)).toBe(false);
    });
  });

  test('free response: value, equivalents, fractions, decimals', () => {
    const spec = { value: '1/2', equivalents: ['0.5', '2/4'] };
    expect(compareAnswer('1/2', spec)).toBe(true);
    expect(compareAnswer('0.5', spec)).toBe(true);
    expect(compareAnswer('3/6', spec)).toBe(true); // equivalent via fraction math
    expect(compareAnswer('1/3', spec)).toBe(false);
  });

  test('free response: a missing answer key always grades false', () => {
    // The problem.correctAnswer / growth-check-0% bug class, both directions:
    // no key must never grade correct — not even for the literal string
    // "undefined", which the old String() coercion would have matched
    expect(compareAnswer('42', { value: undefined })).toBe(false);
    expect(compareAnswer('undefined', { value: undefined })).toBe(false);
    expect(compareAnswer('null', { value: null })).toBe(false);
    expect(compareAnswer('', { value: '' })).toBe(false);
  });
});
