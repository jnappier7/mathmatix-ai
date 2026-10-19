/**
 * Course progression must not stall on a teaching step.
 *
 * Course audit, 2026-10-18: ~120 real enrollments, none had finished a module;
 * every stuck session sat on a step-0 explanation. Replaying a real one, the
 * LLM judge said "understood" on one turn and "not_yet" on every other — the
 * tutor almost always ends on a new question, so the last four exchanges look
 * unfinished. And a verdict quoting LaTeX was dropped as invalid JSON.
 */
jest.mock('../../utils/openaiClient', () => ({ callLLM: jest.fn() }));
const { callLLM } = require('../../utils/openaiClient');
const {
  evaluateStepCompletion, parseEvalResponse, applyTurnCap, TEACHING_STEP_TURN_CAP,
} = require('../../utils/pipeline/stepEvaluator');

const reply = (status) => ({ choices: [{ message: { content: JSON.stringify({ status, confidence: 0.3, evidence: 'x' }) } }] });
const explanation = { type: 'explanation', title: 'Concept: Place Value' };

function convo(nPairs, { advancedAt = null } = {}) {
  const messages = [{ role: 'assistant', content: 'Welcome! What does the 6 in 67 mean?' }];
  for (let i = 0; i < nPairs; i++) {
    messages.push({ role: 'user', content: `answer ${i}` });
    messages.push({ role: 'assistant', content: `Nice. Next: what about ${i}?`, scaffoldAdvanced: advancedAt === i });
  }
  return { messages };
}

beforeEach(() => callLLM.mockReset());

test('a judge that keeps saying not_yet no longer holds the step forever', async () => {
  callLLM.mockResolvedValue(reply('not_yet'));
  const early = await evaluateStepCompletion(explanation, convo(3));
  expect(early.complete).toBe(false);
  const capped = await evaluateStepCompletion(explanation, convo(TEACHING_STEP_TURN_CAP.explanation));
  expect(capped).toMatchObject({ complete: true, mode: 'llm_eval_cap' });
});

test('the cap needs real student replies, not just tutor talk', () => {
  const tutorOnly = { messages: Array.from({ length: 8 }, (_, i) => ({ role: 'assistant', content: `t${i}` })) };
  expect(applyTurnCap({ complete: false, status: 'not_yet' }, explanation, tutorOnly.messages, 8).complete).toBe(false);
});

test('the window restarts at the last advance marker', async () => {
  callLLM.mockResolvedValue(reply('not_yet'));
  // 6 pairs, advanced at pair 3 → only 2 tutor turns since: under the cap
  const r = await evaluateStepCompletion(explanation, convo(6, { advancedAt: 3 }));
  expect(r.complete).toBe(false);
});

test('practice steps are never capped — they still need verified correct answers', async () => {
  const practice = { type: 'independent_practice', title: 'You do' };
  const r = await evaluateStepCompletion(practice, convo(10));
  expect(r).toMatchObject({ complete: false, mode: 'deterministic' });
  expect(callLLM).not.toHaveBeenCalled();
});

test('a verdict quoting LaTeX is parsed, not dropped', () => {
  const raw = '{"status":"understood","confidence":0.8,"evidence":"Named the place of the \\( 2 \\) in \\( 200,000,000 \\)."}';
  expect(parseEvalResponse(raw)).toMatchObject({ complete: true, status: 'understood' });
});

test('chat.js persists the advance marker after progression', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../routes/chat.js'), 'utf8');
  expect(src).toMatch(/\$set: \{ 'messages\.\$\.scaffoldAdvanced': true \}/);
});
