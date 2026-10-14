/**
 * utils/skillSummary.js — ONE evidence-based definition of "struggling".
 *
 * The old rule (`learning && masteryScore < 40`) flagged every skill a student
 * merely started, because the pipeline seeds new skills at 30. A dashboard that
 * cries wolf on 100 of 105 students is a dashboard nobody acts on.
 */
const { struggleReason, summarizeSkillMastery } = require('../../utils/skillSummary');

const NOW = new Date('2026-10-14T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const recent = new Date(NOW - 2 * DAY);

describe('struggleReason', () => {
  test('a freshly started skill (seeded at 30) is NOT a struggle', () => {
    expect(struggleReason({ status: 'learning', masteryScore: 30, lastPracticed: recent }, NOW)).toBeNull();
  });
  test('tutor-flagged struggle areas count', () => {
    expect(struggleReason({ status: 'learning', strugglingAreas: ['sign errors'], lastPracticed: recent }, NOW))
      .toEqual({ kind: 'tutor-flagged', detail: 'sign errors' });
  });
  test('failing a direct check counts', () => {
    expect(struggleReason({ status: 'learning', explicitlyFailed: true, failureDate: recent }, NOW).kind).toBe('missed-on-check');
  });
  test('low accuracy needs enough attempts', () => {
    const few = { status: 'practicing', lastPracticed: recent, pillars: { accuracy: { correct: 0, total: 3, percentage: 0 } } };
    const many = { status: 'practicing', lastPracticed: recent, pillars: { accuracy: { correct: 2, total: 6, percentage: 0.33 } } };
    expect(struggleReason(few, NOW)).toBeNull();
    expect(struggleReason(many, NOW)).toEqual({ kind: 'low-accuracy', detail: '33% of 6' });
  });
  test('old evidence is history, not today\'s to-do', () => {
    expect(struggleReason({ status: 'learning', strugglingAreas: ['x'], lastPracticed: new Date(NOW - 45 * DAY) }, NOW)).toBeNull();
  });
  test('mastered skills never struggle', () => {
    expect(struggleReason({ status: 'mastered', strugglingAreas: ['x'], lastPracticed: recent }, NOW)).toBeNull();
  });
});

describe('summarizeSkillMastery', () => {
  const map = {
    a: { status: 'mastered', masteryScore: 1, masteredDate: new Date(NOW - 3 * DAY) },   // legacy 0-1 scale
    b: { status: 'learning', masteryScore: 30, lastPracticed: recent },
    c: { status: 'practicing', masteryScore: 50, strugglingAreas: ['distributing'], lastPracticed: recent },
    d: { status: 're-fragile', masteryScore: 70 },
    e: { status: 'ready', masteryScore: 0 },
  };
  test('counts every in-flight state and ignores ready/locked', () => {
    const s = summarizeSkillMastery(map, { c: 'Distributive property' }, NOW);
    expect(s).toMatchObject({ mastered: 1, inProgress: 2, slipping: 1, total: 4 });
  });
  test('average mastery is normalized to 0-100 (the 287% bug)', () => {
    const s = summarizeSkillMastery(map, {}, NOW);
    expect(s.avgMastery).toBe(Math.round((100 + 30 + 50 + 70) / 4));
    expect(s.avgMastery).toBeLessThanOrEqual(100);
  });
  test('struggling carries a display name and reason', () => {
    const s = summarizeSkillMastery(map, { c: 'Distributive property' }, NOW);
    expect(s.struggling).toEqual([expect.objectContaining({ skillId: 'c', name: 'Distributive property', reason: 'tutor-flagged' })]);
  });
  test('recently mastered is listed for milestones', () => {
    expect(summarizeSkillMastery(map, {}, NOW).recentlyMastered.map(r => r.skillId)).toEqual(['a']);
  });
  test('accepts a Map (hydrated mongoose doc)', () => {
    expect(summarizeSkillMastery(new Map(Object.entries(map)), {}, NOW).total).toBe(4);
  });
});
