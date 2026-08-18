// jest.config.js
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'models/**/*.js',
    'services/**/*.js',
    'auth/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/scripts/**',
    // Streaming voice infrastructure: thin wrappers around vendor WebSocket
    // SDKs (Deepgram/Cartesia) and a per-socket orchestrator. Meaningful
    // tests require integration-style mocking of those SDKs and would test
    // the mocks more than the wrappers. voiceMetrics.js IS covered.
    '!utils/sttStream.js',
    '!utils/ttsStream.js',
    '!utils/voiceSession.js'
  ],

  // Coverage thresholds — ratchet up as coverage improves (never lower these)
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 22,
      functions: 24,
      lines: 25
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout (increased for database operations)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Ignore patterns
  //
  // `.claude/worktrees/` is load-bearing, not tidiness. Sibling git worktrees used
  // to live outside the repo, but the agent harness now creates them *inside* it —
  // so jest's `**/tests/**` glob walked into every one and ran that branch's tests
  // too. Observed: one `npm run test:eval:live` executed FOUR copies of the suite,
  // three of them from other sessions' branches, with stack traces pointing at
  // different line numbers in their older copies of utils/openaiClient.js.
  //
  // That means a local pass or fail was partly decided by unrelated in-flight code
  // in someone else's worktree — the exact hazard CLAUDE.md's one-worktree-per-session
  // rule exists to prevent, leaking in through the test runner. It also quadrupled
  // every run and caused the "Haste module naming collision: mathmatix-ai" warning
  // (four package.json files claiming one module name).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/tests/load/',
    '/\\.claude/worktrees/'
  ],

  // Stops the duplicate-package.json haste collision at the source: don't crawl
  // nested worktrees for modules either, not just for tests.
  modulePathIgnorePatterns: [
    '/\\.claude/worktrees/'
  ]
};
