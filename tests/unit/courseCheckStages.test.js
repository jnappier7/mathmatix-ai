/**
 * The quick check's stages, and which items it may show (pure halves; the
 * routes are driven against a real database in
 * tests/integration/coursePlacementClosesModules.test.js).
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

const { buildStageBlueprint, courseSkills } = require('../../utils/coursePreAssessment');
const { isCheckable } = require('../../utils/coursePlacementService');
const { skillLookupCandidates } = require('../../utils/skillCanonicalizer');

const PATHWAY = {
  modules: [
    { moduleId: 'u1', title: 'Unit 1', skills: ['a', 'b', 'c'] },
    { moduleId: 'cp1', title: 'Checkpoint 1', isCheckpoint: true, skills: ['a', 'b', 'c'] },
    { moduleId: 'u2', title: 'Unit 2', skills: ['d', 'e'] },
    { moduleId: 'u3', title: 'Unit 3', skills: ['f', 'g', 'h', 'i', 'j', 'k'] },
    { moduleId: 'review', title: 'Review', skills: ['a', 'd', 'f', 'z'] },
    { moduleId: 'final', title: 'Final', isCheckpoint: true, skills: [] },
  ],
};
const all = (n) => Object.fromEntries(courseSkills(PATHWAY).map((s) => [s.skillId, n]));
const ids = (bp) => bp.skills.map((s) => s.skillId);

describe('buildStageBlueprint', () => {
  test('takes whole modules from the first open one, up to ten skills', () => {
    const bp = buildStageBlueprint(PATHWAY, { available: all(8) });
    expect(ids(bp)).toEqual(['a', 'b', 'c', 'd', 'e']);          // u3 (6 more) would not fit whole
    expect(bp.modules.map((m) => m.moduleId)).toEqual(['u1', 'u2']);   // the checkpoint is not a unit to list
    expect(bp.totalItems).toBe(10);
  });

  test('skips what is done and never re-asks an owned skill', () => {
    const bp = buildStageBlueprint(PATHWAY, {
      completed: ['u1', 'cp1', 'u2'], owned: ['a', 'b', 'c', 'd', 'e'], available: all(8),
    });
    // Unit 3 whole, and the review's one new skill rides along in the room left.
    expect(ids(bp)).toEqual(['f', 'g', 'h', 'i', 'j', 'k', 'z']);
    const next = buildStageBlueprint(PATHWAY, {
      completed: ['u1', 'cp1', 'u2', 'u3'], owned: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'], available: all(8),
    });
    expect(ids(next)).toEqual(['z']);                             // the review's one new skill
  });

  test('a module with a skill the bank cannot test ends the stage', () => {
    const available = { ...all(8), e: 1 };
    const first = buildStageBlueprint(PATHWAY, { available });
    expect(ids(first)).toEqual(['a', 'b', 'c']);                  // stops before u2
    const stuck = buildStageBlueprint(PATHWAY, { completed: ['u1', 'cp1'], owned: ['a', 'b', 'c'], available });
    expect(stuck.skills).toEqual([]);
    expect(stuck.blockedBy).toMatchObject({ moduleId: 'u2', skills: ['e'] });
  });

  test('the last module is never tested, and an empty bank yields nothing', () => {
    const done = buildStageBlueprint(PATHWAY, {
      completed: ['u1', 'cp1', 'u2', 'u3', 'review'], owned: courseSkills(PATHWAY).map((s) => s.skillId), available: all(8),
    });
    expect(done.skills).toEqual([]);
    expect(done.blockedBy).toBeNull();
    expect(buildStageBlueprint(PATHWAY, { available: {} }).skills).toEqual([]);
    expect(buildStageBlueprint(null, {}).skills).toEqual([]);
  });

  test('a module bigger than one stage is finished over two', () => {
    const big = { modules: [{ moduleId: 'm', title: 'M', skills: 'abcdefghijklmn'.split('') }, { moduleId: 'end', skills: [] }] };
    const available = Object.fromEntries('abcdefghijklmn'.split('').map((k) => [k, 5]));
    const one = buildStageBlueprint(big, { available });
    expect(one.skills).toHaveLength(10);
    const two = buildStageBlueprint(big, { owned: ids(one), available });
    expect(ids(two)).toEqual(['k', 'l', 'm', 'n']);
  });
});

describe('isCheckable — what the check may put in front of a student', () => {
  const mc = (over) => ({
    prompt: 'Which is greater, 0.5 or 0.25?', answerType: 'multiple-choice',
    options: [{ label: 'A', text: '0.5' }, { label: 'B', text: '0.25' }, { label: 'C', text: 'They are equal' }, { label: 'D', text: 'Cannot tell' }],
    correctOption: 'A', answer: { value: '0.5', equivalents: ['0.5'] }, ...over,
  });
  test('a clean multiple-choice or typed item is fine', () => {
    expect(isCheckable(mc())).toBe(true);
    expect(isCheckable({ prompt: '30 + 22 = ?', options: [], answer: { value: '52', equivalents: ['52'] } })).toBe(true);
  });
  test('anything that needs a figure is not', () => {
    expect(isCheckable(mc({ svg: '<svg/>' }))).toBe(false);
    expect(isCheckable(mc({ figure: { kind: 'grid' } }))).toBe(false);
    expect(isCheckable(mc({ prompt: 'In the figure shown, which angle is larger?' }))).toBe(false);
    expect(isCheckable(mc({ prompt: 'Use the table below to find the rate.' }))).toBe(false);
  });
  test('an item with no gradable answer is not', () => {
    expect(isCheckable({ prompt: 'Explain why.', options: [], answer: {} })).toBe(false);
    expect(isCheckable(null)).toBe(false);
  });
});

describe('servedForm — converted items are asked the way they were written', () => {
  const { servedForm, gradeServed } = require('../../utils/coursePlacementService');
  const junk = (value, texts) => ({
    prompt: 'q', answer: { value, equivalents: [value] },
    options: texts.map((text, i) => ({ label: 'ABCD'[i], text })),
  });

  test('options with no correctOption and a typeable answer → typed', () => {
    // "In 0.908, which digit is in the tenths place?" with 14 · 19 · 6 · 9
    expect(servedForm(junk('9', ['14', '19', '6', '9']))).toBe('typed');
    expect(servedForm(junk('7:8', ['8', '7:8', '9', '6']))).toBe('typed');
    expect(servedForm(junk('12/13', ['1', '12/13', '2', '3']))).toBe('typed');
    expect(servedForm(junk('48.75', ['4', '48.75', '5', '6']))).toBe('typed');
    expect(servedForm(junk('1 1/2', ['1', '1 1/2', '2', '3']))).toBe('typed');
    expect(servedForm(junk('−4', ['4', '−4', '0', '8']))).toBe('typed');
  });

  test('authored multiple choice, letter keys, lists and words stay multiple choice', () => {
    expect(servedForm({ ...junk('9', ['14', '19', '6', '9']), correctOption: 'D' })).toBe('choice');
    expect(servedForm(junk('D', ['a', 'b', 'c', 'd']))).toBe('choice');
    expect(servedForm(junk('3, 21, 26', ['3, 21, 26', '26, 21, 3', '21, 3, 26', '3, 26, 21']))).toBe('choice');
    expect(servedForm(junk('x > 2', ['x > 2', 'x < 2', 'x = 2', 'x ≥ 2']))).toBe('choice');
    expect(servedForm(junk('isosceles', ['isosceles', 'scalene', 'right', 'obtuse']))).toBe('choice');
  });

  test('an item with no options is typed', () => {
    expect(servedForm({ prompt: 'q', options: [], answer: { value: '52' } })).toBe('typed');
  });

  test('a typed item is graded on its value, not on matching an option', () => {
    const item = junk('0.5', ['14', '0.5', '6', '9']);
    expect(gradeServed(item, '0.5').correct).toBe(true);
    expect(gradeServed(item, '1/2').correct).toBe(true);       // an equal form no option lists
    expect(gradeServed(item, '6').correct).toBe(false);
  });
});

describe('the crosswalk', () => {
  test('systems-substitution reaches the bank skill that holds it', () => {
    // The live bank has no items under "systems-substitution"; they are under
    // the Algebra 1 name. Without this row it was the one untestable skill of
    // 8th Grade Math and Algebra 2.
    expect(skillLookupCandidates('systems-substitution')).toContain('systems-of-equations-substitution');
  });
});
