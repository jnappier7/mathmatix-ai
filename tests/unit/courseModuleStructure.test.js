/**
 * EVERY COURSE MODULE MUST BE STRUCTURALLY SOUND.
 *
 * scripts/qaModule.js used to be a manual one-module-at-a-time tool that nobody
 * could act on, because it failed on essentially every module. Its rule was
 * "every lesson has all four phases", and that is simply not how these modules
 * are built: 82 of 128 carry a single mixed independent_practice at the end
 * rather than one per lesson, and the parent guides deliberately have none at
 * all. A check that is always red hides the checks that matter — in this case it
 * masked 31 lessons that were drilled but never taught, and a module that
 * promised to teach the coordinate plane and didn't.
 *
 * The rules now enforced (see scripts/qaModule.js for why each one earns its
 * place) hold for all 232 modules today, so any regression is a real one. This
 * test runs them in CI so the tool cannot drift back into always-red noise.
 */

const fs = require('fs');
const path = require('path');
const { checkModule, allModulePaths, RENDERABLE_TYPES } = require('../../scripts/qaModule');

const ROOT = path.join(__dirname, '../..');
const MODULES = allModulePaths(ROOT).map((m) => ({
  ...m, data: JSON.parse(fs.readFileSync(m.file, 'utf8')),
}));
const results = MODULES.map((m) => ({
  label: `${m.courseId}/${m.moduleId}`, ...checkModule(m.data, `${m.courseId}/${m.moduleId}`),
}));

describe('course module structure', () => {
  test('the sweep actually reached every module', () => {
    expect(MODULES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(MODULES.map((m) => m.courseId)).size).toBeGreaterThanOrEqual(15);
  });

  test('no module has a structural failure', () => {
    const failing = results
      .filter((r) => r.failures.length)
      .map((r) => `${r.label}: ${r.failures.join('; ')}`);
    expect(failing).toEqual([]);
  });
});

describe('the specific defects this was built to catch', () => {
  // Each of these was a real, shipped bug. Asserting them by name means a
  // regression reports its own cause instead of a generic "structure failed".
  const flat = (pred) => results.flatMap((r) => r.failures.filter(pred).map((f) => `${r.label}: ${f}`));

  test('no lesson is practised without being taught', () => {
    expect(flat((f) => f.includes('never taught'))).toEqual([]);
  });

  test('no lesson is taught and then never practised', () => {
    expect(flat((f) => f.includes('never practised'))).toEqual([]);
  });

  test('no step is tagged with a lesson the module does not declare', () => {
    expect(flat((f) => f.includes('not in lessons[]'))).toEqual([]);
  });

  test('every problem has an answer the tutor can reach', () => {
    expect(flat((f) => f.includes('has no answer'))).toEqual([]);
  });

  test('every scaffold step has a type coursePrompt can render', () => {
    expect(flat((f) => f.includes('unrenderable type'))).toEqual([]);
    // The renderable set must stay in step with formatScaffoldStep's switch.
    const src = fs.readFileSync(path.join(ROOT, 'utils/coursePrompt.js'), 'utf8');
    for (const type of RENDERABLE_TYPES) expect(src).toContain(`case '${type}':`);
  });
});

describe('the checker itself still has teeth', () => {
  // Without this, a rule that silently stopped firing would look like success.
  const base = { lessons: [{ lessonId: 'l1' }], answerKeys: {} };
  const step = (over) => ({ type: 'explanation', lessonId: 'l1', title: 't', ...over });

  test('catches a lesson that is never taught', () => {
    const { failures } = checkModule({ ...base,
      scaffold: [step({ type: 'guided_practice', problems: [{ id: 'p', answer: '1' }] })] });
    expect(failures.join(' ')).toMatch(/never taught/);
  });

  test('catches an undeclared lessonId', () => {
    const { failures } = checkModule({ ...base, scaffold: [step({ lessonId: 'nope' })] });
    expect(failures.join(' ')).toMatch(/not in lessons\[\]/);
  });

  test('catches an unrenderable step type', () => {
    const { failures } = checkModule({ ...base, scaffold: [step({ type: 'video' })] });
    expect(failures.join(' ')).toMatch(/unrenderable type/);
  });

  test('catches a problem with no answer anywhere', () => {
    const { failures } = checkModule({ ...base,
      scaffold: [step(), step({ type: 'guided_practice', problems: [{ id: 'p', question: 'q' }] })] });
    expect(failures.join(' ')).toMatch(/has no answer/);
  });

  test('accepts an answer supplied inline OR via answerKeys', () => {
    const inline = checkModule({ ...base,
      scaffold: [step(), step({ type: 'guided_practice', problems: [{ id: 'p', answer: '1' }] })] });
    const viaKeys = checkModule({ ...base, answerKeys: { p: '1' },
      scaffold: [step(), step({ type: 'guided_practice', problems: [{ id: 'p', question: 'q' }] })] });
    expect(inline.failures).toEqual([]);
    expect(viaKeys.failures).toEqual([]);
  });

  test('a single module-wide you-do satisfies every lesson, as the modules intend', () => {
    const { failures } = checkModule({
      lessons: [{ lessonId: 'a' }, { lessonId: 'b' }], answerKeys: {},
      scaffold: [
        { type: 'explanation', lessonId: 'a', title: 'a' },
        { type: 'explanation', lessonId: 'b', title: 'b' },
        { type: 'independent_practice', lessonId: 'a', title: 'mixed' },
      ],
    });
    expect(failures).toEqual([]);
  });
});
