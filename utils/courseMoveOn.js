'use strict';
/* ============================================================
   courseMoveOn.js — a student asking to move on, or to test out, in a course.

   Course audit, 2026-10-18: students in courses said "move on", "how many more
   until I finish this lesson?", "I know this stuff. Can't I just take a test
   and move past it?", "I'm ready test me" — and nothing in the course heard
   them. The tutor improvised off-course problems while progress sat at 0.

   Owner decision (2026-10-18):
     • "move on" on a TEACHING step (explanation / worked example / check-in)
       advances it — those steps assess nothing, the student's pace decides.
       Practice steps still need two verified correct answers.
     • "I already know this" / "test me" offers the unit's checkpoint as a
       test-out. Pass it and the unit is credited; miss it and the student
       goes back exactly where they were.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { detectTestOutIntent } = require('./testOutIntent');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function readPathway(courseId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'resources', `${courseId}-pathway.json`), 'utf8'));
  } catch { return null; }
}

function readModule(pathwayModule) {
  if (!pathwayModule || !pathwayModule.moduleFile) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, pathwayModule.moduleFile), 'utf8'));
  } catch { return null; }
}

// "I already know this", "can't I just take a test", "skip this unit".
const KNOWS_IT = /\b(?:i\s+(?:already\s+)?know\s+(?:this|all\s+(?:of\s+)?this|this\s+stuff|it\s+already|how\s+to\s+do\s+this)|already\s+know\s+(?:this|it|how)|can'?t\s+i\s+(?:just\s+)?(?:take|do)\s+(?:a|the)\s+test|let\s+me\s+(?:take|do)\s+(?:a|the)\s+test|skip\s+(?:this|the)\s+(?:unit|module))\b/i;

// "move on", "can we go to the next section", "skip ahead" — a REQUEST. A bare
// "next step"/"next one" inside a sentence is usually math talk ("the next
// step is to subtract 3"), so "next …" counts only inside a request frame, or
// as the whole message ("next section please").
const MOVES_ON = /\b(?:move\s+on|moving\s+on|skip\s+(?:this|ahead|it)|(?:can\s+we|could\s+we|let'?s|lets|i\s+want\s+to|i'?d\s+like\s+to|take\s+me\s+to|skip\s+to)\s+(?:go\s+(?:on\s+)?to\s+|move\s+to\s+|do\s+)?(?:the\s+)?next\s+(?:step|section|part|lesson|topic|one))\b/i;
const BARE_NEXT = /^\s*(?:next|continue|keep\s+going|next\s+(?:step|section|part|lesson|topic|one))(?:\s+please)?[.!]*\s*$/i;

const PRACTICE_STEP_TYPES = new Set([
  'guided_practice', 'independent_practice', 'we-do', 'you-do', 'mastery-check',
]);

/**
 * @returns {'test_out'|'skip'|null}
 */
function classifyCourseRequest(text) {
  if (!text || typeof text !== 'string') return null;
  if (KNOWS_IT.test(text) || detectTestOutIntent(text)) return 'test_out';
  if (MOVES_ON.test(text) || BARE_NEXT.test(text)) return 'skip';
  return null;
}

function isPracticeStep(step) {
  const t = step && (step.type || step.lessonPhase);
  return !!t && PRACTICE_STEP_TYPES.has(t);
}

/** Is this pathway module (with its loaded file data, if any) a checkpoint? */
function isCheckpointModule(pathwayModule, moduleData) {
  return !!(pathwayModule && pathwayModule.isCheckpoint)
    || !!(moduleData && (moduleData.type === 'assessment' || moduleData.diagnosticMode));
}

/**
 * The checkpoint that closes the student's current unit: the first checkpoint
 * at or after the current module, in pathway order.
 *
 * @param {Object} pathway         parsed *-pathway.json
 * @param {string} currentModuleId
 * @param {Function} loadModuleData (pathwayModule) => module JSON or null
 * @returns {{ moduleId: string, title: string } | null}
 */
