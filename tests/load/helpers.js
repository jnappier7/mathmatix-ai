/**
 * Shared helpers for k6 load tests.
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL } from './config.js';

/**
 * Authenticate a user and return the session cookie jar.
 * k6 automatically manages cookies per VU when using http.CookieJar.
 *
 * @param {string} username
 * @param {string} password
 * @returns {boolean} true if login succeeded
 */
export function login(username, password) {
  const res = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ username, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      redirects: 0,  // don't follow redirects, just capture the cookie
    }
  );

  const success = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login response has success': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.error(`Login failed for ${username}: ${res.status} ${res.body}`);
  }

  return success;
}

/**
 * Standard JSON POST request with session cookies.
 */
export function jsonPost(path, body, params = {}) {
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...params.headers,
    },
    ...params,
  });
}

/**
 * Standard GET request with session cookies.
 */
export function jsonGet(path, params = {}) {
  return http.get(`${BASE_URL}${path}`, {
    headers: {
      'Accept': 'application/json',
      ...params.headers,
    },
    ...params,
  });
}

/**
 * Generate a random math message that a student might type.
 */
export function randomStudentMessage() {
  const messages = [
    'What is 3/4 + 1/2?',
    'Can you help me with fractions?',
    'I think the answer is 7',
    'How do I solve 2x + 5 = 15?',
    'What does perpendicular mean?',
    'Can you explain long division?',
    'I got 42, is that right?',
    'Help me with this word problem: If Sally has 12 apples and gives away 5, how many are left?',
    'What is the area of a rectangle that is 6cm by 4cm?',
    'I don\'t understand how to multiply decimals',
    'What is 15% of 80?',
    'Can you show me how to simplify 12/18?',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Think time — simulates realistic user pauses between actions.
 * Students typically take 5-30 seconds between messages.
 */
export function studentThinkTime() {
  // k6 sleep is imported in the test files
  return 5 + Math.random() * 25;  // 5-30 seconds
}

/**
 * Shorter think time for screener (students answering MCQ).
 */
export function screenerThinkTime() {
  return 3 + Math.random() * 12;  // 3-15 seconds
}
