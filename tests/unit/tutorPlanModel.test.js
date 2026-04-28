// tests/unit/tutorPlanModel.test.js
// Unit tests for models/tutorPlan.js (instance + static helpers)

const TutorPlan = require('../../models/tutorPlan');

const methods = TutorPlan.schema.methods;
const statics = TutorPlan.schema.statics;

describe('TutorPlan.methods.getActiveSkillFocus', () => {
  test('filters out non-active and sorts by priority desc', () => {
    const doc = {
      skillFocus: [
        { skillId: 'a', status: 'active', priority: 2 },
        { skillId: 'b', status: 'completed', priority: 5 },
        { skillId: 'c', status: 'in-progress', priority: 4 },
        { skillId: 'd', status: 'active', priority: 9 }
      ]
    };
    const r = methods.getActiveSkillFocus.call(doc);
    expect(r.map(x => x.skillId)).toEqual(['d', 'c', 'a']);
  });

  test('returns empty array when nothing is active', () => {
    expect(methods.getActiveSkillFocus.call({ skillFocus: [] })).toEqual([]);
  });
});

describe('TutorPlan.methods.findSkillFocus', () => {
  test('returns the matching focus entry', () => {
    const doc = { skillFocus: [{ skillId: 'a' }, { skillId: 'b' }] };
    expect(methods.findSkillFocus.call(doc, 'b')).toEqual({ skillId: 'b' });
  });
  test('returns undefined when not found', () => {
    expect(methods.findSkillFocus.call({ skillFocus: [] }, 'x')).toBeUndefined();
  });
});

describe('TutorPlan.methods.getNotesForSkill', () => {
  test('returns only non-superseded notes for the skill', () => {
    const doc = {
      tutorNotes: [
        { skillId: 'a', text: 'one' },
        { skillId: 'a', text: 'old', supersededAt: new Date() },
        { skillId: 'b', text: 'other' }
      ]
    };
    const r = methods.getNotesForSkill.call(doc, 'a');
    expect(r.map(n => n.text)).toEqual(['one']);
  });
});

describe('TutorPlan.methods.getCurrentNotes', () => {
  test('returns up to `limit` notes sorted by createdAt desc', () => {
    const t = (n) => new Date(2025, 0, n);
    const doc = {
      tutorNotes: [
        { text: 'older', createdAt: t(1) },
        { text: 'newest', createdAt: t(5) },
        { text: 'middle', createdAt: t(3) },
        { text: 'soft-deleted', createdAt: t(10), supersededAt: t(11) }
      ]
    };
    expect(methods.getCurrentNotes.call(doc).map(n => n.text)).toEqual(['newest', 'middle', 'older']);
    expect(methods.getCurrentNotes.call(doc, 1).map(n => n.text)).toEqual(['newest']);
  });
});

describe('TutorPlan.statics.familiarityToMode', () => {
  test.each([
    ['never-seen', 'instruct'],
    ['introduced', 'instruct'],
    ['developing', 'guide'],
    ['proficient', 'strengthen'],
    ['mastered', 'leverage'],
    ['unknown', 'guide'] // default
  ])('%s → %s', (familiarity, expected) => {
    expect(statics.familiarityToMode(familiarity)).toBe(expected);
  });
});

describe('TutorPlan.statics.inferFamiliarity', () => {
  test('returns "never-seen" for missing or untouched mastery', () => {
    expect(statics.inferFamiliarity(null)).toBe('never-seen');
    expect(statics.inferFamiliarity({ totalAttempts: 0 })).toBe('never-seen');
  });

  test('classifies as "mastered" when status + score qualify', () => {
    expect(statics.inferFamiliarity({
      status: 'mastered', masteryScore: 92, totalAttempts: 12
    })).toBe('mastered');
  });

  test('"proficient" when score ≥75 and totalAttempts ≥5', () => {
    expect(statics.inferFamiliarity({
      status: 'practicing', masteryScore: 80, totalAttempts: 6
    })).toBe('proficient');
  });

  test('"proficient" when accuracy ≥80% even if score is borderline', () => {
    expect(statics.inferFamiliarity({
      status: 'practicing', masteryScore: 60, totalAttempts: 5,
      pillars: { accuracy: { percentage: 0.85 } }
    })).toBe('proficient');
  });

  test('"developing" when status=practicing, score≥50, attempts≥3', () => {
    expect(statics.inferFamiliarity({
      status: 'practicing', masteryScore: 60, totalAttempts: 4
    })).toBe('developing');
  });

  test('"developing" when status=learning and attempts≥3', () => {
    expect(statics.inferFamiliarity({
      status: 'learning', masteryScore: 30, totalAttempts: 4
    })).toBe('developing');
  });

  test('"introduced" when only 1-2 attempts', () => {
    expect(statics.inferFamiliarity({
      status: 'practicing', masteryScore: 20, totalAttempts: 2
    })).toBe('introduced');
  });

  test('a few attempts at low score is NOT proficient (regression)', () => {
    // The key bug guard: 75% on 2 attempts is noise.
    expect(statics.inferFamiliarity({
      status: 'practicing', masteryScore: 75, totalAttempts: 2
    })).toBe('introduced');
  });
});
