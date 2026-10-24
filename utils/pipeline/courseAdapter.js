/**
 * COURSE ADAPTER — Bridge between courseChat.js and the unified pipeline.
 *
 * Previously, courseChat.js bypassed the pipeline entirely — it built its own
 * prompt, called the LLM directly, and only used pipelineVerify for cleanup.
 * This meant course mode missed: observe, diagnose, decide, evidence assembly,
 * tutor plan updates, instructional mode awareness, and smart suggestions.
 *
 * This adapter lets courseChat route through runPipeline by:
 * 1. Loading course context (pathway, scaffold, module data)
 * 2. Merging the course system prompt with the pipeline's plan layer
 * 3. Setting up the pipeline context with course-specific metadata
 * 4. Handling course-specific post-processing (scaffold advance, module complete)
 *
 * The course scaffold becomes INPUT to the pipeline, not a parallel system.
 *
 * @module pipeline/courseAdapter
 */

const fs = require('fs');
const path = require('path');
const CourseSession = require('../../models/courseSession');
const { buildCourseSystemPrompt, loadCourseContext, calculateOverallProgress } = require('../coursePrompt');
const { processScaffoldAdvance, processModuleComplete, detectGraphTool } = require('./coursePersist');
const { evaluateStepCompletion } = require('./stepEvaluator');
const { tallyCheckpoint } = require('./checkpointEvidence');
const checkpointOutcome = require('../checkpointOutcome');
const { settleTestOut } = require('../courseMoveOn');
const { buildProgressUpdate } = require('../progressState');
const courseProgressMetrics = require('../courseProgressMetrics');
const TUTOR_CONFIG = require('../tutorConfig');

/**
 * Build pipeline context for a course interaction.
 *
 * This is what courseChat.js calls instead of building its own prompt
 * and calling the LLM directly. It returns a context object that
 * runPipeline can consume.
 *
 * @param {Object} params
 * @param {Object} params.user - User document
 * @param {Object} params.courseSession - CourseSession document
 * @param {Object} params.conversation - Conversation document
 * @param {Array}  params.formattedMessages - Message history
 * @param {Object} [params.resourceContext] - Teacher resource context
 * @returns {Object} Pipeline context with course enrichment
 */
async function buildCoursePipelineContext(params) {
  const { user, courseSession, conversation, formattedMessages, resourceContext } = params;

  // Accept pre-loaded data from caller to avoid duplicate file reads.
  // courseChat.js already reads these for validation; no need to read again.
  let pathway = params.pathway;
  let currentPathwayModule = params.currentPathwayModule;
  let moduleData = params.moduleData;

  if (!pathway) {
    const pathwayFile = path.join(__dirname, '../../public/resources', `${courseSession.courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) {
      throw new Error(`Course pathway not found: ${courseSession.courseId}`);
    }
    pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
  }

  if (!currentPathwayModule) {
    currentPathwayModule = (pathway.modules || []).find(
      m => m.moduleId === courseSession.currentModuleId
    );
    if (!currentPathwayModule) {
      throw new Error(`Module ${courseSession.currentModuleId} not found in pathway`);
    }
  }

  if (!moduleData) {
    moduleData = { title: currentPathwayModule.title, skills: currentPathwayModule.skills || [] };
    if (currentPathwayModule.moduleFile) {
      const moduleFile = path.join(__dirname, '../../public', currentPathwayModule.moduleFile);
      if (fs.existsSync(moduleFile)) {
        moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
      }
    }
  }

  // ── Build course system prompt ──
  const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
    ? user.selectedTutorId : 'default';
  const currentTutor = TUTOR_CONFIG[selectedTutorKey];

  const systemPrompt = buildCourseSystemPrompt({
    userProfile: user,
    tutorProfile: currentTutor,
    courseSession,
    pathway,
    scaffoldData: moduleData,
    currentModule: currentPathwayModule,
    resourceContext,
  });

  // ── Determine active skill from course module ──
  const activeSkill = deriveCourseActiveSkill({
    moduleData,
    currentPathwayModule,
    scaffoldIndex: courseSession.currentScaffoldIndex || 0,
  });

  // ── Step-context anchor (prevents AI drift in long conversations) ──
  const scaffold = moduleData?.scaffold || [];
  const enrichedMessages = [...formattedMessages];
  if (scaffold.length > 1) {
    const stepIdx = courseSession.currentScaffoldIndex || 0;
    const currentStep = scaffold[stepIdx];
    if (currentStep && enrichedMessages.length > 0) {
      const lastMsg = enrichedMessages[enrichedMessages.length - 1];
      if (lastMsg?.role === 'user') {
        enrichedMessages[enrichedMessages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + `\n\n[INTERNAL — DO NOT READ ALOUD: You are on step ${stepIdx + 1}/${scaffold.length} ("${currentStep.title}"). Teach only this step's content. Do not introduce topics from later steps.]`,
        };
      }
    }
  }

  return {
    systemPrompt,
    formattedMessages: enrichedMessages,
    activeSkill,
    // Course-specific metadata for post-processing
    _course: {
      courseSession,
      pathway,
      moduleData,
      currentPathwayModule,
      currentTutor,
      isParentCourse: pathway.audience === 'parent',
      isCheckpoint: moduleData?.type === 'assessment' || moduleData?.diagnosticMode || currentPathwayModule?.isCheckpoint,
    },
  };
}

