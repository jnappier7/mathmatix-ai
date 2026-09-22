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
  parseStrictNumber,
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

describe('a number is the WHOLE string, never its leading digits', () => {
  // valuesMatch's last resort was parseFloat, which reads the leading digits
  // and ignores the rest — so every pair below graded EQUAL. Swept against the
  // seeded banks: 528 distractors on 344 multiple-choice items graded correct
  // when typed, none of them a bad item. Each row is a real key and one of its
  // own distractors, from seeds/act-*.generated.json.
  test.each([
    ['4x^2 + 36', '4x^2 - 36', 'sign flip in a polynomial'],
    ['4x^2 - 24x - 36', '4x^2 - 36', 'extra middle term'],
    ['2x + 3', '2x - 3', 'linear, same leading coefficient'],
    ['3,429', '3,610', 'thousands — parseFloat read both as 3'],
    ['1,000', '1,999', 'thousands, wildly different'],
    ['-7 < x < 18', '-7/5 < x < 18/5', 'compound inequality, unscaled bounds'],
    ['2(log(a) + log(b))', '2log(a) + log(b)', 'log identity'],
    ['2log(a)log(b)', '2log(a) + log(b)', 'log identity, product for sum'],
    ['2b/A', '2A/b', 'formula rearranged the wrong way'],
    ['18 + 22i', '18 - 14i', 'complex, same real part'],
    ['61 - 11i', '61', 'complex against a real'],
    ['2', '2π/3', 'bare number against a π fraction'],
    ['64', '64π', 'bare number against a π multiple'],
    ['5', '5√2', 'bare number against a radical'],
    ['1.8 × 10⁹', '1.8 × 10¹⁰', 'same mantissa, different exponent'],
    ['16.9 × 10^5', '1.69 × 10^6', 'equal quantity, but not scientific notation — the item tests the form'],
    ['8% decrease', '8% increase', 'direction is not a unit'],
    ['8 and every choice smaller', '8 and every choice larger', 'act-backsolving key vs its own distractor'],
    ['4 centimeters left of the line', '4 centimeters right of the line', 'create-symmetry key vs its own distractor'],
    ['10 more', '10', 'a comparative is not a unit'],
    ['0.5 × 10^3', '5 × 10^2', 'mantissa below 1 is a form error too'],
    ['2⁷', '2', 'superscript power'],
    ['3:4', '3', 'ratio'],
  ])('%s is not %s (%s)', (a, b) => {
    expect(valuesMatch(a, b)).toBe(false);
    expect(valuesMatch(b, a)).toBe(false);
  });

  test('parseStrictNumber refuses everything that is more than a number', () => {
    for (const s of ['4x^2 - 36', '2π/3', '64π', '5√2', '18-14i', '3:4', '2⁷', '5 or 6', '2 and 3', '11:00 a.m.', '6,8,10', 'e', 'abc', '']) {
      expect(parseStrictNumber(s)).toBeNull();
    }
  });

  test('a × 10ⁿ is a spelling of a number only with the mantissa in [1, 10)', () => {
    // 20 act-scientific-notation items carry the unnormalized form as a
    // distractor — "16.9 × 10^5" against key "1.69 × 10^6". Same quantity,
    // wrong form, and the form is what the item is asking for.
    expect(parseStrictNumber('1.69 × 10^6')).toBe(1690000);
    expect(parseStrictNumber('1 × 10^5')).toBe(100000);
    expect(parseStrictNumber('-2.5 × 10^4')).toBe(-25000);
    expect(parseStrictNumber('16.9 × 10^5')).toBeNull();
    expect(parseStrictNumber('10 × 10^3')).toBeNull();
    expect(parseStrictNumber('0.5 × 10^3')).toBeNull();
    // The plain number is still that number.
    expect(valuesMatch('1690000', '1.69 × 10^6')).toBe(true);
  });

  test('a real item: the key and its letter grade correct, no distractor does', () => {
    // seeds/act-enhanced fa52ebe5 — all three distractors graded correct before.
    const spec = {
      value: '4x^2 - 36', equivalents: [], answerType: 'multiple-choice',
      options: [{ label: 'A', text: '4x^2 + 36' }, { label: 'B', text: '4x^2 - 36' },
        { label: 'C', text: '4x^2 - 24x - 36' }, { label: 'D', text: '4x^2 + 6' }],
      correctOption: 'B',
    };
    expect(compareAnswer('B', spec)).toBe(true);
    expect(compareAnswer('4x^2 - 36', spec)).toBe(true);
    for (const wrong of ['4x^2 + 36', '4x^2 - 24x - 36', '4x^2 + 6']) expect(compareAnswer(wrong, spec)).toBe(false);
  });
});

