/**
 * The Growth Check's completion moment.
 *
 * Before this, a check ended on a stats card: no comparison to last time, no
 * named skills, no next step — and the tutor, who had just said "come back
 * here when you're done", never mentioned it again. These tests pin the shape
 * of the summary routes/screener.js hands to the results screen AND to the tutor's debrief, so the card and the
 * tutor can never tell two different stories.
 */

const {
  summarizeGrowthStatus,
  buildGrowthCheckSummary,
  pickSuggestedNextStep,
  levelStoryLine,
  buildDebriefInstruction,
  fallbackDebriefText,
  humanizeSkillId,
} = require('../../utils/growthSummary');

const skill = (skillId, name) => ({ skillId, name });

describe('summarizeGrowthStatus', () => {
  test.each([
    [0.9, 'significant-growth'],
    [0.31, 'significant-growth'],
    [0.2, 'some-growth'],
    [0.0, 'stable'],
    [-0.09, 'stable'],
    [-0.4, 'review-needed'],
  ])('θ change %p → %s', (change, expected) => {
    expect(summarizeGrowthStatus(change).growthStatus).toBe(expected);
  });

  test('every status carries a student-facing message', () => {
    for (const change of [0.9, 0.2, 0, -0.5]) {
      expect(summarizeGrowthStatus(change).growthMessage).toEqual(expect.any(String));
      expect(summarizeGrowthStatus(change).growthMessage.length).toBeGreaterThan(0);
    }
  });
});

describe('buildGrowthCheckSummary', () => {
  const base = {
    previousTheta: 0.2,
    newTheta: 0.75,
    accuracy: 83,
    questionsAnswered: 6,
    durationMs: 240000,
    confirmedSkills: [skill('ms-ratios', 'ratios')],
    needsReviewSkills: [],
    newlyReachableSkills: [skill('alg1-slope', 'slope')],
  };

  test('reports BOTH levels from theta, so the comparison can never contradict the estimate', () => {
    const s = buildGrowthCheckSummary(base);
    // θ 0.2 → 6th Grade, θ 0.75 → 8th Grade (utils/catConfig thetaToGradeLevel)
    expect(s.previousLevel).toBe('6th Grade');
    expect(s.newLevel).toBe('8th Grade');
    expect(s.levelChanged).toBe(true);
    expect(s.thetaChange).toBeCloseTo(0.55, 5);
    expect(s.growthStatus).toBe('significant-growth');
  });

  test('a level that did not move is reported as unchanged, not as growth', () => {
    const s = buildGrowthCheckSummary({ ...base, previousTheta: 0.4, newTheta: 0.45 });
    expect(s.previousLevel).toBe(s.newLevel);
    expect(s.levelChanged).toBe(false);
    expect(s.growthStatus).toBe('stable');
  });

  test('carries the performance numbers the results card renders', () => {
    const s = buildGrowthCheckSummary(base);
    expect(s).toMatchObject({
      type: 'growth-check',
      accuracy: 83,
      questionsAnswered: 6,
      durationMs: 240000,
    });
    expect(s.skillsConfirmed).toEqual([skill('ms-ratios', 'ratios')]);
    expect(s.newlyReachable).toEqual([skill('alg1-slope', 'slope')]);
  });

  test('ALWAYS ends on exactly one next step — the closure the flow was missing', () => {
    const s = buildGrowthCheckSummary(base);
    expect(s.suggestedNextStep).toBeTruthy();
    expect(s.suggestedNextStep.text).toEqual(expect.any(String));
    expect(s.suggestedNextStep.text.length).toBeGreaterThan(0);
  });

  test('still produces a next step when nothing was confirmed or unlocked', () => {
    const s = buildGrowthCheckSummary({
      ...base,
      confirmedSkills: [],
      needsReviewSkills: [],
      newlyReachableSkills: [],
    });
    expect(s.suggestedNextStep.kind).toBe('continue');
    expect(s.suggestedNextStep.text).toContain(s.newLevel);
  });

  test('theta values are rounded for display, not left at raw float precision', () => {
    const s = buildGrowthCheckSummary({ ...base, previousTheta: 0.123456, newTheta: 0.987654 });
    expect(s.previousTheta).toBe(0.12);
    expect(s.newTheta).toBe(0.99);
  });
});

