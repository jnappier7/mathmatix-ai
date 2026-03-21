/**
 * COURSE PERSIST — Scaffold, module, and lesson state machine
 *
 * Extracted from courseChat.js to make course progression logic
 * testable and reusable. Consumes the `extracted` tags from the
 * verify stage and updates courseSession + conversation state.
 *
 * Does NOT save to DB — returns the mutations for the caller to save.
 * This keeps the function pure and testable.
 *
 * @module pipeline/coursePersist
 */

const { calculateOverallProgress } = require('../coursePrompt');

// ── Phase labels for breadcrumb display ──
const PHASE_LABELS = {
  'explanation': 'Concept Intro', 'concept-intro': 'Concept Intro',
  'model': 'I-Do (Modeling)', 'i-do': 'I-Do (Modeling)',
  'guided_practice': 'We-Do (Guided)', 'we-do': 'We-Do (Guided)',
  'independent_practice': 'You-Do (Independent)', 'you-do': 'You-Do (Independent)',
  'mastery-check': 'Mastery Check', 'concept-check': 'Concept Check',
  'check-in': 'Check-In',
};

const PRACTICE_PHASES = [
  'guided_practice', 'independent_practice', 'we-do', 'you-do', 'mastery-check',
];

const MIN_CORRECT_FOR_ADVANCE = 2;

/**
 * Detect interactive graph tool from AI response text.
 * Returns graph config object or null.
 *
 * @param {string} responseText - AI response (tags already stripped by verify)
 * @param {Object} options
 * @param {boolean} options.isParentCourse - Parent courses don't use graphs
 * @param {Array} options.moduleSkills - Skills for the current module
 * @param {string} options.lessonPhase - Current scaffold step phase (e.g. 'concept-intro', 'i-do', 'we-do', 'you-do')
 * @returns {Object|null} Graph tool configuration
 */
function detectGraphTool(responseText, options = {}) {
  if (options.isParentCourse) return null;
  if (!responseText) return null;

  // During concept-intro and i-do phases, the AI talks ABOUT graphs but should
  // not trigger the interactive line-plotting tool. Only an explicit tag overrides.
  const isExplanatoryPhase = ['concept-intro', 'i-do', 'explanation', 'model']
    .includes(options.lessonPhase);

  // 1. Check for explicit <GRAPH_TOOL> tag (with or without attributes)
  const tagMatch = responseText.match(/<GRAPH_TOOL(?:\s+([^>]*))?\s*>/i);
  if (tagMatch) {
    const attrs = {};
    if (tagMatch[1]) {
      tagMatch[1].replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
    }
    return {
      type: attrs.type || 'plot-line',
      expectedSlope: attrs.slope != null ? parseFloat(attrs.slope) : null,
      expectedIntercept: attrs.intercept != null ? parseFloat(attrs.intercept) : null,
      xMin: attrs.xMin ? parseInt(attrs.xMin) : -10,
      xMax: attrs.xMax ? parseInt(attrs.xMax) : 10,
      yMin: attrs.yMin ? parseInt(attrs.yMin) : -10,
      yMax: attrs.yMax ? parseInt(attrs.yMax) : 10,
      _source: 'tag',
    };
  }

  // 2. Keyword fallback — AI described the graph but forgot the tag.
  //    SKIP during explanatory phases where the AI naturally talks about
  //    "graphs" and "points" without wanting the plotting tool.
  if (isExplanatoryPhase) return null;

  const lower = responseText.toLowerCase();

  // Require an IMPERATIVE graphing instruction — the AI must be asking the
  // student to actively plot/graph something, not just mentioning graphs.
  const mentionsGraphing = /\b(plot|graph)\b.*\b(on the|on this|on your)\b.*\b(grid|plane|graph)\b/i.test(lower)
    || /\b(interactive grid|coordinate grid|coordinate plane)\b/i.test(lower);

  // Exclude purely descriptive language about reading/looking at graphs
  const isDescriptive = /\b(reading|read|look at|imagine|see|shown|has)\b.*\b(graph|circle|point)\b/i.test(lower);
  if (isDescriptive && !(/\bplot\b/i.test(lower))) return null;

  const moduleSkills = (options.moduleSkills || []).join(' ').toLowerCase();
  const isGraphModule = /graph|slope|intercept|linear|coordinate/.test(moduleSkills);

  if (mentionsGraphing && isGraphModule) {
    let slope = null, intercept = null;
    const eqMatch = responseText.match(/y\s*=\s*(-?\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)?/i);
    if (eqMatch) {
      slope = eqMatch[1] === '' || eqMatch[1] === '-' ? (eqMatch[1] === '-' ? -1 : 1) : parseFloat(eqMatch[1]);
      intercept = eqMatch[2] ? parseFloat(eqMatch[2].replace(/\s/g, '')) : 0;
    }

    return {
      type: 'plot-line',
      expectedSlope: slope,
      expectedIntercept: intercept,
      xMin: -10, xMax: 10, yMin: -10, yMax: 10,
      _source: 'keyword',
    };
  }

  return null;
}