/**
 * Which skill is this course turn actually about?
 *
 * Shared by BOTH entry points, because getting it wrong corrupts the mastery
 * model rather than just the UI. The pipeline attributes BKT/FSRS evidence to
 * `ctx.activeSkill?.skillId || tutorPlan.currentTarget.skillId` — that
 * fallback exists for FREE chat, but /api/chat never set activeSkill on course
 * turns, so course practice read AND wrote mastery evidence under whatever the
 * free-tutoring plan happened to be targeting (owner review, 2026-07-29). A
 * student grinding ACT exponents inside the course was crediting, say, angle
 * relationships.
 *
 * Prefers the CURRENT SCAFFOLD STEP's skill — module JSON tags each step
 * (`skill: 'act-exponents-roots'`) — so attribution follows the lesson step by
 * step instead of dumping a whole 4-skill module onto skills[0].
 *
 * @param {Object} params
 * @param {Object} [params.moduleData]           module JSON (scaffold + skills)
 * @param {Object} [params.currentPathwayModule] pathway entry (skills fallback)
 * @param {number} [params.scaffoldIndex]        step the student is on
 * @returns {{skillId:string, displayName:string, teachingGuidance:null}|null}
 */
function deriveCourseActiveSkill({ moduleData, currentPathwayModule, scaffoldIndex = 0 } = {}) {
  const moduleSkills = moduleData?.skills || currentPathwayModule?.skills || [];
  const idOf = (s) => (typeof s === 'string' ? s : s?.skillId || null);
  const nameOf = (s) => (typeof s === 'string' ? s : s?.displayName || s?.skillId || null);

  const step = (moduleData?.scaffold || [])[scaffoldIndex];
  const stepSkillId = typeof step?.skill === 'string' && step.skill.trim() ? step.skill.trim() : null;

  const skillId = stepSkillId || idOf(moduleSkills[0]);
  if (!skillId) return null;

  // Prefer a display name from the module's own skill list when it names this id.
  const match = moduleSkills.find((s) => idOf(s) === skillId);
  return {
    skillId,
    displayName: (match ? nameOf(match) : null) || skillId,
    teachingGuidance: null,
  };
}

/**
 * Post-process pipeline results for course mode.
 *
 * Handles scaffold advancement, module completion, graph tool detection,
 * and course-specific progress updates that the base pipeline doesn't know about.
 *
 * @param {Object} pipelineResult - Result from runPipeline
 * @param {Object} courseContext - The _course metadata from buildCoursePipelineContext
 * @param {Object} conversation - Conversation document (for checkpoint counting)
 * @param {boolean} wasCorrect - Whether the student answered correctly
 * @returns {Object} Enhanced result with course progress
 */
