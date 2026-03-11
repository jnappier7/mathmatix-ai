/**
 * COURSE PERSIST TESTS — Scaffold/module/lesson state machine
 *
 * Tests the extracted course progression logic that was previously
 * inlined in courseChat.js (~250 lines). Now testable as pure functions.
 */

// Mock coursePrompt to avoid loading the full module tree
jest.mock('../../utils/coursePrompt', () => ({
  calculateOverallProgress: jest.fn((modules) => {
    const done = modules.filter(m => m.status === 'completed').length;
    return Math.round((done / modules.length) * 100);
  }),
}));

const {
  detectGraphTool,
  processScaffoldAdvance,
  processModuleComplete,
  processSkillMastery,
  MIN_CORRECT_FOR_ADVANCE,
} = require('../../utils/pipeline/coursePersist');

// ── Helper: build a mock courseSession ──
function mockCourseSession(overrides = {}) {
  return {
    currentModuleId: 'mod-1',
    currentScaffoldIndex: 0,
    currentLessonId: null,
    overallProgress: 0,
    status: 'active',
    modules: [
      {
        moduleId: 'mod-1',
        status: 'in_progress',
        scaffoldProgress: 0,
        startedAt: new Date(),
        title: 'Linear Equations',
        unit: 'Unit 1',
        lessons: [
          { lessonId: 'L1', title: 'Basics', status: 'in_progress', startedAt: new Date() },
          { lessonId: 'L2', title: 'Solving', status: 'locked' },
        ],
      },
      {
        moduleId: 'mod-2',
        status: 'locked',
        scaffoldProgress: 0,
        title: 'Quadratics',
        lessons: [],
      },
    ],
    markModified: jest.fn(),
    ...overrides,
  };
}

function mockModuleData(scaffoldLength = 4) {
  const scaffold = [];
  for (let i = 0; i < scaffoldLength; i++) {
    scaffold.push({
      title: `Step ${i + 1}`,
      type: i < 2 ? 'explanation' : 'guided_practice',
      lessonId: i < 2 ? 'L1' : 'L2',
    });
  }
  return { scaffold, skills: ['linear equations', 'slope'] };
}

function mockConversation(messageCount = 0, correctCount = 0) {
  const messages = [];
  for (let i = 0; i < messageCount; i++) {
    if (i < correctCount) {
      messages.push({ role: 'assistant', content: 'test', problemResult: 'correct' });
    } else {
      messages.push({ role: 'user', content: 'test' });
    }
  }
  return { messages };
}

// ============================================================================
// detectGraphTool
// ============================================================================

describe('coursePersist: detectGraphTool', () => {
  test('detects explicit <GRAPH_TOOL> tag', () => {
    const text = 'Try plotting the line: <GRAPH_TOOL type="plot-line" slope="2" intercept="3">';
    const result = detectGraphTool(text);
    expect(result).not.toBeNull();
    expect(result.type).toBe('plot-line');
    expect(result.expectedSlope).toBe(2);
    expect(result.expectedIntercept).toBe(3);
  });

  test('detects tag without attributes', () => {
    const result = detectGraphTool('Use the graph: <GRAPH_TOOL>');
    expect(result).not.toBeNull();
    expect(result.type).toBe('plot-line');
  });

  test('returns null for parent courses', () => {
    const result = detectGraphTool('<GRAPH_TOOL>', { isParentCourse: true });
    expect(result).toBeNull();
  });

  test('keyword fallback detects graph mentions in graph modules', () => {
    const text = 'Now plot the line on the coordinate grid.';
    const result = detectGraphTool(text, {
      moduleSkills: ['graphing linear equations', 'slope-intercept'],
    });
    expect(result).not.toBeNull();
    expect(result._source).toBe('keyword');
  });

  test('keyword fallback extracts slope/intercept from y = mx + b', () => {
    const text = 'Plot y = 2x + 3 on the coordinate grid.';
    const result = detectGraphTool(text, {
      moduleSkills: ['graphing', 'slope'],
    });
    expect(result).not.toBeNull();
    expect(result.expectedSlope).toBe(2);
    expect(result.expectedIntercept).toBe(3);
  });

  test('returns null when no graph mention in non-graph module', () => {
    const result = detectGraphTool('Solve for x.', {
      moduleSkills: ['fractions', 'decimals'],
    });
    expect(result).toBeNull();
  });
});

// ============================================================================
// processScaffoldAdvance
// ============================================================================