/**
 * Process scaffold advancement.
 *
 * @param {Object} courseSession - Mongoose course session document
 * @param {Object} moduleData - Loaded module JSON (with scaffold array)
 * @param {Object} conversation - Mongoose conversation document
 * @param {boolean} wasCorrect - Whether the last answer was correct
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isParentCourse] - If true, skip practice-phase gating
 * @returns {Object|null} courseProgressUpdate object, or null if blocked/failed
 */
function processScaffoldAdvance(courseSession, moduleData, conversation, wasCorrect, options = {}) {
  const scaffold = moduleData?.scaffold || [];
  const totalSteps = scaffold.length || 1;
  const currentIdx = courseSession.currentScaffoldIndex || 0;
  const currentStep = scaffold[currentIdx];

  const mod = courseSession.modules.find(m => m.moduleId === courseSession.currentModuleId);
  if (!mod) {
    console.error(`[CoursePersist] Module "${courseSession.currentModuleId}" not found in session modules`);
    return null;
  }

  const stepType = currentStep?.type || currentStep?.lessonPhase || '';
  const isPracticePhase = PRACTICE_PHASES.includes(stepType);

  // Practice gating: count correct answers since last advance
  let correctSinceLastAdvance = 0;
  if (isPracticePhase && conversation?.messages) {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const msg = conversation.messages[i];
      if (msg.scaffoldAdvanced) break;
      if (msg.problemResult === 'correct') correctSinceLastAdvance++;
    }
    if (wasCorrect) correctSinceLastAdvance++;
  }

  if (isPracticePhase && !options.isParentCourse && correctSinceLastAdvance < MIN_CORRECT_FOR_ADVANCE) {
    console.log(`[CoursePersist] SCAFFOLD_ADVANCE blocked — "${stepType}" needs ${MIN_CORRECT_FOR_ADVANCE} correct, got ${correctSinceLastAdvance}`);
    return null;
  }

  // Advance scaffold
  const newIdx = Math.min(currentIdx + 1, totalSteps - 1);
  if (newIdx === currentIdx) {
    console.warn(`[CoursePersist] At last step (idx=${currentIdx}/${totalSteps - 1}) — AI should emit MODULE_COMPLETE`);
  }
  courseSession.currentScaffoldIndex = newIdx;
  mod.scaffoldProgress = Math.round((newIdx / totalSteps) * 100);

  if (mod.status === 'available') {
    mod.status = 'in_progress';
    mod.startedAt = mod.startedAt || new Date();
  }

  // Track lesson transitions
  const prevLessonId = currentStep?.lessonId;
  const nextStep = scaffold[newIdx];
  const nextLessonId = nextStep?.lessonId;
  let didTransitionLesson = false;

  if (prevLessonId && nextLessonId && mod.lessons?.length > 0) {
    const curLesson = mod.lessons.find(l => l.lessonId === prevLessonId);
    if (curLesson && curLesson.status === 'locked') {
      curLesson.status = 'in_progress';
      curLesson.startedAt = curLesson.startedAt || new Date();
    }

    if (prevLessonId !== nextLessonId) {
      didTransitionLesson = true;
      if (curLesson && curLesson.status !== 'completed') {
        curLesson.status = 'completed';
        curLesson.completedAt = new Date();
      }
      const nextLesson = mod.lessons.find(l => l.lessonId === nextLessonId);
      if (nextLesson) {
        nextLesson.status = 'in_progress';
        nextLesson.startedAt = nextLesson.startedAt || new Date();
      }
      courseSession.currentLessonId = nextLessonId;
    } else if (!courseSession.currentLessonId) {
      courseSession.currentLessonId = prevLessonId;
    }

    if (curLesson && curLesson.status === 'available') {
      curLesson.status = 'in_progress';
      curLesson.startedAt = curLesson.startedAt || new Date();
    }
  }

  // Recalculate progress
  courseSession.overallProgress = calculateOverallProgress(courseSession.modules);
  courseSession.markModified('modules');

  // Mark advance point on conversation
  if (conversation?.messages?.length > 0) {
    conversation.messages[conversation.messages.length - 1].scaffoldAdvanced = true;
  }

  // Build progress update
  const nextPhase = nextStep?.type || nextStep?.lessonPhase || '';
  const phaseLabel = PHASE_LABELS[nextPhase] || nextPhase;

  let completedLessonCount = 0;
  let totalLessonCount = 0;
  if (mod.lessons?.length > 0) {
    totalLessonCount = mod.lessons.length;
    completedLessonCount = mod.lessons.filter(l => l.status === 'completed').length;
  }

  const completedLessonTitle = mod.lessons?.find(l => l.lessonId === prevLessonId)?.title || '';
  const nextLessonTitle = mod.lessons?.find(l => l.lessonId === (nextLessonId || prevLessonId))?.title || '';

  return {
    event: 'scaffold_advance',
    scaffoldIndex: newIdx,
    scaffoldTotal: totalSteps,
    scaffoldProgress: mod.scaffoldProgress,
    overallProgress: courseSession.overallProgress,
    stepTitle: nextStep?.title || null,
    currentLessonId: courseSession.currentLessonId,
    lessonTitle: nextLessonTitle,
    phase: phaseLabel,
    unit: mod.unit,
    moduleName: mod.title,
    lessonTransition: didTransitionLesson ? {
      completedLessonId: prevLessonId,
      completedLessonTitle,
      nextLessonId,
      nextLessonTitle,
      lessonsCompleted: completedLessonCount,
      lessonsTotal: totalLessonCount,
    } : null,
  };
}

