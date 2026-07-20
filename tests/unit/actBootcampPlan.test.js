// tests/unit/actBootcampPlan.test.js
// Guards the "great tutor" triage that turns a practice-ACT result into a study
// plan: skip mastered domains, rank the rest by leverage (weakness x exam-weight),
// and pick a prerequisite-aware starting module. Pure — no DB.

const { buildActPlan, planStartModule, planSummary, CATEGORY_MODULE } = require('../../utils/actBootcampPlan');

describe('buildActPlan — great-tutor triage', () => {
  test('skips a domain the student already mastered (fast-pass, not a target)', () => {
    const plan = buildActPlan({
      'number-quantity': { correct: 5, total: 5 }, // aced -> mastered
      'algebra': { correct: 3, total: 8 },
    });
    expect(plan.summary.masteredCategories).toContain('number-quantity');
    expect(plan.targets.map(t => t.category)).not.toContain('number-quantity');
    expect(plan.targets.map(t => t.category)).toContain('algebra');
  });

  test('ranks by leverage: a higher-weight domain can outrank a weaker-but-lighter one', () => {
    // algebra: acc .50, weight 8 -> priority 4.0
    // number-quantity: acc .40, weight 5 -> priority 3.0
    // Lower accuracy (nq) but algebra still ranks first because it's worth more.
    const plan = buildActPlan({
      'algebra': { correct: 4, total: 8 },
      'number-quantity': { correct: 2, total: 5 },
    });
    expect(plan.targets[0].category).toBe('algebra');
    expect(plan.targets[1].category).toBe('number-quantity');
  });

  test('respects foundations: starts on the weak prerequisite, not the higher-priority dependent', () => {
    // functions has higher priority than algebra, but algebra is more foundational
    // and also weak — a great tutor starts there.
    const plan = buildActPlan({
      'algebra': { correct: 5, total: 8 },   // acc .625, weight 8 -> 3.0, foundation 1
      'functions': { correct: 4, total: 8 }, // acc .50,  weight 8 -> 4.0, foundation 2
    });
    expect(plan.targets[0].category).toBe('functions');      // ranked first by leverage
    expect(plan.startModuleId).toBe(CATEGORY_MODULE.algebra); // but we START on the foundation
  });

  test('caps the plan to a focused set of targets', () => {
    const plan = buildActPlan({
      'algebra': { correct: 1, total: 8 },
      'functions': { correct: 1, total: 8 },
      'geometry': { correct: 1, total: 8 },
      'statistics-probability': { correct: 1, total: 7 },
      'number-quantity': { correct: 1, total: 5 },
    }, { maxTargets: 3 });
    expect(plan.targets).toHaveLength(3);
  });

  test('maps every target/start to a real pathway module id', () => {
    const plan = buildActPlan({
      'geometry': { correct: 2, total: 8 },
      'statistics-probability': { correct: 3, total: 7 },
    });
    for (const t of plan.targets) expect(typeof t.moduleId).toBe('string');
    expect(plan.startModuleId).toBeTruthy();
  });

  test('empty / all-mastered / unknown input is handled gracefully', () => {
    expect(buildActPlan({}).targets).toEqual([]);
    expect(buildActPlan({}).startModuleId).toBeNull();
    const allMastered = buildActPlan({ 'algebra': { correct: 8, total: 8 } });
    expect(allMastered.targets).toEqual([]);
    expect(allMastered.summary.masteredCategories).toContain('algebra');
    // an unrecognized category is ignored, never crashes
    expect(() => buildActPlan({ 'unknown': { correct: 0, total: 3 } })).not.toThrow();
  });
});

describe('planStartModule — retarget only at course start', () => {
  const plan = { startModuleId: 'geometry' };
  const modules = (statuses) => statuses.map((s, i) => ({ moduleId: ['number_quantity', 'algebra', 'geometry'][i], status: s }));

  test('retargets a fresh course (no progress, no module begun)', () => {
    const cs = { currentModuleId: 'number_quantity', overallProgress: 0, modules: modules(['available', 'locked', 'locked']) };
    expect(planStartModule(cs, plan)).toBe('geometry');
  });

  test('does NOT retarget once a module is in progress', () => {
    const cs = { currentModuleId: 'number_quantity', overallProgress: 0, modules: modules(['in_progress', 'locked', 'locked']) };
    expect(planStartModule(cs, plan)).toBeNull();
  });

  test('does NOT retarget once there is progress', () => {
    const cs = { currentModuleId: 'number_quantity', overallProgress: 12, modules: modules(['completed', 'available', 'locked']) };
    expect(planStartModule(cs, plan)).toBeNull();
  });

  test('no-op when already on the target module, or target missing', () => {
    const onTarget = { currentModuleId: 'geometry', overallProgress: 0, modules: modules(['available', 'locked', 'available']) };
    expect(planStartModule(onTarget, plan)).toBeNull();
    const noSuch = { currentModuleId: 'number_quantity', overallProgress: 0, modules: modules(['available', 'locked', 'locked']) };
    expect(planStartModule(noSuch, { startModuleId: 'not_a_module' })).toBeNull();
    expect(planStartModule(onTarget, { startModuleId: null })).toBeNull();
  });

  test('planSummary is a compact stashable descriptor', () => {
    const p = buildActPlan({ 'algebra': { correct: 3, total: 8 }, 'number-quantity': { correct: 5, total: 5 } });
    const s = planSummary(p, null);
    expect(s.focusCategories).toContain('algebra');
    expect(s.masteredCategories).toContain('number-quantity');
    expect(s).toHaveProperty('startModuleId');
    expect(s).toHaveProperty('takenAt');
  });
});
