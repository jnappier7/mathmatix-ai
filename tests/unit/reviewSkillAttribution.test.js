/**
 * A test-prep review credits the skill being REVIEWED, not a stale plan target.
 *
 * Owner logs, 2026-10-13: a PSAT-seeded SAT review of a polynomial-factor miss
 * (skill ALG2.FNC.6) ran every turn as "TutorPlan: target=act-sequences" — the
 * target left over from the student's ACT course. Review turns carry no
 * activeSkill, so the learning engines fell back to that target and wrote each
 * long-division step into the ACT sequences BKT/FSRS (a wrong step dropped its
 * FSRS stability to 0.1), while decide read act-sequences' BKT as the evidence.
 */
jest.mock('../../utils/skillFamiliarityResolver', () => {
  const actual = jest.requireActual('../../utils/skillFamiliarityResolver');
  return {
    ...actual,
    // The real resolver reads the Skill collection; the target choice is what's under test.
    resolveSkill: jest.fn(async (skillId) => ({
      skillId, displayName: skillId, familiarity: actual.FAMILIARITY.DEVELOPING || 'developing',
      instructionalMode: 'guide',
    })),
  };
});

const fs = require('fs');
const path = require('path');
const { resolveCurrentTarget } = require('../../utils/tutorPlanManager');

function stalePlan() {
  return {
    currentTarget: { skillId: 'act-sequences', displayName: 'Sequences', instructionalMode: 'guide' },
    skillFocus: [{ skillId: 'act-sequences', status: 'in-progress' }],
  };
}

test('the review skill (courseSkillId) replaces a stale target from another course', async () => {
  const { plan } = await resolveCurrentTarget(stalePlan(), {
    user: { skillMastery: new Map() },
    activeSkillId: null,
    courseSkillId: 'ALG2.FNC.6',
  });
  expect(plan.currentTarget.skillId).toBe('ALG2.FNC.6');
});

describe('pipeline wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');

  test('the plan resolver is handed the review miss skill', () => {
    expect(src).toMatch(/courseSkillId:\s*ctx\.actReviewMiss\?\.skillId/);
  });

  test('engine attribution prefers the review skill over the plan target', () => {
    const m = src.match(/const resolvedSkillId = ([\s\S]*?);/);
    expect(m).toBeTruthy();
    const order = ['ctx.activeSkill?.skillId', 'ctx.actReviewMiss?.skillId', 'tutorPlan?.currentTarget?.skillId']
      .map((s) => m[1].indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

test('chat.js puts the miss skill on actReviewMiss', () => {
  const chat = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
  const block = chat.slice(chat.indexOf('actReviewMiss = {'), chat.indexOf('actReviewMiss = {') + 1500);
  expect(block).toMatch(/skillId:\s*miss\.skillId/);
});
