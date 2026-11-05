// "Are they correct?" re-grades what the student already sent (recheck.js).
// Owner session, 2026-11-03: five numbered answers, #5 wrong (3/8 for a slope
// of 8/3); "no need. are they correct?" was graded by nothing and the tutor
// said "You nailed all of them!".
const gateway = require('../../utils/llmGateway');
const client = require('../../utils/openaiClient');
const refuse = async () => { throw new Error('no model calls in unit tests'); };
gateway.callLLM = refuse; gateway.callLLMStructured = refuse;
client.callLLM = refuse; client.callLLMStructured = refuse;

const { isRecheckRequest, findRecheckTarget, looksLikeSubmission } = require('../../utils/pipeline/recheck');
const { observeAndDiagnose } = require('../../utils/pipeline/index');
const { decide } = require('../../utils/pipeline/decide');
const { classifyTurn } = require('../../utils/pipeline/solveCredit');

const POSE = "Got it! Let's mix it up with a variety of problems. Here we go with the first few:\n\n1. Evaluate: \\(5 - 3 + 8\\)\n2. Solve for x: \\(2x + 6 = 18\\)\n3. Simplify: \\(\\frac{16}{12}\\)\n4. Calculate the area of a rectangle with length 7 and width 4.\n5. What is the slope of the line passing through the points (2, 3) and (5, 11)?\n\nTry these out, and let me know your answers!";
const TRANSCRIPT = (answers) => [
  { role: 'user', content: 'You decide. mix em up' },
  { role: 'assistant', content: POSE },
  { role: 'user', content: answers },
  { role: 'assistant', content: "Let's work through this one together instead of me just handing you the answer. What step would you take from here?" },
  { role: 'user', content: 'huh?' },
  { role: 'assistant', content: "Let's work through this one together instead of me just handing you the answer. What step would you take from here?" },
  { role: 'user', content: 'you gave me 5 questions and I answered them' },
  { role: 'assistant', content: "Let's go through your answers together. For 5−3+8, can you walk me through how you combined the numbers?" },
];
const quiet = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };
const run = (answers, message = 'no need. are they correct?') => quiet(() => observeAndDiagnose(message, {
  conversation: { messages: TRANSCRIPT(answers), boardProblem: null, lastBoardAction: null, lastProblemState: null },
  user: { _id: 'u' },
}));

describe('isRecheckRequest', () => {
  test.each(['no need. are they correct?', 'is that right?', 'did i get it right?', 'correct?', 'are they all right', 'which ones are wrong?'])('%s', (t) => {
    expect(isRecheckRequest(t)).toBe(true);
  });
  test.each(['can you help me with something', 'what is 5+3', 'i dont get it', 'is it 6?'])('not: %s', (t) => {
    expect(isRecheckRequest(t)).toBe(false);
  });
});

describe('findRecheckTarget', () => {
  test('skips "you gave me 5 questions…" to reach the answers', () => {
    expect(looksLikeSubmission('you gave me 5 questions and I answered them')).toBe(false);
    expect(findRecheckTarget(TRANSCRIPT('1. 10\n2. x=6'))).toBe(2);
  });
  test('a word answer to a tutor question counts when no math is in reach', () => {
    const msgs = [{ role: 'assistant', content: 'True or false: every square is a rectangle?' }, { role: 'user', content: 'true' }];
    expect(findRecheckTarget(msgs)).toBe(1);
  });
  test('nothing to re-check → null', () => {
    expect(findRecheckTarget([{ role: 'assistant', content: 'Hi! What should we work on?' }])).toBeNull();
  });
});

describe('the owner transcript, end to end through observeAndDiagnose', () => {
  test('"are they correct?" after a wrong #5 re-grades the set as wrong at #5', async () => {
    const { diagnosis, observation } = await run('1. 10\n2. x=6\n3. 4/3\n4. 28 units squared\n5. 3/8');
    expect(observation.isRecheck).toBe(true);
    expect(diagnosis.recheck).toBeTruthy();
    expect(diagnosis.isCorrect).toBe(false);
    expect(diagnosis.verificationState).toBe('verified_incorrect');
    expect(diagnosis.batch.items.find(i => i.n === 5).verdict).toBe(false);

    const decision = decide(observation, diagnosis, {});
    expect(decision.directives[0]).toMatch(/^RE-CHECK/);
    expect(decision.directives[0]).toMatch(/number 5 is wrong/);
    expect(decision.directives[0]).not.toMatch(/8\/3/);
  });

  test('a re-check is never recorded as another attempt', async () => {
    const { diagnosis } = await run('1. 10\n2. x=6\n3. 4/3\n4. 28 units squared\n5. 3/8');
    expect(classifyTurn({ diagnosis, extracted: {}, message: 'no need. are they correct?', liveTexts: [] }).outcome).toBe('none');
  });

  test('with no verdict to give, the tutor is restricted, never free', async () => {
    const { diagnosis } = await quiet(() => observeAndDiagnose('is that right?', {
      conversation: {
        messages: [{ role: 'assistant', content: 'True or false: every square is a rectangle?' }, { role: 'user', content: 'true' },
          { role: 'assistant', content: 'Can you tell me why?' }],
        boardProblem: null, lastBoardAction: null, lastProblemState: null,
      },
      user: { _id: 'u' },
    }));
    expect(diagnosis.isCorrect).toBeNull();
    expect(diagnosis.verificationState).toBe('unverified');
  });
});

describe('the re-check directive, every verdict', () => {
  const obs = { isRecheck: true, messageType: 'general_math', streaks: {}, contextSignals: [] };
  const first = (d) => decide(obs, d, {}).directives[0];
  test('correct → say so plainly and move on', () => {
    expect(first({ type: 'correct', isCorrect: true })).toMatch(/RE-CHECK.*ARE correct/);
  });
  test('several wrong items are named by number only', () => {
    const d = first({ type: 'incorrect', isCorrect: false, batch: { items: [{ n: 2, verdict: false }, { n: 4, verdict: false }, { n: 1, verdict: true }] } });
    expect(d).toMatch(/numbers 2, 4 are wrong/);
  });
  test('a single wrong answer outside a set', () => {
    expect(first({ type: 'incorrect', isCorrect: false })).toMatch(/NOT correct/);
  });
  test('no verdict → claim neither way', () => {
    expect(first({ type: 'unverifiable', isCorrect: null })).toMatch(/could NOT be verified/);
  });
  test('an ordinary turn gets no re-check directive', () => {
    const d = decide({ messageType: 'general_math', streaks: {}, contextSignals: [] }, { type: 'no_answer', isCorrect: null }, {});
    expect(d.directives.join(' ')).not.toMatch(/RE-CHECK/);
  });
});
