// resolveSkillInfo never hands a parent (or teacher) a raw id, an encoded key,
// or "Undefined": catalog → seed files → humanized id, junk keys dropped.
jest.mock('../../models/skill', () => ({
  find: () => ({ select: () => ({ lean: async () => [] }) }), // catalog has nothing
}));

const { resolveSkillInfo, categoryLabel, humanize } = require('../../utils/skillDisplayNames');

test('junk keys are omitted entirely', async () => {
  const out = await resolveSkillInfo(['undefined', 'null', '', 'act-sequences']);
  expect(Object.keys(out)).toEqual(['act-sequences']);
});

test('seed files name skills the live catalog lacks', async () => {
  const out = await resolveSkillInfo(['act-sequences', 'cm-wants-vs-needs']);
  expect(out['act-sequences'].name).toBe('Sequences');
  expect(out['cm-wants-vs-needs'].name).toBe('Wants vs Needs (With Numbers)');
});

test('last resort strips exam/course namespaces instead of showing them', () => {
  expect(humanize('act-made-up-skill')).toBe('Made Up Skill');
  expect(humanize('sat-thing')).toBe('Thing');
});

test('category labels read as words, with pairs joined by &', () => {
  expect(categoryLabel('expressions-equations')).toBe('Expressions & Equations');
  expect(categoryLabel('word-problems')).toBe('Word Problems');
  expect(categoryLabel('applications-integrals')).toBe('Applications of Integrals');
  expect(categoryLabel(null)).toBeNull();
});
