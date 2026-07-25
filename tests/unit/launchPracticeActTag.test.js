/**
 * <LAUNCH_PRACTICE_ACT> is handled at the shared pipeline choke point (verify),
 * not only in courseAdapter.
 *
 * The ACT-prep tutor emits this control tag once the student confirms they want
 * the real timed test. Production routes ALL typed messages through /api/chat,
 * which runs the pipeline (→ verify) but NOT courseAdapter — so when the tag was
 * only stripped/flagged in courseAdapter, a student who asked "can I take a
 * practice ACT?" in normal chat got the raw tag leaked into the reply and the
 * test never launched. Extracting it in verify fixes both paths at once.
 */

const { extractSystemTags } = require('../../utils/pipeline/verify');

describe('extractSystemTags: LAUNCH_PRACTICE_ACT', () => {
  test('strips the tag from student-facing text and sets the flag', () => {
    const raw = "Great — let's do the real thing. Starting your practice ACT now.\n<LAUNCH_PRACTICE_ACT>";
    const { text, extracted } = extractSystemTags(raw);
    expect(extracted.launchPracticeAct).toBe(true);
    expect(text).not.toMatch(/LAUNCH_PRACTICE_ACT/i);
    expect(text).not.toContain('<');
    expect(text).toContain('practice ACT now');
  });

  test('is case/whitespace tolerant', () => {
    const { text, extracted } = extractSystemTags('ok < launch_practice_act >');
    expect(extracted.launchPracticeAct).toBe(true);
    expect(text).toBe('ok');
  });

  test('defaults to false when the tutor did not emit it', () => {
    const { extracted } = extractSystemTags('Let me ask you a question first.');
    expect(extracted.launchPracticeAct).toBe(false);
  });
});
