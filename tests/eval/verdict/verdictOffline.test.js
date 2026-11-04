/**
 * Verdict accuracy, deterministic tier — runs in every `npm test`, no keys.
 *
 * The corpus goes through the production verdict path (observeAndDiagnose)
 * with every model call cut, so only the deterministic graders (solver,
 * derivation chain, symbolic tier, arithmetic checks) can rule. Those graders
 * are the ones trusted WITHOUT a second opinion, so a confident wrong verdict
 * from them reaches a student unchallenged.
 *
 * A wrong verdict outside KNOWN fails this test. KNOWN is a ratchet: when a fix
 * lands, its entry must be removed (the second test fails while it lingers),
 * so the list only ever shrinks. The live tier is scripts/verdictEval.js.
 */

const gateway = require('../../../utils/llmGateway');
const client = require('../../../utils/openaiClient');

const refuse = async () => { throw new Error('offline eval: no model calls'); };
gateway.callLLM = refuse;
gateway.callLLMStructured = refuse;
client.callLLM = refuse;
client.callLLMStructured = refuse;

const { runAll, summarize } = require('./runner');

// Wrong verdicts the deterministic tier gives today — each a real bug, found by
// this eval on 2026-11-03. Key: `${problemId}|${answer}`.
const KNOWN = new Set([
  // 1½ ÷ ¾ = 2. LaTeX "1\frac{1}{2}" parses as 11/2 (→ 22/3); plain "1 1/2 ÷ 3/4"
  // as mixed-number arithmetic → 1/8. Either way the solver's key is wrong.
  'frac-4|2', 'frac-4|i got 2', 'frac-4|is it 2?', 'frac-4|its 2', 'frac-4|3/2 x 4/3 = 2',
  // A systems answer written as a chain ("2x = 14 so x = 7, then y = 3") is graded
  // as a one-variable derivation whose last line (y = 3) must equal x's value.
  'sys-1|2x = 14 so x = 7, then y = 3',
]);

// Follow-up turns ("are they correct?") left with no verdict AND no restriction.
// Was 402/402 on 2026-11-03 (nothing re-graded the earlier answers, and
// verificationState came out not_applicable); recheck.js re-grades them now.
const KNOWN_UNGUARDED_FOLLOWUPS = 0;

let results;
let summary;

beforeAll(async () => {
  const log = console.log;
  console.log = () => {};
  try {
    results = await runAll({ quiet: true });
  } finally {
    console.log = log;
  }
  summary = summarize(results);
}, 120000);

// A follow-up row's answer reads "<answer> → <check request>"; it re-grades the
// same answer, so it shares that answer's KNOWN entry.
const key = (r) => `${r.id}|${String(r.answer).split(' → ')[0]}`;

test('no NEW wrong verdict from the deterministic graders', () => {
  const unexpected = summary.failures.filter(f => f.outcome !== 'UNGUARDED' && !KNOWN.has(key(f)));
  expect(unexpected.map(f => `${f.outcome} ${f.id} [${f.context}] ${JSON.stringify(f.answer)} via ${f.source} (pin ${JSON.stringify(f.pin)})`)).toEqual([]);
});

test('KNOWN only lists failures that still happen (remove an entry when its fix lands)', () => {
  const failing = new Set(summary.failures.filter(f => f.outcome !== 'UNGUARDED').map(key));
  expect([...KNOWN].filter(k => !failing.has(k))).toEqual([]);
});

test('unguarded follow-ups never grow (ratchet)', () => {
  expect(summary.byContext.followup.unguarded).toBeLessThanOrEqual(KNOWN_UNGUARDED_FOLLOWUPS);
});

test('the corpus actually exercised the graders', () => {
  expect(summary.overall.n).toBeGreaterThan(1000);
  // Coverage is measured, not asserted beyond a floor — a drop means a grader
  // stopped answering cases it used to answer.
  const firstTurn = ['pinned', 'unpinned'].map(k => summary.byContext[k]);
  const right = firstTurn.reduce((a, s) => a + s.right, 0);
  const n = firstTurn.reduce((a, s) => a + s.n, 0);
  expect(right / n).toBeGreaterThan(0.45);
});