function findUnitCheckpoint(pathway, currentModuleId, loadModuleData = readModule) {
  const mods = (pathway && pathway.modules) || [];
  const start = mods.findIndex((m) => m.moduleId === currentModuleId);
  if (start < 0) return null;
  for (let i = start; i < mods.length; i++) {
    const data = loadModuleData ? loadModuleData(mods[i]) : null;
    if (isCheckpointModule(mods[i], data)) {
      if (!data || !Array.isArray(data.assessmentProblems) || data.assessmentProblems.length === 0) return null;
      return { moduleId: mods[i].moduleId, title: (data && data.title) || mods[i].title || 'Unit checkpoint' };
    }
  }
  return null;
}

/**
 * Start a unit test-out: point the session at the unit's checkpoint and
 * remember where the student was, so a miss returns them exactly there.
 * Mutates `session` (a CourseSession document); the caller saves.
 *
 * @returns {{ moduleId, title } | null} null when the unit has no gradable checkpoint
 */
function beginTestOut(session) {
  const pathway = readPathway(session.courseId);
  const ck = pathway && findUnitCheckpoint(pathway, session.currentModuleId);
  if (!ck) return null;
  const ckProgress = (session.modules || []).find((m) => m.moduleId === ck.moduleId);
  if (!ckProgress) return null;
  if (ck.moduleId !== session.currentModuleId) {
    session.checkpointState = {
      moduleId: ck.moduleId,
      responses: [],
      startedAt: new Date(),
      currentIndex: 0,
      testOutFrom: {
        moduleId: session.currentModuleId,
        scaffoldIndex: session.currentScaffoldIndex || 0,
        checkpointPrevStatus: ckProgress.status,
      },
    };
    if (ckProgress.status === 'locked') ckProgress.status = 'available';
    session.currentModuleId = ck.moduleId;
    session.currentScaffoldIndex = 0;
    if (typeof session.markModified === 'function') {
      session.markModified('checkpointState');
      session.markModified('modules');
    }
  }
  return ck;
}

/**
 * Settle a finished checkpoint that began as a test-out. Mutates `session`.
 *   passed → every module from where the student was up to the checkpoint is
 *            credited (testedOut); the caller then completes the checkpoint
 *            as usual and moves on.
 *   missed → back to exactly where they were; the checkpoint is not
 *            completed, so it stays ahead of them in the course.
 * @returns {{ testOut: boolean, passed?: boolean, returnedTo?: string }}
 */
function settleTestOut(session, passed) {
  const from = session.checkpointState && session.checkpointState.testOutFrom;
  if (!from) return { testOut: false };
  const mods = session.modules || [];
  const fromIdx = mods.findIndex((m) => m.moduleId === from.moduleId);
  const ckIdx = mods.findIndex((m) => m.moduleId === session.currentModuleId);
  if (passed) {
    for (let i = Math.max(0, fromIdx); i >= 0 && i < ckIdx; i++) {
      const m = mods[i];
      if (m.status !== 'completed') {
        m.status = 'completed';
        m.testedOut = true;
        m.scaffoldProgress = 100;
        m.completedAt = new Date();
      }
    }
    return { testOut: true, passed: true };
  }
  if (ckIdx >= 0 && from.checkpointPrevStatus) mods[ckIdx].status = from.checkpointPrevStatus;
  session.currentModuleId = from.moduleId;
  session.currentScaffoldIndex = from.scaffoldIndex || 0;
  session.checkpointState = null;
  if (typeof session.markModified === 'function') {
    session.markModified('checkpointState');
    session.markModified('modules');
  }
  return { testOut: true, passed: false, returnedTo: from.moduleId };
}

module.exports = {
  classifyCourseRequest, isPracticeStep, isCheckpointModule, findUnitCheckpoint,
  readPathway, readModule, beginTestOut, settleTestOut,
};
