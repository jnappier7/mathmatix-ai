/**
 * Guard against duplicate greetings mid-session.
 *
 * Origin: a transcript with ~4 back-to-back "Hey Jason!" greetings interleaved
 * with the student's turns, plus stale context from a prior session. Root cause:
 * the greeting handler reuses a conversation for 30 minutes, but its only
 * anti-duplicate guards were voice-continuation and a 2-minute replay. Between 2
 * and 30 minutes — or once the student has replied — a greeting re-request (page
 * re-mount / tab refocus) fell through and appended a fresh greeting into the live
 * thread. isInProgressSession() is the predicate that now short-circuits that:
 * a conversation the student has already spoken in is a continuation, not a new
 * visit, so it must not be re-greeted.
 */
const { isInProgressSession } = require('../../routes/chat');

describe('isInProgressSession — the duplicate-greeting guard', () => {
  test('a brand-new conversation is NOT in-progress (greet normally)', () => {
    expect(isInProgressSession({ messages: [] })).toBe(false);
  });

  test('a greeting-only conversation (no student reply yet) is NOT in-progress', () => {
    // Handled by the 2-minute replay path, not this guard.
    expect(isInProgressSession({ messages: [{ role: 'assistant', content: 'Hey Jason!' }] })).toBe(false);
  });

  test('once the student has replied, it IS in-progress (continue, do not re-greet)', () => {
    expect(isInProgressSession({
      messages: [
        { role: 'assistant', content: 'Hey Jason!' },
        { role: 'user', content: 'hi' },
      ],
    })).toBe(true);
  });

  test('a real exchange is in-progress', () => {
    expect(isInProgressSession({
      messages: [
        { role: 'user', content: 'x=2 and x=3' },
        { role: 'assistant', content: 'Exactly!' },
      ],
    })).toBe(true);
  });

  test('null / missing / malformed conversations are not in-progress (safe default)', () => {
    expect(isInProgressSession(null)).toBe(false);
    expect(isInProgressSession(undefined)).toBe(false);
    expect(isInProgressSession({})).toBe(false);
    expect(isInProgressSession({ messages: null })).toBe(false);
  });
});
