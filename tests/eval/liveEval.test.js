/**
 * LIVE TUTOR EVAL — runs the scenarios against the REAL model and scores the
 * tutor's actual replies with the judges. This is the piece the old golden suite
 * couldn't do (it mocks the LLM): it catches the tutor's WORDS regressing.
 *
 * OPT-IN ONLY. It needs an OpenAI key and makes real calls, so it is skipped
 * unless RUN_LLM_EVAL=1. Wire it as a nightly / pre-release job, not the keyless
 * PR gate — the model is nondeterministic and would flake normal CI.
 *
 *   RUN_LLM_EVAL=1 OPENAI_API_KEY=sk-... npm run test:eval:live
 *
 * The reply is generated the way production does for a correctness turn: the real
 * compact system prompt + the scenario history, plus the same verified-answer hint
 * chat.js injects when the student's message is an answer attempt. So a failure
 * here is a real "the tutor would say this to a student" failure.
 */
'use strict';

const RUN = process.env.RUN_LLM_EVAL === '1' && !!process.env.OPENAI_API_KEY;

const scenarios = require('./scenarios.json').scenarios;
const { runScenario, formatFailures } = require('./runner');

const TEST_PROFILE = {
  firstName: 'Alex', lastName: 'Rivera', gradeLevel: '7', mathCourse: 'Math 7',
  interests: [], learningStyle: null, tonePreference: 'encouraging',
};
const TEST_TUTOR = {
  name: 'Mr. Nappier',
  catchphrase: 'See the patterns, solve with ease.',
  personality: 'Warm, encouraging middle-school math teacher who guides with questions.',
};

// Mirror chat.js: on a verified answer attempt, the pinned answer is injected for
// grading (never to be revealed). We give the model the SAME signal so the eval
// tests the real "does it respect the verdict" behavior, not a handicapped path.
function verifiedAnswerHint(turn, scenario) {
  if (!turn.ctx || !turn.ctx.studentWasCorrect) return '';
  const ans = turn.ctx.answer ?? scenario.answer;
  if (!ans) return '';
  return `\n\n[MATH_VERIFICATION — INTERNAL GRADING ONLY: the student's answer is CORRECT (equivalent to ${ans}). Confirm it's correct. NEVER reveal or restate ${ans} as the answer; guide from here.]`;
}

async function liveGenerateReply({ scenario, turn, history }) {
  // Lazy-require so the keyless suite never loads the OpenAI client.
  const { generateSystemPrompt } = require('../../utils/promptCompact');
  const { callLLM } = require('../../utils/llmGateway');

  const systemPrompt = generateSystemPrompt(
    TEST_PROFILE, TEST_TUTOR, null, 'student',
    null, null, null, [], null,
    { topicName: scenario.focus || undefined }, null, null, null, null,
    turn.student, history.slice(-8),
  );

  const messages = [{ role: 'system', content: systemPrompt }];
  history.forEach((m, idx) => {
    const isLastUser = idx === history.length - 1 && m.role === 'user';
    messages.push({ role: m.role, content: isLastUser ? m.content + verifiedAnswerHint(turn, scenario) : m.content });
  });

  const completion = await callLLM(process.env.TUTOR_MODEL || 'gpt-4o-mini', messages, { temperature: 0.5, max_tokens: 400 });
  // callLLM returns the full completion object (OpenAI shape for both
  // providers — anthropicClient normalizes). Anything else stringifies to
  // "[object Object]" and the judges silently score that instead of the reply.
  const msg = completion?.choices?.[0]?.message;
  return (msg && msg.content) || '';
}

(RUN ? describe : describe.skip)(`LIVE tutor eval (real ${process.env.TUTOR_MODEL || 'gpt-4o-mini'})`, () => {
  jest.setTimeout(120000);

  for (const s of scenarios) {
    if (!s.turns.some((t) => Array.isArray(t.judge))) continue;
    test(s.name, async () => {
      const r = await runScenario(s, { generateReply: liveGenerateReply });
      if (!r.judgesPassed) {
        throw new Error(`LIVE tutor reply violated a judge:\n${formatFailures(r).join('\n')}`);
      }
    });
  }
});

// Keep the file non-empty for the keyless runner (describe.skip emits no tests).
describe('live eval harness config', () => {
  test('is opt-in via RUN_LLM_EVAL', () => {
    expect(typeof RUN).toBe('boolean');
  });
});
