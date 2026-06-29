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
    '<rootDir>/tests/unit/llmVerifierEscalation.test.js',
    '<rootDir>/tests/unit/verifyMetrics.test.js',
    '<rootDir>/tests/unit/irt.test.js',
    '<rootDir>/tests/unit/knowledgeTracer.test.js',
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
    'utils/pipeline/observe.js',
    'utils/pipeline/decide.js',
    'utils/pipeline/diagnose.js',
  ],
  coverageReporters: ['text-summary', 'text'],
  // Floors sit a few points below measured coverage to absorb cross-Node-version
  // branch-counting drift. Tighten as coverage improves.
  coverageThreshold: {
    './utils/mathSolver.js': { statements: 73, branches: 63, functions: 84, lines: 76 },
    './utils/irt.js': { statements: 90, branches: 82, functions: 95, lines: 90 },
    './utils/knowledgeTracer.js': { statements: 83, branches: 78, functions: 95, lines: 83 },
    './utils/verifyMetrics.js': { statements: 96, branches: 80, functions: 100, lines: 96 },
    './utils/pipeline/llmVerifier.js': { statements: 88, branches: 75, functions: 100, lines: 88 },
    './utils/pipeline/observe.js': { statements: 70, branches: 66, functions: 90, lines: 74 },
    './utils/pipeline/decide.js': { statements: 44, branches: 42, functions: 62, lines: 45 },
    './utils/pipeline/diagnose.js': { statements: 44, branches: 43, functions: 42, lines: 46 },
  },
};
