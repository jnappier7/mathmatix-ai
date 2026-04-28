/**
 * Regression tests for the answer-leak detectors in worksheetGuard.
 *
 * Origin: transcript where a student dropped bare equations ("x^2=49",
 * "x^2-3x=5") and the tutor responded with complete solutions ending in
 * "x=7 or x=-7" and "x=(3+√29)/2 and x=(3-√29)/2". Both responses slipped
 * past detectWorkedSolution because the detector was tuned for graphing
 * worksheets (Step headers, Summary blocks, labeled keys like "vertex:"),
 * not equation-solving giveaways.
 *
 * detectAnswerAnnouncement catches the specific leak shapes:
 *   - multi-root announcement:   "x = A or x = B"
 *   - pluralized conclusion:     "so the solutions are ..."
 *   - transitional reveal:       "this gives us x = ..."
 */

const {
  detectAnswerAnnouncement,
  detectWorkedSolution,
  detectWorksheetSignals,
  applyWorksheetGuard,
  detectBlankWork,
  stripCorrectAnswers,
  detectAnswerKeyResponse,
  filterAnswerKeyResponse,
} = require('../../utils/worksheetGuard');

describe('detectAnswerAnnouncement', () => {
  // ── Multi-root announcements (the transcript's primary leak) ──

  test('flags "x = 7 or x = -7" (x^2=49 quadratic roots)', () => {
    const result = detectAnswerAnnouncement('This gives us:\n\nx = 7 or x = -7\n\nCan you see how we arrived at both solutions?');
    expect(result.detected).toBe(true);
  });

  test('flags "x=(3+√29)/2 and x=(3-√29)/2" (quadratic formula dump)', () => {
    const result = detectAnswerAnnouncement('So, the solutions are:\n\nx=(3+√29)/2 and x=(3-√29)/2\n\nCan you follow how we got there?');
    expect(result.detected).toBe(true);
  });

  test('flags "a = 5 or a = -5" (absolute-value style reveal)', () => {
    expect(detectAnswerAnnouncement('So a = 5 or a = -5.').detected).toBe(true);
  });

  // ── Pluralized conclusion phrases ──

  test('flags "So, the solutions are ..." even without the multi-root pattern', () => {
    expect(detectAnswerAnnouncement('So, the solutions are 7 and -7.').detected).toBe(true);
  });

  test('flags "Therefore the answers are ..."', () => {
    expect(detectAnswerAnnouncement('Therefore the answers are 3 and 4.').detected).toBe(true);
  });

  test('flags "Thus the roots are ..."', () => {
    expect(detectAnswerAnnouncement('Thus the roots are x = 2 and x = 5.').detected).toBe(true);
  });

  // ── Transitional reveals ──

  test('flags "this gives us x = ..."', () => {
    expect(detectAnswerAnnouncement('Dividing both sides by 2, this gives us x = 14.').detected).toBe(true);
  });

  test('flags "so we have x = ..."', () => {
    expect(detectAnswerAnnouncement('After subtracting 3, so we have x = 10.').detected).toBe(true);
  });

  test('flags "so it becomes x = ..."', () => {
    expect(detectAnswerAnnouncement('Take the square root of both sides, so it becomes x = 7.').detected).toBe(true);
  });

  // ── Negative cases: legitimate Socratic prompts must NOT trip the detector ──

  test('does not flag a Socratic opening ("What do you think x is?")', () => {
    expect(detectAnswerAnnouncement('What do you think x is after you subtract 5 from both sides?').detected).toBe(false);
  });

  test('does not flag a first-step guidance without revealing the value', () => {
    const text = 'Nice! What operation would undo the squaring on x? Once you pick one, apply it to both sides.';
    expect(detectAnswerAnnouncement(text).detected).toBe(false);
  });

  test('does not flag a student-echoed question', () => {
    const text = 'Good question — you set up the equation correctly. What do you want to try first?';
    expect(detectAnswerAnnouncement(text).detected).toBe(false);
  });

  test('does not flag a parallel-example teaser without values', () => {
    const text = 'Here is a parallel problem: x² = 25. What value(s) of x would make this true?';
    expect(detectAnswerAnnouncement(text).detected).toBe(false);
  });
});