describe('pickSuggestedNextStep', () => {
  const confirmed = [skill('ms-ratios', 'ratios')];
  const review = [skill('ms-fractions', 'adding fractions')];
  const reachable = [skill('alg1-slope', 'slope')];

  test('a review-needed check leads with the skill that wobbled', () => {
    const step = pickSuggestedNextStep({
      growthStatus: 'review-needed',
      newLevel: '6th Grade',
      confirmedSkills: confirmed,
      needsReviewSkills: review,
      newlyReachableSkills: reachable,
    });
    expect(step.kind).toBe('review');
    expect(step.skillId).toBe('ms-fractions');
  });

  test('a growing student is pointed at what just came into reach', () => {
    const step = pickSuggestedNextStep({
      growthStatus: 'significant-growth',
      newLevel: '8th Grade',
      confirmedSkills: confirmed,
      needsReviewSkills: [],
      newlyReachableSkills: reachable,
    });
    expect(step.kind).toBe('advance');
    expect(step.skillId).toBe('alg1-slope');
  });

  test('with nothing new unlocked, a miss still gets picked up', () => {
    const step = pickSuggestedNextStep({
      growthStatus: 'stable',
      newLevel: '6th Grade',
      confirmedSkills: confirmed,
      needsReviewSkills: review,
      newlyReachableSkills: [],
    });
    expect(step.kind).toBe('review');
  });

  test('a clean sweep with nothing new becomes a stretch, never a dead end', () => {
    const step = pickSuggestedNextStep({
      growthStatus: 'stable',
      newLevel: '6th Grade',
      confirmedSkills: confirmed,
      needsReviewSkills: [],
      newlyReachableSkills: [],
    });
    expect(step.kind).toBe('stretch');
  });
});

describe('levelStoryLine', () => {
  test('a level gain reads as a move up', () => {
    const s = buildGrowthCheckSummary({
      previousTheta: 0.2, newTheta: 0.75, accuracy: 90, questionsAnswered: 6,
    });
    expect(levelStoryLine(s)).toContain('moved up');
  });

  test('a level drop is framed as focus, never as failure', () => {
    const s = buildGrowthCheckSummary({
      previousTheta: 0.75, newTheta: 0.1, accuracy: 40, questionsAnswered: 6,
    });
    const line = levelStoryLine(s);
    expect(line).toContain('normal');
    expect(line).not.toMatch(/fail|behind|worse/i);
  });
});

describe('buildDebriefInstruction', () => {
  const summary = buildGrowthCheckSummary({
    previousTheta: 0.2,
    newTheta: 0.75,
    accuracy: 83,
    questionsAnswered: 6,
    confirmedSkills: [skill('ms-ratios', 'ratios')],
    needsReviewSkills: [skill('ms-fractions', 'adding fractions')],
    newlyReachableSkills: [skill('alg1-slope', 'slope')],
  });

  test('hands the tutor the real numbers and skills rather than letting it invent them', () => {
    const instr = buildDebriefInstruction(summary);
    expect(instr).toContain('6th Grade');
    expect(instr).toContain('8th Grade');
    expect(instr).toContain('ratios');
    expect(instr).toContain('adding fractions');
    expect(instr).toContain('slope');
    expect(instr).toContain('83%');
    expect(instr).toMatch(/do not alter or invent/i);
  });

  test('SUGGESTS one next step and forbids starting it — open chat is the student\'s lead', () => {
    const instr = buildDebriefInstruction(summary);
    expect(instr).toMatch(/EXACTLY ONE suggested next step/);
    expect(instr).toMatch(/Do NOT start that activity/i);
    expect(instr).toMatch(/do NOT ask them a math question now/i);
    expect(instr).toMatch(/driver's seat|whatever they brought/i);
  });

  test('keeps IRT internals away from the student', () => {
    const instr = buildDebriefInstruction(summary);
    expect(instr).toMatch(/No percentile, no theta/);
  });

  test('the greeting variant folds in rather than opening cold', () => {
    const viaGreeting = buildDebriefInstruction(summary, { viaGreeting: true });
    expect(viaGreeting).toMatch(/greeting/i);
    expect(viaGreeting).toMatch(/Skip any warm-up/i);
  });
});

describe('fallbackDebriefText', () => {
  const summary = buildGrowthCheckSummary({
    previousTheta: 0.2,
    newTheta: 0.75,
    accuracy: 83,
    questionsAnswered: 6,
    confirmedSkills: [skill('ms-ratios', 'ratios')],
    newlyReachableSkills: [skill('alg1-slope', 'slope')],
  });

  test('the closure still happens when the LLM call fails', () => {
    const text = fallbackDebriefText(summary, 'Jason');
    expect(text).toContain('Jason');
    expect(text).toContain('6 questions');
    expect(text).toContain('83%');
    expect(text).toContain('8th Grade');
    expect(text).toContain(summary.suggestedNextStep.text);
  });

  test('works without a first name', () => {
    expect(fallbackDebriefText(summary)).toMatch(/^That's your Growth Check done/);
  });
});

describe('humanizeSkillId', () => {
  test('an id with no catalog entry still reads like words, not a slug', () => {
    expect(humanizeSkillId('alg1-solving-two-step-equations')).toBe('solving two step equations');
    expect(humanizeSkillId('ratios')).toBe('ratios');
  });
});
