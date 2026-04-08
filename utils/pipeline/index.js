/**
 * TUTORING PIPELINE — Orchestrates the 6-stage cognitive architecture
 *
 * observe → diagnose → decide → generate → verify → persist
 *
 * The engine decides. The LLM speaks. The system verifies.
 *
 * Usage from chat.js:
 *   const { runPipeline } = require('../utils/pipeline');
 *   const result = await runPipeline(message, pipelineContext);
 *
 * The pipeline returns everything chat.js needs to build the response JSON.
 * Chat.js keeps responsibility for: request validation, context loading,
 * streaming setup, and response formatting.
 *
 * @module pipeline
 */

const { observe, MESSAGE_TYPES } = require('./observe');
const { diagnose } = require('./diagnose');
const { decide, ACTIONS } = require('./decide');
const { generate, assemblePrompt } = require('./generate');
const { verify } = require('./verify');
const { persist } = require('./persist');
const { buildSidecar, mergeLlmSignals, getSignalStats } = require('./sidecar');
const { computeSessionMood, buildMoodDirective } = require('./sessionMood');
const { generateSuggestions } = require('./suggestions');
const { assembleEvidence } = require('./evidenceAccumulator');

// New data-driven engines
const { updateBKT, initializeBKT } = require('../knowledgeTracer');
const { updateCard, initializeCard, rateAttempt, RATINGS } = require('../fsrsScheduler');
const { recordAttempt: recordConsistencyAttempt, initializeScore, categorizeDifficulty } = require('../consistencyScorer');

// Backbone: Tutor Plan + Skill Familiarity
const { loadOrCreatePlan, resolveCurrentTarget, updatePlanAfterInteraction, advanceInstructionPhase } = require('../tutorPlanManager');
const { buildPlanLayer, shouldSuppressSocratic } = require('../promptPlanLayer');
const { evaluatePhaseAdvancement, reassessFamiliarity, createPhaseTracker, updatePhaseTracker } = require('../phaseEvidenceEvaluator');
const { detectModeTransition } = require('../modeTransitionDetector');
const { gradeTurn, summarizeSession, createScorecard } = require('../sessionGrader');
const { detectPatterns, summarizeSession: summarizeForPatterns } = require('../sessionPatternDetector');

/**
 * Run the full tutoring pipeline.
 *
 * @param {string} message - The student's raw message
 * @param {Object} ctx - Pipeline context (assembled by chat.js before calling)
 * @param {Object} ctx.user - Mongoose user document
 * @param {Object} ctx.conversation - Mongoose conversation document
 * @param {string} ctx.systemPrompt - Pre-built system prompt
 * @param {Array}  ctx.formattedMessages - Conversation history for LLM
 * @param {Object} ctx.activeSkill - Current skill if any { skillId, displayName, teachingGuidance }
 * @param {Object} ctx.phaseState - Lesson phase state if in structured mode
 * @param {boolean} ctx.hasRecentUpload - Whether student has recent uploads
 * @param {boolean} ctx.stream - Whether to stream the response
 * @param {Object} ctx.res - Express response object (for streaming)
 * @param {number} ctx.aiProcessingStartTime - Date.now() when processing started
 * @param {boolean} [ctx.skipPersist=false] - Skip persist stage and learning engine updates (for anonymous trial chat)
 * @returns {Object} Pipeline result with everything needed for the response
 */
