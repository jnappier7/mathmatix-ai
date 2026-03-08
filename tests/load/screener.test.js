/**
 * Load Test: Adaptive Screener API (/api/screener)
 *
 * Tests the IRT-based placement test flow under load.
 * This is the first experience for new students — high impact on signup conversion.
 *
 * Flow: start → (next-problem → submit-answer) × N → report
 *
 * Usage:
 *   k6 run tests/load/screener.test.js
 *   k6 run -e PROFILE=peak tests/load/screener.test.js
 */

import { sleep, check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { LOAD_PROFILES, SCREENER_THRESHOLDS, TEST_USERS } from './config.js';
import { login, jsonPost, jsonGet, screenerThinkTime } from './helpers.js';

// Custom metrics
const screenerResponseTime = new Trend('screener_response_time', true);
const problemsFetched = new Counter('problems_fetched');
const answersSubmitted = new Counter('answers_submitted');
const screenerErrors = new Counter('screener_errors');

const profile = __ENV.PROFILE || 'smoke';

export const options = {
  scenarios: {
    screener_load: LOAD_PROFILES[profile] || LOAD_PROFILES.smoke,
  },
  thresholds: SCREENER_THRESHOLDS,
};

export function setup() {
  return { student: TEST_USERS.student };
}

/**
 * Simulate a random answer to a problem.
 * In load testing we don't need correct answers — we're testing throughput.
 */
function randomAnswer(problem) {
  if (problem && problem.options && problem.options.length > 0) {
    // MCQ: pick a random option
    const idx = Math.floor(Math.random() * problem.options.length);
    return problem.options[idx];
  }
  // Free-response: return a number
  return String(Math.floor(Math.random() * 20));
}

export default function (data) {
  // 1. Authenticate
  const loggedIn = login(data.student.username, data.student.password);
  if (!loggedIn) {
    screenerErrors.add(1);
    sleep(5);
    return;
  }

  // 2. Start a screener session (Growth Check to avoid overwriting placement data)
  const startRes = jsonPost('/api/screener/start', {
    isGrowthCheck: true,
  });

  const startOk = check(startRes, {
    'screener start status 200': (r) => r.status === 200,
    'screener session created': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.sessionId || body.session;
      } catch {
        return false;
      }
    },
  });

  if (!startOk) {
    screenerErrors.add(1);
    console.error(`Screener start failed: ${startRes.status} ${startRes.body}`);
    sleep(5);
    return;
  }

  screenerResponseTime.add(startRes.timings.duration);

  // 3. Answer 5-10 questions (typical Growth Check length)
  const numQuestions = 5 + Math.floor(Math.random() * 6);

  for (let i = 0; i < numQuestions; i++) {
    // Fetch next problem
    const nextRes = jsonGet('/api/screener/next-problem');

    const nextOk = check(nextRes, {
      'next-problem status 200': (r) => r.status === 200,
      'next-problem has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.problem || body.completed;
        } catch {
          return false;
        }
      },
    });

    if (!nextOk) {
      screenerErrors.add(1);
      console.warn(`next-problem ${i + 1} failed: ${nextRes.status}`);
      break;
    }

    screenerResponseTime.add(nextRes.timings.duration);
    problemsFetched.add(1);

    // Check if screener is already complete
    let nextBody;
    try {
      nextBody = JSON.parse(nextRes.body);
    } catch {
      break;
    }
    if (nextBody.completed) break;

    // Simulate student thinking
    sleep(screenerThinkTime());

    // Submit answer
    const answer = randomAnswer(nextBody.problem);
    const submitRes = jsonPost('/api/screener/submit-answer', {
      answer,
      problemId: nextBody.problem?.problemId || nextBody.problem?._id,
      responseTime: 3000 + Math.floor(Math.random() * 12000),
    });

    const submitOk = check(submitRes, {
      'submit-answer status 200': (r) => r.status === 200,
    });

    if (submitOk) {
      answersSubmitted.add(1);
    } else {
      screenerErrors.add(1);
      console.warn(`submit-answer ${i + 1} failed: ${submitRes.status}`);
    }

    screenerResponseTime.add(submitRes.timings.duration);
  }

  // 4. Fetch final report
  const reportRes = jsonGet('/api/screener/report');

  check(reportRes, {
    'report status 200': (r) => r.status === 200,
  });

  screenerResponseTime.add(reportRes.timings.duration);
}
