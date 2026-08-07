/**
 * Transcript miner — ctx derivation from the pipeline's own stamps, mining,
 * sampling, and stub generation. Pure-function tier only (no DB, no LLM):
 * pins the seams that would silently empty or flood the nightly report.
 */

'use strict';

const {
  DETERMINISTIC_JUDGES,
  deriveTurns,
  mineMessages,
  judgeEligible,
  buildScenarioStub,
  selectLlmSample,
  llmVerdictViolated,
} = require('../../utils/transcriptMiner');

// Message factory matching models/conversation.js messageSchema shapes.
const user = (content, extra = {}) => ({ role: 'user', content, ...extra });
const assistant = (content, extra = {}) => ({ role: 'assistant', content, ...extra });

describe('deriveTurns — ctx from pipeline stamps', () => {
  test('problemResult stamp on the reply drives studentWasCorrect', () => {
    const turns = deriveTurns([
      assistant('How would you add 1/4 + 1/6?'),
      user('10/24'),
      assistant('Not quite — let\'s re-add those numbers.', { problemResult: 'correct' }),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[1].ctx.studentWasCorrect).toBe(true);
    expect(turns[1].studentMessage).toBe('10/24');
  });

  test('problemInfo opens a focus; a correct stamp closes it AFTER that turn', () => {
    const turns = deriveTurns([
      assistant('Try this: what is 12 × 12?', { problemInfo: { type: 'arithmetic', correctAnswer: '144' } }),
      user('144'),
      assistant('Exactly! 144 it is.', { problemResult: 'correct' }),
      user('what next?'),
      assistant('What would you like to work on?'),
    ]);
    // Posing turn: no focus yet (state opens after the posing reply itself).
    expect(turns[0].ctx.hasFocus).toBe(false);
    // Resolving turn: still judged WITH the focus (rejection-of-correct lives here).
    expect(turns[1].ctx.hasFocus).toBe(true);
    expect(turns[1].ctx.answer).toBe('144');
    expect(turns[1].ctx.mustNotReveal).toBe(false); // solved this turn — reveal is fine
    // After resolution the focus is gone, so "what would you like to work on" is legit.
    expect(turns[2].ctx.hasFocus).toBe(false);
  });

  test('mustNotReveal is armed while the problem is live and unsolved', () => {
    const turns = deriveTurns([
      assistant('Solve for x: 2x + 4 = 90. What is x?', { problemInfo: { type: 'linear_equation', correctAnswer: '43' } }),
      user('idk'),
      assistant('Hint: subtract 4 from both sides. So x = 43.'),
    ]);
    expect(turns[1].ctx.mustNotReveal).toBe(true);
    expect(turns[1].ctx.answer).toBe('43');
  });

  test('single-character answers never arm the reveal judges (noise guard)', () => {
    const turns = deriveTurns([
      assistant('What is 2 + 3?', { problemInfo: { type: 'arithmetic', correctAnswer: '5' } }),
      user('help'),
      assistant('Think of 5 fingers on a hand — try step 5 of the worksheet.'),
    ]);
    expect(turns[1].ctx.answer).toBeNull();
    expect(turns[1].ctx.mustNotReveal).toBe(false);
    // But the focus itself still counts for lostContext.
    expect(turns[1].ctx.hasFocus).toBe(true);
  });
});

describe('mineMessages — deterministic judging', () => {
  test('flags a rejected correct answer using only the stamp', () => {
    const { hits } = mineMessages([
      assistant('How would you add 1/4 + 1/6?', { problemInfo: { type: 'fraction_addition', correctAnswer: '5/12' } }),
      user('oh wait. 10/24, right?'),
      assistant('Not quite — let\'s see where things went wrong.', { problemResult: 'correct' }),
    ]);
    const judges = hits.map(h => h.judge);
    expect(judges).toContain('rejectedCorrectAnswer');
  });

  test('flags a revealed answer on a live, unsolved problem — and not after solve', () => {
    const { hits } = mineMessages([
      assistant('Solve for x: 2x + 4 = 90.', { problemInfo: { type: 'linear_equation', correctAnswer: '43' } }),
      user('i give up'),
      assistant('No worries — the answer is x = 43.'),
    ]);
    expect(hits.map(h => h.judge)).toContain('revealedAnswer');

    const clean = mineMessages([
      assistant('Solve for x: 2x + 4 = 90.', { problemInfo: { type: 'linear_equation', correctAnswer: '43' } }),
      user('x = 43'),
      assistant('Yes! x = 43, nailed it.', { problemResult: 'correct' }),
    ]);
    expect(clean.hits.map(h => h.judge)).not.toContain('revealedAnswer');
  });

  test('flags lostContext only while a focus is active', () => {
    const withFocus = mineMessages([
      assistant('Here is the graph of y=x^3.', { problemInfo: { type: 'graph', correctAnswer: 'increasing' } }),
      user('it increases'),
      assistant('Interesting! What would you like to work on?'),
    ]);
    expect(withFocus.hits.map(h => h.judge)).toContain('lostContext');

    const noFocus = mineMessages([
      user('hi'),
      assistant('Hey! What would you like to work on?'),
    ]);
    expect(noFocus.hits.map(h => h.judge)).not.toContain('lostContext');
  });

  test('clean affirmation of a correct answer produces zero hits', () => {
    const { hits, turns } = mineMessages([
      assistant('What is 12 × 12?', { problemInfo: { type: 'arithmetic', correctAnswer: '144' } }),
      user('144'),
      assistant('Exactly! 144 it is. Want to try a squared-number pattern next?', { problemResult: 'correct' }),
    ]);
    expect(turns.length).toBeGreaterThan(0);
    expect(hits).toHaveLength(0);
  });

  test('since-filter drops turns stamped before the window, keeps stampless ones', () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const recent = new Date('2026-08-07T00:00:00Z');
    const { turns } = mineMessages([
      assistant('old turn', { timestamp: old }),
      user('hey'),
      assistant('recent turn', { timestamp: recent }),
      user('yo'),
      assistant('stampless turn'),
    ], { since: new Date('2026-08-01T00:00:00Z') });
    const replies = turns.map(t => t.reply);
    expect(replies).not.toContain('old turn');
    expect(replies).toContain('recent turn');
    expect(replies).toContain('stampless turn');
  });
});