async function postProcessCourseResult(pipelineResult, courseContext, conversation, wasCorrect) {
  const { courseSession, moduleData, currentPathwayModule, isParentCourse, isCheckpoint } = courseContext;

  let courseProgressUpdate = null;
  let graphToolConfig = null;

  // ── Graph tool detection ──
  const scaffoldStep = (moduleData?.scaffold || [])[courseSession.currentScaffoldIndex || 0];
  graphToolConfig = detectGraphTool(pipelineResult.text, {
    isParentCourse,
    moduleSkills: moduleData?.skills || [],
    lessonPhase: scaffoldStep?.lessonPhase || scaffoldStep?.type || '',
  });

  if (graphToolConfig) {
    if (graphToolConfig._source === 'tag') {
      pipelineResult.text = pipelineResult.text.replace(/<GRAPH_TOOL(?:\s+[^>]*)?\s*>/gi, '').trim();
    }
    delete graphToolConfig._source;
  }

  // ── Practice-ACT launch detection ──
  // The ACT tutor emits <LAUNCH_PRACTICE_ACT> (only after the student confirms)
  // to open the REAL timed test — instead of improvising its own quiz, which
  // produces no ActTestSession and feeds none of the bootcamp targeting. The
  // shared pipeline (verify) now extracts + strips this tag, so honor that flag
  // first; the regex is a defensive fallback in case the tag survives.
  let launchPracticeAct = pipelineResult.launchPracticeAct || false;
  if (!launchPracticeAct && /<LAUNCH_PRACTICE_ACT\s*>/i.test(pipelineResult.text || '')) {
    launchPracticeAct = true;
    pipelineResult.text = pipelineResult.text.replace(/<LAUNCH_PRACTICE_ACT\s*>/gi, '').trim();
  }

  const { courseProgressUpdate: advanced, progressUpdate } = await advanceCourseProgress({
    courseSession, moduleData, conversation, wasCorrect, isParentCourse, isCheckpoint,
  });
  courseProgressUpdate = advanced;

  return {
    ...pipelineResult,
    courseProgressUpdate,
    graphToolConfig,
    launchPracticeAct,
    progressUpdate,
    courseContext: {
      courseId: courseSession.courseId,
      courseName: courseSession.courseName,
      currentModuleId: courseSession.currentModuleId,
      currentLessonId: courseSession.currentLessonId,
      overallProgress: courseSession.overallProgress,
    },
  };
}

/**
 * Evaluate the current scaffold step, advance the course if the evidence
 * supports it, and build the student-facing progress payload.
 *
 * Extracted so BOTH entry points share one progression engine. /api/chat is
 * where chat.html sends every course turn, and it used to carry its own
 * inline copy gated on the model emitting a deprecated <SCAFFOLD_ADVANCE>
 * tag — so teaching turns never moved the lesson forward and the bar sat at
 * 0% through a whole sitting (owner report, 2026-07-29). Progression is
 * backend-owned and evidence-gated (stepEvaluator + MIN_CORRECT_FOR_ADVANCE);
 * the model just teaches.
 *
 * @returns {Promise<{courseProgressUpdate: object|null, progressUpdate: object}>}
 */