async function runPipeline(message, ctx) {
  const startTime = Date.now();

  // ── Stage 1: OBSERVE ──
  const recentUserMessages = ctx.conversation.messages
    .filter(msg => msg.role === 'user')
    .slice(-6);
  const recentAssistantMessages = ctx.conversation.messages
    .filter(msg => msg.role === 'assistant')
    .slice(-6);

  const observation = observe(message, {
    recentUserMessages,
    recentAssistantMessages,
    hasRecentUpload: ctx.hasRecentUpload || false,
  });

  console.log(`[Pipeline] Observe: ${observation.messageType} (confidence: ${observation.confidence})`);

  // ── Stage 2: DIAGNOSE ──
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages: recentAssistantMessages.map(msg => ({
      content: msg.content,
      problemResult: msg.problemResult,
    })),
    recentUserMessages: recentUserMessages.map(msg => ({ content: msg.content })),
    activeSkill: ctx.activeSkill || null,
    user: ctx.user,
  });

  if (diagnosis.type !== 'no_answer') {
    console.log(`[Pipeline] Diagnose: ${diagnosis.type} (answer: ${diagnosis.answer}, correct: ${diagnosis.correctAnswer})`);
  }

  // ── Session mood (emotional arc across the conversation) ──
  const sessionMood = computeSessionMood(ctx.conversation.messages, {
    sessionStart: ctx.conversation.createdAt || ctx.conversation.startDate,
  });

  if (sessionMood.summary) {
    const emotionalTag = sessionMood.emotionalState?.state && sessionMood.emotionalState.state !== 'neutral'
      ? `, emotion: ${sessionMood.emotionalState.state} (${Math.round(sessionMood.emotionalState.confidence * 100)}%)`
      : '';
    console.log(`[Pipeline] Mood: ${sessionMood.trajectory} (energy: ${sessionMood.energy}, momentum: ${sessionMood.momentum}${sessionMood.inFlow ? ', IN FLOW' : ''}${sessionMood.fatigueSignal ? ', FATIGUE' : ''}${emotionalTag})`);
  }

  // ── Backbone: Load Tutor Plan ──
  // The tutor's persistent mental model of this student. Loaded at the start
  // of every interaction so the decide stage knows the instructional mode.
  let tutorPlan = null;
  let skillResolution = null;
  try {
    // Accept a pre-loaded plan from the caller to avoid a duplicate DB query.
    // chat.js already loads it for re-entry/override detection.
    tutorPlan = ctx.tutorPlan || await loadOrCreatePlan(ctx.user._id, { user: ctx.user });

    const resolved = await resolveCurrentTarget(tutorPlan, {
      user: ctx.user,
      activeSkillId: ctx.activeSkill?.skillId || null,
    });
    tutorPlan = resolved.plan;
    skillResolution = resolved.skillResolution;

    if (tutorPlan.currentTarget?.skillId) {
      console.log(`[Pipeline] TutorPlan: target=${tutorPlan.currentTarget.skillId}, mode=${tutorPlan.currentTarget.instructionalMode}${tutorPlan.currentTarget.instructionPhase ? ', phase=' + tutorPlan.currentTarget.instructionPhase : ''}`);
    }
  } catch (err) {
    console.error('[Pipeline] TutorPlan load error (non-fatal):', err.message);
    // TutorPlan is optional — pipeline continues without it
  }

  // ── Evidence Assembly (NEW: data-driven intelligence layer) ──
  // Gathers signals from BKT, FSRS, cognitive load, consistency scoring,
  // and misconception history into a unified evidence object for decide.js
  let evidence = null;
  try {
    // Extract session data for cognitive load estimation
    const allMessages = ctx.conversation.messages || [];
    const userMsgs = allMessages.filter(m => m.role === 'user');
    const assistantMsgs = allMessages.filter(m => m.role === 'assistant');

    const conversationData = {
      responseTimes: assistantMsgs
        .filter(m => m.responseTime)
        .map(m => m.responseTime),
      results: assistantMsgs
        .filter(m => m.problemResult)
        .map(m => ({
          correct: m.problemResult === 'correct',
          hintUsed: false, // Historical messages don't carry per-turn hint flags
          difficulty: 'medium',
        })),
      messageLengths: userMsgs
        .slice(-10)
        .map(m => (m.content || '').split(/\s+/).length),
      sessionDurationMinutes: ctx.conversation.createdAt
        ? (Date.now() - new Date(ctx.conversation.createdAt).getTime()) / 60000
        : 0,
    };

    // Get BKT state for active skill (from user's learningEngines data)
    const bktState = ctx.activeSkill && ctx.user.learningEngines?.bkt
      ? (ctx.user.learningEngines.bkt.get
        ? ctx.user.learningEngines.bkt.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.bkt[ctx.activeSkill.skillId])
      : null;

    // Get FSRS card for active skill
    const fsrsCard = ctx.activeSkill && ctx.user.learningEngines?.fsrs
      ? (ctx.user.learningEngines.fsrs.get
        ? ctx.user.learningEngines.fsrs.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.fsrs[ctx.activeSkill.skillId])
      : null;

    // Get consistency state for active skill
    const consistencyState = ctx.activeSkill && ctx.user.learningEngines?.consistency
      ? (ctx.user.learningEngines.consistency.get
        ? ctx.user.learningEngines.consistency.get(ctx.activeSkill.skillId)
        : ctx.user.learningEngines.consistency[ctx.activeSkill.skillId])
      : null;

    // Get misconception history
    const misconceptionHistory = ctx.user.masteryProgress?.activeBadge?.misconceptionsAddressed || [];

    evidence = assembleEvidence({
      observation,
      diagnosis,
      sessionMood,
      bktState,
      fsrsCard,
      consistencyState,
      conversationData,
      studentProfile: {
        theta: ctx.user.assessmentResults?.theta || 0,
        misconceptionHistory,
        skillMastery: ctx.user.skillMastery,
      },
      activeSkill: ctx.activeSkill,
    });

    if (evidence.composite.reasoning.length > 0) {
      console.log(`[Pipeline] Evidence: ${evidence.composite.reasoning.slice(0, 3).join('; ')}`);
    }
  } catch (err) {
    console.error('[Pipeline] Evidence assembly error (non-fatal):', err.message);
    // Evidence is optional — pipeline continues without it
  }

  // ── Mode transition detection (fluid context shifts) ──
  let modeTransition = null;
  if (tutorPlan) {
    try {
      modeTransition = detectModeTransition(message, observation, {
        tutorPlan,
        activeSkill: ctx.activeSkill,
        courseSession: ctx._course?.courseSession || null,
        sessionMood,
      });
      if (modeTransition?.shouldTransition) {
        console.log(`[Pipeline] Mode transition: ${modeTransition.type} (${modeTransition.reason}) confidence=${modeTransition.confidence}`);
      }
    } catch (err) {
      console.error('[Pipeline] Mode transition detection error (non-fatal):', err.message);
    }
  }

  // ── Stage 3: DECIDE (enhanced with evidence + tutor plan + mode transitions) ──
  const decision = decide(observation, diagnosis, {
    phaseState: ctx.phaseState || null,
    activeSkill: ctx.activeSkill || null,
    sessionMood,
    evidence,
    tutorPlan: tutorPlan || null,
    modeTransition: modeTransition?.shouldTransition ? modeTransition : null,
    hasRecentUpload: ctx.hasRecentUpload || false,
  });

  // Inject mode transition directives into the decision
  if (modeTransition?.shouldTransition && modeTransition.suggestedDirectives) {
    for (const directive of modeTransition.suggestedDirectives) {
      decision.directives.push(directive);
    }
    // If the transition has a connection to the plan, add it as context
    if (modeTransition.connectionToPlan) {
      decision.directives.push(`[PLAN CONNECTION: ${modeTransition.connectionToPlan}]`);
    }
  }

  console.log(`[Pipeline] Decide: ${decision.action}${decision.phase ? ` (phase: ${decision.phase})` : ''}`);

  // ── Build sidecar (deterministic signals pre-filled) ──
  const sidecar = buildSidecar(observation, diagnosis, decision, {
    user: ctx.user,
    activeSkill: ctx.activeSkill || null,
  });

  // ── Stage 4: GENERATE ──
  const moodDirective = buildMoodDirective(sessionMood);

  // Inject tutor plan layer into system prompt
  let enrichedSystemPrompt = ctx.systemPrompt;
  // Socratic suppression is now handled structurally via buildSlimRules and
  // buildStaticRules options — NOT via string surgery on the assembled prompt.
  // This flag flows through to assemblePrompt → buildSlimRules.
  // Teaching mode (suppressSocratic) is allowed for LLM-generated problems
  // (the AI teaching concepts), but NOT when the student is asking about their
  // uploaded worksheet. Worksheet problems require Socratic enforcement.
  const isReferencingWorksheet = observation.isWorksheetFollowUp ||
    observation.messageType === 'check_my_work';
  const suppressSocratic = isReferencingWorksheet
    ? false
    : (tutorPlan ? shouldSuppressSocratic(tutorPlan) : false);

  if (tutorPlan) {
    const planLayer = buildPlanLayer(tutorPlan, {
      skillResolution,
      interactionType: ctx.conversation?.conversationType || 'chat',
    });
    if (planLayer) {
      enrichedSystemPrompt += '\n\n' + planLayer;
    }
  }

  const assembled = assemblePrompt(decision, {
    systemPrompt: enrichedSystemPrompt,
    messages: ctx.formattedMessages,
    moodDirective,
    suppressSocratic,
  });

  let rawResponseText;
  if (ctx.stream && ctx.res) {
    rawResponseText = await generate(assembled, { stream: true, res: ctx.res });
  } else {
    rawResponseText = await generate(assembled);
  }

  // ── Stage 5: VERIFY ──
  const verified = await verify(rawResponseText, {
    userId: ctx.user._id?.toString(),
    userMessage: message,
    iepReadingLevel: ctx.user.iepPlan?.readingLevel || null,
    firstName: ctx.user.firstName,
    isVisualLearner: ctx.user.learningStyle === 'Visual' || ctx.user.learningProfile?.learningStyle?.prefersDiagrams === true,
    isStreaming: ctx.stream || false,
    res: ctx.res || null,
    action: decision.action,
    messageType: observation.messageType,
    correctAnswer: diagnosis.correctAnswer || null,
    diagnosisType: diagnosis.type,
    hasRecentUpload: ctx.hasRecentUpload || false,
    isWorksheetFollowUp: observation.isWorksheetFollowUp || false,
  });

  console.log(`[Pipeline] Verify: ${verified.flags.length > 0 ? verified.flags.join(', ') : 'clean'}`);

  // ── Merge LLM signals into sidecar ──
  mergeLlmSignals(sidecar, verified.extracted);
  const signalStats = getSignalStats(sidecar);
  console.log(`[Pipeline] Sidecar: ${signalStats.total} signals (${signalStats.pipelineDerived} deterministic, ${signalStats.llmEmitted} from LLM)`);

  // ── Stage 6: PERSIST ──
  // When skipPersist is true (e.g. anonymous trial chat), skip all DB writes
  // and learning engine updates. The cognitive stages still ran, so the AI
  // response quality is identical — we just don't save state.
  const aiProcessingSeconds = Math.ceil((Date.now() - (ctx.aiProcessingStartTime || startTime)) / 1000);

  let persistResults;
  if (ctx.skipPersist) {
    persistResults = {
      xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
      problemAnswered: false,
      wasCorrect: false,
      wasSkipped: false,
      leveledUp: false,
      tutorsUnlocked: [],
      avatarBuilderUnlocked: false,
      iepGoalUpdates: [],
      courseProgressUpdate: null,
      aiTimeUsed: 0,
      freeWeeklySecondsRemaining: null,
    };
    console.log('[Pipeline] Persist: SKIPPED (skipPersist=true)');
  } else {
    // ── Update learning engines (BKT, FSRS, ConsistencyScorer) ──
    // These run BEFORE persist so the updated states are saved with the user document.
    if (ctx.activeSkill && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
      try {
        updateLearningEngines(ctx.user, ctx.activeSkill.skillId, diagnosis, observation);
      } catch (err) {
        console.error('[Pipeline] Learning engine update error (non-fatal):', err.message);
      }
    }

    persistResults = await persist({
      user: ctx.user,
      conversation: ctx.conversation,
      extracted: verified.extracted,
      diagnosis,
      observation,
      decision,
      responseText: verified.text,
      originalMessage: message,
      aiProcessingSeconds,
      sessionMood,
      evidence,
    });

    // ── Update Tutor Plan after interaction (evidence-driven) ──
    if (tutorPlan) {
      try {
        const targetSkillId = ctx.activeSkill?.skillId || tutorPlan.currentTarget?.skillId;
        const notes = [];
        let shouldAdvance = false;
        let advanceToPhase = null;
        let familiarityChange = null;

        // ── 1. Evidence-based phase advancement ──
        // Instead of advancing on a single correct answer, evaluate accumulated evidence
        if (tutorPlan.currentTarget?.instructionPhase && tutorPlan.currentTarget?.instructionalMode === 'instruct') {
          const phaseTracker = ctx.conversation?.phaseTracker || createPhaseTracker(
            tutorPlan.currentTarget.instructionPhase,
            targetSkillId
          );

          const phaseEval = evaluatePhaseAdvancement(
            { phase: phaseTracker.phase, turnsInPhase: phaseTracker.turnsInPhase, evidenceLog: phaseTracker.evidenceLog },
            { diagnosis, observation, decision, sessionMood },
            { tutorPlan, evidence }
          );

          updatePhaseTracker(phaseTracker, phaseEval, { diagnosis, observation, decision });

          // Store tracker on conversation for cross-turn accumulation
          if (ctx.conversation) {
            ctx.conversation.phaseTracker = phaseTracker;
            ctx.conversation.markModified?.('phaseTracker');
          }

          if (phaseEval.shouldAdvance) {
            shouldAdvance = true;
            advanceToPhase = phaseEval.nextPhase;
            console.log(`[Pipeline] Phase advance: ${phaseTracker.phase} → ${phaseEval.nextPhase} (${phaseEval.reasoning})`);
            notes.push({
              content: `Phase advanced: ${phaseEval.reasoning}`,
              category: 'general',
              skillId: targetSkillId,
            });
          } else if (phaseEval.shouldRegress) {
            shouldAdvance = true; // We use the same mechanism for regression
            advanceToPhase = phaseEval.nextPhase;
            console.log(`[Pipeline] Phase regression: → ${phaseEval.nextPhase} (${phaseEval.reasoning})`);
            notes.push({
              content: `Phase regressed: ${phaseEval.reasoning}`,
              category: 'general',
              skillId: targetSkillId,
            });
          }
        }

        // ── 2. Real-time familiarity re-assessment ──
        // If the student surprises us (knows more or less than expected), adapt immediately
        if (tutorPlan.currentTarget?.instructionalMode) {
          familiarityChange = reassessFamiliarity(
            {
              familiarity: tutorPlan.skillFocus?.find(sf => sf.skillId === targetSkillId)?.familiarity || 'developing',
              instructionalMode: tutorPlan.currentTarget.instructionalMode,
            },
            {
              diagnosis,
              observation,
              turnsInMode: ctx.conversation?.phaseTracker?.turnsInMode || 0,
            }
          );

          if (familiarityChange) {
            console.log(`[Pipeline] Familiarity re-assessed: ${familiarityChange.reason}`);
            // Update the plan's current target mode
            tutorPlan.currentTarget.instructionalMode = familiarityChange.instructionalMode;
            // Update the skill focus entry
            const focusEntry = tutorPlan.skillFocus?.find(sf => sf.skillId === targetSkillId);
            if (focusEntry) {
              focusEntry.familiarity = familiarityChange.familiarity;
              focusEntry.instructionalMode = familiarityChange.instructionalMode;
            }
            notes.push({
              content: familiarityChange.reason,
              category: 'learning-style',
              skillId: targetSkillId,
            });
          }
        }

        // ── 3. Extract tutor notes from AI signals ──
        if (diagnosis.misconception?.name) {
          notes.push({
            content: `Misconception: ${diagnosis.misconception.name}${diagnosis.misconception.description ? ' — ' + diagnosis.misconception.description : ''}`,
            category: 'misconception',
            skillId: targetSkillId,
          });
        }
        if (verified.extracted?.learningInsight) {
          notes.push({
            content: verified.extracted.learningInsight,
            category: 'learning-style',
            skillId: targetSkillId,
          });
        }

        // ── 4. Detect breakthroughs and struggles ──
        let outcome = 'productive';
        if (sessionMood?.fatigueSignal) {
          outcome = 'disengaged';
        } else if (familiarityChange && familiarityChange.instructionalMode === 'strengthen') {
          outcome = 'breakthrough';
          notes.push({
            content: `Breakthrough moment: student upgraded to ${familiarityChange.instructionalMode} mode`,
            category: 'breakthrough',
            skillId: targetSkillId,
          });
        } else if (diagnosis.isCorrect === false && observation.streaks?.recentWrongCount >= 3) {
          outcome = 'struggled';
        }

        await updatePlanAfterInteraction(tutorPlan, {
          topic: ctx.conversation?.topic || observation.messageType,
          skillId: targetSkillId,
          mood: sessionMood?.trajectory,
          outcome,
          conversationId: ctx.conversation?._id,
          notes: notes.length > 0 ? notes : undefined,
          shouldAdvancePhase: shouldAdvance,
          advanceToPhase,
        });
      } catch (err) {
        console.error('[Pipeline] TutorPlan update error (non-fatal):', err.message);
      }
    }
  }

  // ── Session Grading (deterministic teaching quality evaluation) ──
  // Runs after persist so it has the full pipeline context.
  // Accumulates per-turn grades into a session scorecard stored on the conversation.
  let turnGrade = null;
  if (!ctx.skipPersist && tutorPlan) {
    try {
      const scorecard = ctx.conversation?.sessionScorecard || createScorecard();

      const gradeResult = gradeTurn({
        responseText: verified.text,
        decision,
        diagnosis,
        observation,
        sessionMood,
        evidence,
        tutorPlan,
        skillResolution,
        phaseTracker: ctx.conversation?.phaseTracker || null,
        scorecard,
      });

      turnGrade = gradeResult;

      // Store scorecard on conversation for accumulation across turns
      if (ctx.conversation) {
        ctx.conversation.sessionScorecard = gradeResult.scorecard;
        ctx.conversation.markModified?.('sessionScorecard');
      }

      // If there are coaching notes from this turn, add them to the TutorPlan
      if (gradeResult.coachingNotes.length > 0) {
        for (const note of gradeResult.coachingNotes) {
          if (!tutorPlan.tutorNotes) tutorPlan.tutorNotes = [];
          // Avoid duplicate notes
          const isDuplicate = tutorPlan.tutorNotes.some(
            n => n.content === note && !n.supersededAt
          );
          if (!isDuplicate) {
            tutorPlan.tutorNotes.push({
              content: note,
              category: 'coaching',
              skillId: tutorPlan.currentTarget?.skillId || null,
              createdAt: new Date(),
            });
          }
        }
        tutorPlan.markModified?.('tutorNotes');
        await tutorPlan.save?.();
      }

      if (gradeResult.flags.length > 0) {
        console.log(`[Pipeline] Grade: ${gradeResult.turnScore.toFixed(2)} — ${gradeResult.flags.map(f => f.message).join('; ')}`);
      } else {
        console.log(`[Pipeline] Grade: ${gradeResult.turnScore.toFixed(2)}`);
      }
    } catch (err) {
      console.error('[Pipeline] Session grading error (non-fatal):', err.message);
    }
  }

  // ── Cross-Session Pattern Detection ──
  // Runs periodically (every 10 messages) to avoid overhead on every message.
  // Detects recurring struggles, confidence trends, engagement patterns,
  // and generates tutor notes + signal updates for the TutorPlan.
  if (!ctx.skipPersist && tutorPlan && ctx.conversation) {
    const turnCount = ctx.conversation.messages?.length || 0;
    if (turnCount > 0 && turnCount % 10 === 0) {
      try {
        const sessionData = summarizeForPatterns(ctx.conversation, {
          _pipeline: {
            sessionMood,
            backbone: { targetSkill: skillResolution?.skillId || null },
          },
        });

        const Conversation = require('../../models/conversation');
        const recentConvos = await Conversation.find({
          userId: ctx.user._id,
          _id: { $ne: ctx.conversation._id },
          lastActivity: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        })
          .sort({ lastActivity: -1 })
          .limit(10)
          .select('sessionSummary')
          .lean();

        const recentSessions = recentConvos
          .filter(c => c.sessionSummary)
          .map(c => c.sessionSummary);

        if (recentSessions.length >= 2) {
          const patternResult = detectPatterns(sessionData, {
            recentSessions,
            tutorNotes: tutorPlan.tutorNotes || [],
            skillMastery: ctx.user.skillMastery,
            studentSignals: tutorPlan.studentSignals || {},
          });

          // Apply signal updates to TutorPlan
          if (Object.keys(patternResult.signalUpdates).length > 0) {
            Object.assign(tutorPlan.studentSignals, patternResult.signalUpdates);
            tutorPlan.markModified?.('studentSignals');
          }

          // Add pattern-generated tutor notes
          for (const note of patternResult.notes) {
            const isDuplicate = (tutorPlan.tutorNotes || []).some(
              n => n.content === note.content && !n.supersededAt
            );
            if (!isDuplicate) {
              tutorPlan.tutorNotes.push({
                ...note,
                source: 'pipeline',
                createdAt: new Date(),
              });
            }
          }

          if (patternResult.notes.length > 0 || Object.keys(patternResult.signalUpdates).length > 0) {
            tutorPlan.markModified?.('tutorNotes');
            await tutorPlan.save?.();
            console.log(`[Pipeline] Pattern detection: ${patternResult.patterns.length} patterns, ${patternResult.notes.length} notes`);
          }
        }

        // Store session summary on conversation for future pattern analysis
        ctx.conversation.sessionSummary = sessionData;
        ctx.conversation.markModified?.('sessionSummary');
      } catch (err) {
        console.error('[Pipeline] Pattern detection error (non-fatal):', err.message);
      }
    }
  }

  // ── Post-persist conversation save ──
  // phaseTracker, sessionScorecard, and sessionSummary are all set AFTER
  // persist() already saved the conversation. Only save again if something changed.
  if (!ctx.skipPersist && ctx.conversation?.isModified?.()) {
    try {
      await ctx.conversation.save();
    } catch (err) {
      console.error('[Pipeline] Post-persist conversation save error:', err.message);
    }
  }

  const pipelineTime = Date.now() - startTime;
  console.log(`[Pipeline] Complete in ${pipelineTime}ms (observe→diagnose→decide→generate→verify→persist)`);

  // ── Generate smart suggestion chips ──
  const suggestions = generateSuggestions({
    decision,
    diagnosis,
    observation,
    sessionMood,
    user: ctx.user,
    conversationStats: {
      problemsAttempted: ctx.conversation.problemsAttempted || 0,
      problemsCorrect: ctx.conversation.problemsCorrect || 0,
    },
  });

  // ── Return everything chat.js needs ──
  return {
    text: verified.text,
    visualCommands: verified.visualCommands,
    drawingSequence: verified.drawingSequence,
    boardContext: verified.boardContext,
    xpBreakdown: persistResults.xpBreakdown,
    problemResult: persistResults.problemAnswered
      ? (persistResults.wasCorrect ? 'correct' : 'incorrect')
      : null,
    // Parallel worked example flag — frontend can render a distinct "similar problem" label
    isParallelExample: decision.action === ACTIONS.WORKED_EXAMPLE || decision.action === ACTIONS.EXIT_RAMP,
    // Error annotation: misconception label for frontend display (no answer revealed)
    errorAnnotation: (diagnosis.isCorrect === false && diagnosis.misconception) ? {
      name: diagnosis.misconception.name,
      description: diagnosis.misconception.description || null,
      source: diagnosis.misconception.source, // 'library' or 'ai_analysis'
    } : null,
    leveledUp: persistResults.leveledUp,
    tutorsUnlocked: persistResults.tutorsUnlocked,
    iepGoalUpdates: persistResults.iepGoalUpdates,
    courseProgressUpdate: persistResults.courseProgressUpdate,
    aiTimeUsed: persistResults.aiTimeUsed,
    freeWeeklySecondsRemaining: persistResults.freeWeeklySecondsRemaining,
    sessionStats: {
      problemsAttempted: ctx.conversation.problemsAttempted || 0,
      problemsCorrect: ctx.conversation.problemsCorrect || 0,
    },
    // Smart suggestion chips (context-aware)
    suggestions,
    // Structured sidecar (deterministic + LLM signals merged)
    sidecar,

    // ── BACKBONE: Instructional context for frontend ──
    // The frontend can use this to render mode indicators, phase progress,
    // contextual UI (show/hide manipulatives, adjust chat chrome, etc.)
    instructionalContext: tutorPlan ? {
      // Current instructional mode — determines the overall teaching approach
      mode: tutorPlan.currentTarget?.instructionalMode || null,
      // Current phase within the mode (for INSTRUCT mode)
      phase: tutorPlan.currentTarget?.instructionPhase || null,
      // What skill is being taught
      targetSkill: tutorPlan.currentTarget?.skillId ? {
        skillId: tutorPlan.currentTarget.skillId,
        displayName: tutorPlan.currentTarget.displayName,
      } : null,
      // Phase tracker for progress visualization
      phaseProgress: ctx.conversation?.phaseTracker ? {
        currentPhase: ctx.conversation.phaseTracker.phase,
        turnsInPhase: ctx.conversation.phaseTracker.turnsInPhase,
        totalAdvancements: ctx.conversation.phaseTracker.advancementCount,
        totalRegressions: ctx.conversation.phaseTracker.regressionCount,
        phaseSequence: ['vocabulary', 'concept-intro', 'i-do', 'we-do', 'you-do', 'mastery-check'],
        currentIndex: ['vocabulary', 'concept-intro', 'i-do', 'we-do', 'you-do', 'mastery-check']
          .indexOf(ctx.conversation.phaseTracker?.phase),
      } : null,
      // Familiarity was re-assessed this turn (significant event for UX)
      familiarityChanged: !!(tutorPlan._familiarityChanged),
      // Session continuity hint
      hasUnfinishedBusiness: !!(tutorPlan.lastSession?.unfinishedBusiness),
      // Skill focus queue summary (for "up next" display)
      upNext: (tutorPlan.skillFocus || [])
        .filter(sf => sf.status === 'active' && sf.skillId !== tutorPlan.currentTarget?.skillId)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3)
        .map(sf => ({
          skillId: sf.skillId,
          displayName: sf.displayName,
          mode: sf.instructionalMode,
          reason: sf.reason,
        })),
      // Student signals for adaptive UI
      studentSignals: {
        confidence: tutorPlan.studentSignals?.overallConfidence || 'moderate',
        engagement: tutorPlan.studentSignals?.engagementTrend || 'stable',
      },
    } : null,

    // Pipeline metadata (for debugging/logging)
    _pipeline: {
      messageType: observation.messageType,
      action: decision.action,
      phase: decision.phase,
      diagnosisType: diagnosis.type,
      flags: verified.flags,
      signalStats,
      sessionMood: {
        trajectory: sessionMood.trajectory,
        energy: sessionMood.energy,
        momentum: sessionMood.momentum,
        inFlow: sessionMood.inFlow,
        fatigueSignal: sessionMood.fatigueSignal,
      },
      // Evidence-based intelligence
      evidence: evidence ? {
        cognitiveLoad: evidence.cognitiveLoad?.level || null,
        knowledgePL: evidence.knowledge?.pLearned || null,
        memoryRetrievability: evidence.memory?.retrievability || null,
        smartScore: evidence.performance?.smartScore || null,
        productiveStruggle: evidence.performance?.productiveStruggle || false,
        compositeReadiness: evidence.composite?.readiness || null,
        compositeReasoning: evidence.composite?.reasoning || [],
      } : null,
      // Backbone metadata
      backbone: tutorPlan ? {
        mode: tutorPlan.currentTarget?.instructionalMode,
        phase: tutorPlan.currentTarget?.instructionPhase,
        targetSkill: tutorPlan.currentTarget?.skillId,
        planVersion: tutorPlan.version,
        sessionCount: tutorPlan.sessionCount,
      } : null,
      // Session grading (teaching quality feedback loop)
      grade: turnGrade ? {
        turnScore: turnGrade.turnScore,
        dimensions: turnGrade.dimensionScores,
        flags: turnGrade.flags,
        sessionAverage: turnGrade.scorecard.turnCount > 0
          ? Math.round((turnGrade.scorecard.turnScores.reduce((s, v) => s + v, 0) / turnGrade.scorecard.turnCount) * 100) / 100
          : null,
      } : null,
      timeMs: pipelineTime,
    },
  };
}

