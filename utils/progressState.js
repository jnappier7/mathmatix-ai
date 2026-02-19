/**
 * PROGRESS STATE BUILDER
 *
 * Builds a deterministic, student-safe progressUpdate payload
 * returned on EVERY /api/course-chat response and from the
 * GET /api/course-progress rehydration endpoint.
 *
 * Internal phases (9) are mapped to 5 student-facing buckets.
 * The course-wide progress bar never moves backward (progressFloorPct).
 */

const { calculateOverallProgress } = require('./coursePrompt');

// ── Phase group mapping ───────────────────────────────────────
// Internal phase keys → student-safe bucket
const PHASE_GROUP_MAP = {
  // Scaffold step types (from module JSON)
  'intro':                  'WARMUP',
  'warmup':                 'WARMUP',
  'explanation':            'LEARN',
  'concept-intro':          'LEARN',
  'model':                  'LEARN',
  'i-do':                   'LEARN',
  'concept-check':          'GUIDED',
  'guided_practice':        'GUIDED',
  'we-do':                  'GUIDED',
  'check-in':               'GUIDED',
  'independent_practice':   'INDEPENDENT',
  'you-do':                 'INDEPENDENT',
  'mastery-check':          'CHECKPOINT',
  'mastery':                'CHECKPOINT',
  'assessment':             'CHECKPOINT'
};

const PHASE_GROUP_LABELS = {
  WARMUP:      'Warm-up',
  LEARN:       'Learn',
  GUIDED:      'Practice (Guided)',
  INDEPENDENT: 'Practice (Independent)',
  CHECKPOINT:  'Checkpoint'
};

// Friendly labels for internal scaffold step types
const PHASE_LABELS = {
  'intro':                  'Introduction',
  'warmup':                 'Warm-up',
  'explanation':            'Concept Intro',
  'concept-intro':          'Concept Intro',
  'model':                  'Worked Examples',
  'i-do':                   'Worked Examples',
  'concept-check':          'Understanding Check',
  'guided_practice':        'Guided Practice',
  'we-do':                  'Guided Practice',
  'check-in':               'Check-in',
  'independent_practice':   'Independent Practice',
  'you-do':                 'Independent Practice',
  'mastery-check':          'Checkpoint',
  'mastery':                'Checkpoint',
  'assessment':             'Checkpoint'
};

// The 5 ordered bucket keys for the checkpoint dots
const PHASE_GROUP_ORDER = ['WARMUP', 'LEARN', 'GUIDED', 'INDEPENDENT', 'CHECKPOINT'];

/**
 * Map a raw scaffold step type to student-safe group info.
 */
function mapPhaseGroup(rawPhaseKey) {
  const key = (rawPhaseKey || '').toLowerCase();
  const groupKey = PHASE_GROUP_MAP[key] || 'LEARN';
  return {
    phaseGroupKey:   groupKey,
    phaseGroupLabel: PHASE_GROUP_LABELS[groupKey] || groupKey,
    phaseLabel:      PHASE_LABELS[key] || rawPhaseKey || 'Lesson'
  };
}

/**
 * Determine which phase groups are completed/current/future
 * based on the current scaffold index and module scaffold data.
 */
function computePhaseGroupStatuses(scaffoldData, currentScaffoldIndex) {
  const scaffolds = scaffoldData?.scaffold || [];
  if (scaffolds.length === 0) return [];

  // Walk through scaffolds and find the highest group reached
  const groupsSeen = new Set();
  const currentStep = scaffolds[currentScaffoldIndex];
  const currentRaw = currentStep?.type || currentStep?.lessonPhase || '';
  const currentGroup = (PHASE_GROUP_MAP[currentRaw] || 'LEARN');

  // All steps before the current index contribute to "completed" groups
  for (let i = 0; i < currentScaffoldIndex; i++) {
    const step = scaffolds[i];
    const raw = step?.type || step?.lessonPhase || '';
    const group = PHASE_GROUP_MAP[raw] || 'LEARN';
    groupsSeen.add(group);
  }

  const currentGroupIdx = PHASE_GROUP_ORDER.indexOf(currentGroup);

  return PHASE_GROUP_ORDER.map((groupKey, idx) => {
    let status;
    if (idx < currentGroupIdx || (groupsSeen.has(groupKey) && groupKey !== currentGroup)) {
      status = 'completed';
    } else if (groupKey === currentGroup) {
      status = 'current';
    } else {
      status = 'future';
    }
    return {
      groupKey,
      label: PHASE_GROUP_LABELS[groupKey],
      status
    };
  });
}