async function advanceCourseProgress({
  courseSession, moduleData, conversation, wasCorrect,
  isParentCourse = false, isCheckpoint = false,
  // Explicit model signals (verify extracts <SCAFFOLD_ADVANCE> /
  // <MODULE_COMPLETE> and surfaces them on pipelineResult). Treated as a
  // FAST PATH — good evidence when present, never a requirement: the
  // evaluator below decides on every turn the model stays silent, which is
  // most of them. Explicit advances still go through processScaffoldAdvance,
  // so the practice evidence gate is not bypassed.
  explicitAdvance = false, explicitModuleComplete = false,
} = {}) {
  let courseProgressUpdate = null;

  // ── Step evaluation and scaffold advancement ──
  const currentScaffoldIdx = courseSession.currentScaffoldIndex || 0;
  const currentScaffoldStep = (moduleData?.scaffold || [])[currentScaffoldIdx];
  const isLastStep = isCheckpoint
    ? true
    : currentScaffoldIdx >= (moduleData?.scaffold?.length || 1) - 1;

  try {
    let evalResult;

    if (isCheckpoint) {
      // Checkpoint: count the answers given SINCE THE CHECKPOINT STARTED.
      // Counting the whole conversation completed every checkpoint on launch
      // (course audit, 2026-10-23) — see checkpointEvidence.js.
      //
      // A miss does NOT complete the module (owner decision 2026-10-24): the
      // student reviews what they missed, then retakes — checkpointOutcome.js.
      const review = checkpointOutcome.activeCheckpointReview(courseSession);
      if (review) {
        // Between a miss and the retake the tutor is reteaching; nothing said
        // here is a checkpoint answer.
        evalResult = {
          mode: 'checkpoint_review',
          complete: false,
          confidence: 1.0,
          evidence: `reviewing after ${review.score}% (needs ${review.passThreshold}%)`,
        };
      } else {
        const tally = tallyCheckpoint(conversation, courseSession, moduleData.assessmentProblems);
        const passThreshold = moduleData.passThreshold || 70;
        const passed = tally.score >= passThreshold;

        evalResult = {
          mode: 'checkpoint',
          complete: tally.complete && passed,
          confidence: 1.0,
          evidence: `${tally.attempted}/${tally.total} problems attempted, ${tally.correct} correct`
            + (tally.undecided ? `, ${tally.undecided} unverified` : '')
            + (tally.complete ? ` — ${tally.score}% (${passed ? 'passed' : 'below ' + passThreshold + '%'})` : ''),
        };

        if (tally.complete) {
          // A test-out settles first: passing credits the skipped lessons,
          // missing returns the student to where they were (courseMoveOn).
          const testOut = settleTestOut(courseSession, passed);
          if (passed) {
            checkpointOutcome.recordCheckpointPass(courseSession, { score: tally.score });
          } else if (testOut.testOut) {
            courseProgressUpdate = {
              event: 'checkpoint_failed',
              testOut: true,
              returnedTo: testOut.returnedTo,
              score: tally.score,
              passThreshold,
              skillBreakdown: tally.skillBreakdown,
              missedSkills: checkpointOutcome.missedSkillsFrom(tally.skillBreakdown),
            };
            await courseSession.save();
          } else {
            courseProgressUpdate = checkpointOutcome.recordCheckpointMiss(courseSession, {
              score: tally.score,
              passThreshold,
              skillBreakdown: tally.skillBreakdown,
              correct: tally.correct,
              attempted: tally.attempted,
            });
            await courseSession.save();
          }
        }
      }
    } else if (explicitModuleComplete || explicitAdvance) {
      evalResult = {
        complete: true,
        mode: 'explicit_tag',
        confidence: 1.0,
        evidence: explicitModuleComplete ? 'model emitted MODULE_COMPLETE' : 'model emitted SCAFFOLD_ADVANCE',
      };
    } else {
      evalResult = await evaluateStepCompletion(currentScaffoldStep, conversation, {
        wasCorrect,
        isParentCourse,
      });
    }

    if (evalResult.complete) {
      if (explicitModuleComplete || isLastStep) {
        courseProgressUpdate = processModuleComplete(courseSession);
        await courseSession.save();
      } else {
        courseProgressUpdate = processScaffoldAdvance(courseSession, moduleData, conversation, wasCorrect, { isParentCourse });
        if (courseProgressUpdate) {
          await courseSession.save();
        }
      }
    }

    // Telemetry at the choke point — this is the number that makes a silent
    // progression outage visible (see utils/courseProgressMetrics.js).
    courseProgressMetrics.recordProgression({
      outcome: courseProgressUpdate?.event === 'module_complete' ? 'module_complete'
        : courseProgressUpdate?.event === 'scaffold_advance' ? 'advanced'
        : courseProgressUpdate?.event === 'checkpoint_failed' ? 'checkpoint_failed'
        : evalResult.complete ? 'gate_blocked'   // judged done, advance refused
        : 'held',
      mode: evalResult.mode,
      courseId: courseSession.courseId,
      moduleId: courseSession.currentModuleId,
      stepIndex: currentScaffoldIdx,
      stepTotal: (moduleData?.scaffold || []).length || null,
      stepType: currentScaffoldStep?.type || currentScaffoldStep?.lessonPhase || null,
      evidence: evalResult.evidence,
    });
  } catch (evalErr) {
    console.error('[CourseAdapter] Step evaluator error:', evalErr.message);
    courseProgressMetrics.recordProgression({
      outcome: 'error',
      courseId: courseSession.courseId,
      moduleId: courseSession.currentModuleId,
      stepIndex: currentScaffoldIdx,
      evidence: evalErr.message,
    });
  }

  // ── Build progress update ──
  const progressUpdate = buildProgressUpdate({
    courseSession,
    moduleData,
    conversation,
    lastSignal: wasCorrect != null ? (wasCorrect ? 'correct_fast' : 'incorrect_close') : null,
    signalSource: wasCorrect != null ? 'problem_result' : null,
    showCheckpoint: false,
  });

  // Persist progress floor
  const newFloor = progressUpdate.progressFloorPct;
  if (newFloor > (courseSession.progressFloorPct || 0)) {
    courseSession.progressFloorPct = newFloor;
    courseSession.overallProgress = progressUpdate.overallPct;
    await courseSession.save();
  }

  return { courseProgressUpdate, progressUpdate };
}

module.exports = {
  buildCoursePipelineContext,
  postProcessCourseResult,
  advanceCourseProgress,
  deriveCourseActiveSkill,
};