/**
 * Update BKT, FSRS, and ConsistencyScorer states after an answer attempt.
 *
 * These engines maintain per-skill, per-student learning state that makes
 * the system's predictions and decisions dramatically more accurate over time.
 *
 * @param {Object} user - Mongoose user document
 * @param {string} skillId - Active skill ID
 * @param {Object} diagnosis - Diagnosis result
 * @param {Object} observation - Observation result
 */
function updateLearningEngines(user, skillId, diagnosis, observation) {
  const isCorrect = diagnosis.isCorrect === true;
  const hintUsed = observation.contextSignals?.some(s => s.type === 'uncertainty') || false;

  // Initialize learningEngines on user if not exists
  if (!user.learningEngines) {
    user.learningEngines = { bkt: {}, fsrs: {}, consistency: {} };
  }

  // ── 1. Update BKT (Bayesian Knowledge Tracing) ──
  let bktStates = user.learningEngines.bkt;
  if (bktStates instanceof Map) {
    // Convert Map to plain object for compatibility
    bktStates = Object.fromEntries(bktStates);
  }

  let bktState = bktStates[skillId];
  if (!bktState) {
    bktState = initializeBKT(skillId, 'default');
  }

  bktState = updateBKT(bktState, isCorrect, { hintUsed });
  bktStates[skillId] = bktState;
  user.learningEngines.bkt = bktStates;

  console.log(`[LearningEngines] BKT ${skillId}: P(L)=${bktState.pLearned.toFixed(3)} (${isCorrect ? '✓' : '✗'})`);

  // ── 2. Update FSRS (Spaced Repetition) ──
  let fsrsCards = user.learningEngines.fsrs;
  if (fsrsCards instanceof Map) {
    fsrsCards = Object.fromEntries(fsrsCards);
  }

  let fsrsCard = fsrsCards[skillId];
  const rating = rateAttempt({
    correct: isCorrect,
    hintUsed,
    consecutiveCorrect: bktState.consecutiveCorrect,
  });

  if (!fsrsCard) {
    fsrsCard = initializeCard(rating);
  } else {
    fsrsCard = updateCard(fsrsCard, rating);
  }

  fsrsCards[skillId] = fsrsCard;
  user.learningEngines.fsrs = fsrsCards;

  console.log(`[LearningEngines] FSRS ${skillId}: S=${fsrsCard.stability.toFixed(1)}, next=${fsrsCard.scheduledDays}d`);

  // ── 3. Update ConsistencyScorer ──
  let consistencyStates = user.learningEngines.consistency;
  if (consistencyStates instanceof Map) {
    consistencyStates = Object.fromEntries(consistencyStates);
  }

  let consistencyState = consistencyStates[skillId];
  if (!consistencyState) {
    consistencyState = initializeScore(skillId);
  }

  consistencyState = recordConsistencyAttempt(consistencyState, {
    correct: isCorrect,
    difficulty: categorizeDifficulty(diagnosis.problemInfo?.difficulty || 0),
  });

  consistencyStates[skillId] = consistencyState;
  user.learningEngines.consistency = consistencyStates;

  console.log(`[LearningEngines] SmartScore ${skillId}: ${consistencyState.smartScore}${consistencyState.productiveStruggleDetected ? ' (productive struggle!)' : ''}`);

  // Mark as modified for Mongoose
  user.markModified('learningEngines');
}

module.exports = {
  runPipeline,
  // Re-export for direct access when needed
  observe,
  diagnose,
  decide,
  generate: require('./generate'),
  verify,
  persist,
  MESSAGE_TYPES,
  ACTIONS,
  sidecar: require('./sidecar'),
  // New engines
  evidenceAccumulator: require('./evidenceAccumulator'),
  // Backbone: Tutor Plan + Instructional Modes
  INSTRUCTIONAL_MODES: require('./decide').INSTRUCTIONAL_MODES,
};
