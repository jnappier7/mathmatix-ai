// tests/setup.js
// Global test setup and configuration

// A LIVE eval is the one test path that needs REAL credentials, and it had no
// way to get them: `.env.test` doesn't exist in most checkouts, `.env` (where the
// real keys live) was never loaded, and the placeholder below then guaranteed a
// truthy-but-invalid OPENAI_API_KEY. So `RUN_LLM_EVAL=1 npm run test:eval:live`
// authenticated with the literal string `test_openai_key` and every scenario
// 401'd — reported as nine behavioral failures, which reads exactly like a tutor
// quality regression and is nothing of the kind.
//
// Load `.env` for live runs ONLY. Unit tests stay hermetic on the placeholders:
// dotenv never overrides an already-set var, so this cannot leak a real key into
// the normal `npm test` path.
// Anchored to the repo root, not cwd: dotenv defaults to `process.cwd()/.env`,
// which silently finds nothing when jest is invoked from a subdirectory or a git
// worktree. Resolving from __dirname makes the load independent of where you ran it.
if (process.env.RUN_LLM_EVAL === '1') {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
}

// Load environment variables for testing (optional — most unit tests use stubs)
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Provide harmless defaults for env vars that the codebase reads at module
// load time. Unit tests should NOT make real API calls; these placeholders
// only let third-party SDK clients construct without throwing.
//
// PLACEHOLDER_KEYS is exported for the live-eval guards: a key being *present*
// is not the same as a key being *usable*, and this line is why. Anything
// gating on real credentials must compare against these, not on truthiness.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test_openai_key';
process.env.MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || 'test_mathpix_id';
process.env.MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || 'test_mathpix_key';

// Increase test timeout for database operations
jest.setTimeout(10000);

// Suppress console output during tests (optional - uncomment to enable)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
global.testHelpers = {
  // Helper to create test user data
  createTestUser: (overrides = {}) => ({
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'student',
    passwordHash: '$2a$10$samplehash',
    ...overrides
  }),

  // Helper to wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
