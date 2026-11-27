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

  test('a judge\'s "correct" is withdrawn when the reply assigns different values than the key', async () => {
    mockCall.mockResolvedValue(reply({ verdict: 'correct', matched: 'board', confidence: 0.95 }));
    const parallel = { kind: 'parallel', question: 'What do -6 and 1 add to?', answer: '-5', finalAnswer: 'x = 7 or x = -2' };
    const flipped = await oq.gradeOpenQuestion(parallel, 'oh so mine is (x+7)(x-2)=0, x = -7 or x = 2', {});
    expect(flipped.isCorrect).toBeNull();
    const right = await oq.gradeOpenQuestion(parallel, 'oh so mine is (x-7)(x+2)=0, x = -2 or x = 7', {});
    expect(right.isCorrect).toBe(true);
    expect(oq.contradictsKey('x = 7', 'x = 7 or x = -2')).toBe(false);   // partial is not a contradiction
    expect(oq.contradictsKey('x = 1/2', 'x = 0.5')).toBe(false);
    expect(oq.contradictsKey('y = 3', 'x = 7')).toBe(false);             // different unknowns: not comparable
    expect(oq.contradictsKey('so 16', '16')).toBe(false);
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

// Against the REAL Conversation model and a real (in-memory) database. The
// first version of stampLatestTurn was tested with a hand-made model whose
// messages had `_id`s; real messages have none, the function returned early on
// every turn, and production stamped nothing (found 2026-11-26 by reading a
// live conversation back). A fake model cannot catch that; this can.
describe('stampLatestTurn, against the real model', () => {
  const mongoose = require('mongoose');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  let mem;
  let Conversation;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    Conversation = require('../../models/conversation');
  }, 60000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mem.stop();
  });

  // A conversation as persist leaves it: the tutor's reply pushed, then saved.
  const saved = async (messages) => {
    const c = new Conversation({ userId: new mongoose.Types.ObjectId(), messages: [] });
    for (const m of messages) c.messages.push(m);
    c.boardProblem = { tex: '3x - 7 = 11', posedAt: new Date() };
    await c.save();
    return c;
  };
  const stored = async (c) => (await mongoose.connection.db.collection('conversations').findOne({ _id: c._id })).messages;
  const FINAL = { kind: 'final', question: 'Solve 3x - 7 = 11.', answer: 'x = 6', finalAnswer: 'x = 6' };

  test('the record lands on the tutor turn that was just saved, and loads back', async () => {
    mockCall.mockResolvedValue(reply(FINAL));
    const onStamp = jest.fn();
    const c = await saved([{ role: 'user', content: 'solve 3x - 7 = 11' }, { role: 'assistant', content: 'What do you get for \\(x\\)?' }]);
    const record = await oq.stampLatestTurn(c, { onStamp });
    expect(record).toMatchObject({ kind: 'final', answer: 'x = 6' });
    expect(onStamp).toHaveBeenCalledWith('final');

    const messages = await stored(c);
    expect(messages[1].openQuestion).toMatchObject({ kind: 'final', question: 'Solve 3x - 7 = 11.', answer: 'x = 6', finalAnswer: 'x = 6' });
    expect(messages[0].openQuestion).toBeUndefined();
    // …and the next turn, which loads the conversation fresh, finds it.
    const next = await Conversation.findById(c._id);
    expect(oq.latestOpenQuestion(next.messages)).toMatchObject({ kind: 'final', answer: 'x = 6' });
    expect(oq.isGradeable(oq.latestOpenQuestion(next.messages))).toBe(true);
  });

  test('a later save of the same in-memory document does not erase it', async () => {
    mockCall.mockResolvedValue(reply(FINAL));
    const c = await saved([{ role: 'user', content: 'solve 3x - 7 = 11' }, { role: 'assistant', content: 'What do you get?' }]);
    await oq.stampLatestTurn(c);
    c.activeMinutes = 3;
    await c.save();
    expect((await stored(c))[1].openQuestion).toMatchObject({ answer: 'x = 6' });
  });

  test('if the turn is no longer where it was, nothing is written', async () => {
    mockCall.mockResolvedValue(reply(FINAL));
    const onStamp = jest.fn();
    const c = await saved([{ role: 'user', content: 'solve 3x - 7 = 11' }, { role: 'assistant', content: 'What do you get?' }]);
    await mongoose.connection.db.collection('conversations').updateOne({ _id: c._id }, { $set: { 'messages.1.content': 'A summary replaced this turn.' } });
    expect(await oq.stampLatestTurn(c, { onStamp })).toBeNull();
    expect(onStamp).toHaveBeenCalledWith('unwritten');
    expect((await stored(c))[1].openQuestion).toBeUndefined();
  });

  test('a student turn last, or an unreadable reply: no write', async () => {
    const onStamp = jest.fn();
    const c = await saved([{ role: 'assistant', content: 'What do you get?' }, { role: 'user', content: '6' }]);
    expect(await oq.stampLatestTurn(c, { onStamp })).toBeNull();
    expect(mockCall).not.toHaveBeenCalled();

    mockCall.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    const d = await saved([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'What do you get?' }]);
    expect(await oq.stampLatestTurn(d, { onStamp })).toBeNull();
    expect(onStamp).toHaveBeenCalledWith(null);
    expect((await stored(d))[1].openQuestion).toBeUndefined();
  });

  test('a plain object is left alone, and a failed write is swallowed', async () => {
    expect(await oq.stampLatestTurn({ _id: 'c1', messages: [{ role: 'assistant', content: 'What is 2 + 2?' }] })).toBeNull();
    mockCall.mockResolvedValue(reply(FINAL));
    function Model() {}
    Model.updateOne = jest.fn().mockRejectedValue(new Error('db down'));
    const c = Object.assign(new Model(), { _id: 'c1', messages: [{ role: 'assistant', content: 'What is 2 + 2?' }] });
    await expect(oq.stampLatestTurn(c)).resolves.toBeNull();
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