describe('spellings that ARE the same number still match', () => {
  // The bank writes numbers with currency signs, degree signs, percent signs,
  // thousands separators, a trailing unit word, and two spellings of scientific
  // notation. Each is the same number the student typed without the dressing,
  // and none must be lost to the strictness above. ("$276" vs "276" actually
  // FAILED before — parseFloat("$276") is NaN — so that one is a fix, not a hold.)
  test.each([
    ['3,610', '3610'],
    ['1,234,567.5', '1234567.5'],
    ['$276', '276'],
    ['$20.00', '20'],
    ['-$5', '-5'],
    ['68°', '68'],
    ['15%', '15'],
    ['9 only', '9'],
    ['12 ft', '12'],
    ['295 vehicles', '295'],
    ['36 units squared', '36'],
    ['12 square feet', '12'],
    ['295 vehicles per hour', '295'],
    ['$5 per hour', '5'],
    ['1.8 × 10¹⁰', '18000000000'],
    ['1.8 × 10¹⁰', '1.8e10'],
    ['2.88 × 10^10', '28800000000'],
    ['4.7 × 10⁻⁴', '0.00047'],
    ['4.7 x 10^-4', '0.00047'],
    ['−5', '-5'],
    ['−3/4', '-0.75'],
  ])('%s matches %s', (a, b) => {
    expect(valuesMatch(a, b)).toBe(true);
    expect(valuesMatch(b, a)).toBe(true);
  });

  test('units are words — a second number is not a unit, nor is a lone letter', () => {
    expect(parseStrictNumber('9 only')).toBe(9);
    expect(parseStrictNumber('36 units squared')).toBe(36);
    expect(parseStrictNumber('5 or 6')).toBeNull();
    expect(parseStrictNumber('2 and 3')).toBeNull();
    expect(parseStrictNumber('3 and π')).toBeNull();
    // "5 x" is 5x with a space, "2 i" is a complex number — variables, not units.
    expect(parseStrictNumber('5 x')).toBeNull();
    expect(parseStrictNumber('2 i')).toBeNull();
    // A word that makes the number relative to something halts the peel, and
    // what is left is not a number. The bank carries each of these as a
    // key/distractor pair, so peeling through them would grade opposites equal.
    for (const s of ['8 and every choice smaller', '4 centimeters left of the line', '8% decrease', '10 more', '6 left', '3 greater than']) {
      expect(parseStrictNumber(s)).toBeNull();
    }
    // "per" connects units and is not in the way.
    expect(parseStrictNumber('295 vehicles per hour')).toBe(295);
  });

  test('commas are thousands separators only in that shape', () => {
    expect(parseStrictNumber('9,000')).toBe(9000);
    expect(parseStrictNumber('6,8,10')).toBeNull();   // a list
    expect(parseStrictNumber('8, 15, 17')).toBeNull(); // a triple
    expect(parseStrictNumber('1,2')).toBeNull();       // not thousands
  });

  test('the fraction path inherits the same strictness', () => {
    expect(parseFractionOrDecimal('2A/b')).toBeNull();
    expect(parseFractionOrDecimal('-7/5 < x < 18/5')).toBeNull();
    expect(parseFractionOrDecimal('−3/4')).toBeCloseTo(-0.75);
  });
});

