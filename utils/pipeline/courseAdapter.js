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
const { buildProgressUpdate } = require('../progressState');
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
  const moduleSkills = moduleData.skills || currentPathwayModule.skills || [];
  const activeSkill = moduleSkills[0] ? {
    skillId: typeof moduleSkills[0] === 'string' ? moduleSkills[0] : moduleSkills[0].skillId,
    displayName: typeof moduleSkills[0] === 'string' ? moduleSkills[0] : moduleSkills[0].displayName,
    teachingGuidance: null,
  } : null;

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

  // ── Step evaluation and scaffold advancement ──
  const currentScaffoldIdx = courseSession.currentScaffoldIndex || 0;
  const currentScaffoldStep = (moduleData?.scaffold || [])[currentScaffoldIdx];
  const isLastStep = isCheckpoint
    ? true
    : currentScaffoldIdx >= (moduleData?.scaffold?.length || 1) - 1;

  try {
    let evalResult;

    if (isCheckpoint) {
      // Checkpoint: count problem results
      const totalProblems = (moduleData.assessmentProblems || []).length;
      const problemResults = conversation.messages
        .filter(m => m.role === 'assistant' && m.problemResult)
        .map(m => m.problemResult);
      const attempted = problemResults.length;
      const correct = problemResults.filter(r => r === 'correct').length;

      evalResult = {
        mode: 'checkpoint',
        complete: attempted >= totalProblems && totalProblems > 0,
        confidence: 1.0,
        evidence: `${attempted}/${totalProblems} problems attempted, ${correct} correct`,
      };

      if (evalResult.complete) {
        const totalPoints = (moduleData.assessmentProblems || []).reduce((sum, p) => sum + (p.points || 1), 0);
        const earnedPoints = problemResults.reduce((sum, r, i) => {
          const problem = (moduleData.assessmentProblems || [])[i];
          return sum + (r === 'correct' ? (problem?.points || 1) : 0);
        }, 0);
        const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
        const mod = (courseSession.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
        if (mod) {
          mod.checkpointScore = score;
          mod.checkpointPassed = score >= (moduleData.passThreshold || 70);
        }
      }
    } else {
      evalResult = await evaluateStepCompletion(currentScaffoldStep, conversation, {
        wasCorrect,
        isParentCourse,
      });
    }

    if (evalResult.complete) {
      if (isLastStep) {
        courseProgressUpdate = processModuleComplete(courseSession);
        await courseSession.save();
      } else {
        courseProgressUpdate = processScaffoldAdvance(courseSession, moduleData, conversation, wasCorrect, { isParentCourse });
        if (courseProgressUpdate) {
          await courseSession.save();
        }
      }
    }
  } catch (evalErr) {
    console.error('[CourseAdapter] Step evaluator error:', evalErr.message);
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

  return {
    ...pipelineResult,
    courseProgressUpdate,
    graphToolConfig,
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

module.exports = {
  buildCoursePipelineContext,
  postProcessCourseResult,
};
