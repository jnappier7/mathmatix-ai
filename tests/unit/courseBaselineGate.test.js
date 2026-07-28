/**
 * The course baseline gate.
 *
 * THE BUG: on enroll AND activate, courseCatalog fired sendCourseGreeting()
 * unconditionally, right after showing the diagnostic card. The greeting is the
 * tutor introducing module 1 ("what is a real number"), so it started teaching
 * BEFORE the baseline ran — every course, every time. The baseline never gated
 * anything, so it never adapted the plan, and (per the owner) the full ACT test
 * was never seen to trigger anything.
 *
 * The fix routes both call sites through beginTeachingUnlessBaselinePending() and
 * fires the held greeting from onBaselineComplete() when the test finishes. These
 * tests exercise those two methods directly.
 *
 * courseCatalog.js only auto-instantiates inside a DOMContentLoaded handler, so a
 * minimal `document` stub lets it load in node; the methods are called on a stub
 * `this` so the DOM-heavy constructor never runs.
 */

global.document = global.document || { addEventListener() {} };
const { CourseManager } = require('../../public/js/courseCatalog');

const proto = CourseManager.prototype;
const makeCtx = () => ({ sendCourseGreeting: jest.fn() });

describe('beginTeachingUnlessBaselinePending', () => {
  test('a required baseline holds the greeting', () => {
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, { type: 'act-practice', required: true });
    expect(ctx.sendCourseGreeting).not.toHaveBeenCalled();
    expect(ctx._baselinePending).toBe(true);
  });

  test('no diagnostic starts teaching immediately', () => {
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, null);
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1);
    expect(ctx._baselinePending).toBe(false);
  });

  test('a non-required (optional) diagnostic does not block teaching', () => {
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, { type: 'starting-point', required: false });
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1);
  });
});

describe('onBaselineComplete', () => {
  test('fires the greeting that was held back — exactly once', () => {
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, { required: true });
    expect(ctx.sendCourseGreeting).not.toHaveBeenCalled();

    proto.onBaselineComplete.call(ctx);
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1);
    expect(ctx._baselinePending).toBe(false);
  });

  test('does nothing when no baseline was pending — no double greeting', () => {
    // A course that started teaching immediately must not greet again if a stray
    // completion hook fires (e.g. a cancelled ACT test that somehow calls it).
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, null); // greets once
    proto.onBaselineComplete.call(ctx);                       // must be a no-op
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1);
  });

  test('a second completion call does not re-greet', () => {
    const ctx = makeCtx();
    proto.beginTeachingUnlessBaselinePending.call(ctx, { required: true });
    proto.onBaselineComplete.call(ctx);
    proto.onBaselineComplete.call(ctx);
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1);
  });
});

describe('the enroll/activate sequence a student actually hits', () => {
  test('ACT prep: card shown, no teaching, then the test finishes and teaching begins', () => {
    const ctx = makeCtx();
    // enroll returns a required act-practice diagnostic
    proto.beginTeachingUnlessBaselinePending.call(ctx, { type: 'act-practice', required: true });
    expect(ctx.sendCourseGreeting).not.toHaveBeenCalled(); // the reported bug is gone

    // student takes the baseline; act-test.close() calls this on completion
    proto.onBaselineComplete.call(ctx);
    expect(ctx.sendCourseGreeting).toHaveBeenCalledTimes(1); // now it teaches, adapted
  });
});

// ── active-exchange guard (pure half) ──────────────────────────────────────
describe('assistantSpokeWithin — the anti-collision guard', () => {
  const { assistantSpokeWithin } = require('../../utils/activeConversation');
  const NOW = Date.parse('2026-07-28T08:00:00Z');

  test('a tutor message 30s ago → mid-exchange, greeting must defer', () => {
    const msgs = [
      { role: 'user', content: 'ok', timestamp: new Date(NOW - 40_000) },
      { role: 'assistant', content: 'kicking off sequences…', timestamp: new Date(NOW - 30_000) },
    ];
    expect(assistantSpokeWithin(msgs, 2 * 60 * 1000, NOW)).toBe(true);
  });

  test('a tutor message 10min ago → clear to greet', () => {
    const msgs = [{ role: 'assistant', content: 'earlier', timestamp: new Date(NOW - 10 * 60_000) }];
    expect(assistantSpokeWithin(msgs, 2 * 60 * 1000, NOW)).toBe(false);
  });

  test('trailing user messages do not mask the newest assistant timestamp', () => {
    const msgs = [
      { role: 'assistant', content: 'fresh', timestamp: new Date(NOW - 20_000) },
      { role: 'user', content: 'ok', timestamp: new Date(NOW - 5_000) },
    ];
    expect(assistantSpokeWithin(msgs, 2 * 60 * 1000, NOW)).toBe(true);
  });

  test('empty / junk history never defers', () => {
    expect(assistantSpokeWithin([], 120000, NOW)).toBe(false);
    expect(assistantSpokeWithin(null, 120000, NOW)).toBe(false);
    expect(assistantSpokeWithin([{ role: 'assistant', content: 'x' }], 120000, NOW)).toBe(false);
  });
});
