/**
 * Load Test: Chat API (/api/chat)
 *
 * Tests the core tutoring chat pipeline under load.
 * This is the most critical endpoint — it chains:
 *   DB lookup → prompt construction → LLM call → post-processing → DB write
 *
 * Usage:
 *   # Smoke test (1 VU, 30s)
 *   k6 run tests/load/chat.test.js
 *
 *   # Peak traffic simulation
 *   k6 run -e PROFILE=peak tests/load/chat.test.js
 *
 *   # Against staging
 *   k6 run -e BASE_URL=https://staging.mathmatix.ai -e PROFILE=average tests/load/chat.test.js
 *
 *   # Custom VU count
 *   k6 run --vus 30 --duration 5m tests/load/chat.test.js
 */

import { sleep, check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { LOAD_PROFILES, CHAT_THRESHOLDS, TEST_USERS } from './config.js';
import { login, jsonPost, jsonGet, randomStudentMessage, studentThinkTime } from './helpers.js';

// Custom metrics
const chatResponseTime = new Trend('chat_response_time', true);
const chatErrors = new Counter('chat_errors');
const messagesExchanged = new Counter('messages_exchanged');

// Select load profile from env or default to smoke
const profile = __ENV.PROFILE || 'smoke';

export const options = {
  scenarios: {
    chat_load: LOAD_PROFILES[profile] || LOAD_PROFILES.smoke,
  },
  thresholds: CHAT_THRESHOLDS,
};

// Runs once per VU before iterations start
export function setup() {
  return {
    student: TEST_USERS.student,
  };
}

export default function (data) {
  // 1. Authenticate
  const loggedIn = login(data.student.username, data.student.password);
  if (!loggedIn) {
    chatErrors.add(1);
    sleep(5);
    return;
  }

  // 2. Check for resume context (what students see on page load)
  const resumeRes = jsonGet('/api/chat/resume-context');
  check(resumeRes, {
    'resume-context status 200': (r) => r.status === 200,
  });

  // 3. Send a greeting to start the session
  const greetingRes = jsonPost('/api/chat/', {
    message: '',
    isGreeting: true,
  });

  const greetingOk = check(greetingRes, {
    'greeting status 200': (r) => r.status === 200,
    'greeting has response': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.response && body.response.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (!greetingOk) {
    chatErrors.add(1);
    console.error(`Greeting failed: ${greetingRes.status} ${greetingRes.body}`);
    sleep(5);
    return;
  }

  chatResponseTime.add(greetingRes.timings.duration);
  messagesExchanged.add(1);

  // 4. Simulate a student conversation (2-4 message exchanges)
  const numMessages = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < numMessages; i++) {
    // Simulate think time before responding
    sleep(studentThinkTime());

    const message = randomStudentMessage();
    const startTime = Date.now();

    const chatRes = jsonPost('/api/chat/', {
      message,
      responseTime: 5000 + Math.floor(Math.random() * 20000), // simulated response time
    });

    const duration = Date.now() - startTime;
    chatResponseTime.add(duration);

    const chatOk = check(chatRes, {
      'chat status 200': (r) => r.status === 200,
      'chat has AI response': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.response && body.response.length > 0;
        } catch {
          return false;
        }
      },
      'chat response under 15s': (r) => r.timings.duration < 15000,
    });

    if (chatOk) {
      messagesExchanged.add(1);
    } else {
      chatErrors.add(1);
      console.warn(`Chat message ${i + 1} failed: ${chatRes.status}`);
    }
  }

  // 5. Track time (fires periodically from the client)
  const trackRes = jsonPost('/api/chat/track-time', {
    activeSeconds: 30 + Math.floor(Math.random() * 60),
  });

  check(trackRes, {
    'track-time status 200': (r) => r.status === 200,
  });

  // 6. Check last session (happens on next visit)
  const lastSessionRes = jsonGet('/api/chat/last-session');
  check(lastSessionRes, {
    'last-session status 200': (r) => r.status === 200,
  });
}