describe('no seeded multiple-choice item has a distractor that grades correct', () => {
  // The three largest banks on disk uncompressed. A distractor whose text is
  // literally the key is a bad ITEM and is skipped; everything else that
  // grades correct here is a grader bug, and there were 361 of them.
  const load = (f) => require(`../../seeds/${f}`);
  const banks = ['act-enhanced/act-items.generated.json', 'act-fable-items.generated.json', 'act-ies-expansion/ies-items.generated.json'];

  test.each(banks)('%s', (bank) => {
    const items = load(bank).filter((it) => it && it.answer && Array.isArray(it.options) && it.options.length);
    expect(items.length).toBeGreaterThan(300);   // a missing or empty bank must not pass vacuously
    const hits = [];
    for (const it of items) {
      const spec = { value: it.answer.value, equivalents: it.answer.equivalents || [], answerType: it.answerType, options: it.options, correctOption: it.correctOption };
      for (const o of it.options) {
        if (o.label === it.correctOption) continue;
        if (String(o.text).trim() === String(it.answer.value).trim()) continue;
        if (compareAnswer(o.text, spec)) hits.push(`${it.problemId} key=${JSON.stringify(it.answer.value)} distractor=${JSON.stringify(o.text)}`);
      }
      // and the key itself, typed, must still grade correct
      expect(compareAnswer(it.answer.value, spec)).toBe(true);
    }
    expect(hits).toEqual([]);
  });
});

describe('the absolute slack does not outgrow a small key', () => {
  // valuesMatch's default slack is 1e-4 absolute. On a key of 36 that is
  // rounding at the fourth decimal. On a key of 0.000045 it is 222% of the key,
  // so "0.0000045" — a tenth of the answer — graded correct. The bank has six
  // keys in that zone; each row below is one of them against its own
  // distractor (all decade neighbours, from seeds/act-*.generated.json).
  test.each([
    ['0.0000045', '0.000045'],
    ['0.00045', '0.000045'],
    ['1.4 × 10⁻⁵', '1.4 × 10⁻⁴'],
    ['4.5 × 10⁻⁵', '4.5 × 10⁻⁴'],
    ['4.5 × 10⁻³', '4.5 × 10⁻⁴'],
    ['4.7 × 10⁻³', '4.7 × 10⁻⁴'],
    ['7.2×10⁻⁵', '7.2×10⁻⁴'],
    ['$0.15', '$0.01'],
  ])('%s is not %s', (a, b) => {
    expect(valuesMatch(a, b)).toBe(false);
    expect(valuesMatch(b, a)).toBe(false);
  });

  test('the same small number in another spelling still matches', () => {
    expect(valuesMatch('0.000045', '4.5 × 10⁻⁵')).toBe(true);
    expect(valuesMatch('0.00045', '4.5 × 10⁻⁴')).toBe(true);
    expect(valuesMatch('0.00047', '4.7 × 10⁻⁴')).toBe(true);
    expect(valuesMatch('0.01', '$0.01')).toBe(true);
  });

  test('rounding a small key to three significant figures still passes', () => {
    // 3 s.f. costs at most 0.5%, under the 1% cap. This is what the cap is
    // sized against — tighter would start rejecting honest rounding.
    expect(valuesMatch('0.0067', '0.00667')).toBe(true);
    expect(valuesMatch('0.00333', '1/300')).toBe(true);
  });

  test('nothing changes at normal magnitude or at zero', () => {
    // 1e-4 is below 1% of any key >= 0.01, so the cap is inert there — and 45
    // bank items have a distractor within 1% of the key, so it has to be.
    expect(valuesMatch('0.6667', '2/3')).toBe(true);
    expect(valuesMatch('36.00005', '36')).toBe(true);
    expect(valuesMatch('35.99', '36')).toBe(false);
    expect(valuesMatch('0.5', '0.50')).toBe(true);
    // A zero KEY has no magnitude to scale by; the absolute slack stands.
    expect(valuesMatch('0.00005', '0')).toBe(true);
    expect(valuesMatch('0.001', '0')).toBe(false);
    // The other direction is not the zero rule: typing 0 for a nonzero key is
    // wrong by 100%, and used to grade correct for any key under 1e-4.
    expect(valuesMatch('0', '0.00005')).toBe(false);
  });

  test('relative mode (assessmentService) is untouched', () => {
    const tol = { relative: 0.015, zeroAbsolute: 0.01 };
    expect(valuesMatch('0.0000455', '0.000045', tol)).toBe(true);   // 1.1% off, under 1.5%
    expect(valuesMatch('0.000046', '0.000045', tol)).toBe(false);   // 2.2% off
  });
});