/**
 * Process module completion.
 *
 * @param {Object} courseSession - Mongoose course session document
 * @returns {Object} courseProgressUpdate object
 */
function processModuleComplete(courseSession) {
  const mod = courseSession.modules.find(m => m.moduleId === courseSession.currentModuleId);
  if (!mod) {
    console.error(`[CoursePersist] Module "${courseSession.currentModuleId}" not found`);
    return { event: 'module_complete', error: 'module_not_found' };
  }

  mod.status = 'completed';
  mod.scaffoldProgress = 100;
  mod.completedAt = new Date();

  // Complete all lessons in this module
  if (mod.lessons?.length > 0) {
    mod.lessons.forEach(l => {
      if (l.status !== 'completed') {
        l.status = 'completed';
        l.completedAt = new Date();
      }
    });
  }

  // Unlock next module
  const modIdx = courseSession.modules.findIndex(m => m.moduleId === courseSession.currentModuleId);
  let nextModuleId = null;
  if (modIdx >= 0 && modIdx < courseSession.modules.length - 1) {
    const nextMod = courseSession.modules[modIdx + 1];
    if (nextMod.status === 'locked') nextMod.status = 'available';
    nextMod.startedAt = new Date();
    courseSession.currentModuleId = nextMod.moduleId;
    courseSession.currentLessonId = nextMod.lessons?.[0]?.lessonId || null;
    if (nextMod.lessons?.[0]) nextMod.lessons[0].status = 'available';
    nextModuleId = nextMod.moduleId;
  }

  courseSession.currentScaffoldIndex = 0;
  courseSession.overallProgress = calculateOverallProgress(courseSession.modules);
  courseSession.markModified('modules');

  const doneCount = courseSession.modules.filter(m => m.status === 'completed').length;
  let courseComplete = false;
  if (doneCount === courseSession.modules.length) {
    courseSession.status = 'completed';
    courseSession.completedAt = new Date();
    courseComplete = true;
  }

  return {
    event: 'module_complete',
    moduleId: mod.moduleId,
    overallProgress: courseSession.overallProgress,
    nextModuleId: nextModuleId || courseSession.currentModuleId,
    currentLessonId: courseSession.currentLessonId,
    xpAwarded: 150, // Module completion XP — caller should award this
    courseComplete,
  };
}

