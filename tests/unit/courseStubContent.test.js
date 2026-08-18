/**
 * NO COURSE MAY SHIP PLACEHOLDER LESSON CONTENT.
 *
 * The content generator used to leave its own scaffolding behind in place of
 * math — a practice problem reading "Practice problem for real number
 * ordering.", answered by "Step-by-step solution for real number ordering.",
 * hinted by "Apply the concepts of real number ordering." There was no math in
 * any of it. The step rendered, the tutor dutifully presented it, and the
 * student got a lesson made of nothing.
 *
 * 27 such steps shipped across four courses (grade-8-math 12, geometry 8,
 * algebra-1 4, precalculus 3). They were invisible for a second reason: they
 * stored the key under `solution`, which the prompt builder did not read, so the
 * prompt said "Answer: undefined" and looked like a field-name bug rather than
 * missing content.
 *
 * All 27 now have real, verified problems. This file started as a ratchet on a
 * known-bad list; with the list empty it becomes the simpler assertion — zero,
 * anywhere, ever. A regenerated bank that reintroduces the pattern fails here.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

// The generator's three placeholder sentences, anchored so real prose that
// merely starts similarly does not trip them.
const STUB_PATTERNS = [
  /^Practice problem for .+\.$/i,
  /^Step-by-step solution for .+\.$/i,
  /^Apply the concepts of .+\.$/i,
];
const isStub = (v) => typeof v === 'string' && STUB_PATTERNS.some((r) => r.test(v.trim()));

function scanCourses() {
  const resources = path.join(ROOT, 'public/resources');
  const found = [];
  let stepsScanned = 0;
  const courses = new Set();

  for (const file of fs.readdirSync(resources).filter((f) => f.endsWith('-pathway.json'))) {
    const pathway = JSON.parse(fs.readFileSync(path.join(resources, file), 'utf8'));
    const courseId = pathway.courseId || file.replace('-pathway.json', '');
    courses.add(courseId);
    for (const m of pathway.modules || []) {
      if (!m.moduleFile) continue;
      const modulePath = path.join(ROOT, 'public', m.moduleFile);
      if (!fs.existsSync(modulePath)) continue;
      const md = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
      (md.scaffold || []).forEach((step, i) => {
        stepsScanned += 1;
        const values = [step.content, step.text];
        (step.problems || []).forEach((p) => values.push(
          p.question, p.problem, p.answer, p.solution, p.hint, ...(p.hints || [])));
        (step.examples || []).forEach((e) => values.push(e.problem, e.solution, e.explanation));
        if (values.some(isStub)) found.push(`${courseId}/${m.moduleId}[${i}]`);
      });
      (md.assessmentProblems || []).forEach((p, i) => {
        if (isStub(p.question) || isStub(p.answer)) found.push(`${courseId}/${m.moduleId} assessment[${i}]`);
      });
    }
  }
  return { found, stepsScanned, courses };
}

describe('placeholder lesson content', () => {
  const { found, stepsScanned, courses } = scanCourses();

  test('the scan actually reached every course', () => {
    expect(courses.size).toBeGreaterThanOrEqual(15);
    expect(stepsScanned).toBeGreaterThan(1000);
  });

  test('no scaffold step anywhere contains generator placeholder text', () => {
    expect(found).toEqual([]);
  });

  test('the detector still recognises the pattern it is guarding against', () => {
    // Without this, a broken regex would make the suite pass vacuously.
    expect(isStub('Practice problem for real number ordering.')).toBe(true);
    expect(isStub('Step-by-step solution for exterior angle theorem.')).toBe(true);
    expect(isStub('Apply the concepts of sector area.')).toBe(true);
    // And does not fire on real content that happens to start similarly.
    expect(isStub('Practice problems like this one appear on every exam, so work carefully.')).toBe(false);
    expect(isStub('Apply the concepts you just learned to the triangle below, then check your work.')).toBe(false);
    expect(isStub('Solve 3x² - 75 = 0 by taking square roots.')).toBe(false);
  });
});
