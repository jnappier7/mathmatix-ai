// Read-then-grade: the check-work grader reads the sheet, grades with code,
// and only calls a problem WRONG with two independent witnesses.
//
// Before this, one vision call read the handwriting, solved every problem and
// judged the student in a single pass — nothing independent checked it, so a
// misread digit or a model arithmetic slip told a student they were wrong.

jest.mock('../../utils/llmGateway', () => ({
  callLLMStructured: jest.fn(),
}));

const { callLLMStructured } = require('../../utils/llmGateway');
const { checkSteps } = require('../../utils/pipeline/checkWorkSteps');
const { gradeSheet, _internal } = require('../../utils/pipeline/checkWorkGrader');
const { verifyStudentWork } = require('../../utils/pipeline/checkWorkVerifier');

const { decide, confirmReading, solverCheck, stepCheck } = _internal;
const IMG = [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ABC' } }];

beforeEach(() => {
  callLLMStructured.mockReset();
  delete process.env.CHECK_WORK_PIPELINE;
});

// ── Step checker ────────────────────────────────────────────────────────────

describe('checkSteps — finds the first line that does not follow', () => {
  const broken = (steps, line) => {
    const r = checkSteps(steps);
    expect(r.status).toBe('broken');
    expect(r.badLine).toBe(line);
  };
  const valid = (steps) => expect(checkSteps(steps).status).toBe('valid');

  test('valid linear solution', () => valid(['3x + 5 = 20', '3x = 15', 'x = 5']));
  test('valid with a distribution and unicode minus', () => valid(['2(x − 3) = 10', '2x − 6 = 10', '2x = 16', 'x = 8']));
  test('clearing a denominator is a valid step', () => valid(['x/2 + 1 = 4', 'x + 2 = 8', 'x = 6']));
  test('factoring correctly is valid', () => valid(['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0']));
  test('squaring both sides is not flagged (extraneous roots are a teaching point)', () => valid(['sqrt(x) = 3', 'x = 9']));
  test('dividing by the variable is not flagged (a lost root is a teaching point)', () => valid(['x^2 = 3x', 'x = 3']));
  test('LaTeX fractions and |abs| parse', () => {
    valid(['\\frac{3}{4} + \\frac{1}{2} = \\frac{5}{4}']);
    valid(['|x - 3| = 5', 'x = 8']);
  });
  test('true negative arithmetic is valid, never a mistake', () => valid(['4 - 5 = -1']));

  test('a wrong subtraction is caught at the line it happens', () => broken(['2x + 4 = 18', '2x = 18 - 4', '2x = 12', 'x = 6'], '2x = 12'));
  test('side arithmetic that is false is the error, not the line after it', () => broken(['2x + 4 = 18', '18 - 4 = 12', '2x = 12', 'x = 6'], '18 - 4 = 12'));
  test('distributing only to the first term is caught', () => broken(['2(x - 3) = 10', '2x - 3 = 10'], '2x - 3 = 10'));
  test('a wrong factorization is caught', () => broken(['x^2 - 5x + 6 = 0', '(x + 2)(x - 3) = 0'], '(x + 2)(x - 3) = 0'));
  test('a wrong simplification is caught', () => broken(['3x + 2x - 4', '6x - 4'], '6x - 4'));

  test('anything it cannot parse is unknown, never broken', () => {
    expect(checkSteps(['subtract 4 from both sides', '2x = 14']).status).toBe('unknown');
    expect(checkSteps(['(x-2)(x-3)=0', 'x = 2 or x = 3']).status).toBe('unknown'); // an "or" line isn't checkable
    expect(checkSteps([]).status).toBe('unknown');
  });
});

// ── Combining signals ──────────────────────────────────────────────────────

describe('decide — an error needs two independent witnesses', () => {
  const P = { label: '3', problem: '2x + 4 = 18', steps: ['2x = 12', 'x = 6'], answer: 'x = 6', legibility: 'clear' };
  const noSolver = { result: null, solverAnswer: null };
  const mismatch = { result: 'mismatch', solverAnswer: '7' };
  const broken = { status: 'broken', badLine: '2x = 12' };
  const unknownSteps = { status: 'unknown' };
  const J = (verdict, extra) => ({ verdict, errorStep: verdict === 'has_error' ? '2x = 12' : null, correctedValue: verdict === 'has_error' ? '2x = 14' : null, whatIsRight: 'set it up', confidence: 0.9, ...extra });

  test('a solver match is enough to call it right, whatever the judges say', () => {
    const r = decide(P, { solver: { result: 'match', solverAnswer: '6' }, steps: unknownSteps, judges: [J('has_error'), J('has_error')], reading: 'confirmed' });
    expect(r.status).toBe('correct');
    expect(r.source).toBe('solver');
  });

  test('solver mismatch + a broken step → error at the step the CODE found, corrected value from the solver', () => {
    const r = decide(P, { solver: mismatch, steps: broken, judges: [null, null], reading: 'confirmed' });
    expect(r).toMatchObject({ status: 'has_error', errorStep: '2x = 12', correctedValue: '7', source: 'steps' });
  });

  test('both judges agreeing is two witnesses', () => {
    const r = decide(P, { solver: noSolver, steps: unknownSteps, judges: [J('has_error'), J('has_error')], reading: 'unknown' });
    expect(r.status).toBe('has_error');
  });

  test('ONE witness is never enough: a lone judge, a lone solver mismatch, a lone broken step', () => {
    expect(decide(P, { solver: noSolver, steps: unknownSteps, judges: [J('has_error'), J('correct')], reading: 'confirmed' }).status).toBe('uncertain');
    expect(decide(P, { solver: mismatch, steps: unknownSteps, judges: [J('uncertain'), null], reading: 'confirmed' }).status).toBe('uncertain');
    expect(decide(P, { solver: noSolver, steps: broken, judges: [J('correct'), J('uncertain')], reading: 'confirmed' }).status).toBe('uncertain');
  });

  test('an error on an UNCONFIRMED reading becomes "could not verify", with what was read', () => {
    const r = decide(P, { solver: mismatch, steps: broken, judges: [J('has_error'), J('has_error')], reading: 'unconfirmed' });
    expect(r.status).toBe('uncertain');
    expect(r.readAs).toBe('2x + 4 = 18');
    expect(r.evidence).toContain('reading:unconfirmed');
  });

  test('an unsure legibility also blocks an error', () => {
    const r = decide({ ...P, legibility: 'unsure' }, { solver: mismatch, steps: broken, judges: [null, null], reading: 'unknown' });
    expect(r.status).toBe('uncertain');
  });

  test('judges saying correct is overruled by a solver mismatch (→ uncertain, not correct)', () => {
    expect(decide(P, { solver: mismatch, steps: unknownSteps, judges: [J('correct'), J('correct')], reading: 'confirmed' }).status).toBe('uncertain');
  });

  test('all judges correct and nothing deterministic disagrees → correct', () => {
    expect(decide(P, { solver: noSolver, steps: unknownSteps, judges: [J('correct'), J('correct')], reading: 'confirmed' }).status).toBe('correct');
  });

  test('blank stays blank and carries no answer', () => {
    const r = decide({ ...P, legibility: 'blank', answer: null, steps: [] }, { solver: noSolver, steps: null, judges: [], reading: 'unknown' });
    expect(r).toMatchObject({ status: 'blank', studentAnswer: null, correctedValue: null });
  });
});

describe('solverCheck / stepCheck / confirmReading', () => {
  test('solver accepts "x = 5" against a bare 5, and equivalent forms', () => {
    expect(solverCheck({ problem: '3x + 5 = 20', answer: 'x = 5' }).result).toBe('match');
    expect(solverCheck({ problem: '3/4 + 1/2', answer: '1 1/4' }).result).toBe('match');
    expect(solverCheck({ problem: '15.5 - 6', answer: '9.5' }).result).toBe('match');
    expect(solverCheck({ problem: '3x + 5 = 20', answer: 'x = 6' })).toMatchObject({ result: 'mismatch', solverAnswer: '5' });
    expect(solverCheck({ problem: 'Explain why a triangle has 180 degrees', answer: 'because' }).result).toBeNull();
  });

  test('stepCheck starts from the printed equation when the student did not copy it', () => {
    const r = stepCheck({ problem: 'Solve: 2x + 4 = 18', steps: ['2x = 12'], answer: 'x = 6' });
    expect(r).toMatchObject({ status: 'broken', badLine: '2x = 12' });
  });

  test('confirmReading: Mathpix LaTeX confirms a plain answer; a missing answer is unconfirmed', () => {
    const mp = { text: '3. \\( x=\\frac{3}{4} \\)\n4. \\( y=-12 \\)' };
    expect(confirmReading({ answer: 'x = 3/4' }, mp)).toBe('confirmed');
    expect(confirmReading({ answer: 'y = −12' }, mp)).toBe('confirmed');
    expect(confirmReading({ answer: 'x = 7' }, mp)).toBe('unconfirmed');
    expect(confirmReading({ answer: 'x = 7' }, null)).toBe('unknown');
    expect(confirmReading({ answer: null }, mp)).toBe('unknown');
  });
});

// ── End to end ─────────────────────────────────────────────────────────────

const TRANSCRIPT = {
  problems: [
    { label: '1', problem: '3x + 5 = 20', steps: ['3x = 15', 'x = 5'], answer: 'x = 5', legibility: 'clear' },
    { label: '2', problem: '2x + 4 = 18', steps: ['2x = 12', 'x = 6'], answer: 'x = 6', legibility: 'clear' },
    { label: '3', problem: 'Explain what a slope means', steps: ['rise over run'], answer: 'rise over run', legibility: 'clear' },
    { label: '4', problem: '5x - 1 = 9', steps: [], answer: null, legibility: 'blank' },
  ],
};
const judgeSays = (p3) => ({
  problems: [
    { label: '1', verdict: 'correct', errorStep: null, correctedValue: null, whatIsRight: 'clean', confidence: 0.95 },
    { label: '2', verdict: 'has_error', errorStep: '2x = 12', correctedValue: '2x = 14', whatIsRight: 'setup', confidence: 0.9 },
    { label: '3', verdict: p3, errorStep: p3 === 'has_error' ? 'rise over run' : null, correctedValue: p3 === 'has_error' ? 'x' : null, whatIsRight: 'idea', confidence: 0.9 },
  ],
});

function wire({ judge1 = judgeSays('correct'), judge2 = judgeSays('correct'), read = TRANSCRIPT } = {}) {
  callLLMStructured.mockImplementation(async (model, messages, format) => {
    const name = format.json_schema.name;
    if (name === 'check_work_transcription') {
      if (read instanceof Error) throw read;
      return read;
    }
    if (name === 'check_work_judgement') {
      const out = model.startsWith('claude') ? judge2 : judge1;
      if (out instanceof Error) throw out;
      return out;
    }
    throw new Error('unexpected call ' + name);
  });
}

describe('gradeSheet — read, then code, then two blind judges', () => {
  const mathpix = { ocrDetailed: async () => ({ text: '1) x=5  2) x=6  3) rise over run', confidence: 0.9 }) };

  test('grades every problem with the right source', async () => {
    wire();
    const out = await gradeSheet({ images: IMG, studentText: 'check my work' }, mathpix);
    const by = Object.fromEntries(out.map(p => [p.label, p]));
    expect(by['1']).toMatchObject({ status: 'correct', source: 'solver' });
    // #2: solver says 7, code finds 2x = 12 broken → error at the code's line.
    expect(by['2']).toMatchObject({ status: 'has_error', errorStep: '2x = 12', correctedValue: '7', source: 'steps' });
    // #3: no solver, judges agree it's correct.
    expect(by['3']).toMatchObject({ status: 'correct', source: 'judges' });
    expect(by['4'].status).toBe('blank');
  });

  test('the READ call grades nothing, and the judges see text only, blind to each other', async () => {
    wire();
    await gradeSheet({ images: IMG }, mathpix);
    const calls = callLLMStructured.mock.calls;
    const read = calls.find(c => c[2].json_schema.name === 'check_work_transcription');
    expect(read[1][0].content).toMatch(/do NOT grade/);
    const judges = calls.filter(c => c[2].json_schema.name === 'check_work_judgement');
    expect(judges.map(c => c[0]).sort()).toEqual(['claude-haiku-4-5', 'gpt-4o']);
    for (const j of judges) {
      expect(typeof j[1][1].content).toBe('string'); // no image blocks
      expect(j[1][1].content).toMatch(/line 1: 2x = 12/);
      expect(j[1][1].content).not.toMatch(/Problem 4/); // blanks aren't sent
    }
  });

  test('judges split on #3 (no solver, no steps) → uncertain, never an error', async () => {
    wire({ judge1: judgeSays('has_error'), judge2: judgeSays('correct') });
    const out = await gradeSheet({ images: IMG }, mathpix);
    expect(out.find(p => p.label === '3').status).toBe('uncertain');
  });

  test('judge labels match however they are written ("#2", "2.", "Problem 2")', async () => {
    const relabel = (out, f) => ({ problems: out.problems.map(p => ({ ...p, label: f(p.label) })) });
    wire({ judge1: relabel(judgeSays('has_error'), l => '#' + l), judge2: relabel(judgeSays('has_error'), l => 'Problem ' + l + '.') });
    const out = await gradeSheet({ images: IMG }, mathpix);
    // Both judges flag #3 and no code can check it — two witnesses only if the labels matched.
    expect(out.find(p => p.label === '3').status).toBe('has_error');
  });

  test('a judge that fails just removes a witness', async () => {
    wire({ judge2: new Error('anthropic 400') });
    const out = await gradeSheet({ images: IMG }, mathpix);
    expect(out.find(p => p.label === '2').status).toBe('has_error'); // solver + steps still two witnesses
    expect(out.find(p => p.label === '3').status).toBe('correct');   // the one judge left says correct
  });

  test('Mathpix not finding the answer turns an error into "could not verify"', async () => {
    wire();
    const out = await gradeSheet({ images: IMG }, { ocrDetailed: async () => ({ text: '1) x=5  2) x=8', confidence: 0.4 }) });
    const p2 = out.find(p => p.label === '2');
    expect(p2.status).toBe('uncertain');
    expect(p2.readAs).toBe('2x + 4 = 18');
  });

  test('a failed READ returns null (caller falls back)', async () => {
    wire({ read: new Error('vision timeout') });
    expect(await gradeSheet({ images: IMG }, mathpix)).toBeNull();
  });
});

describe('verifyStudentWork — pipeline selection and fallback', () => {
  const noMathpix = { ocrDetailed: null };

  test('uses read-then-grade by default', async () => {
    wire();
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'check' }, noMathpix);
    expect(v.pipeline).toBe('read-then-grade');
    expect(v.verdict).toBe('has_error');
    expect(v.problems).toHaveLength(4);
  });

  test('falls back to the single-pass grader when the read fails', async () => {
    callLLMStructured.mockImplementation(async (model, messages, format) => {
      if (format.json_schema.name === 'check_work_transcription') throw new Error('vision timeout');
      return { problems: [{ label: '1', status: 'correct', studentAnswer: 'x=5', whatIsRight: 'ok', errorStep: null, correctedValue: null, confidence: 0.9 }] };
    });
    const v = await verifyStudentWork({ imageContents: IMG, studentText: 'check' }, noMathpix);
    expect(v.pipeline).toBe('single-pass');
    expect(v.verdict).toBe('correct');
  });

  test('CHECK_WORK_PIPELINE=legacy skips the pipeline entirely', async () => {
    process.env.CHECK_WORK_PIPELINE = 'legacy';
    callLLMStructured.mockResolvedValue({ problems: [{ label: '1', status: 'correct', studentAnswer: 'x=5', whatIsRight: 'ok', errorStep: null, correctedValue: null, confidence: 0.9 }] });
    const v = await verifyStudentWork({ imageContents: IMG }, noMathpix);
    expect(v.pipeline).toBe('single-pass');
    expect(callLLMStructured.mock.calls.every(c => c[2].json_schema.name === 'check_work_sheet')).toBe(true);
  });
});