describe('detectWorkedSolution — multi-root smoking gun', () => {
  test('flags the transcript\'s x^2=49 response (trailing question does not excuse)', () => {
    const text = `Got it! So you're solving the equation x² = 49.

To find x, you'll want to take the square root of both sides. Remember, when you take the square root, you should consider both the positive and negative roots.

So it becomes:

x = √49 or x = -√49

This gives us:

x = 7 or x = -7

Can you see how we arrived at both solutions? Why do you think we need to consider both the positive and negative roots?`;

    const result = detectWorkedSolution(text);
    expect(result.isWorkedSolution).toBe(true);
    expect(result.breakdown.hardAnnouncement).toBe(true);
  });

  test('flags the transcript\'s x^2-3x=5 quadratic-formula dump', () => {
    const text = `Alright, let's solve the equation x² - 3x = 5 step by step!

First, we want to get everything on one side of the equation to set it to zero. So, we can subtract 5 from both sides:

x² - 3x - 5 = 0

Now we have a quadratic equation in standard form! Next, we can solve this using the quadratic formula:

x = (-b ± √(b²-4ac)) / (2a)

In this case, a = 1, b = -3, and c = -5.

Calculate the discriminant: 9 + 20 = 29

So, the solutions are:

x = (3 + √29) / 2 and x = (3 - √29) / 2

Can you follow how we got there?`;

    const result = detectWorkedSolution(text);
    expect(result.isWorkedSolution).toBe(true);
    expect(result.breakdown.hardAnnouncement).toBe(true);
  });

  test('does not flag a properly Socratic response to the same problem', () => {
    const text = `Got it — x² = 49. Before I say anything: what operation undoes squaring a variable? Once you pick one, apply it to both sides and tell me what you get.`;
    const result = detectWorkedSolution(text);
    expect(result.isWorkedSolution).toBe(false);
  });
});

describe('detectWorksheetSignals', () => {
  test('returns "not a worksheet" on empty/non-string input', () => {
    expect(detectWorksheetSignals('').isWorksheet).toBe(false);
    expect(detectWorksheetSignals(null).isWorksheet).toBe(false);
    expect(detectWorksheetSignals(123).isWorksheet).toBe(false);
  });

  test('detects multi-problem worksheets via numbered problems', () => {
    const text = '1. Solve x+1=5\n2. Find slope of (1,2)(3,4)\n3. Factor x^2-4';
    const r = detectWorksheetSignals(text);
    expect(r.isWorksheet).toBe(true);
    expect(r.signals.join(' ')).toMatch(/numbered problems/);
  });

  test('detects header fields like Name/Date/Period', () => {
    const text = 'Name: ____\nDate: ____\n1. solve\n2. solve\n3. solve';
    expect(detectWorksheetSignals(text).isWorksheet).toBe(true);
  });

  test('does not flag a single problem as a worksheet', () => {
    expect(detectWorksheetSignals('What is 2+2?').isWorksheet).toBe(false);
  });
});

describe('applyWorksheetGuard', () => {
  test('appends full guard for multi-problem worksheets', () => {
    const r = applyWorksheetGuard('Name: x\nDate: y\n1) solve\n2) solve\n3) solve');
    expect(r).toMatch(/SYSTEM INSTRUCTION/);
  });

  test('appends single-problem guard for short uploads', () => {
    const r = applyWorksheetGuard('Solve 2x+3=11');
    expect(r).toMatch(/single problem|concept/i);
  });

  test('preserves the original message at the start', () => {
    const original = 'Solve 2x+3=11';
    expect(applyWorksheetGuard(original).startsWith(original)).toBe(true);
  });
});

