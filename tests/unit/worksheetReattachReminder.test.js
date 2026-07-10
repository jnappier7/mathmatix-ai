/**
 * Worksheet re-attach reminder — the SYSTEM note placed next to a worksheet
 * IMAGE that is re-threaded on a FOLLOW-UP turn ("check #4", "what answer did
 * I get?"), when the student did NOT attach anything this turn.
 *
 * Regression for the geometry-homework-check bug: a student uploaded a
 * problem set, then asked the tutor to check specific problems. On the
 * follow-up turn the worksheet image WAS re-threaded into context, but the
 * reminder reused from the fresh-upload path ("uploaded with this message",
 * image "above") read as false — nothing was attached "this message" and the
 * image sits BELOW the text. The model latched onto that and deflected with
 * "I actually can't see your uploaded work from my end right now," breaking
 * the whole homework-check feature.
 *
 * The follow-up reminder must describe the situation accurately so the model
 * reads the re-attached image instead of denying it can see it.
 */

const {
  UPLOAD_CONTEXT_REMINDER,
  WORKSHEET_REATTACH_REMINDER,
} = require('../../utils/visualCapabilities');

describe('WORKSHEET_REATTACH_REMINDER — follow-up turn worksheet re-thread', () => {
  it('is exported as a non-empty string', () => {
    expect(typeof WORKSHEET_REATTACH_REMINDER).toBe('string');
    expect(WORKSHEET_REATTACH_REMINDER.length).toBeGreaterThan(0);
  });

  it('is distinct from the fresh-upload reminder', () => {
    // The whole point: the follow-up turn must NOT reuse the upload-turn wording.
    expect(WORKSHEET_REATTACH_REMINDER).not.toBe(UPLOAD_CONTEXT_REMINDER);
  });

  it('frames the worksheet as uploaded EARLIER, not "with this message"', () => {
    // The misleading fresh-upload phrasing must be gone.
    expect(WORKSHEET_REATTACH_REMINDER).not.toMatch(/with this message/i);
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/earlier/i);
  });

  it('does not claim the image is "above" (it is re-attached below the text)', () => {
    expect(WORKSHEET_REATTACH_REMINDER).not.toMatch(/\babove\b/i);
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/\bbelow\b/i);
  });

  it('asserts the tutor CAN see the image', () => {
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/you can see/i);
  });

  it('explicitly forbids the "can\'t see it right now" deflection', () => {
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/can'?t see it right now/i);
  });

  it('forbids asking the student to re-upload or re-type their work', () => {
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/re-?upload/i);
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/re-?type/i);
  });

  it('is wrapped as a SYSTEM note so the tutor does not echo it', () => {
    expect(WORKSHEET_REATTACH_REMINDER).toMatch(/^\[SYSTEM:/);
    expect(WORKSHEET_REATTACH_REMINDER.trim()).toMatch(/\]$/);
  });
});