/**
 * Process skill mastery from verify-extracted tag.
 *
 * @param {Object} user - Mongoose user document
 * @param {string} skillId - Skill ID from <SKILL_MASTERED:skillId>
 */
function processSkillMastery(user, skillId) {
  if (!skillId) return;

  user.skillMastery = user.skillMastery || new Map();
  const existing = user.skillMastery.get(skillId) || {};
  const pillars = existing.pillars || {
    accuracy: { correct: 0, total: 0, percentage: 0, threshold: 0.90 },
    independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
    transfer: { contextsAttempted: [], contextsRequired: 3 },
    retention: { retentionChecks: [], failed: false },
  };

  pillars.accuracy.correct += 1;
  pillars.accuracy.total += 1;
  pillars.accuracy.percentage = pillars.accuracy.correct / pillars.accuracy.total;

  const accuracyScore = Math.min(pillars.accuracy.percentage / 0.90, 1.0);
  const independenceScore = pillars.independence.hintsUsed <= pillars.independence.hintThreshold ? 1.0
    : Math.max(0, 1.0 - (pillars.independence.hintsUsed - pillars.independence.hintThreshold) * 0.15);
  const transferScore = Math.min(pillars.transfer.contextsAttempted.length / pillars.transfer.contextsRequired, 1.0);
  const masteryScore = Math.round(((accuracyScore + independenceScore + transferScore) / 3) * 100);

  const meetsAll = pillars.accuracy.percentage >= 0.90 && pillars.accuracy.total >= 3
    && pillars.independence.hintsUsed <= pillars.independence.hintThreshold
    && pillars.transfer.contextsAttempted.length >= pillars.transfer.contextsRequired;

  const newStatus = meetsAll ? 'mastered' : pillars.accuracy.total >= 2 ? 'practicing' : 'learning';

  user.skillMastery.set(skillId, { ...existing, status: newStatus, pillars, masteryScore, lastPracticed: new Date() });
  user.markModified('skillMastery');
}

// ── NOTE: Stall detection (shouldAutoAdvance) has been removed. ──
// The backend step evaluator (stepEvaluator.js) now runs on every turn
// and decides when to advance. The old system relied on counting turns
// since the last <SCAFFOLD_ADVANCE> tag — which only existed because
// the teaching LLM was responsible for emitting it. Now that progression
// is backend-owned, stall detection is unnecessary.
//
// shouldAutoAdvance is still exported as a no-op for backward compat
// with any code that might reference it during the transition.
function shouldAutoAdvance() {
  return false;
}

module.exports = {
  detectGraphTool,
  processScaffoldAdvance,
  processModuleComplete,
  processSkillMastery,
  shouldAutoAdvance,
  PHASE_LABELS,
  PRACTICE_PHASES,
  MIN_CORRECT_FOR_ADVANCE,
};