describe('coursePersist: processScaffoldAdvance', () => {
  test('advances scaffold index on non-practice step', () => {
    const session = mockCourseSession();
    const moduleData = mockModuleData(4);
    const conversation = mockConversation();

    const result = processScaffoldAdvance(session, moduleData, conversation, false);

    expect(result).not.toBeNull();
    expect(result.event).toBe('scaffold_advance');
    expect(result.scaffoldIndex).toBe(1);
    expect(session.currentScaffoldIndex).toBe(1);
  });

  test('blocks practice phase without enough correct answers', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 2 }); // Step 2 is guided_practice
    const moduleData = mockModuleData(4);
    const conversation = mockConversation(3, 0); // No correct answers

    const result = processScaffoldAdvance(session, moduleData, conversation, false);

    expect(result).toBeNull(); // Blocked
    expect(session.currentScaffoldIndex).toBe(2); // Not advanced
  });

  test('allows practice phase with enough correct answers', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 2 });
    const moduleData = mockModuleData(4);
    const conversation = mockConversation(4, 2); // 2 correct

    const result = processScaffoldAdvance(session, moduleData, conversation, false);

    expect(result).not.toBeNull();
    expect(result.scaffoldIndex).toBe(3);
  });

  test('counts wasCorrect from current turn toward gate', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 2 });
    const moduleData = mockModuleData(4);
    const conversation = mockConversation(2, 1); // Only 1 correct in history

    // wasCorrect = true adds one more, making it 2 total
    const result = processScaffoldAdvance(session, moduleData, conversation, true);

    expect(result).not.toBeNull();
  });

  test('detects lesson transition', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 1 }); // Step 1 → Step 2 crosses L1 → L2
    const moduleData = mockModuleData(4);
    const conversation = mockConversation();

    const result = processScaffoldAdvance(session, moduleData, conversation, false);

    expect(result).not.toBeNull();
    expect(result.lessonTransition).not.toBeNull();
    expect(result.lessonTransition.completedLessonId).toBe('L1');
    expect(result.lessonTransition.nextLessonId).toBe('L2');
  });

  test('marks scaffoldAdvanced on last conversation message', () => {
    const session = mockCourseSession();
    const moduleData = mockModuleData(4);
    const conversation = { messages: [{ role: 'user', content: 'test' }] };

    processScaffoldAdvance(session, moduleData, conversation, false);

    expect(conversation.messages[0].scaffoldAdvanced).toBe(true);
  });

  test('skips practice gating for parent courses', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 2 }); // Step 2 is guided_practice
    const moduleData = mockModuleData(4);
    const conversation = mockConversation(3, 0); // No correct answers

    // Without isParentCourse, this would be blocked
    const result = processScaffoldAdvance(session, moduleData, conversation, false, { isParentCourse: true });

    expect(result).not.toBeNull();
    expect(result.event).toBe('scaffold_advance');
    expect(result.scaffoldIndex).toBe(3);
  });

  test('returns null if module not found', () => {
    const session = mockCourseSession({ currentModuleId: 'nonexistent' });
    const result = processScaffoldAdvance(session, mockModuleData(), mockConversation(), false);
    expect(result).toBeNull();
  });
});

// ============================================================================
// processModuleComplete
// ============================================================================

describe('coursePersist: processModuleComplete', () => {
  test('marks module as completed', () => {
    const session = mockCourseSession();
    const result = processModuleComplete(session);

    expect(result.event).toBe('module_complete');
    expect(result.moduleId).toBe('mod-1');
    expect(session.modules[0].status).toBe('completed');
    expect(session.modules[0].scaffoldProgress).toBe(100);
  });

  test('unlocks next module', () => {
    const session = mockCourseSession();
    processModuleComplete(session);

    expect(session.modules[1].status).toBe('available');
    expect(session.currentModuleId).toBe('mod-2');
  });

  test('resets scaffold index', () => {
    const session = mockCourseSession({ currentScaffoldIndex: 5 });
    processModuleComplete(session);

    expect(session.currentScaffoldIndex).toBe(0);
  });

  test('completes all lessons in module', () => {
    const session = mockCourseSession();
    processModuleComplete(session);

    session.modules[0].lessons.forEach(l => {
      expect(l.status).toBe('completed');
    });
  });

  test('detects full course completion', () => {
    const session = mockCourseSession();
    // Pre-complete all modules except the first
    session.modules[1].status = 'completed';
    const result = processModuleComplete(session);

    expect(result.courseComplete).toBe(true);
    expect(session.status).toBe('completed');
  });

  test('returns xpAwarded = 150', () => {
    const result = processModuleComplete(mockCourseSession());
    expect(result.xpAwarded).toBe(150);
  });
});

// ============================================================================
// processSkillMastery
// ============================================================================

describe('coursePersist: processSkillMastery', () => {
  test('initializes skill mastery on first call', () => {
    const user = { markModified: jest.fn() };
    processSkillMastery(user, 'linear-equations');

    expect(user.skillMastery).toBeDefined();
    const skill = user.skillMastery.get('linear-equations');
    expect(skill.status).toBe('learning');
    expect(skill.pillars.accuracy.correct).toBe(1);
    expect(skill.pillars.accuracy.total).toBe(1);
  });

  test('increments existing skill', () => {
    const user = { skillMastery: new Map() };
    user.skillMastery.set('test-skill', {
      pillars: {
        accuracy: { correct: 2, total: 2, percentage: 1.0, threshold: 0.90 },
        independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
        transfer: { contextsAttempted: [], contextsRequired: 3 },
        retention: { retentionChecks: [], failed: false },
      },
    });
    user.markModified = jest.fn();

    processSkillMastery(user, 'test-skill');

    const skill = user.skillMastery.get('test-skill');
    expect(skill.pillars.accuracy.correct).toBe(3);
    expect(skill.pillars.accuracy.total).toBe(3);
    // 3 correct, 3 total → 100% accuracy >= 90%, total >= 3
    // But transfer requires 3 contexts, so not mastered yet
    expect(skill.status).toBe('practicing');
  });

  test('no-ops on null skillId', () => {
    const user = {};
    processSkillMastery(user, null);
    expect(user.skillMastery).toBeUndefined();
  });
});
