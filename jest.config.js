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
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/tests/load/'
  ]
};
