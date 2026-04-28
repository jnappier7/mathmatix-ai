// tests/unit/skillModel.test.js
// Unit tests for models/skill.js — instance + static methods

const Skill = require('../../models/skill');

function fakeSkill(skillId, prerequisites = []) {
  return {
    skillId,
    prerequisites,
    isActive: true,
    checkPrerequisites: Skill.schema.methods.checkPrerequisites
  };
}

describe('Skill.methods.checkPrerequisites', () => {
  test('returns true when there are no prerequisites', () => {
    const s = fakeSkill('algebra-1', []);
    expect(s.checkPrerequisites(new Map())).toBe(true);
  });

  test('returns true when every prerequisite is mastered', () => {
    const s = fakeSkill('algebra-1', ['integers', 'fractions']);
    const mastery = new Map([
      ['integers', { status: 'mastered' }],
      ['fractions', { status: 'mastered' }]
    ]);
    expect(s.checkPrerequisites(mastery)).toBe(true);
  });

  test('returns false when a prerequisite is missing or not mastered', () => {
    const s = fakeSkill('algebra-1', ['integers', 'fractions']);
    const partial = new Map([
      ['integers', { status: 'mastered' }],
      ['fractions', { status: 'learning' }]
    ]);
    expect(s.checkPrerequisites(partial)).toBe(false);

    const noEntry = new Map([['integers', { status: 'mastered' }]]);
    expect(s.checkPrerequisites(noEntry)).toBe(false);
  });
});

describe('Skill.statics.getReadySkills', () => {
  test('returns skills whose prereqs are met and are not yet mastered', async () => {
    const skills = [
      fakeSkill('a', []),                     // ready
      fakeSkill('b', ['a']),                  // ready (prereq mastered)
      fakeSkill('c', ['a', 'b']),             // ready (both mastered)
      fakeSkill('d', ['nonexistent']),        // not ready
      fakeSkill('e', [])                      // already mastered
    ];

    const findResult = jest.fn().mockResolvedValue(skills);
    const mastery = new Map([
      ['a', { status: 'mastered' }],
      ['b', { status: 'mastered' }],
      ['e', { status: 'mastered' }]
    ]);

    // Bind static to a fake model
    const result = await Skill.schema.statics.getReadySkills.call({ find: findResult }, mastery);

    const ids = result.map(s => s.skillId).sort();
    expect(ids).toEqual(['c']);
  });
});

describe('Skill.statics.getLearningSkills', () => {
  test('returns entries with status = "learning"', () => {
    const mastery = new Map([
      ['a', { status: 'learning', masteryScore: 30 }],
      ['b', { status: 'mastered' }],
      ['c', { status: 'learning', masteryScore: 50 }]
    ]);
    const r = Skill.schema.statics.getLearningSkills(mastery);
    expect(r.map(s => s.skillId).sort()).toEqual(['a', 'c']);
  });
});

describe('Skill.statics.getMasteredSkills', () => {
  test('returns mastered skills sorted by masteredDate descending', () => {
    const mastery = new Map([
      ['a', { status: 'mastered', masteredDate: '2025-01-01' }],
      ['b', { status: 'mastered', masteredDate: '2025-03-01' }],
      ['c', { status: 'learning' }],
      ['d', { status: 'mastered', masteredDate: '2025-02-01' }]
    ]);
    const r = Skill.schema.statics.getMasteredSkills(mastery);
    expect(r.map(s => s.skillId)).toEqual(['b', 'd', 'a']);
  });
});
