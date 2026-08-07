/**
 * TUTOR EVAL — hermetic layer (runs in normal `npm test`, no API key).
 *
 * Two things are asserted here without ever calling a model:
 *   1. DETERMINISTIC classification — the real observe() reads each scenario turn
 *      the way production does. This locks the merged fixes (a self-checked answer
 *      "is it 5/12?" is an answer_attempt; "12 2/3 - 4 1/4" is a bare problem drop)
 *      so a refactor can't silently regress them.
 *   2. JUDGE wiring — a mock model feeds the runner the ACTUAL failing transcript
 *      lines (must be flagged) and clean replies (must pass). This proves the
 *      judge+runner path works, so the live eval (liveEval.test.js) is trustworthy.
 *
 * The live eval against the real gpt-4o-mini pipeline lives in liveEval.test.js and
 * is opt-in (RUN_LLM_EVAL=1) so it never flakes the keyless CI path.
 */
'use strict';

const scenarios = require('./scenarios.json').scenarios;
const { runScenario, formatFailures } = require('./runner');

// Real failing lines from this session's transcripts — each must trip its judges.
const BAD_REPLIES = {
  "fractions: butterfly answer 10/24 is correct (= 5/12), confirm then simplify":
    'Not quite! While 5/12 and 10/24 may look similar, they are not equivalent. Can you reduce it?',
  "graph: don't lose the y=x^3 context":
    'That sounds like functions! What specific function or type of graph do you have in mind?',
  'bare mixed-number drop is elicited, not solved':
    'Convert to improper: 38/3 - 17/4 = 152/12 - 51/12 = 101/12 = 8 5/12.',
  "order of operations: 16/4 x 2 = 8 is correct; no PEMDAS 'M before D'":
    'Not quite - multiplication comes before division, so let us re-check.',
  'negative answer -28 is correct, not rejected':
    'Hmm, that is not quite right. Let us double-check -34 + 6.',
  'self-check phrased as a question still gets verified':
    'Not quite, let us check that again.',
  "multi-root answer 'x=2 and x=3' is correct, not doubted":
    "I appreciate your effort! Let's take a closer look and pinpoint where things might have gone off track.",
  // Both verbatim from the 2026-07-29 production transcript (expected-value session).
  'expected value: correct multi-line sum 34 is confirmed, not re-added':
    "I see where you're coming from with your calculation, and it's great to explore different methods. However, let's take another look at your three terms: 5+9+20. You previously arrived at 34, but I encourage you to re-add those numbers. What do you get when you sum them again?",
  'two-part question: final answer 300 is confirmed, no phantom decimal slip':
    "Good catch on 0.15×2=0.3, that part's solid. The decimal shift is where it slipped though. Let's think about it with place value instead.",
};

// Clean replies that confirm correctly and stay on topic — must pass every judge.
const GOOD_REPLIES = {
  "fractions: butterfly answer 10/24 is correct (= 5/12), confirm then simplify":
    'Exactly right - 10/24 works. Can you simplify it to lowest terms?',
  "graph: don't lose the y=x^3 context":
    'Right! As x increases, y increases; as x decreases, y decreases. Why does the left side dive so fast?',
  // The pose tag is deliberate: prose judges score the CLEANED text, so tag
  // attribute `=` signs must not read as worked solution steps (live false
  // positive, 2026-08-07).
  'bare mixed-number drop is elicited, not solved':
    'Good one to practice. What is your first move here? <BOARD action="pose" tex="12\\frac{2}{3} - 4\\frac{1}{4}" />',
  "order of operations: 16/4 x 2 = 8 is correct; no PEMDAS 'M before D'":
    'Exactly, 8 is right. Multiply and divide left to right.',
  'negative answer -28 is correct, not rejected':
    'Yes! -28 is correct. Nice work with the negatives.',
  'self-check phrased as a question still gets verified':
    'Yes, 5/12 is exactly right.',
  "multi-root answer 'x=2 and x=3' is correct, not doubted":
    'Exactly! x = 2 and x = 3 are both solutions. Nice factoring.',
  'expected value: correct multi-line sum 34 is confirmed, not re-added':
    'Exactly — 5 + 9 + 20 = 34 coins. That is the expected value. Want to dig into why the long-run average works like that?',
  'two-part question: final answer 300 is confirmed, no phantom decimal slip':
    'That is it — 0.3 × 1000 = 300, three places for the three zeros. Now bring it home: what is 0 + 50 + 300?',
};

describe('tutor eval — deterministic classification (no model)', () => {
  for (const s of scenarios) {
    test(s.name, async () => {
      const r = await runScenario(s);
      if (!r.classificationPassed) {
        throw new Error(`classification regressed:\n${formatFailures(r).join('\n')}`);
      }
    });
  }
});

describe('tutor eval — judges flag known-bad replies and pass clean ones', () => {
  const scored = scenarios.filter((s) => s.turns.some((t) => Array.isArray(t.judge)));

  for (const s of scored) {
    test(`${s.name} — bad reply is caught`, async () => {
      expect(BAD_REPLIES[s.name]).toBeDefined();
      const r = await runScenario(s, { generateReply: () => BAD_REPLIES[s.name] });
      const anyViolation = r.turns.some((t) => t.violations.length > 0);
      expect(anyViolation).toBe(true);
    });

    test(`${s.name} — clean reply passes`, async () => {
      expect(GOOD_REPLIES[s.name]).toBeDefined();
      const r = await runScenario(s, { generateReply: () => GOOD_REPLIES[s.name] });
      if (!r.judgesPassed) {
        throw new Error(`clean reply was wrongly flagged:\n${formatFailures(r).join('\n')}`);
      }
    });
  }
});

describe('tutor eval — suite integrity', () => {
  test('scenarios loaded and every judge turn has a known-bad + known-good fixture', () => {
    expect(scenarios.length).toBeGreaterThan(4);
    for (const s of scenarios) {
      if (s.turns.some((t) => Array.isArray(t.judge))) {
        expect(BAD_REPLIES[s.name]).toBeDefined();
        expect(GOOD_REPLIES[s.name]).toBeDefined();
      }
    }
  });
});
