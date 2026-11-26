/**
 * The open-question record (utils/pipeline/openQuestion.js): what the tutor
 * asked, read once when it was asked, and the one function that grades a reply
 * against it. Model calls are stubbed — these pin the contract around them:
 * what is kept from the reader, when a rejection is allowed, and that the
 * shadow never touches the verdict a student gets.
 */

const mockCall = jest.fn();
jest.mock('../../utils/llmGateway', () => ({
  callLLM: (...args) => mockCall(...args),
  callLLMStructured: jest.fn(),
}));

const oq = require('../../utils/pipeline/openQuestion');
const verifyMetrics = require('../../utils/verifyMetrics');
const { observeAndDiagnose } = require('../../utils/pipeline/index');

const reply = (obj) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const sent = (n = 0) => mockCall.mock.calls[n][1].map((m) => m.content).join('\n');

beforeEach(() => {
  mockCall.mockReset();
  verifyMetrics.reset();
  delete process.env.OPEN_QUESTION;
});

describe('declareOpenQuestion', () => {
  test('keeps the reader\'s record, and sends the board problem and history with the turn', async () => {
    mockCall.mockResolvedValue(reply({ kind: 'substep', question: 'Rewrite 3/4 and 2/3 over 12. What are the numerators?', answer: '9 and 8', finalAnswer: '17/12' }));
    const record = await oq.declareOpenQuestion({
      reply: 'Now rewrite each fraction with denominator \\(12\\). What numerator does each one get?',
      boardProblem: 'can you help me with 3/4 + 2/3',
      history: [{ role: 'user', content: 'can you help me with 3/4 + 2/3' }, { role: 'assistant', content: 'What is the LCD?' }, { role: 'user', content: '12' }],
    });
    expect(record).toMatchObject({ kind: 'substep', answer: '9 and 8', finalAnswer: '17/12' });
    expect(sent()).toMatch(/The problem on the board:\ncan you help me with 3\/4 \+ 2\/3/);
    expect(sent()).toMatch(/Student: 12/);
  });

  test('a method, conceptual or empty ask carries no key of its own', async () => {
    mockCall.mockResolvedValue(reply({ kind: 'method', question: 'What gets the x-terms together?', answer: 'subtract 2x', finalAnswer: '17' }));
    const record = await oq.declareOpenQuestion({ reply: 'Can you tell me the move that gets the x-terms together?' });
    expect(record.answer).toBeNull();
    expect(record.finalAnswer).toBe('17');
  });

  test('the student\'s first name never leaves in the prompt', async () => {
    mockCall.mockResolvedValue(reply({ kind: 'none', question: null, answer: null, finalAnswer: null }));
    await oq.declareOpenQuestion({ reply: 'Good to see you, Jason. Ready?', history: [{ role: 'user', content: 'jason here' }], firstName: 'Jason' });
    expect(sent()).not.toMatch(/jason/i);
    expect(sent()).toMatch(/\[Student\]/);
  });

  test.each([
    ['an unknown kind', reply({ kind: 'quiz', answer: '4' })],
    ['unparseable output', { choices: [{ message: { content: 'I think the tutor asked…' } }] }],
  ])('%s yields no record', async (_label, out) => {
    mockCall.mockResolvedValue(out);
    expect(await oq.declareOpenQuestion({ reply: 'What is 2 + 2?' })).toBeNull();
  });

  test('a failed call yields no record and never throws', async () => {
    mockCall.mockRejectedValue(new Error('boom'));
    await expect(oq.declareOpenQuestion({ reply: 'What is 2 + 2?' })).resolves.toBeNull();
  });

  test('OPEN_QUESTION=off makes no call', async () => {
    process.env.OPEN_QUESTION = 'off';
    expect(await oq.declareOpenQuestion({ reply: 'What is 2 + 2?' })).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('gradeOpenQuestion', () => {
  const substep = { kind: 'substep', question: 'What is 1/3 of 24?', answer: '8', finalAnswer: '16' };

  test('an exact match on the key affirms with no model call', async () => {
    const v = await oq.gradeOpenQuestion(substep, '8', { candidate: '8' });
    expect(v).toMatchObject({ isCorrect: true, matched: 'answer', via: 'exact' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  test('so does the whole problem\'s answer: jumping ahead is finishing', async () => {
    const v = await oq.gradeOpenQuestion(substep, '16', { candidate: '16' });
    expect(v).toMatchObject({ isCorrect: true, matched: 'board', via: 'exact' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  test('a mismatch is never rejected from the extracted fragment: the judge reads the whole reply', async () => {
    mockCall.mockResolvedValue(reply({ verdict: 'correct', matched: 'answer', confidence: 0.95 }));
    const multiplier = { kind: 'substep', question: 'What do you multiply the numerator 3 by?', answer: '3', finalAnswer: '17/12' };
    const v = await oq.gradeOpenQuestion(multiplier, 'you multiply by 3 so its 9. thats what i said', { candidate: '9' });
    expect(v).toMatchObject({ isCorrect: true, via: 'judge' });
    expect(sent()).toMatch(/you multiply by 3 so its 9/);
  });

  test('a rejection needs more confidence than an affirmation', async () => {
    mockCall.mockResolvedValue(reply({ verdict: 'incorrect', matched: 'none', confidence: 0.7 }));
    expect((await oq.gradeOpenQuestion(substep, '12', { candidate: '12' })).isCorrect).toBeNull();
    mockCall.mockResolvedValue(reply({ verdict: 'incorrect', matched: 'none', confidence: 0.92 }));
    expect((await oq.gradeOpenQuestion(substep, '12', { candidate: '12' })).isCorrect).toBe(false);
  });

  test('with only the whole problem\'s answer on record, nothing can be rejected', async () => {
    mockCall.mockResolvedValue(reply({ verdict: 'incorrect', matched: 'none', confidence: 0.99 }));
    const method = { kind: 'method', question: 'Name the two factors.', answer: null, finalAnswer: '2x sin(x) + x^2 cos(x)' };
    expect(oq.isGradeable(method)).toBe(true);
    expect((await oq.gradeOpenQuestion(method, 'x^2 and cos x', {})).isCorrect).toBeNull();
  });

  test('nothing on record, nothing graded', async () => {
    expect(oq.isGradeable({ kind: 'none', answer: null, finalAnswer: null })).toBe(false);
    expect((await oq.gradeOpenQuestion({ kind: 'conceptual', answer: null, finalAnswer: null }, 'because it cancels')).isCorrect).toBeNull();
    expect((await oq.gradeOpenQuestion(null, '8')).isCorrect).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
  });

  test('"unclear", a failed call and junk output are all no verdict', async () => {
    mockCall.mockResolvedValue(reply({ verdict: 'unclear', confidence: 0.9 }));
    expect((await oq.gradeOpenQuestion(substep, 'wait what', {})).isCorrect).toBeNull();
    mockCall.mockRejectedValue(new Error('boom'));
    expect((await oq.gradeOpenQuestion(substep, '12', { candidate: '12' })).isCorrect).toBeNull();
    mockCall.mockResolvedValue({ choices: [{ message: { content: 'hmm' } }] });
    expect((await oq.gradeOpenQuestion(substep, '12', { candidate: '12' })).isCorrect).toBeNull();
  });
});

describe('stampLatestTurn', () => {
  const conversationWith = (messages, updateOne) => {
    function Model() {}
    Model.updateOne = updateOne;
    const c = new Model();
    Object.assign(c, { _id: 'c1', messages, boardProblem: { tex: '3x - 7 = 11' } });
    return c;
  };

  test('writes the record onto the turn that was just saved, by id', async () => {
    mockCall.mockResolvedValue(reply({ kind: 'final', question: 'Solve 3x - 7 = 11.', answer: 'x = 6', finalAnswer: 'x = 6' }));
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    const onStamp = jest.fn();
    const conversation = conversationWith([
      { _id: 'm1', role: 'user', content: 'solve 3x - 7 = 11' },
      { _id: 'm2', role: 'assistant', content: 'What do you get for \\(x\\)?' },
    ], updateOne);
    const record = await oq.stampLatestTurn(conversation, { onStamp });
    expect(record.answer).toBe('x = 6');
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'c1', 'messages._id': 'm2' },
      { $set: { 'messages.$.openQuestion': expect.objectContaining({ kind: 'final', answer: 'x = 6' }) } },
    );
    expect(onStamp).toHaveBeenCalledWith('final');
  });

  test('a plain object, an unsaved turn, or a student turn last: nothing is read or written', async () => {
    const updateOne = jest.fn();
    expect(await oq.stampLatestTurn({ _id: 'c1', messages: [{ _id: 'm', role: 'assistant', content: 'What is 2 + 2?' }] })).toBeNull();
    expect(await oq.stampLatestTurn(conversationWith([{ role: 'assistant', content: 'What is 2 + 2?' }], updateOne))).toBeNull();
    expect(await oq.stampLatestTurn(conversationWith([{ _id: 'm', role: 'user', content: '4' }], updateOne))).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  test('a failed write is swallowed', async () => {
    mockCall.mockResolvedValue(reply({ kind: 'final', question: 'q', answer: '4', finalAnswer: '4' }));
    const conversation = conversationWith([{ _id: 'm', role: 'assistant', content: 'What is 2 + 2?' }], jest.fn().mockRejectedValue(new Error('db down')));
    await expect(oq.stampLatestTurn(conversation)).resolves.toBeNull();
  });
});

describe('in the pipeline it is a shadow: measured, never the verdict', () => {
  const turn = (openQuestion) => ({
    conversation: {
      messages: [
        { role: 'user', content: 'can I get a practice problem' },
        { role: 'assistant', content: 'Try this one: Solve \\(3x - 7 = 11\\).', problemInfo: { type: 'general_linear', correctAnswer: '6' }, openQuestion },
      ],
      boardProblem: { tex: '3x - 7 = 11' },
      lastBoardAction: 'pose',
      lastProblemState: null,
    },
    user: { _id: 'u', firstName: 'Eval' },
    activeSkill: null,
  });

  test('a record that disagrees with the solver changes nothing the student gets', async () => {
    // A wrong key on the record: it affirms "x = 4", which the solver rejects.
    const run = await observeAndDiagnose('x = 4', turn({ kind: 'final', question: 'Solve 3x - 7 = 11.', answer: 'x = 4', finalAnswer: 'x = 4' }));
    expect(run.diagnosis.isCorrect).toBe(false);
    expect(run.diagnosis.verificationSource).toBe('solver');
    const shadow = await run.openQuestionShadowPromise;
    expect(shadow.isCorrect).toBe(true);
    const summary = verifyMetrics.openQuestionSummary();
    expect(summary.graded).toBe(1);
    expect(summary.liveRejectsShadowAffirms).toBe(1);
    expect(summary.agreementRate).toBe(0);
  });

  test('agreement is counted as agreement', async () => {
    const run = await observeAndDiagnose('x = 6', turn({ kind: 'final', question: 'Solve 3x - 7 = 11.', answer: 'x = 6', finalAnswer: 'x = 6' }));
    expect(run.diagnosis.isCorrect).toBe(true);
    await run.openQuestionShadowPromise;
    expect(verifyMetrics.openQuestionSummary()).toMatchObject({ graded: 1, agreementRate: 1 });
  });

  test('no record on the turn, or the switch off: no shadow at all', async () => {
    expect((await observeAndDiagnose('x = 6', turn(undefined))).openQuestionShadowPromise).toBeNull();
    process.env.OPEN_QUESTION = 'off';
    expect((await observeAndDiagnose('x = 6', turn({ kind: 'final', answer: 'x = 6', finalAnswer: 'x = 6' }))).openQuestionShadowPromise).toBeNull();
    expect(verifyMetrics.openQuestionSummary().graded).toBe(0);
  });
});

describe('the comparison the promotion decision waits on', () => {
  test('nothing graded yet reads as zeros, not NaN', () => {
    expect(verifyMetrics.openQuestionSummary()).toMatchObject({ stamped: 0, graded: 0, agreementRate: 0, boardMatches: 0 });
  });

  test('stamps are counted by kind, and an unreadable turn is counted too', () => {
    verifyMetrics.recordOpenQuestionStamp('substep');
    verifyMetrics.recordOpenQuestionStamp('substep');
    verifyMetrics.recordOpenQuestionStamp(null);
    expect(verifyMetrics.openQuestionSummary()).toMatchObject({ stamped: 3, byKind: { substep: 2, unreadable: 1 } });
  });

  test('each pair of verdicts lands in its own cell', () => {
    const rec = verifyMetrics.recordOpenQuestionShadow;
    rec({ live: 'correct', shadow: 'correct', kind: 'final', via: 'exact', matched: 'answer' });
    rec({ live: 'incorrect', shadow: 'correct', kind: 'substep', via: 'exact', matched: 'board' });
    rec({ live: 'correct', shadow: 'incorrect', kind: 'substep', via: 'judge' });
    rec({ live: 'none', shadow: 'correct', kind: 'parallel', via: 'judge', matched: 'answer' });
    rec({ live: 'incorrect', shadow: 'none' });
    rec({ live: 'none', shadow: 'none', kind: 'method' });
    const summary = verifyMetrics.aggregate().openQuestion;
    expect(summary).toMatchObject({
      graded: 6,
      agreementRate: Number((2 / 6).toFixed(4)),
      liveRejectsShadowAffirms: 1,
      shadowRejectsLiveAffirms: 1,
      shadowDecidesLiveSilent: 1,
      liveDecidesShadowSilent: 1,
      boardMatches: 1,
      byVia: { exact: 2, judge: 2 },
    });
  });
});
