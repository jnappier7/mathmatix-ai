// tests/unit/skillFocusBuilder.test.js
// Unit tests for the Phase 2 "structure everywhere" skill-focus seeder.
// Uses plain objects for the plan (addSkillToFocus only needs an array) and a
// Map for skillMastery — no DB required. TutorPlan statics (inferFamiliarity,
// familiarityToMode) are pure and load without a connection.

const { refreshSkillFocus, isStructuredFreeChatEnabled } = require('../../utils/skillFocusBuilder');

function makePlan() {
  return { skillFocus: [] };
}

// Fixed clock so review-due math is deterministic.
const NOW = new Date('2026-07-15T12:00:00Z');
const PAST = new Date('2026-07-10T12:00:00Z');   // due
const FUTURE = new Date('2026-08-10T12:00:00Z'); // not due

function masteryMap(entries) {
  const m = new Map();
  for (const [id, e] of Object.entries(entries)) m.set(id, e);
  return m;
}

describe('skillFocusBuilder.refreshSkillFocus', () => {
  const prevFlag = process.env.STRUCTURED_FREE_CHAT;
  afterEach(() => {
    if (prevFlag === undefined) delete process.env.STRUCTURED_FREE_CHAT;
    else process.env.STRUCTURED_FREE_CHAT = prevFlag;
  });

  test('seeds an in-progress (developing) skill when the queue is empty', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'add-fractions': { status: 'learning', totalAttempts: 4 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(1);
    expect(plan.skillFocus[0]).toMatchObject({
      skillId: 'add-fractions',
      reason: 'assessment-identified',
      familiarity: 'developing',
      instructionalMode: 'guide',
      status: 'active',
    });
  });

  test('bumps a review-due in-progress skill to review-due priority', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      // developing + review due → jumps the queue
      'one-step-eq': { status: 'practicing', masteryScore: 60, totalAttempts: 4, reviewSchedule: { nextReviewDate: PAST } },
      'two-step-eq': { status: 'learning', totalAttempts: 3 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    const due = plan.skillFocus.find(s => s.skillId === 'one-step-eq');
    const dev = plan.skillFocus.find(s => s.skillId === 'two-step-eq');
    expect(due).toMatchObject({ reason: 'review-due', priority: 8 });
    // review-due outranks a not-due in-progress skill
    expect(due.priority).toBeGreaterThan(dev.priority);
  });

  test('skips mastered skills (retired by resolveCurrentTarget; surfaced by the prompt layer)', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'slope': { status: 'mastered', masteredDate: PAST, reviewSchedule: { nextReviewDate: PAST } },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(0);
  });

  test('skips never-seen skills (would trigger aggressive INSTRUCT)', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'limits': { status: 'locked', totalAttempts: 0 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(0);
  });

  test('skips a mastered skill that is not yet due for review', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'slope': { status: 'mastered', masteredDate: PAST, reviewSchedule: { nextReviewDate: FUTURE } },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(0);
  });

  test('is a no-op when the queue already has active work', () => {
    const plan = { skillFocus: [{ skillId: 'existing', status: 'in-progress', priority: 5 }] };
    const user = { skillMastery: masteryMap({
      'add-fractions': { status: 'learning', totalAttempts: 4 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(1);
    expect(plan.skillFocus[0].skillId).toBe('existing');
  });

  test('is a no-op during a course session', () => {
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'add-fractions': { status: 'learning', totalAttempts: 4 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW, inCourse: true });
    expect(plan.skillFocus).toHaveLength(0);
  });

  test('is a no-op when the kill switch is set', () => {
    process.env.STRUCTURED_FREE_CHAT = 'false';
    expect(isStructuredFreeChatEnabled()).toBe(false);
    const plan = makePlan();
    const user = { skillMastery: masteryMap({
      'add-fractions': { status: 'learning', totalAttempts: 4 },
    }) };
    refreshSkillFocus(plan, user, { now: NOW });
    expect(plan.skillFocus).toHaveLength(0);
  });

  test('caps the seeded queue at 6 entries', () => {
    const entries = {};
    for (let i = 0; i < 12; i++) entries['skill-' + i] = { status: 'learning', totalAttempts: 4 };
    const plan = makePlan();
    refreshSkillFocus(plan, { skillMastery: masteryMap(entries) }, { now: NOW });
    expect(plan.skillFocus.length).toBeLessThanOrEqual(6);
  });

  test('tolerates a missing or malformed skillMastery gracefully', () => {
    const plan = makePlan();
    expect(() => refreshSkillFocus(plan, {}, { now: NOW })).not.toThrow();
    expect(plan.skillFocus).toHaveLength(0);
  });
});