describe('judgeEligible — per-judge denominators', () => {
  const turn = (ctx) => ({ ctx });
  test('gates match each judge\'s arming condition', () => {
    expect(judgeEligible('rejectedCorrectAnswer', turn({ studentWasCorrect: true }))).toBe(true);
    expect(judgeEligible('rejectedCorrectAnswer', turn({ studentWasCorrect: false }))).toBe(false);
    expect(judgeEligible('lostContext', turn({ hasFocus: true }))).toBe(true);
    expect(judgeEligible('lostContext', turn({ hasFocus: false }))).toBe(false);
    expect(judgeEligible('revealedAnswer', turn({ mustNotReveal: true }))).toBe(true);
    expect(judgeEligible('solvedInsteadOfEliciting', turn({ shouldElicit: false }))).toBe(false);
    // Always-armed judges
    expect(judgeEligible('usedImpreciseTerm', turn({}))).toBe(true);
    expect(judgeEligible('badOrderOfOperations', turn({}))).toBe(true);
  });

  test('covers every registered judge', () => {
    for (const j of DETERMINISTIC_JUDGES) {
      expect(typeof judgeEligible(j, turn({}))).toBe('boolean');
    }
  });
});

describe('buildScenarioStub — scenarios.json-shaped, anonymized', () => {
  test('stub carries the student turn, ctx, judge, and anonymized texts', () => {
    const { hits } = mineMessages([
      assistant('How would you add 1/4 + 1/6, Jordan?', { problemInfo: { type: 'fraction_addition', correctAnswer: '5/12' } }),
      user('Jordan here — 10/24?'),
      assistant('Not quite, Jordan.', { problemResult: 'correct' }),
    ]);
    const hit = hits.find(h => h.judge === 'rejectedCorrectAnswer');
    const anonymize = (s) => String(s).replace(/Jordan/g, '[Student]');
    const stub = buildScenarioStub(
      { ...hit, conversationId: 'abc123', turn: hit.turn },
      anonymize
    );
    expect(stub.turns.length).toBeGreaterThanOrEqual(2); // posed assistant + student
    const studentTurn = stub.turns[stub.turns.length - 1];
    expect(studentTurn.judge).toEqual(['rejectedCorrectAnswer']);
    expect(studentTurn.ctx.studentWasCorrect).toBe(true);
    expect(stub.answer).toBe('5/12');
    // No student name anywhere in the stub.
    expect(JSON.stringify(stub)).not.toMatch(/Jordan/);
    expect(stub._minedFrom).toEqual({ conversationId: 'abc123', turnIndex: hit.turnIndex });
  });
});

