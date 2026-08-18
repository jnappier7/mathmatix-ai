/**
 * GENERATOR STUBS MUST NOT GROW.
 *
 * Some lesson steps shipped with the content-generator's placeholder text still
 * in them — a practice problem that reads "Practice problem for real number
 * ordering.", answered by "Step-by-step solution for real number ordering.",
 * hinted by "Apply the concepts of real number ordering." There is no math in
 * any of it. The step renders, the tutor dutifully presents it, and the student
 * gets a lesson made of nothing.
 *
 * They were invisible until now for a second reason: these steps store the key
 * under `solution`, which the prompt builder did not read, so the prompt said
 * "Answer: undefined" and looked like a field-name bug rather than missing
 * content. utils/coursePrompt.js reads the alias now, which makes the stubs show
 * up as what they are.
 *
 * Writing real content for 27 lessons is a curriculum job, not a code change, so
 * this test does not demand they be gone. It pins the exact inventory: a NEW stub
 * cannot ship, and fixing one shows up here as a diff that shrinks the list.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

// The generator's three placeholder sentences, anchored so real prose that merely
// starts similarly does not trip them.
const STUB_PATTERNS = [
  /^Practice problem for .+\.$/i,
  /^Step-by-step solution for .+\.$/i,
  /^Apply the concepts of .+\.$/i,
];
const isStub = (v) => typeof v === 'string' && STUB_PATTERNS.some((r) => r.test(v.trim()));

// Known-bad, as of the all-courses audit. Shrink this list; never extend it.
// Each entry is a lesson step whose practice content is placeholder text.
const KNOWN_STUB_STEPS = [
  'geometry/similarity[1]',
  'geometry/coordinate_geometry[7]',
  'grade-8-math/number_system_exponents[1]',
  'grade-8-math/linear_equations[3]',
  'grade-8-math/linear_equations[6]',
  'grade-8-math/graphing_linear[9]',
  'grade-8-math/functions[5]',
  'grade-8-math/systems_equations[3]',
  'grade-8-math/geometry_transformations[2]',
  'grade-8-math/geometry_transformations[4]',
  'grade-8-math/volume_similarity[2]',
  'grade-8-math/volume_similarity[4]',
  'grade-8-math/statistics_bivariate[2]',
  'grade-8-math/statistics_bivariate[4]',
  'precalculus/function_toolkit[9]',
  'precalculus/trigonometry_foundations[12]',
  'precalculus/vectors[5]',
];

function findStubSteps() {
  const resources = path.join(ROOT, 'public/resources');
  const found = [];
  for (const file of fs.readdirSync(resources).filter((f) => f.endsWith('-pathway.json'))) {
    const pathway = JSON.parse(fs.readFileSync(path.join(resources, file), 'utf8'));
    const courseId = pathway.courseId || file.replace('-pathway.json', '');
    for (const m of pathway.modules || []) {
      if (!m.moduleFile) continue;
      const modulePath = path.join(ROOT, 'public', m.moduleFile);
      if (!fs.existsSync(modulePath)) continue;
      const md = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
      (md.scaffold || []).forEach((step, i) => {
        const values = [step.content, step.text];
        (step.problems || []).forEach((p) => values.push(
          p.question, p.problem, p.answer, p.solution, p.hint, ...(p.hints || [])));
        (step.examples || []).forEach((e) => values.push(e.problem, e.solution, e.explanation));
        if (values.some(isStub)) found.push(`${courseId}/${m.moduleId}[${i}]`);
      });
    }
  }
  return found;
}

describe('placeholder lesson content', () => {
  const found = findStubSteps();

  test('no course has gained a new generator stub', () => {
    const added = found.filter((s) => !KNOWN_STUB_STEPS.includes(s));
    expect(added).toEqual([]);
  });

  test('the inventory is accurate — a fixed step must be removed from the list', () => {
    const stale = KNOWN_STUB_STEPS.filter((s) => !found.includes(s));
    expect(stale).toEqual([]);
  });

  test('the debt is bounded and shrinking, never growing', () => {
    expect(found.length).toBeLessThanOrEqual(KNOWN_STUB_STEPS.length);
  });

  test('the courses that were clean stay clean', () => {
    const tainted = new Set(found.map((s) => s.split('/')[0]));
    ['consumer-math', '6th-grade-math', '7th-grade-math', 'act-prep',
      'algebra-2', 'ap-calculus-ab', 'calculus-bc', 'early-math-foundations',
      'parent-math-k2', 'parent-math-35', 'parent-math-68',
    ].forEach((c) => expect([...tainted]).not.toContain(c));
  });
});