describe('detectBlankWork', () => {
  test('flags as blank when no problems given', () => {
    expect(detectBlankWork([]).isBlank).toBe(true);
    expect(detectBlankWork(null).isBlank).toBe(true);
  });

  test('flags as blank when ≥80% of studentAnswer fields are empty/dash/N/A', () => {
    const r = detectBlankWork([
      { studentAnswer: '' },
      { studentAnswer: '—' },
      { studentAnswer: 'N/A' },
      { studentAnswer: '(blank)' },
      { studentAnswer: '8' }
    ]);
    expect(r.isBlank).toBe(true);
    expect(r.blankCount).toBe(4);
    expect(r.totalCount).toBe(5);
  });

  test('not blank when most are answered', () => {
    const r = detectBlankWork([
      { studentAnswer: '5' },
      { studentAnswer: '7' },
      { studentAnswer: '' }
    ]);
    expect(r.isBlank).toBe(false);
    expect(r.blankCount).toBe(1);
  });

  test('honors a custom threshold', () => {
    expect(detectBlankWork([
      { studentAnswer: '' },
      { studentAnswer: '5' }
    ], 0.4).isBlank).toBe(true);
  });
});

describe('stripCorrectAnswers', () => {
  test('removes correctAnswer from each problem', () => {
    const probs = [
      { id: 1, studentAnswer: '5', correctAnswer: '5' },
      { id: 2, studentAnswer: '8', correctAnswer: '8' }
    ];
    stripCorrectAnswers(probs);
    expect(probs[0].correctAnswer).toBeUndefined();
    expect(probs[1].correctAnswer).toBeUndefined();
  });

  test('returns input unchanged when not an array', () => {
    expect(stripCorrectAnswers(null)).toBeNull();
    expect(stripCorrectAnswers('x')).toBe('x');
  });
});

describe('detectAnswerKeyResponse', () => {
  test('returns false for short single-problem responses', () => {
    expect(detectAnswerKeyResponse('Try 2x = 4. What is x?').isAnswerKey).toBe(false);
  });

  test('flags multi-problem hash-numbered solutions', () => {
    const txt = '#1: x = 5\n#2: x = 7\n#3: x = 9\n#4: x = 11';
    expect(detectAnswerKeyResponse(txt).isAnswerKey).toBe(true);
  });

  test('flags Problem-labeled walkthroughs', () => {
    const txt = 'Problem 1: solve...\nProblem 2: solve...\nProblem 3: solve...\nProblem 4: solve...';
    expect(detectAnswerKeyResponse(txt).isAnswerKey).toBe(true);
  });

  test('returns problem numbers and pattern name on hit', () => {
    const txt = '1) x=5\n2) x=7\n3) x=9\n4) x=11';
    const r = detectAnswerKeyResponse(txt);
    expect(r.matchedPattern).toBeTruthy();
    expect(r.problemNumbers.length).toBeGreaterThanOrEqual(3);
  });

  test('returns false on null/non-string input', () => {
    expect(detectAnswerKeyResponse(null).isAnswerKey).toBe(false);
    expect(detectAnswerKeyResponse(123).isAnswerKey).toBe(false);
  });
});

describe('filterAnswerKeyResponse', () => {
  test('replaces text + flags when an answer key is detected', () => {
    const txt = '#1: x=5\n#2: x=7\n#3: x=9\n#4: x=11';
    const r = filterAnswerKeyResponse(txt, 'u1');
    expect(r.wasFiltered).toBe(true);
    expect(r.text).not.toBe(txt);
    expect(r.text).toMatch(/which one/i);
  });

  test('passes safe responses through unchanged', () => {
    const safe = 'What is the first step?';
    const r = filterAnswerKeyResponse(safe, 'u1');
    expect(r.wasFiltered).toBe(false);
    expect(r.text).toBe(safe);
  });
});
