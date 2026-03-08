/**
 * Load Test: Authentication & Session (/login)
 *
 * Tests login throughput and session handling under concurrent load.
 * Auth is the foundation — if sessions break, everything breaks.
 *
 * Usage:
 *   k6 run tests/load/auth.test.js
 *   k6 run -e PROFILE=stress tests/load/auth.test.js
 */

import { sleep, check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { BASE_URL, LOAD_PROFILES, THRESHOLDS, TEST_USERS } from './config.js';
import { login, jsonGet } from './helpers.js';
import http from 'k6/http';

// Custom metrics
const loginDuration = new Trend('login_duration', true);
const loginSuccess = new Rate('login_success_rate');
const sessionCheckDuration = new Trend('session_check_duration', true);

const profile = __ENV.PROFILE || 'smoke';

export const options = {
  scenarios: {
    auth_load: LOAD_PROFILES[profile] || LOAD_PROFILES.smoke,
  },
  thresholds: {
    ...THRESHOLDS,
    'login_duration': ['p(95)<1000', 'p(99)<2000'],
    'login_success_rate': ['rate>0.98'],
  },
};

export function setup() {
  return {
    student: TEST_USERS.student,
    teacher: TEST_USERS.teacher,
  };
}

export default function (data) {
  // Alternate between student and teacher logins
  const user = Math.random() > 0.7 ? data.teacher : data.student;

  // 1. Test successful login
  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const success = check(loginRes, {
    'login returns 200': (r) => r.status === 200,
    'login body has success': (r) => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
    'login sets session cookie': (r) => {
      const cookies = r.cookies;
      return cookies && Object.keys(cookies).length > 0;
    },
    'login under 1s': (r) => r.timings.duration < 1000,
  });

  loginDuration.add(loginRes.timings.duration);
  loginSuccess.add(success ? 1 : 0);

  if (!success) {
    sleep(2);
    return;
  }

  // 2. Verify session works — hit an authenticated endpoint
  const sessionRes = jsonGet('/api/chat/resume-context');

  check(sessionRes, {
    'session check returns 200': (r) => r.status === 200,
    'session is authenticated': (r) => r.status !== 401,
  });

  sessionCheckDuration.add(sessionRes.timings.duration);

  // 3. Test invalid login (should fail gracefully, not crash)
  const badLoginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ username: 'nonexistent-user', password: 'wrong' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(badLoginRes, {
    'invalid login returns 401 or 200 with error': (r) => {
      if (r.status === 401) return true;
      try { return JSON.parse(r.body).success === false; } catch { return false; }
    },
    'invalid login does not crash': (r) => r.status < 500,
  });

  sleep(1 + Math.random() * 2);
}
