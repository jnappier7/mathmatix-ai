// jest.critical.config.js — coverage RATCHET for the highest-stakes logic.
//
// The main `npm test` keeps an intentionally low global coverage floor (~25%)
// across the whole codebase. That floor can't protect the few modules where a
// silent drop in coverage is genuinely dangerous: the answer-grading math
// engine, the IRT placement math, knowledge tracing, and the tutoring pipeline's
// decision/verification stages. A bug here mis-teaches or mis-grades students.
//
// This config runs ONLY the tests that exercise those modules, and measures
// coverage ONLY on those modules, with per-file thresholds. Because the file set
// and test set are fixed, the numbers are deterministic — no flakiness from the
// rest of the suite. It runs as its own CI job (`npm run test:critical`) so it
// never perturbs the global threshold in jest.config.js (Jest subtracts
// path-scoped files from the global bucket, which we deliberately avoid here).
//
// RATCHET POLICY: thresholds are set just below current measured coverage. When
// you add tests and coverage rises, raise the floor to lock the gain. Never lower
// a floor to make a red build green — that's the regression this gate exists to
// catch. Investigate the drop instead.

module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  testMatch: [
    '<rootDir>/tests/unit/pipeline.test.js',
    '<rootDir>/tests/unit/pipelineIntegration.test.js',
    '<rootDir>/tests/unit/generatePiiRehydration.test.js',
    '<rootDir>/tests/unit/emotionalFirstAid.test.js',
    '<rootDir>/tests/unit/llmVerifier.test.js',
    '<rootDir>/tests/unit/llmVerifierEscalation.test.js',
    '<rootDir>/tests/unit/verifierCrossProvider.test.js',
    '<rootDir>/tests/unit/verifierPinnedProblem.test.js',
    '<rootDir>/tests/unit/affirmThenProbe.test.js',
    '<rootDir>/tests/unit/decideInstructionalMode.test.js',
    '<rootDir>/tests/unit/actReviewSolvedAdvance.test.js',
    // decide's teaching moves: first wrong step, the IDK ladder, own-it disputes.
    '<rootDir>/tests/unit/teachingMoves.test.js',
    '<rootDir>/tests/unit/stepGradingTranscript.test.js',
    '<rootDir>/tests/unit/conceptualAnswerVerdict.test.js',
    '<rootDir>/tests/unit/verifyMetrics.test.js',
    '<rootDir>/tests/unit/verifyTopic.test.js',
    '<rootDir>/tests/unit/irt.test.js',
    '<rootDir>/tests/unit/knowledgeTracer.test.js',
    '<rootDir>/tests/unit/workspace/scaffoldBlankMove.test.js',
    '<rootDir>/tests/unit/diagnoseArithmeticGuard.test.js',
    '<rootDir>/tests/unit/trueArithmeticVerdict.test.js',
    '<rootDir>/tests/unit/diagnoseMultiLineAnswer.test.js',
    // Numbered sets graded per item; an answer to the parked earlier problem.
    '<rootDir>/tests/unit/completedWorkVerdicts.test.js',
    '<rootDir>/tests/unit/observeLatexAnswer.test.js',
    // Bare-problem-drop and worked-step classification (observe.js).
    '<rootDir>/tests/unit/bareProblemDrop.test.js',
    '<rootDir>/tests/unit/diagnoseMultiStep.test.js',
    // 2026-10-25 owner session: prose-wrapped problems pin, one-line equation
    // steps and "so" chains get verdicts, graded work is never a bare drop.
    '<rootDir>/tests/unit/diagnoseEquationStep.test.js',
    '<rootDir>/tests/unit/derivationVerifier.test.js',
    '<rootDir>/tests/unit/stepSolveCredit.test.js',
    // Course audit 2026-10-18..23: correct worked answers, and verdict repair.
    '<rootDir>/tests/unit/auditCourseFalseNegatives.test.js',
    '<rootDir>/tests/unit/verdictRepair.test.js',
    '<rootDir>/tests/unit/mathSolver*.test.js',
    '<rootDir>/tests/golden/goldenTranscripts.test.js',
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'utils/mathSolver.js',
    'utils/irt.js',
    'utils/knowledgeTracer.js',
    'utils/verifyMetrics.js',
    'utils/pipeline/llmVerifier.js',
    'utils/pipeline/verifyTopic.js',
    'utils/pipeline/observe.js',
    'utils/pipeline/decide.js',
    'utils/pipeline/diagnose.js',
  ],
  coverageReporters: ['text-summary', 'text'],
  // Floors sit a few points below measured coverage to absorb cross-Node-version
  // branch-counting drift. Tighten as coverage improves.
  coverageThreshold: {
    './utils/mathSolver.js': { statements: 82, branches: 73, functions: 91, lines: 85 },
    './utils/irt.js': { statements: 90, branches: 82, functions: 95, lines: 90 },
    './utils/knowledgeTracer.js': { statements: 83, branches: 78, functions: 95, lines: 83 },
    // Measured 100/95.58/100/100 after the cross-provider state tests (up from
    // 100/94.9 after mathType + resolvedBy). The floor keeps its usual few
    // points of headroom for cross-Node branch-counting drift rather than being
    // pinned to the measurement.
    //
    // NOTE the curated testMatch above: coverage for this module has to come
    // from a file this config actually runs. Adding the cross-provider state
    // machine to verifyMetrics.js while its tests lived only in
    // verifierProviderHealth.test.js is what turned this gate red.
    './utils/verifyMetrics.js': { statements: 99, branches: 92, functions: 100, lines: 99 },
    // Measured 97.9/90.7/100/98.8 after the cross-provider tests (parseVerdict +
    // verifierCall) — ratcheted. The verifier now depends on a second provider, so
    // its JSON-mode translation and its reachability fallback are exactly the code
    // whose failures are invisible: a regression there returns `unverifiable` for
    // every attempt rather than throwing. Coverage is the only alarm.
    './utils/pipeline/llmVerifier.js': { statements: 97, branches: 90, functions: 100, lines: 98 },
    // Measured 100 across the board. It is a pure, bounded label function with no
    // I/O, so full coverage is the steady state, not an aspiration.
    './utils/pipeline/verifyTopic.js': { statements: 98, branches: 96, functions: 100, lines: 98 },
    // Measured 86.0/83.6/100/90.9 once bareProblemDrop.test.js joined the gate
    // with the worked-step classification — ratcheted. extractAnswer is the gate
    // that decides whether a student's claim gets graded at all, and the drop
    // detector decides whether their work is treated as a problem they handed
    // over; a shape either misses fails silently, so coverage is the alarm.
    // Measured 90.8/87.0/100/94.9 once auditCourseFalseNegatives.test.js joined
    // with the final-claim shapes (closed arithmetic, equivalent forms,
    // comparisons, check lines) — ratcheted.
    './utils/pipeline/observe.js': { statements: 88, branches: 85, functions: 100, lines: 93 },
    // Measured 68.4/69.7/100/67.7 once bareProblemDrop.test.js (which drives
    // decide's ELICIT_FIRST and alignment gates) joined the gate — ratcheted.
    // functions:100 is deliberate and is the lesson from the drop that turned this
    // gate red (81.3% → 77.77% against a 78% floor, from three helpers landing
    // untested). decide.js is where the tutor picks its move; a new decision
    // helper here arrives with a test or it doesn't arrive.
    // Measured 74.3/73.4/100/73.9 once teachingMoves.test.js joined — ratcheted.
    './utils/pipeline/decide.js': { statements: 73, branches: 72, functions: 100, lines: 73 },
    // Measured 67.9/62.6/72.2/68.6 after the true-arithmetic tiers
    // (trueArithmeticVerdict.test.js) — ratcheted. Those tiers are the pipeline's
    // last line between a correct student and a tutor improvising arithmetic, and
    // they fail SILENTLY: losing one costs a verdict, not an exception, and the
    // turn goes out undecided with every language guard in verify.js disarmed.
    // Measured 80.9/73.1/85.7/81.0 once auditCourseFalseNegatives.test.js joined
    // (comparison grading, shown-arithmetic reasoning) — ratcheted.
    './utils/pipeline/diagnose.js': { statements: 78, branches: 70, functions: 83, lines: 78 },
  },
};