describe('selectLlmSample — budget cap and routing', () => {
  const convo = { _id: 'c1', userId: 'u1' };
  const mkTurn = (over = {}) => ({
    index: 0,
    reply: 'reply',
    studentMessage: 'msg',
    stamp: null,
    observation: { messageType: 'general_math', isBareProblemDrop: false },
    activeProblem: null,
    ctx: { mustNotReveal: false },
    ...over,
  });

  test('routes frustration→tone, live problem→leak, incorrect→scaffold', () => {
    const sample = selectLlmSample([
      { convo, turn: mkTurn({ observation: { messageType: 'frustration' } }), flaggedBy: [] },
      { convo, turn: mkTurn({ ctx: { mustNotReveal: true, answer: '43' }, activeProblem: { problemText: 'p' } }), flaggedBy: [] },
      { convo, turn: mkTurn({ stamp: 'incorrect' }), flaggedBy: [] },
      { convo, turn: mkTurn(), flaggedBy: [] }, // eligible for nothing
    ], 10);
    expect(sample.map(s => s.llmJudge).sort()).toEqual(['answerLeak', 'scaffoldVsTell', 'toneSupport']);
  });

  test('flagged turns win the budget over random fill, and the cap is hard', () => {
    const items = [];
    for (let i = 0; i < 20; i++) {
      items.push({
        convo,
        turn: mkTurn({ index: i, stamp: 'incorrect' }),
        flaggedBy: i < 5 ? ['rejectedCorrectAnswer'] : [],
      });
    }
    const sample = selectLlmSample(items, 8, () => 0.5);
    expect(sample).toHaveLength(8);
    expect(sample.filter(s => s.sampledBecause === 'flagged')).toHaveLength(5);
    expect(sample.filter(s => s.sampledBecause === 'random')).toHaveLength(3);
    expect(selectLlmSample(items, 0)).toHaveLength(0);
  });
});

describe('llmVerdictViolated — verdict → candidate mapping', () => {
  test('uncertain never counts as a violation (net, not ground truth)', () => {
    expect(llmVerdictViolated('answerLeak', { leaked: true, uncertain: true })).toBe(false);
    expect(llmVerdictViolated('answerLeak', { leaked: true, uncertain: false })).toBe(true);
    expect(llmVerdictViolated('toneSupport', { acknowledgesFeeling: true, pushesNewProblem: false, uncertain: false })).toBe(false);
    expect(llmVerdictViolated('toneSupport', { acknowledgesFeeling: false, pushesNewProblem: false, uncertain: false })).toBe(true);
    expect(llmVerdictViolated('scaffoldVsTell', { classification: 'tell', uncertain: false })).toBe(true);
    expect(llmVerdictViolated('scaffoldVsTell', { classification: 'scaffold', uncertain: false })).toBe(false);
  });
});

describe('judges shim — tests/eval keeps working from the new home', () => {
  test('tests/eval/judges.js re-exports utils/replyJudges.js', () => {
    expect(require('../eval/judges')).toBe(require('../../utils/replyJudges'));
    expect(require('../eval/llmJudges')).toBe(require('../../utils/replyLlmJudges'));
  });
});
