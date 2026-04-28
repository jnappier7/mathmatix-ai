// tests/setup.js
// Global test setup and configuration

// Load environment variables for testing (optional — most unit tests use stubs)
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Provide harmless defaults for env vars that the codebase reads at module
// load time. Unit tests should NOT make real API calls; these placeholders
// only let third-party SDK clients construct without throwing.
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
