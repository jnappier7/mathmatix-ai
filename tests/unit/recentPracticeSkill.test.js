const { recentPracticeSkillId } = require('../../utils/tutorPlanManager');

// Attribution fallback: when currentTarget is transiently null, a verified solve
// should still credit the skill the student is plainly working on — the most
// recently worked in-progress focus entry.
describe('recentPracticeSkillId', () => {
  it('returns the most-recently-worked in-progress skill', () => {
    const plan = {
      skillFocus: [
        { skillId: 'MS.QNT.8', status: 'in-progress', lastWorkedOn: '2026-07-23T15:00:00Z' },
        { skillId: 'ALG1.EQV.1', status: 'in-progress', lastWorkedOn: '2026-07-20T10:00:00Z' },
        { skillId: 'GEO.CON.2', status: 'active', lastWorkedOn: '2026-07-10T10:00:00Z' },
      ],
    };
    expect(recentPracticeSkillId(plan)).toBe('MS.QNT.8');
  });

  it('ignores resolved / deferred entries', () => {
    const plan = {
      skillFocus: [
        { skillId: 'MASTERED.1', status: 'resolved', lastWorkedOn: '2026-07-25T00:00:00Z' },
        { skillId: 'DEFERRED.1', status: 'deferred', lastWorkedOn: '2026-07-25T00:00:00Z' },
        { skillId: 'MS.QNT.8', status: 'in-progress', lastWorkedOn: '2026-07-01T00:00:00Z' },
      ],
    };
    expect(recentPracticeSkillId(plan)).toBe('MS.QNT.8');
  });

  it('returns null when nothing is in progress', () => {
    expect(recentPracticeSkillId({ skillFocus: [{ skillId: 'X', status: 'resolved' }] })).toBeNull();
    expect(recentPracticeSkillId({ skillFocus: [] })).toBeNull();
    expect(recentPracticeSkillId({})).toBeNull();
    expect(recentPracticeSkillId(null)).toBeNull();
  });

  it('falls back to an entry with no lastWorkedOn when it is the only candidate', () => {
    const plan = { skillFocus: [{ skillId: 'MS.QNT.8', status: 'in-progress' }] };
    expect(recentPracticeSkillId(plan)).toBe('MS.QNT.8');
  });
});
