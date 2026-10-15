// tests/unit/freeChatSkillAttribution.test.js
//
// QA handoff 2026-10-14 §2.2: with an ACT review in progress, every turn of a
// free-chat session about pumps, polynomials and systems reported
// currentSkillId "act-triangles-angle-relationships" and
// masteryCompleted/masterySuccess: true — even on a wrong answer.
//
// Two independent causes, both pinned here:
//   1. The tutor plan's target. A review item pins its miss's skill as the
//      target; nothing unpinned it, and the skill also sat in the focus queue,
//      so free chat kept resolving to it.
//   2. A phantom badge session. masteryProgress.activeBadge has numeric
//      defaults, so Mongoose gives EVERY user a stub object. `!!activeBadge`
//      read that as "in a badge session", and with no requirements
//      (`n < undefined` is false) every answered turn completed the badge.

jest.mock('../../models/skill', () => ({
  findOne: jest.fn(({ skillId }) => ({
    lean: () => Promise.resolve({ skillId, displayName: skillId, prerequisites: [] }),
  })),
}));

const {
  resolveCurrentTarget, recentPracticeSkillId, isTestPrepSkillId,
} = require('../../utils/tutorPlanManager');
const { hasActiveBadge } = require('../../utils/masteryGuard');
const { updateBadgeProgress } = require('../../utils/pipeline/persist');

const ACT = 'act-triangles-angle-relationships';
const plan = (currentTarget, skillFocus = []) => ({ currentTarget, skillFocus, lastUpdated: null });
const user = () => ({ skillMastery: {} });

describe('test-prep skills are scoped to the review item that pins them', () => {
  test('isTestPrepSkillId covers the four exam families only', () => {
    for (const id of ['act-circles', 'sat-linear-equations', 'psat-ratios', 'preact-percent']) {
      expect(isTestPrepSkillId(id)).toBe(true);
    }
    for (const id of ['quadratic-formula', 'alg1-systems', 'factoring', null, undefined, 42]) {
      expect(isTestPrepSkillId(id)).toBe(false);
    }
  });

  test('free chat drops a stale ACT target instead of teaching it', async () => {
    const p = plan({ skillId: ACT, instructionalMode: 'instruct', instructionPhase: 'vocabulary' });
    const { plan: out } = await resolveCurrentTarget(p, { user: user() });
    expect(out.currentTarget.skillId).toBeNull();
  });

  test('…and falls through to the next non-exam skill in the queue', async () => {
    const p = plan({ skillId: ACT }, [
      { skillId: ACT, status: 'in-progress', priority: 9 },
      { skillId: 'multiplying-polynomials', status: 'active', priority: 5 },
    ]);
    const { plan: out } = await resolveCurrentTarget(p, { user: user() });
    expect(out.currentTarget.skillId).toBe('multiplying-polynomials');
  });

  test('a review item still pins its own skill', async () => {
    const p = plan({ skillId: null });
    const { plan: out } = await resolveCurrentTarget(p, { user: user(), courseSkillId: ACT });
    expect(out.currentTarget.skillId).toBe(ACT);
  });

  test('a course/badge skill override still wins in free chat', async () => {
    const p = plan({ skillId: ACT });
    const { plan: out } = await resolveCurrentTarget(p, { user: user(), activeSkillId: 'factoring' });
    expect(out.currentTarget.skillId).toBe('factoring');
  });

  test('a non-exam target is untouched in free chat', async () => {
    const p = plan({ skillId: 'factoring' });
    const { plan: out } = await resolveCurrentTarget(p, { user: user() });
    expect(out.currentTarget.skillId).toBe('factoring');
  });

  test('the in-progress fallback skips exam skills only when asked to', () => {
    const p = plan({ skillId: null }, [
      { skillId: ACT, status: 'in-progress', lastWorkedOn: new Date('2026-10-14') },
      { skillId: 'factoring', status: 'in-progress', lastWorkedOn: new Date('2026-10-01') },
    ]);
    expect(recentPracticeSkillId(p)).toBe(ACT);
    expect(recentPracticeSkillId(p, { excludeTestPrep: true })).toBe('factoring');
  });
});

describe('the default activeBadge stub is not a badge session', () => {
  const stub = () => ({ masteryProgress: { activeBadge: { problemsCompleted: 75, problemsCorrect: 44, hintsUsed: 0 } }, badges: [] });

  test('hasActiveBadge requires a real badgeId', () => {
    expect(hasActiveBadge(stub())).toBe(false);
    expect(hasActiveBadge({ masteryProgress: { activeBadge: { badgeId: '' } } })).toBe(false);
    expect(hasActiveBadge({ masteryProgress: { activeBadge: null } })).toBe(false);
    expect(hasActiveBadge({})).toBe(false);
    expect(hasActiveBadge(null)).toBe(false);
    expect(hasActiveBadge({ masteryProgress: { activeBadge: { badgeId: 'b1' } } })).toBe(true);
  });

  test('a stub can never complete, award XP, or push an id-less badge', () => {
    const u = { ...stub(), xp: 100, markModified: jest.fn() };
    const r = updateBadgeProgress(u, false);
    expect(r).toEqual({ completed: false, success: false, badgeAwarded: null });
    expect(u.xp).toBe(100);
    expect(u.badges).toHaveLength(0);
  });

  test('an already-earned badge does not re-report completion on later turns', () => {
    const u = {
      masteryProgress: { activeBadge: { badgeId: 'b1', skillId: 'factoring', requiredProblems: 2, requiredAccuracy: 0.5, problemsCompleted: 5, problemsCorrect: 5 } },
      badges: [{ badgeId: 'b1' }],
      markModified: jest.fn(),
    };
    expect(updateBadgeProgress(u, false).completed).toBe(false);
    expect(updateBadgeProgress(u, false).success).toBe(false);
  });
});

describe('every badge-session gate uses hasActiveBadge, not the bare object', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');

  test.each([
    'routes/chat.js',
    'routes/mastery.js',
    'utils/pipeline/persist.js',
    'utils/pipeline/sidecar.js',
    'utils/pipeline/suggestions.js',
  ])('%s', (file) => {
    const src = read(file);
    // `activeBadge ?`, `!!…activeBadge`, `!…activeBadge)`, `activeBadge &&`
    expect(src).not.toMatch(/masteryProgress\??\.activeBadge\s*(\?(?!\.)|&&|\))/);
    expect(src).not.toMatch(/!!\s*user\.masteryProgress\?\.activeBadge/);
  });
});