/**
 * Build the full progressUpdate payload.
 *
 * @param {Object} opts
 * @param {Object} opts.courseSession - The CourseSession document
 * @param {Object} opts.moduleData   - The loaded module JSON (has scaffold[])
 * @param {Object} opts.conversation - The Conversation document (for problem stats)
 * @param {string|null} opts.lastSignal - Last assessment signal (correct_fast, etc.)
 * @param {boolean} opts.showCheckpoint - Whether the checkpoint phase is visible
 * @returns {Object} progressUpdate payload
 */
function buildProgressUpdate({ courseSession, moduleData, conversation, lastSignal = null, signalSource = null, showCheckpoint = false }) {
  const scaffolds = moduleData?.scaffold || [];
  const totalScaffolds = scaffolds.length || 1;
  const scaffoldIndex = courseSession.currentScaffoldIndex || 0;
  const currentStep = scaffolds[scaffoldIndex];

  // Raw phase key from scaffold step
  const rawPhaseKey = currentStep?.type || currentStep?.lessonPhase || 'explanation';

  // Map to student-safe labels
  const { phaseGroupKey, phaseGroupLabel, phaseLabel } = mapPhaseGroup(rawPhaseKey);

  // Step label: "Step 3 of 7"
  const stepLabel = `Step ${scaffoldIndex + 1} of ${totalScaffolds}`;

  // Module-level progress: steps completed / total steps.
  // scaffoldIndex is the step the student is ON; steps 0…(index-1) are done.
  const computedPct = Math.min(100, Math.max(0, Math.round((scaffoldIndex / totalScaffolds) * 100)));

  // Course-wide progress (lesson-count weighted) — the bar the student sees
  const overallPct = calculateOverallProgress(courseSession.modules || []);

  // Floor: course-wide progress never goes backward (clamped int [0, 100])
  const existingFloor = courseSession.progressFloorPct || 0;
  const progressFloorPct = Math.min(100, Math.max(0, Math.max(existingFloor, overallPct)));

  // Problem stats from conversation
  const problemsAttempted = conversation?.problemsAttempted || 0;
  const problemsCorrect = conversation?.problemsCorrect || 0;

  // Struggle flag: 3+ recent incorrect answers
  let struggleFlag = false;
  if (conversation?.messages) {
    const recent = conversation.messages.slice(-6);
    const recentIncorrect = recent.filter(m => m.problemResult === 'incorrect').length;
    struggleFlag = recentIncorrect >= 3;
  }

  // Phase group statuses for checkpoint dots
  const phaseGroups = computePhaseGroupStatuses(moduleData, scaffoldIndex);

  // UI flags: what to show/hide
  const uiFlags = {
    showCheckpoint: showCheckpoint || phaseGroupKey === 'CHECKPOINT',
    showAccuracy: problemsAttempted >= 2,
    showPercent: false  // Default: show step label instead
  };

  // displayPct: the ONLY value the UI should use for the bar width.
  // Course-wide progress with floor guarantee — frontend does zero math.
  const displayPct = Math.min(100, Math.max(0, Math.max(progressFloorPct, overallPct)));

  return {
    sessionId:         courseSession._id,
    lessonId:          courseSession.currentLessonId || null,

    rawPhaseKey,
    phaseLabel,
    phaseGroupKey,
    phaseGroupLabel,

    phaseIndex:        scaffoldIndex,
    totalPhases:       totalScaffolds,

    scaffoldIndex,
    totalScaffolds,
    stepLabel,

    problemsAttempted,
    problemsCorrect,

    lastSignal:        lastSignal || null,
    signalSource:      signalSource || null,  // 'problem_result' | 'lesson_phase_manager' | null
    struggleFlag,

    computedPct,
    overallPct,
    progressFloorPct,
    displayPct,

    masterySignal:     null,

    uiFlags,
    phaseGroups,

    updatedAt:         new Date().toISOString()
  };
}

module.exports = {
  PHASE_GROUP_MAP,
  PHASE_GROUP_LABELS,
  PHASE_GROUP_ORDER,
  PHASE_LABELS,
  mapPhaseGroup,
  computePhaseGroupStatuses,
  buildProgressUpdate
};
