// tests/unit/courseVoiceBlocks.test.js
//
// Course chat must carry the same voice rules as open tutoring.
//
// Production evidence (owner's AP Calc transcript, 2026-07-28): the "Sure!
// Let's take a closer look" probe-on-correct-work pattern — banned in the
// open-chat prompt since 2026-07-26 — reappeared verbatim in COURSE chat,
// because buildCourseSystemPrompt never included the OPENERS / ARITHMETIC
// DIGNITY blocks. These pins make the shared blocks a contract: any prompt a
// student reads includes them.
//
// Also pins the owner's course-direction rule (2026-07-28): "during a course
// chat the direction is set — no 'did you have something else in mind?'"

const { buildCourseSystemPrompt } = require('../../utils/coursePrompt');
const { SHARED_VOICE_BLOCKS } = require('../../utils/promptCompact');

const prompt = (courseId = 'ap-calculus-ab') => buildCourseSystemPrompt({
  userProfile: { firstName: 'Jason' },
  tutorProfile: { name: 'Mr. Nappier' },
  pathway: { track: courseId, modules: [] },
  scaffoldData: { scaffold: [] },
  currentModule: { title: 'Function Behavior & Rational Functions' },
  courseSession: { courseId, courseName: courseId, modules: [] },
});

describe('course prompts carry the shared voice blocks', () => {
  test('OPENERS ban is present (no "Sure!" filler in course chat)', () => {
    const p = prompt();
    expect(p).toContain('--- OPENERS (MANDATORY) ---');
    expect(p).toMatch(/Never open a reply with filler: "Sure!"/);
  });

  test('ARITHMETIC DIGNITY is present (no probing 3.5×4 at an AP student)', () => {
    const p = prompt();
    expect(p).toContain('--- ARITHMETIC DIGNITY (MANDATORY) ---');
    // The transcript failure: work shown as "100-3.5(4)=100-14=86" and the
    // tutor asked how they got from 3.5×4 to 14. The block now names it.
    expect(p).toMatch(/the work IS the explanation/);
  });

  test('the shared blocks are the SAME text as open tutoring (single source)', () => {
    expect(prompt()).toContain(SHARED_VOICE_BLOCKS);
  });
});

describe('course direction is set (owner policy, 2026-07-28)', () => {
  test('the course prompt forbids open-ended direction offers', () => {
    const p = prompt();
    expect(p).toContain('--- COURSE DIRECTION (MANDATORY) ---');
    expect(p).toMatch(/did you have something else in mind/);
    expect(p).toMatch(/what do you want to tackle next/);
  });

  test('applies to every course, not just one track', () => {
    for (const id of ['act-prep', 'algebra-1', 'geometry']) {
      expect(prompt(id)).toContain('--- COURSE DIRECTION (MANDATORY) ---');
    }
  });
});

describe('open-chat prompt is unchanged by the extraction', () => {
  test('STATIC_RULES still contains both blocks verbatim', () => {
    const { STATIC_RULES } = require('../../utils/promptCompact');
    expect(STATIC_RULES).toContain('--- OPENERS (MANDATORY) ---');
    expect(STATIC_RULES).toContain('--- ARITHMETIC DIGNITY (MANDATORY) ---');
  });
});
