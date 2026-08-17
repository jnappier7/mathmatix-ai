/**
 * DECIDE — the tutor-plan backbone and its two neighbours.
 *
 * Three seams in decide.js that shipped without a test and went dark in the
 * critical-coverage gate (functions fell to 77.8% against a 78% floor):
 *
 *   1. applyInstructionalMode's prerequisite lookup — the plan's currentTarget
 *      is matched against skillFocus[] and only gaps still marked 'needs-work'
 *      may divert the turn to a bridge. Both halves matter: matching the wrong
 *      focus entry teaches the wrong prerequisite, and failing to filter a
 *      RESOLVED gap sends the student back through work they already finished.
 *   2. The "draw it" ask standing down when the board already carries a visual
 *      — a good tutor points back at the drawing instead of redrawing it, and
 *      that silence depends on reading the board ledger's steps.
 *   3. initPhase, the exported entry point mastery/lesson sessions call to
 *      start a phase state.
 */
const { observe } = require('../../utils/pipeline/observe');
const { decide, ACTIONS, INSTRUCTIONAL_MODES, initPhase } = require('../../utils/pipeline/decide');

// A substantive, topic-naming turn with no answer to grade: the decision falls
// through to the tutor plan rather than an answer branch. (A bare "ok" would
// NOT get here — applyStudentsLeadGuard holds a topicless opener in open
// tutoring, which is its own tested policy.)
function decideWithPlan(context, message = 'can we work on slope') {
  const obs = observe(message, { recentUserMessages: [], recentAssistantMessages: [] });
  return decide(obs, { type: 'unknown' }, { phaseState: null, activeSkill: null, ...context });
}

const gap = (over = {}) => ({
  skillId: 'PA_RATIO_UNIT_RATE',
  displayName: 'Unit Rates',
  status: 'needs-work',
  familiarity: 'never-seen',
  ...over,
});

const planFor = (gaps, over = {}) => ({
  currentTarget: {
    skillId: 'ALG1_SLOPE_FROM_TABLE',
    displayName: 'Slope From a Table',
    instructionalMode: INSTRUCTIONAL_MODES.INSTRUCT,
    instructionPhase: 'concept-intro',
    ...over,
  },
  skillFocus: [{ skillId: 'ALG1_SLOPE_FROM_TABLE', prerequisiteGaps: gaps }],
});

describe('instructional mode: prerequisite gaps divert the turn', () => {
  test('an open gap on the current target routes to a prerequisite bridge', () => {
    const d = decideWithPlan({ tutorPlan: planFor([gap()]) });
    expect(d.action).toBe(ACTIONS.PREREQUISITE_BRIDGE);
    const all = d.directives.join('\n');
    expect(all).toContain('Unit Rates');
    expect(all).toContain('Slope From a Table');   // the bridge names its destination
  });

  test('a never-seen prerequisite is taught, not elicited', () => {
    const all = decideWithPlan({ tutorPlan: planFor([gap()]) }).directives.join('\n');
    expect(all).toMatch(/Teach it directly/i);
    expect(all).not.toMatch(/Use guided practice/i);
  });

  test('a shaky (seen-before) prerequisite gets guided practice instead', () => {
    const all = decideWithPlan({
      tutorPlan: planFor([gap({ familiarity: 'shaky' })]),
    }).directives.join('\n');
    expect(all).toMatch(/Use guided practice/i);
    expect(all).not.toMatch(/Teach it directly/i);
  });

  test('the DEEPEST open gap is the one worked, not the last one listed', () => {
    const all = decideWithPlan({
      tutorPlan: planFor([gap(), gap({ skillId: 'PA_PROPORTION', displayName: 'Proportions' })]),
    }).directives.join('\n');
    expect(all).toContain('Unit Rates');
    expect(all).not.toContain('Proportions');
  });

  test('a RESOLVED gap does not re-open the bridge — the target is taught', () => {
    const d = decideWithPlan({ tutorPlan: planFor([gap({ status: 'mastered' })]) });
    expect(d.action).toBe(ACTIONS.DIRECT_INSTRUCTION);
    expect(d.directives.join('\n')).not.toContain('PREREQUISITE REMEDIATION');
  });

  test('gaps belonging to a DIFFERENT skill are not borrowed', () => {
    const plan = planFor([gap()]);
    plan.skillFocus[0].skillId = 'GEO_ANGLE_PAIRS';   // focus entry for another skill
    const d = decideWithPlan({ tutorPlan: plan });
    expect(d.action).toBe(ACTIONS.DIRECT_INSTRUCTION);
    expect(d.directives.join('\n')).not.toContain('Unit Rates');
  });

  test('no plan target at all → the mode pass declines and the turn falls through', () => {
    const d = decideWithPlan({ tutorPlan: { skillFocus: [] } });
    expect(d.action).not.toBe(ACTIONS.PREREQUISITE_BRIDGE);
  });
});

describe('the "draw it" ask reads the board before asking', () => {
  const ledgerWith = (steps) => ({ conversation: { boardLedger: { current: { steps } } } });
  const visualTurn = {
    tutorPlan: planFor([], { instructionPhase: 'concept-intro' }),
    activeSkill: { displayName: 'Graphing Linear Functions' },
  };
  const drawAsk = /^DRAW IT:/m;

  test('an empty board on a teaching turn still gets the ask', () => {
    const d = decideWithPlan({ ...visualTurn, ...ledgerWith([]) });
    expect(d.action).toBe(ACTIONS.DIRECT_INSTRUCTION);
    expect(d.directives.join('\n')).toMatch(drawAsk);
  });

  test('a board of text-only steps still gets the ask', () => {
    const d = decideWithPlan({
      ...visualTurn,
      ...ledgerWith([{ action: 'write' }, { action: 'step' }]),
    });
    expect(d.directives.join('\n')).toMatch(drawAsk);
  });

  test('a board that ALREADY carries a graph stands down', () => {
    const withGraph = decideWithPlan({
      ...visualTurn,
      ...ledgerWith([{ action: 'write' }, { action: 'graph' }]),
    });
    const withoutGraph = decideWithPlan({ ...visualTurn, ...ledgerWith([{ action: 'write' }]) });
    // Same turn, same action — the only difference is what's on the board.
    expect(withGraph.action).toBe(withoutGraph.action);
    expect(withoutGraph.directives.join('\n')).toMatch(drawAsk);
    expect(withGraph.directives.join('\n')).not.toMatch(drawAsk);
  });
});

describe('initPhase', () => {
  test('starts a lesson phase state for the skill', () => {
    const state = initPhase('ALG1_SLOPE_FROM_TABLE');
    expect(state.skillId).toBe('ALG1_SLOPE_FROM_TABLE');
    expect(state.currentPhase).toBeTruthy();
    expect(state.assessmentData).toBeDefined();
    expect(state.readyForMastery).toBe(false);
  });

  test('carries the caller\'s warm-up data through', () => {
    const warmup = { skillName: 'Unit Rates', concepts: ['ratio', 'division'] };
    expect(initPhase('ALG1_SLOPE_FROM_TABLE', warmup).warmupData).toEqual(warmup);
  });

  test('defaults the warm-up when the caller has none', () => {
    expect(initPhase('ALG1_SLOPE_FROM_TABLE').warmupData).toEqual({
      skillName: 'prerequisite',
      concepts: ['basics'],
    });
  });
});
