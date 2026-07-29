/**
 * Course progression on the path that actually teaches.
 *
 * Owner report, 2026-07-29: a real working sitting inside ACT Math Prep
 * showed "0/11 modules · 0%". Cause: /api/chat — where chat.html sends every
 * course message — carried its own inline progression copy gated on the model
 * emitting a <SCAFFOLD_ADVANCE> tag, while the backend evaluator that actually
 * owns progression (stepEvaluator + coursePersist, evidence-gated) lived only
 * in courseAdapter, reachable from /api/course-chat. Two prompt surfaces even
 * contradicted each other about whether to emit the tag.
 *
 * advanceCourseProgress is now the single engine both entry points call.
 */

jest.mock('../../utils/pipeline/stepEvaluator', () => ({
  evaluateStepCompletion: jest.fn(),
}));

const { evaluateStepCompletion } = require('../../utils/pipeline/stepEvaluator');
const { advanceCourseProgress } = require('../../utils/pipeline/courseAdapter');

// Mirrors the real ACT module shape: explanation → model → guided_practice.
const MODULE_DATA = {
  title: 'Number & Quantity',
  scaffold: [
    { type: 'explanation', lessonPhase: 'concept-intro', title: 'Real Number Operations', skill: 's1' },
    { type: 'model', lessonPhase: 'i-do', title: 'Worked Examples', skill: 's1' },
    { type: 'guided_practice', lessonPhase: 'we-do', title: 'Practice', skill: 's2' },
    { type: 'explanation', lessonPhase: 'concept-intro', title: 'Ratios', skill: 's3' },
  ],
};

function makeSession(overrides = {}) {
  return {
    _id: 'cs1',
    courseId: 'act-prep',
    courseName: 'ACT Math Prep',
    currentModuleId: 'number_quantity',
    currentScaffoldIndex: 0,
    progressFloorPct: 0,
    overallProgress: 0,
    modules: [
      { moduleId: 'number_quantity', unit: 1, title: 'Number & Quantity', status: 'in_progress', scaffoldProgress: 0, lessons: [] },
      { moduleId: 'functions', unit: 2, title: 'Functions', status: 'locked', scaffoldProgress: 0, lessons: [] },
    ],
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const CONVERSATION = { messages: [], problemsAttempted: 0, problemsCorrect: 0 };

beforeEach(() => evaluateStepCompletion.mockReset());

describe('advanceCourseProgress', () => {
  test('a completed teaching step advances the lesson — no tag required', async () => {
    evaluateStepCompletion.mockResolvedValue({ complete: true, mode: 'llm_eval', confidence: 0.9 });
    const session = makeSession();

    const { courseProgressUpdate, progressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
    });

    expect(session.currentScaffoldIndex).toBe(1);
    expect(courseProgressUpdate.event).toBe('scaffold_advance');
    expect(courseProgressUpdate.scaffoldTotal).toBe(4);
    expect(session.modules[0].scaffoldProgress).toBe(25);
    expect(progressUpdate.stepLabel).toBe('Step 2 of 4');
    expect(session.save).toHaveBeenCalled();
  });

  test('an incomplete step holds position but still reports progress', async () => {
    evaluateStepCompletion.mockResolvedValue({ complete: false, mode: 'llm_eval', confidence: 0.2 });
    const session = makeSession({ currentScaffoldIndex: 1 });

    const { courseProgressUpdate, progressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
    });

    expect(session.currentScaffoldIndex).toBe(1);
    expect(courseProgressUpdate).toBeNull();
    // The student still gets a live position readout — this is what replaces
    // the frozen 0%: movement is visible per STEP, not per module.
    expect(progressUpdate.stepLabel).toBe('Step 2 of 4');
    expect(Array.isArray(progressUpdate.phaseGroups)).toBe(true);
  });

  test('practice steps stay evidence-gated (one correct answer is not enough)', async () => {
    evaluateStepCompletion.mockResolvedValue({ complete: true, mode: 'deterministic', confidence: 1 });
    const session = makeSession({ currentScaffoldIndex: 2 }); // guided_practice

    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: { messages: [] },
      wasCorrect: true,
    });

    expect(session.currentScaffoldIndex).toBe(2);
    expect(courseProgressUpdate).toBeNull();
  });

  test('completing the LAST step completes the module and unlocks the next', async () => {
    evaluateStepCompletion.mockResolvedValue({ complete: true, mode: 'llm_eval', confidence: 0.9 });
    const session = makeSession({ currentScaffoldIndex: 3 }); // last step

    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
    });

    expect(courseProgressUpdate.event).toBe('module_complete');
    expect(session.modules[0].status).toBe('completed');
    expect(session.modules[0].scaffoldProgress).toBe(100);
    expect(session.modules[1].status).toBe('available');
    expect(session.currentModuleId).toBe('functions');
    expect(session.currentScaffoldIndex).toBe(0);
  });

  test('an explicit <SCAFFOLD_ADVANCE> is honored as a fast path (evaluator skipped)', async () => {
    const session = makeSession();
    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
      explicitAdvance: true,
    });

    expect(evaluateStepCompletion).not.toHaveBeenCalled();
    expect(session.currentScaffoldIndex).toBe(1);
    expect(courseProgressUpdate.event).toBe('scaffold_advance');
  });

  test('an explicit tag does NOT bypass the practice evidence gate', async () => {
    const session = makeSession({ currentScaffoldIndex: 2 }); // guided_practice
    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: { messages: [] },
      wasCorrect: true,
      explicitAdvance: true,
    });

    expect(session.currentScaffoldIndex).toBe(2);
    expect(courseProgressUpdate).toBeNull();
  });

  test('an explicit <MODULE_COMPLETE> completes the module from any step', async () => {
    const session = makeSession({ currentScaffoldIndex: 1 }); // not the last step
    const { courseProgressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
      explicitModuleComplete: true,
    });

    expect(courseProgressUpdate.event).toBe('module_complete');
    expect(session.modules[0].status).toBe('completed');
  });

  test('an evaluator failure never breaks the turn', async () => {
    evaluateStepCompletion.mockRejectedValue(new Error('sidecar down'));
    const session = makeSession();

    const { courseProgressUpdate, progressUpdate } = await advanceCourseProgress({
      courseSession: session,
      moduleData: MODULE_DATA,
      conversation: CONVERSATION,
      wasCorrect: null,
    });

    expect(courseProgressUpdate).toBeNull();
    expect(progressUpdate.stepLabel).toBe('Step 1 of 4');
    expect(session.currentScaffoldIndex).toBe(0);
  });
});

describe('/api/chat wiring (the path chat.html actually uses)', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');

  test('calls the shared engine, with the model tags as a fast path only', () => {
    expect(src).toMatch(/advanceCourseProgress\(\{/);
    // The flags are still read (courseProgressWiring.test.js pins that), but
    // they are now inputs to the engine rather than the gate around it.
    expect(src).toMatch(/explicitAdvance: pipelineResult\.scaffoldAdvance === true/);
    expect(src).not.toMatch(/if \(hasScaffoldAdvance \|\| hasModuleComplete\)/);
  });

  test('returns the student-facing progressUpdate payload', () => {
    expect(src).toMatch(/progressUpdate: lessonProgressUpdate \|\| null/);
  });

  test('the step anchor no longer asks the model to emit the advance tag', () => {
    const anchor = src.slice(src.indexOf('[STEP ${courseScaffoldCtx.stepIdx'));
    expect(anchor.slice(0, 400)).not.toMatch(/emit <SCAFFOLD_ADVANCE>/);
  });
});
