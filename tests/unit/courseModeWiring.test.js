/**
 * Course mode must reach the pipeline from BOTH entry points.
 *
 * Owner report, 2026-07-29 (second round): a course lesson kept asking
 * "what do you want to work on?" even after the first fix. Root cause was
 * a wiring gap, not logic — the fix keyed on ctx._course, which only
 * /api/course-chat sets, while chat.html sends every course turn to
 * /api/chat ("all chat goes through /api/chat", script.js). So the
 * student's-lead course guard and the plan-layer suppression never fired
 * in production.
 *
 * The route handler needs a live DB to exercise end to end, so the wiring
 * is pinned at the source level — the same approach
 * growthCheckGrading.test.js uses for "no route grades against
 * problem.correctAnswer". The behavior these flags drive is unit-tested in
 * courseLeadGuard.test.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('pipeline derives course mode from either entry point', () => {
  const src = read('utils/pipeline/index.js');

  test('inCourseLesson accepts ctx._course OR ctx.isCourseMode', () => {
    expect(src).toMatch(/const inCourseLesson = !!\(ctx\._course \|\| ctx\.isCourseMode\)/);
  });

  test('both consumers use the derived flag, not ctx._course directly', () => {
    expect(src).toMatch(/isCourseMode: inCourseLesson/);          // decide()
    expect(src).toMatch(/if \(tutorPlan && !inCourseLesson\)/);   // plan-layer skip
    // No consumer may regress to the _course-only test.
    expect(src).not.toMatch(/isCourseMode: !!ctx\._course/);
    expect(src).not.toMatch(/if \(tutorPlan && !ctx\._course\)/);
  });
});

describe('/api/chat threads course mode (chat.html sends course turns here)', () => {
  const src = read('routes/chat.js');

  test('courseModeActive is set where the course prompt is built', () => {
    expect(src).toMatch(/let courseModeActive = false/);
    expect(src).toMatch(/courseModeActive = true;\s*\n\s*systemPrompt = buildCourseSystemPrompt/);
  });

  test('runPipeline receives isCourseMode', () => {
    expect(src).toMatch(/isCourseMode: courseModeActive/);
  });

  test('re-entry after an idle gap resumes the module instead of asking', () => {
    expect(src).toMatch(/RETURNING STUDENT, MID-COURSE/);
    const courseBranch = src.slice(
      src.indexOf('RETURNING STUDENT, MID-COURSE'),
      src.indexOf('RETURNING STUDENT, MID-COURSE') + 700
    );
    expect(courseBranch).toMatch(/CONTINUE THE MODULE/);
    expect(courseBranch).toMatch(/Do NOT ask what they want to work on/);
  });

  test('the open-tutoring re-entry text still exists for non-course sessions', () => {
    expect(src).toMatch(/ask what they'd like to work on today/);
  });
});

describe('one lesson, one greeting', () => {
  const src = read('public/js/script.js');

  test('the generic chat greeting is skipped inside a course lesson', () => {
    const idx = src.indexOf('activeCourseSessionId) {\n                console.log(\'[Chat] Course lesson active');
    expect(idx).toBeGreaterThan(-1);
    // The bail-out must come BEFORE the generic greeting request fires.
    const greetingCall = src.indexOf("JSON.stringify({ isGreeting: true, skipCourse: true })");
    expect(greetingCall).toBeGreaterThan(idx);
  });
});
