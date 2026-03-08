/**
 * Load Test Configuration
 *
 * Centralized config for all k6 load test scripts.
 * Override via environment variables for different environments.
 */

// Base URL for the target server
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test user credentials (use seeded test accounts)
export const TEST_USERS = {
  student: {
    username: __ENV.TEST_STUDENT_USER || 'loadtest-student',
    password: __ENV.TEST_STUDENT_PASS || 'LoadTest123!',
  },
  teacher: {
    username: __ENV.TEST_TEACHER_USER || 'loadtest-teacher',
    password: __ENV.TEST_TEACHER_PASS || 'LoadTest123!',
  },
};

/**
 * Load profiles — use with k6 scenarios.
 *
 * smoke:    Minimal load to verify the test works
 * average:  Typical weekday traffic pattern
 * peak:     Peak school hours (morning rush)
 * stress:   Find the breaking point
 * soak:     Extended run to detect memory leaks
 */
export const LOAD_PROFILES = {
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '30s',
  },
  average: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 10 },   // ramp up
      { duration: '3m', target: 10 },   // steady state
      { duration: '1m', target: 0 },    // ramp down
    ],
  },
  peak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },   // ramp up
      { duration: '5m', target: 50 },   // sustained peak
      { duration: '2m', target: 0 },    // ramp down
    ],
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '3m', target: 150 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 0 },
    ],
  },
  soak: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30m',
  },
};

/**
 * Default performance thresholds.
 * Tests FAIL if these are breached.
 */
export const THRESHOLDS = {
  // HTTP request duration (p95 < 2s, p99 < 5s)
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  // Error rate must stay below 5%
  http_req_failed: ['rate<0.05'],
  // At least 95% of checks must pass
  checks: ['rate>0.95'],
};

/**
 * Chat-specific thresholds (more lenient due to LLM latency).
 */
export const CHAT_THRESHOLDS = {
  http_req_duration: ['p(95)<10000', 'p(99)<15000'],  // LLM calls are slow
  http_req_failed: ['rate<0.05'],
  checks: ['rate>0.95'],
  // Custom trend for chat response time
  'chat_response_time': ['p(95)<10000'],
};

/**
 * Screener-specific thresholds.
 */
export const SCREENER_THRESHOLDS = {
  http_req_duration: ['p(95)<3000', 'p(99)<5000'],
  http_req_failed: ['rate<0.05'],
  checks: ['rate>0.95'],
};
