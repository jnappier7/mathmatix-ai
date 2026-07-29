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
const { diagnose, extractBareExpression } = require('./diagnose');
const { decide, ACTIONS } = require('./decide');
const { generate, assemblePrompt } = require('./generate');
const { attachVerifiedTwin } = require('../twinGenerator');
const { verify } = require('./verify');
const { detectParallelExampleIntroduction } = require('../worksheetGuard');
const { persist } = require('./persist');
const {
  verifyWithEscalation,
  pickProblemContext,
  pickPosedQuestion,
  llmVerifyConceptual,
  isConceptualQuestion,
  isProseAnswer,
  isPolarityQuestion,
  isPolarityAnswer,
  VERIFIER_MODEL,
} = require('./llmVerifier');
const { deriveVerificationState, hasMathematicalContent } = require('./verificationState');
const verifyMetrics = require('../verifyMetrics');
const { buildSidecar, mergeLlmSignals, getSignalStats } = require('./sidecar');
const { computeSessionMood, buildMoodDirective } = require('./sessionMood');
const { generateSuggestions } = require('./suggestions');
const { assembleEvidence } = require('./evidenceAccumulator');
const { applyTurnToLedger } = require('./boardLedger');
const { assistanceLevelForTurn } = require('./assistanceLadder');
const { buildBoardStateBlock } = require('./boardStateBlock');

// New data-driven engines
const { updateBKT, initializeBKT } = require('../knowledgeTracer');
const { canonicalSkillId } = require('../skillCanonicalizer');
const { updateCard, initializeCard, rateAttempt, RATINGS } = require('../fsrsScheduler');
const { recordAttempt: recordConsistencyAttempt, initializeScore, categorizeDifficulty } = require('../consistencyScorer');

// Backbone: Tutor Plan + Skill Familiarity
const { loadOrCreatePlan, resolveCurrentTarget, updatePlanAfterInteraction, advanceInstructionPhase, recentPracticeSkillId } = require('../tutorPlanManager');
const { detectTestOutIntent, resolveTestOutSkillId } = require('../testOutIntent');
const { buildPlanLayer, shouldSuppressSocratic } = require('../promptPlanLayer');
const { reassessFamiliarity } = require('../phaseEvidenceEvaluator');
const { detectModeTransition } = require('../modeTransitionDetector');
const { gradeTurn, summarizeSession, createScorecard } = require('../sessionGrader');
const { detectPatterns, summarizeSession: summarizeForPatterns } = require('../sessionPatternDetector');
const { parseBoardTags } = require('../boardTagParser');
const { stripInternalTags, hasInternalTags, stripOrphanMathDelims } = require('../internalTagSanitizer');
const { parseBoardJsonCommands } = require('../boardJsonParser');
const { enforcePedagogyRule } = require('../boardCommandGuard');
const { resolveModelCommands } = require('../conceptModelCommand');
const { parseXpTags } = require('../xpTagParser');
const { parseVisualTabTags } = require('../visualTabTagParser');
const { synthesizeBoardCommands, mergeWithLlmCommands, dropRedundantPoses, synthesizeFallbackPose, synthesizeFallbackImage, synthesizeTilesTab, synthesizeAutoClear, synthesizeWorkedExampleSteps, detectBoardReference } = require('./boardSynthesizer');
const { getBoardLlmMode, proposeBoardCommands } = require('./boardLlm');
const { applyVisualGate } = require('../visualGate');
const { gateInlineGraphTags, containsInlineGraphTag } = require('./inlineGraphGate');
const { buildDecisionDoc, persistVisualDecisions } = require('../visualDecisionLog');
const { auditTurn } = require('../turnTypeAudit');
const structuredMetrics = require('../structuredTutorMetrics');
const log = require('../logger');
const boardLogger = log.child({ service: 'board-tag-protocol' });
const turnTypeLogger = log.child({ service: 'turn-type-audit' });

// The "I-do" decision actions — the tutor is directly teaching/demonstrating on
// a teaching example, not the student's graded problem. These are the moves
// where worked-example steps belong on the board (see workedExampleBoard).
// Deliberately excludes the "we-do"/"you-do" practice moves (guided_practice,
// independent_practice) and strengthen_challenge, where the student works and
// the strict student-mirror rule must stand.
const TEACHING_ACTIONS = new Set([
  ACTIONS.WORKED_EXAMPLE,
  ACTIONS.DIRECT_INSTRUCTION,
  ACTIONS.PREREQUISITE_BRIDGE,
  ACTIONS.LEVERAGE_BRIDGE,
]);

function isTeachingMove(decision) {
  return !!decision && TEACHING_ACTIONS.has(decision.action);
}

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

  // Streak evidence must survive probing turns: assistant messages with no
  // problemResult stamp (explanation requests, encouragement) would otherwise
  // push real wins out of the 6-message window. Hand observe the last 6
  // STAMPED outcomes from the full conversation instead.
  const recentProblemResults = ctx.conversation.messages
    .filter(msg => msg.role === 'assistant' && msg.problemResult)
    .slice(-6)
    .map(msg => msg.problemResult);

  const observation = observe(message, {
    recentUserMessages,
    recentAssistantMessages,
    recentProblemResults,
    hasRecentUpload: ctx.hasRecentUpload || false,
  });

  // The most recent thing the student actually submitted as math, newest-first.
  // Used to re-open a verdict when they dispute one.
  function lastStudentMathSubmission(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i] && messages[i].content;
      if (!content) continue;
      const expr = extractBareExpression(content);
      if (expr) return expr;
      // A bare number ("-3") is a submission too, and is what a student most
      // often defends when they disagree.
      const bare = String(content).trim();
      if (/^-?\d+(?:\.\d+)?$/.test(bare)) return bare;
    }
    return null;
  }

  console.log(`[Pipeline] Observe: ${observation.messageType} (confidence: ${observation.confidence})`);

  // ── Parallel: LLM answer verification ──
  // Fire a small, focused verification call alongside the main pipeline. The
  // deterministic solver in diagnose covers ~30% of math topics — for everything
  // else (calculus, trig identities, proofs, word problems) this fills the gap
  // with a fresh LLM verdict the pipeline can trust. Returns in ~200ms, well
  // before generate finishes, so the latency cost is zero.
  //
  // THE GATE USED TO BE `messageType === ANSWER_ATTEMPT`, which made the whole
  // verification stack opt-in behind observe's answer regex. A student writing a
  // correct step the regex didn't recognise ("24-3+3") got no solver, no CAS and
  // no verifier, and the tutor filled the silence by guessing. Widening that
  // regex was the standing fix and it never converged, because the gate was the
  // bug.
  //
  // So the trigger is now "did the student submit something checkable", not
  // "does this look like an answer". Two things it must NOT become:
  //   - It cannot fire on arbitrary prose. The verifier computes the problem's
  //     answer and compares; hand it "how do I do 24-6/2?" and it reports NOT
  //     equivalent, i.e. a false INCORRECT verdict that would license the tutor
  //     to reject a question. So the candidate must be a real answer or a real
  //     expression, never the raw message.
  //   - It cannot fire on a bare problem drop. That's homework being handed
  //     over, not work to grade.
  // Failing to fire is now safe in a way it wasn't before: no verdict means
  // UNVERIFIED, and under the invariant the tutor must ask rather than assert.
  //
  // A DISPUTE re-opens the previous verdict. "You are wrong" carries no math of
  // its own, so with nothing to check the tutor would simply restate its claim —
  // which is what turned one bad call into a five-turn argument. Re-verifying
  // the student's last mathematical submission gives this turn a real verdict,
  // and the assertion invariant then stops the tutor repeating a rejection it
  // can no longer support. Note what this deliberately is NOT: pushback alone
  // never earns a concession. The tutor concedes only if verification says so.
  let llmVerificationPromise = null;
  const disputedSubmission = observation.isDispute
    ? lastStudentMathSubmission(recentUserMessages)
    : null;
  const verificationCandidate = observation.answer?.value
    || (!observation.isBareProblemDrop ? extractBareExpression(message) : null)
    || disputedSubmission;

  // ── Which verifier is the right one for this turn ──
  // A CONCEPTUAL question ("what distinguishes a vertical asymptote from a
  // hole?") answered in words has no value to compare, so the math verifier can
  // only report NO MATCH — a correct idea rejected, and a problemResult of
  // 'incorrect' minted off it (production, AP Calculus AB, 2026-07-28). Those
  // turns go to the conceptual judge instead, which grades the idea.
  const assistantContext = recentAssistantMessages.map(msg => ({
    content: msg.content,
    problemInfo: msg.problemInfo || null,
  }));
  const posedQuestion = pickPosedQuestion(assistantContext);
  const isConceptualTurn = observation.conceptualReply === true
    || (isConceptualQuestion(posedQuestion) && isProseAnswer(message))
    // "True or false: …?" answered with a bare "true" — one word, so neither
    // gate above fires, and the value-matcher can only reject it. The judge
    // grades the claim instead.
    || (isPolarityQuestion(posedQuestion) && isPolarityAnswer(message));

  let conceptualVerificationPromise = null;
  if (isConceptualTurn && posedQuestion) {
    const conceptualStart = Date.now();
    conceptualVerificationPromise = llmVerifyConceptual(posedQuestion, message)
      .then(verdict => {
        console.log(`[Pipeline] ConceptualVerify: ${verdict.verdict || 'no verdict'}${verdict.error ? ` (${verdict.error})` : ''} (confidence: ${(verdict.confidence || 0).toFixed(2)})`);
        // Tagged with its own tier so conceptual outcomes stay separable from
        // the math verifier's on the admin metrics endpoint — a conceptual
        // judge drifting toward rejection is exactly what we'd need to see.
        verifyMetrics.recordVerification({
          verdict,
          tier: `conceptual:${VERIFIER_MODEL}`,
          latencyMs: Date.now() - conceptualStart,
        });
        return verdict;
      })
      .catch(err => {
        console.error('[Pipeline] ConceptualVerify promise rejected:', err.message);
        return { isCorrect: null, partial: false, confidence: 0, verdict: null, keyIdea: null, conceptual: true, error: err.message };
      });
  }

  if (verificationCandidate && !isConceptualTurn) {
    const problemText = pickProblemContext(assistantContext);
    if (problemText) {
      const verifyStart = Date.now();
      // fullStudentMessage protects multi-part questions: the extracted
      // candidate is the FINAL value, but the reply may also carry the
      // intermediate sub-answers ("0.3 … 300") — the judge must see them
      // as shown work, not competing answers.
      llmVerificationPromise = verifyWithEscalation(problemText, verificationCandidate, {
        fullStudentMessage: message,
      })
        .then(verdict => {
          const tier = verdict.escalated ? `escalated→${verdict.tier}` : verdict.tier;
          if (verdict.isCorrect !== null) {
            console.log(`[Pipeline] LLMVerify: ${verdict.isCorrect ? 'correct' : 'incorrect'} (confidence: ${verdict.confidence.toFixed(2)}, modelAnswer: ${verdict.modelAnswer}, ${tier})`);
          } else if (verdict.error) {
            console.log(`[Pipeline] LLMVerify: unverifiable (${verdict.error}, ${tier})`);
          } else {
            console.log(`[Pipeline] LLMVerify: low-confidence (${verdict.confidence.toFixed(2)}, modelAnswer: ${verdict.modelAnswer}, ${tier})`);
          }
          verifyMetrics.recordVerification({
            verdict,
            escalated: verdict.escalated,
            escalationResolved: verdict.escalationResolved,
            tier: verdict.tier,
            latencyMs: Date.now() - verifyStart,
          });
          return verdict;
        })
        .catch(err => {
          console.error('[Pipeline] LLMVerify promise rejected:', err.message);
          const verdict = { isCorrect: null, confidence: 0, modelAnswer: null, rationale: null, error: err.message };
          verifyMetrics.recordVerification({ verdict, latencyMs: Date.now() - verifyStart });
          return verdict;
        });
    }
  }

  // ── Stage 2: DIAGNOSE ──
  const diagnosis = await diagnose(observation, {
    recentAssistantMessages: recentAssistantMessages.map(msg => ({
      content: msg.content,
      problemResult: msg.problemResult,
      problemInfo: msg.problemInfo || null,
    })),
    recentUserMessages: recentUserMessages.map(msg => ({ content: msg.content })),
    activeSkill: ctx.activeSkill || null,
    user: ctx.user,
    lastProblemState: ctx.conversation?.lastProblemState || null,
    pinnedProblemTex: ctx.conversation?.boardProblem?.tex || null,
    verificationCandidate,
    llmVerificationPromise,
    conceptualVerificationPromise,
  });

  // ── The tutor's licence to make a correctness claim ──
  // Attached to the diagnosis so every downstream stage reads one value rather
  // than re-deriving "did anything verify this?" from isCorrect/type/source.
  // UNVERIFIED is a RESTRICTION, not an absence: it is what the generate stage
  // must be told so it asks instead of guessing, and what the verify stage
  // enforces against on the way out.
  diagnosis.verificationState = deriveVerificationState(
    diagnosis,
    hasMathematicalContent(message)
  );

  if (diagnosis.type !== 'no_answer') {
    console.log(`[Pipeline] Diagnose: ${diagnosis.type} (answer: ${diagnosis.answer}, correct: ${diagnosis.correctAnswer})`);
  }
  console.log(`[Pipeline] Verification state: ${diagnosis.verificationState}${diagnosis.verificationSource ? ` (${diagnosis.verificationSource})` : ''}`);

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

  // ── Self-heal: clear an activeBadge pointing to an already-mastered skill ──
  // Cheap, idempotent, runs once per pipeline turn. Catches users whose
  // masteryProgress.activeBadge was set before we hardened badge selection
  // (or who got mastered via a different code path while a badge was open).
  // Without this, applyMasteryOverrides in suggestions.js keeps nudging the
  // student toward a topic they're already done with.
  try {
    const { isSkillMastered, clearActiveBadge } = require('../masteryGuard');
    const badge = ctx.user.masteryProgress?.activeBadge;
    if (badge?.skillId && isSkillMastered(ctx.user, badge.skillId)) {
      clearActiveBadge(ctx.user, 'self-heal: activeBadge pointed to an already-mastered skill');
    }
  } catch (err) {
    console.error('[Pipeline] activeBadge self-heal error (non-fatal):', err.message);
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

    // ── Phase 2: structure everywhere ──
    // Seed the skill-focus queue from the student's own mastery signals so the
    // structured-teaching machine runs in free chat too (not only in courses).
    // Non-fatal, guarded to only act when the queue is empty and the student is
    // not in a course. See utils/skillFocusBuilder.js.
    try {
      const { refreshSkillFocus } = require('../skillFocusBuilder');
      refreshSkillFocus(tutorPlan, ctx.user, { inCourse: !!ctx.user.activeCourseSessionId });
    } catch (seedErr) {
      console.error('[Pipeline] skillFocus seed error (non-fatal):', seedErr.message);
    }

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

  // ── Test-out (Fix B): launch an in-chat challenge run ──
  // When the student asks to prove they already know this, hand the client the
  // skill to challenge on. The challenge (5 problems, no hints) proves the skill
  // via the challenge rung — the one proof path with no 3-context requirement,
  // so ambient practice and a test-out both have a real road to 100%.
  let launchChallenge = null;
  let testOutIntentDetected = false;
  if (detectTestOutIntent(message)) {
    testOutIntentDetected = true;
    const challengeSkillId = resolveTestOutSkillId({
      message,
      activeSkillId: ctx.activeSkill?.skillId || null,
      tutorPlan,
      recentPracticeSkillId,
    });
    if (challengeSkillId) {
      launchChallenge = { skillId: challengeSkillId };
      console.log(`[Pipeline] Test-out intent → launching challenge for ${challengeSkillId}`);
    } else {
      // MUST NOT be silent: with no directive the LLM accepts the request and
      // improvises an ungraded quiz in prose (production, 2026-07-26). The
      // no-improv directive is pushed below, next to the launch directive.
      console.warn('[Pipeline] Test-out intent but no skill resolved — challenge NOT launched, no-improv directive pushed');
    }
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

    // Read per-skill engine state keyed by the canonical (unified) skill id to
    // match how updateLearningEngines writes it; fall back to the raw id so
    // historical legacy-keyed state still resolves. Handles Map or plain object.
    const readEngine = (store, id) => {
      if (!store || !id) return null;
      const get = (k) => (typeof store.get === 'function' ? store.get(k) : store[k]);
      const canon = canonicalSkillId(id);
      return get(canon) ?? (canon !== id ? get(id) : null) ?? null;
    };
    // Fall back to the plan's current target, mirroring the persist-side
    // attribution (updateLearningEngines). Without the fallback, free chat —
    // where ctx.activeSkill is always null — WRITES BKT/FSRS evidence under
    // the plan target every turn but can never read it back, so the evidence
    // layer runs blind on exactly the sessions that need it.
    const activeSkillId = ctx.activeSkill?.skillId
      || tutorPlan?.currentTarget?.skillId
      || null;

    // Get BKT state for active skill (from user's learningEngines data)
    const bktState = readEngine(ctx.user.learningEngines?.bkt, activeSkillId);

    // Get FSRS card for active skill
    const fsrsCard = readEngine(ctx.user.learningEngines?.fsrs, activeSkillId);

    // Get consistency state for active skill
    const consistencyState = readEngine(ctx.user.learningEngines?.consistency, activeSkillId);

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
        console.log(`[Pipeline] Mode transition: ${modeTransition.transitionType} (${modeTransition.reason}) confidence=${modeTransition.confidence}`);
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
    user: ctx.user || null,
    // For the one-ask guard: decide reads the LAST assistant message to know
    // whether the tutor already asked this student to explain this work.
    conversation: ctx.conversation || null,
    // Course lessons don't use lessonPhaseManager phaseState — their state
    // rides in the course prompt + _course metadata — so decide needs this
    // flag to know the topic is already chosen (the student's-lead guard
    // must launch the module, never offer a topic menu).
    isCourseMode: !!ctx._course,
  });

  // Test-out: the challenge card is about to render below the tutor's reply, so
  // the reply should tee it up — not teach or pose a problem of its own.
  if (launchChallenge) {
    decision.directives.push(
      'TEST-OUT: The student wants to prove they already know this skill, and a 5-problem challenge is being launched right in the chat immediately after your message. In ONE or two upbeat sentences, set it up: 5 problems, no hints, one shot — miss it and we just find the gap, nothing lost. Do NOT pose a problem yourself and do NOT start teaching; the challenge card handles the problems.'
    );
  } else if (testOutIntentDetected) {
    decision.directives.push(
      'TEST-OUT REQUEST, NO SKILL RESOLVED: The student asked to test out, but no target skill could be identified, so the real graded challenge could NOT be launched. Do NOT improvise a quiz in the chat — you cannot grade one, it will not be recorded, and it will not count toward the skill. Instead, in one or two sentences: confirm which skill they want to test out of (name the topic you have been working on if it is obvious), and ask them to say "test out of [that skill]" so the real 5-problem challenge can start.'
    );
  }

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

  // Graduation announcement: a verified answer proved a skill on the PREVIOUS
  // turn (flagged in persist, which is the first point mastery is known — after
  // the tutor has already spoken). Open THIS turn by celebrating it and moving
  // on, so the handoff feels like a live tutor rather than a silent status flip.
  if (ctx.conversation?.pendingGraduation) {
    const g = ctx.conversation.pendingGraduation;
    const masteredName = g.masteredLabel || 'the skill they were working on';
    const nextClause = g.nextLabel
      ? `then invite them to start ${g.nextLabel}`
      : `then ask what they'd like to work on next`;
    decision.directives.push(
      `GRADUATION: The student just proved mastery of ${masteredName}. Open your reply by celebrating that — warm, specific, brief — ${nextClause}. Do not re-teach the skill they just mastered.`
    );
    ctx.conversation.pendingGraduation = null;
    ctx.conversation.markModified('pendingGraduation');
  }

  console.log(`[Pipeline] Decide: ${decision.action}${decision.phase ? ` (phase: ${decision.phase})` : ''}`);

  // ── Verified twin (anti-cheat co-solve) ──
  // For a worked example / exit ramp, hand the tutor a CAS-verified PARALLEL
  // problem instead of asking it to improvise one with no checked answer (see
  // utils/twinGenerator + worksheetGuard.formatVerifiedTwinInstruction). Gated
  // to these two actions (the student is stuck), so the extra LLM latency is
  // only paid when a worked example is actually being shown; best-effort, and
  // buildActionPrompt falls back to the improvised instruction if none attaches.
  if (decision.action === ACTIONS.WORKED_EXAMPLE || decision.action === ACTIONS.EXIT_RAMP) {
    const stuckProblem = pickProblemContext(
      recentAssistantMessages.map(msg => ({ content: msg.content, problemInfo: msg.problemInfo || null }))
    );
    await attachVerifiedTwin(decision, stuckProblem);
    if (decision.verifiedTwin) {
      console.log('[Pipeline] Verified twin attached for', decision.action);
    }
  }

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

  // The plan layer is the FREE-tutoring mental model ("we were into volume
  // last time", current skill focuses). In a course lesson the pathway has
  // already chosen the topic — injecting the plan layer there makes the
  // tutor pitch last week's open-chat topics over the module content
  // (production report, 2026-07-29: geometry topic menu inside ACT Math
  // Prep). Course turns run on the course prompt alone.
  if (tutorPlan && !ctx._course) {
    const planLayer = buildPlanLayer(tutorPlan, {
      skillResolution,
      interactionType: ctx.conversation?.conversationType || 'chat',
    });
    if (planLayer) {
      enrichedSystemPrompt += '\n\n' + planLayer;
    }
  }

  // Board awareness: describe what the student's board displays RIGHT NOW
  // (from the ledger the previous turns built), so the tutor references the
  // shared surface instead of re-deriving lines already on it. Rebuilt every
  // turn — it can't go stale and survives conversation summarization.
  try {
    const boardBlock = buildBoardStateBlock(ctx.conversation?.boardLedger);
    if (boardBlock) enrichedSystemPrompt += '\n\n' + boardBlock;
  } catch (boardBlockErr) {
    console.error('[Pipeline] board-state block failed (non-fatal):', boardBlockErr.message);
  }

  const assembled = assemblePrompt(decision, {
    systemPrompt: enrichedSystemPrompt,
    messages: ctx.formattedMessages,
    moodDirective,
    suppressSocratic,
  });

  let generatedResult;
  if (ctx.stream && ctx.res) {
    generatedResult = await generate(assembled, { stream: true, res: ctx.res });
  } else {
    generatedResult = await generate(assembled);
  }

  const rawResponseText = generatedResult.text;
  const resolvedTools = generatedResult.resolvedTools || null;
  // ── Await the parallel LLM verification (already resolved by this point) ──
  // Used by verify.js to catch false rejections / false confirmations the
  // deterministic solver couldn't gate on.
  let llmVerdict = null;
  if (llmVerificationPromise) {
    try {
      llmVerdict = await llmVerificationPromise;
    } catch (err) {
      console.error('[Pipeline] LLMVerify await error:', err.message);
    }
  }

  // ── Stage 5: VERIFY ──
  const verified = await verify(rawResponseText, {
    resolvedTools,
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
    demonstratedReasoning: diagnosis.demonstratedReasoning || false,
    verificationState: diagnosis.verificationState,
    hasRecentUpload: ctx.hasRecentUpload || false,
    isWorksheetFollowUp: observation.isWorksheetFollowUp || false,
    isBareProblemDrop: observation.isBareProblemDrop || false,
    phaseState: ctx.phaseState || ctx.conversation?.phaseState || null,
    studentAnswer: observation.answer?.value || null,
    llmVerdict,
  });

  console.log(`[Pipeline] Verify: ${verified.flags.length > 0 ? verified.flags.join(', ') : 'clean'}`);

  // ── Stage 5b: BOARD COMMANDS FROM LLM ──
  // Two paths converge here:
  //   (A) Structured-output path (Phase 1, flag-gated): the LLM
  //       returned board_commands directly via JSON schema. They
  //       are already in the legacy compact shape and skip the
  //       regex parser entirely.
  //   (B) Legacy free-text path: <BOARD …/> tags are extracted
  //       from verify.text and verify.text is replaced with the
  //       stripped version.
  // Either way the result is run through the same pedagogy guard
  // so the #1 product rule is enforced identically.
  const recentUserMessagesForBoard = recentUserMessages;
  let llmBoardCommands = [];
  let rawLlmBoardCommands = [];

  if (Array.isArray(generatedResult.structuredBoardCommands)
      && generatedResult.structuredBoardCommands.length > 0) {
    rawLlmBoardCommands = generatedResult.structuredBoardCommands;
  } else {
    // Legacy path: parse <BOARD/> tags out of verify.text.
    const boardParsed = parseBoardTags(verified.text);
    if (boardParsed.boardCommands.length > 0) {
      verified.text = boardParsed.cleanedText;
      rawLlmBoardCommands = boardParsed.boardCommands;
    }

    // Recovery: some models emit board commands as raw JSON instead of
    // the <BOARD/> tag syntax. Parse those too so they (a) don't leak as
    // visible text and (b) actually reach the board. They join
    // rawLlmBoardCommands and flow through the identical concept-model
    // resolve + pedagogy guard below, so the #1 anti-cheat rule vets them
    // exactly like tag-form commands.
    const jsonParsed = parseBoardJsonCommands(verified.text);
    if (jsonParsed.boardCommands.length > 0) {
      verified.text = jsonParsed.cleanedText;
      rawLlmBoardCommands = rawLlmBoardCommands.concat(jsonParsed.boardCommands);
      boardLogger.info('Recovered board commands emitted as raw JSON', {
        count: jsonParsed.boardCommands.length,
        actions: jsonParsed.boardCommands.map(c => c.action),
      });
    }
  }

  // Worked-example board: when the tutor is TEACHING — demonstrating or deriving
  // on a teaching example that is NOT the student's graded problem — the board
  // may carry the full worked steps, the same basis on which worked steps on
  // PARALLEL problems are allowed under the #1 rule. This relaxes apply/resolve/
  // verify off the student-text match AND admits read-only `example` cards.
  //
  // Triggers on any "I-do" decision action (worked_example, direct_instruction,
  // prerequisite_bridge, leverage_bridge) OR when there is no pinned problem at
  // all — a free conceptual derivation ("why does the integral give area?") has
  // no graded answer to protect, so mirroring its steps can't leak anything.
  // Gated behind a default-off flag: a phase/move mislabel must never silently
  // relax the guard, so it requires BOTH the explicit flag AND a teaching
  // context. Off → fully strict (byte-identical to today). In every case the
  // pinnedProblem/pinnedAnswer backstop below still blocks a "worked example"
  // that is secretly the student's own problem.
  const noPinnedProblem = !(ctx.conversation?.boardProblem?.tex);
  const workedExampleBoard = process.env.WORKED_EXAMPLE_BOARD === 'true'
    && (isTeachingMove(decision) || noPinnedProblem);

  // Generative long-tail gate (CONCEPT_MODELS.md step 4). A `model` command may
  // carry a brand-new spec the LLM authored (JSON) instead of a curated catalog
  // name. Validate it HERE, before the pedagogy guard and before render: parse +
  // bound + structurally validate, so a spec whose ids/params/refs don't resolve
  // is dropped ("can pick a weird layout but cannot display wrong math"). Curated
  // names are checked against the catalog. No-op for non-model commands.
  if (rawLlmBoardCommands.length > 0) {
    const resolvedModels = resolveModelCommands(rawLlmBoardCommands);
    rawLlmBoardCommands = resolvedModels.commands;
    for (const { command, reason, errors } of resolvedModels.dropped) {
      boardLogger.warn('Concept-model command dropped', {
        reason,
        model: command.model || null,
        errors: errors || null,
      });
    }
    // Generated spec rejected but a curated name carried the card instead.
    for (const { command, reason } of resolvedModels.fallbacks) {
      boardLogger.warn('Concept-model spec rejected; fell back to curated model', {
        reason,
        model: command.model || null,
      });
    }
  }

  // ── Stage 5b.0: BOARD LLM (advisory board-card source) ──
  // A second, focused call that translates the tutor's FINAL message into board
  // cards (see docs/BOARD_LLM_STAGE_DESIGN.md). The tutor model is unreliable at
  // transcribing its own teaching into board commands; this stage does that one
  // job with a short, single-purpose prompt. ADVISORY ONLY: in `live` it becomes
  // the SOURCE of rawLlmBoardCommands, then flows through the exact same guard →
  // synthesizer-merge → visual gate below — the guard owns final authority. In
  // `shadow` it runs and logs but does not change what renders. Default `off` →
  // no call, no latency, behavior byte-identical to today. The deterministic
  // synthesizer downstream remains the fallback when this yields nothing.
  const boardLlmMode = getBoardLlmMode();
  if (boardLlmMode !== 'off') {
    try {
      const proposal = await proposeBoardCommands({
        chatText: verified.text,
        moveType: decision?.action || null,
        pinnedProblem: ctx.conversation?.boardProblem?.tex || null,
        teachingMode: workedExampleBoard,
        currentSkill: ctx.activeSkill?.name || null,
      });
      boardLogger.info('Board LLM proposal', {
        mode: boardLlmMode,
        status: proposal.record.status,
        proposed: proposal.commands.map(c => c.action),
        currentSource: rawLlmBoardCommands.map(c => c.action),
      });
      // Live: the board LLM is the primary source. If it yields nothing (skip /
      // error / empty), keep whatever the tutor emitted so the board never goes
      // dark on its account — the synthesizer fallback still runs below.
      if (boardLlmMode === 'live' && proposal.commands.length > 0) {
        rawLlmBoardCommands = proposal.commands;
      }
    } catch (boardLlmErr) {
      // The advisory stage must never break a response.
      boardLogger.error('Board LLM stage failed (non-fatal)', { error: boardLlmErr.message });
    }
  }

  if (rawLlmBoardCommands.length > 0) {
    const guardResult = enforcePedagogyRule({
      commands: rawLlmBoardCommands,
      userMessage: message,
      recentUserMessages: recentUserMessagesForBoard,
      lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
      workedExample: workedExampleBoard,
      // Backstop: even in worked-example mode, never let a step that reveals the
      // student's OWN pinned problem / answer through (model "demonstrating" on
      // the graded problem instead of a parallel one).
      pinnedProblemTex: ctx.conversation?.boardProblem?.tex || null,
      pinnedAnswer: diagnosis.correctAnswer || null,
      // Lets the scaffold guard tell a legit missing-factor card (result
      // stated in this very reply) from a backwards one that leaks it.
      tutorReplyText: verified.text || null,
    });
    llmBoardCommands = guardResult.allowed;
    if (guardResult.dropped.length > 0) {
      for (const { command, reason } of guardResult.dropped) {
        boardLogger.warn('Pedagogy guard dropped board command', {
          action: command.action,
          reason,
          tex: command.tex || null,
          op: command.op || null,
        });
      }
    }
  }

  // ── Stage 5b.1: TURN-TYPE AUDIT (Phase 3) ──
  // Lights up the signal so we can measure how often the model's
  // declared turn_type contradicts the board it emitted. The one hard
  // bug it detects — problem_introduction with no pose — is acted on
  // downstream in Stage 5c.1 (Phase 5), which runs after synthesis so
  // it only fires when no pose survives the merge. Soft mismatches stay
  // observe-only. Phase 6 records the mismatches into
  // structuredTutorMetrics (after Stage 5c.1, so the backfill outcome
  // lands in the same record).
  //
  // Gate on structuredBoardCommands being an array — the reliable
  // "this was a structured attempt" signal — rather than on a truthy
  // turn_type. A turn_type the model botched is normalized to null
  // upstream (normalizeStructuredResponse), so gating on the turn_type
  // would make the audit's own `invalid_turn_type` case unreachable and
  // drop those turns from the metrics denominator entirely — the exact
  // misclassification the dashboard exists to catch. The legacy
  // free-text path never sets structuredBoardCommands, so it stays a
  // no-op there.
  const isStructuredTurn = Array.isArray(generatedResult.structuredBoardCommands);
  let auditMismatches = [];
  if (isStructuredTurn) {
    auditMismatches = auditTurn({
      turnType: generatedResult.structuredTurnType, // null → invalid_turn_type
      boardCommands: generatedResult.structuredBoardCommands,
    });
    for (const m of auditMismatches) {
      if (m.severity === 'hard') {
        turnTypeLogger.warn('turn_type mismatch (hard)', m);
      } else {
        turnTypeLogger.info('turn_type mismatch (soft)', m);
      }
    }
  }

  // ── Stage 5c: DETERMINISTIC BOARD SYNTHESIZER ──
  // The LLM-emitted tag path (Layer 2) is unreliable — pose cards at
  // the start of a problem and verify cards at the end are the most
  // common misses, and partial emission (one resolve tag in the
  // middle, nothing else) leaves the board stuck. The synthesizer
  // runs every turn and derives cards from pipeline ground truth
  // (math engine + diagnose stage + the student's literal text). Its
  // output is merged with the LLM's; the LLM wins on overlap so its
  // wording is preserved when present.
  let synthesizedCommands = [];
  try {
    synthesizedCommands = synthesizeBoardCommands({
      studentMessage: message,
      tutorResponse: verified.text,
      diagnosis,
      observation,
      lastBoardAction: ctx.conversation?.lastBoardAction || null,
      pinnedProblem: ctx.conversation?.boardProblem?.tex || null,
      recentAssistantMessages,
    });
  } catch (synthErr) {
    // Synthesis must never break the response.
    boardLogger.error('Board synthesizer failed (non-fatal)', { error: synthErr.message });
  }

  // Guard synthesized cards through the same pedagogy rule —
  // defense in depth. Synthesized cards are derived from the
  // student's own message so they should always pass, but if a
  // detector regression slips through, the guard catches it.
  let guardedSynth = synthesizedCommands;
  if (synthesizedCommands.length > 0) {
    const synthGuard = enforcePedagogyRule({
      commands: synthesizedCommands,
      userMessage: message,
      recentUserMessages: recentUserMessagesForBoard,
      lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
      tutorReplyText: verified.text || null,
    });
    guardedSynth = synthGuard.allowed;
    if (synthGuard.dropped.length > 0) {
      for (const { command, reason } of synthGuard.dropped) {
        boardLogger.warn('Pedagogy guard dropped synthesized board command', {
          action: command.action,
          reason,
          tex: command.tex || null,
          op: command.op || null,
        });
      }
    }
  }

  const merged = mergeWithLlmCommands(llmBoardCommands, guardedSynth);
  verified.boardCommands = merged.all;

  // Drop a redundant re-pose of the already-pinned problem. The LLM tends to
  // re-emit a pose after the student says "use the board" (it apologizes and
  // re-poses the same problem) — that both duplicates the PROBLEM card and
  // resets the solve cycle, orphaning the student's in-progress work and their
  // final answer. Keep the pin; drop the echo.
  {
    const pinnedTex = ctx.conversation?.boardProblem?.tex || null;
    const { kept, dropped } = dropRedundantPoses(verified.boardCommands, pinnedTex);
    if (dropped.length > 0) {
      verified.boardCommands = kept;
      boardLogger.info('Dropped redundant pose(s)', {
        count: dropped.length,
        tex: dropped.map(c => c.tex),
        pinnedTex,
      });
    }
  }

  if (merged.added.length > 0) {
    boardLogger.info('Synthesized board commands', {
      count: merged.added.length,
      actions: merged.added.map(c => c.action),
      llmEmitted: llmBoardCommands.length,
    });
  }

  // ── Stage 5c.0a0: WORKED-EXAMPLE STEP BACKFILL (hybrid) ──
  // The structured path SHOULD emit `example` cards when the tutor derives
  // something, but compliance is unreliable (the same reason pose/verify get
  // synthesized). When this is a teaching turn (workedExampleBoard) and the
  // tutor's reply carries a multi-step derivation yet no example card survived,
  // mirror the tutor's own math spans onto the board. The LLM wins when it did
  // emit examples — we only backfill the gap. Routed through the same guard, so
  // the pinned-problem backstop applies to every backfilled step too.
  if (workedExampleBoard
      && !verified.boardCommands.some(c => c.action === 'example')) {
    const workedSteps = synthesizeWorkedExampleSteps({ tutorResponse: verified.text });
    if (workedSteps.length > 0) {
      const workedGuard = enforcePedagogyRule({
        commands: workedSteps,
        userMessage: message,
        recentUserMessages: recentUserMessagesForBoard,
        lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
        workedExample: workedExampleBoard,
        pinnedProblemTex: ctx.conversation?.boardProblem?.tex || null,
        pinnedAnswer: diagnosis.correctAnswer || null,
      });
      if (workedGuard.allowed.length > 0) {
        verified.boardCommands = mergeWithLlmCommands(verified.boardCommands, workedGuard.allowed).all;
        boardLogger.info('Worked-example step backfill added cards', {
          count: workedGuard.allowed.length,
          dropped: workedGuard.dropped.length,
        });
      }
    }
  }

  // ── Stage 5c.0a: VISUAL-PROMISE BACKFILL ──
  // The tutor sometimes narrates a visual it never put on the board ("Here's a
  // visual representation of the inscribed angle theorem!") — the board then
  // silently contradicts the chat, the worst kind of phantom. `decide` calls
  // these continue_conversation, so turn_type can't catch them; we detect the
  // broken PROMISE in the tutor's own words and backfill an image. Runs BEFORE
  // the visual gate below so the backfilled image is gated like any other.
  // Conservative: fires only when no graph/image already survived AND a concept
  // is derivable — otherwise the board is left as-is (no garbage search).
  // A tiles promise is satisfied by the TILES tab command (backfilled at the
  // visual-tab stage below), not by an image search — detect it once here so
  // the image backfill doesn't answer "let me get those tiles on your screen"
  // with a random diagram.
  const tilesTabBackfill = synthesizeTilesTab({
    tutorResponse: verified.text,
    pinnedProblemTex: (verified.boardCommands.find(c => c.action === 'pose' && c.tex) || {}).tex
      || ctx.conversation?.boardProblem?.tex || null,
  });

  if (!tilesTabBackfill
      && !verified.boardCommands.some(c => c.action === 'graph' || c.action === 'image')) {
    const fallbackImage = synthesizeFallbackImage({
      tutorResponse: verified.text,
      activeSkill: ctx.activeSkill || null,
    });
    if (fallbackImage) {
      const imgGuard = enforcePedagogyRule({
        commands: [fallbackImage],
        userMessage: message,
        recentUserMessages: recentUserMessagesForBoard,
        lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
      });
      if (imgGuard.allowed.length > 0) {
        verified.boardCommands = mergeWithLlmCommands(verified.boardCommands, imgGuard.allowed).all;
        boardLogger.info('Visual-promise backfill added image', { query: fallbackImage.query });
      }
    }
  }

  // ── Stage 5c.0b: VISUAL GATE (conceptual-visual safety) ──
  // graph/image commands bypass the pedagogy guard's student-text rule by
  // design (they're teaching aids, not echoes of the student's work). That
  // leaves one hole the guard structurally can't close: a graph/image of the
  // student's OWN unsolved problem leaks the answer geometrically (a parabola
  // crossing at x=2 and x=3 *is* the roots). The visual gate computes what each
  // graph would reveal (mathSolver: solve fn=0) and blocks/transforms anything
  // whose roots hit the known correctAnswer. Defaults to 'live_control' —
  // enforcement ON, deterministic leak-block only (the LLM value judge is a
  // separate opt-in, VISUAL_GATE_VALUE_JUDGE, default off). Fail-safe by design:
  // this protects the #1 anti-cheat rule, so the secure posture is the default.
  // Set VISUAL_GATE_MODE=shadow to log-without-enforcing, or =off to bypass.
  //
  // Read the mode once. `off` is a complete, zero-cost bypass (true kill
  // switch): the whole stage is skipped, no evaluation, no writes.
  const visualGateMode = process.env.VISUAL_GATE_MODE || 'live_control';
  if (visualGateMode !== 'off'
      && verified.boardCommands.some(c => c.action === 'graph' || c.action === 'image')) {
    try {
      const pinnedTex = ctx.conversation?.boardProblem?.tex || null;
      const activeProblem = {
        problemText: pinnedTex,
        normalizedExpression: pinnedTex,
        correctAnswer: diagnosis.correctAnswer || null,
        problemType: diagnosis.problemType || null,
        status: diagnosis.isCorrect === true
          ? 'solved'
          : ((pinnedTex || diagnosis.correctAnswer) ? 'unsolved' : 'unknown'),
      };
      const learningState = {
        concept: ctx.activeSkill?.name || null,
        misconception: diagnosis.misconception?.name || null,
        masteryScore: null,
      };
      const gatedCommands = [];
      const decisionDocs = [];
      const turnIndex = Array.isArray(ctx.conversation?.messages) ? ctx.conversation.messages.length : null;
      for (const cmd of verified.boardCommands) {
        if (cmd.action !== 'graph' && cmd.action !== 'image') {
          gatedCommands.push(cmd);
          continue;
        }
        const { command: gated, record } = await applyVisualGate({
          command: cmd,
          activeProblem,
          learningState,
          tutorMessage: verified.text,
          user: ctx.user || null,
          mode: visualGateMode,
          // Leak enforcement runs deterministically in live modes; the LLM
          // value judge is a separate opt-in (default off) so it can't suppress
          // useful visuals until it's been validated against shadow data.
          enableValueJudge: process.env.VISUAL_GATE_VALUE_JUDGE === 'on',
        });
        if (record.decision !== 'allow') {
          boardLogger.info('Visual gate decision', {
            mode: visualGateMode,
            action: record.action,
            decision: record.decision,
            reasonCode: record.reasonCode,
            riskLevel: record.riskLevel,
          });
        }
        // Capture every decision (allow/block/transform) for the corpus —
        // positive examples matter for training too.
        decisionDocs.push(buildDecisionDoc({
          record,
          activeProblem,
          learningState,
          mode: visualGateMode,
          userId: ctx.user?._id || null,
          conversationId: ctx.conversation?._id || null,
          turnIndex,
        }));
        // In shadow/audit_only/off the gate returns the command unchanged, so
        // this is a no-op for render; only live modes drop/transform.
        if (gated) gatedCommands.push(gated);
      }
      verified.boardCommands = gatedCommands;

      // Persist the corpus FIRE-AND-FORGET — a logging write must never sit in
      // the critical path of a tutoring response (no await, so it can't delay
      // or hang the turn). persistVisualDecisions is internally guarded and
      // never rejects, so there's no floating-rejection risk.
      if (decisionDocs.length > 0) {
        persistVisualDecisions(decisionDocs);
      }
    } catch (gateErr) {
      // The gate must never break a response.
      boardLogger.error('Visual gate failed (non-fatal)', { error: gateErr.message });
    }
  }

  // ── Stage 5c.0c: VISUAL GATE for LEGACY INLINE GRAPH TAGS ──
  // The board gate above only sees <BOARD> graph/image commands. Legacy inline
  // [FUNCTION_GRAPH:...]-family tags live in the tutor's chat text and otherwise
  // reach the client ungated — the same leak the board gate closes (a graph of
  // the student's own unsolved function reveals its roots), plus decorative/
  // off-topic graphs (the "sin(x)/x" reflex) when the value judge is on. Route
  // them through the SAME gate. Runs here in verify so the edit lands in
  // pipelineResult.text — the authoritative text the client renders inline
  // visuals from; worst case is a brief literal-tag flash mid-stream, never a
  // rendered leak. Self-contained (doesn't touch the board block) and fail-safe:
  // a gate error leaves the text untouched and never breaks the response.
  if (visualGateMode !== 'off' && containsInlineGraphTag(verified.text)) {
    try {
      const pinnedTex = ctx.conversation?.boardProblem?.tex || null;
      const activeProblem = {
        problemText: pinnedTex,
        normalizedExpression: pinnedTex,
        correctAnswer: diagnosis.correctAnswer || null,
        problemType: diagnosis.problemType || null,
        status: diagnosis.isCorrect === true
          ? 'solved'
          : ((pinnedTex || diagnosis.correctAnswer) ? 'unsolved' : 'unknown'),
      };
      const learningState = {
        concept: ctx.activeSkill?.name || null,
        misconception: diagnosis.misconception?.name || null,
        masteryScore: null,
      };
      const inlineResult = await gateInlineGraphTags({
        text: verified.text,
        activeProblem,
        learningState,
        user: ctx.user || null,
        mode: visualGateMode,
        // Same opt-in as the board path: leak-block runs deterministically in
        // live modes; the decorative/relevance value judge is separate.
        enableValueJudge: process.env.VISUAL_GATE_VALUE_JUDGE === 'on',
      });
      if (typeof inlineResult.text === 'string' && inlineResult.text !== verified.text) {
        verified.text = inlineResult.text;
      }
      if (inlineResult.records.length) {
        const turnIndex = Array.isArray(ctx.conversation?.messages) ? ctx.conversation.messages.length : null;
        const decisionDocs = [];
        for (const record of inlineResult.records) {
          if (record.decision !== 'allow') {
            boardLogger.info('Visual gate decision (inline graph)', {
              mode: visualGateMode,
              action: record.action,
              decision: record.decision,
              reasonCode: record.reasonCode,
              riskLevel: record.riskLevel,
            });
          }
          decisionDocs.push(buildDecisionDoc({
            record,
            activeProblem,
            learningState,
            mode: visualGateMode,
            userId: ctx.user?._id || null,
            conversationId: ctx.conversation?._id || null,
            turnIndex,
          }));
        }
        if (decisionDocs.length) persistVisualDecisions(decisionDocs);
      }
    } catch (gateErr) {
      boardLogger.error('Inline visual gate failed (non-fatal)', { error: gateErr.message });
    }
  }

  // ── Stage 5c.1: TURN-TYPE BACKFILL (Phase 5) ──
  // Phase 3 lit the audit signal; Phase 5 acts on the one hard bug it
  // detects. When the model self-declared turn_type=problem_introduction
  // yet no pose survived the merge — neither LLM-emitted nor synthesized
  // (the problem parses as neither algebra nor recognized geometry, or
  // the main synth skipped pose on a stale-but-open cycle) — the board
  // would sit empty on the exact turn the model said a problem is on the
  // table. The turn_type is ground truth the synthesizer can't otherwise
  // see, so we backfill a verbatim pose. Naturally dark-flagged:
  // structuredTurnType is only populated when STRUCTURED_TUTOR_RESPONSE
  // is on, so flag-off traffic never reaches this branch.
  // Trigger on the model's self-declared problem_introduction turn_type OR — when
  // the board is still empty — the decide stage's own `present_problem` action.
  // The model under-declares problem_introduction on conversational lead-ins, so
  // the pose used to lag until the equation later parsed (often the student's own
  // attempt), which reads as "the problem showed up after I'd solved it". The
  // decide action is pipeline ground truth, not a model self-report; we only trust
  // it to pose onto an EMPTY board (no pinned problem) so it can never re-pose a
  // problem already in play or mistake an intermediate line for a new one.
  const posePinnedTex = ctx.conversation?.boardProblem?.tex || null;
  const problemIntroTurn = shouldBackfillProblemPose({
    structuredTurnType: generatedResult.structuredTurnType,
    decisionAction: decision?.action,
    pinnedTex: posePinnedTex,
  });
  let backfillOutcome = null;
  if (problemIntroTurn
      && !verified.boardCommands.some(c => c.action === 'pose')) {
    const fallbackPose = synthesizeFallbackPose({
      tutorResponse: verified.text,
      studentMessage: message,
    });
    if (fallbackPose) {
      // Defense in depth — same guard every other board path runs.
      const backfillGuard = enforcePedagogyRule({
        commands: [fallbackPose],
        userMessage: message,
        recentUserMessages: recentUserMessagesForBoard,
        lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
      });
      if (backfillGuard.allowed.length > 0) {
        // Re-merge so canonical ordering (pose first) is preserved.
        const backfilled = mergeWithLlmCommands(verified.boardCommands, backfillGuard.allowed);
        verified.boardCommands = backfilled.all;
        backfillOutcome = 'posed';
        boardLogger.info('Turn-type backfill posed problem (Phase 5)', {
          turnType: generatedResult.structuredTurnType,
          tex: fallbackPose.tex,
        });
      } else if (backfillGuard.dropped.length > 0) {
        backfillOutcome = 'guard_dropped';
        boardLogger.warn('Pedagogy guard dropped turn-type backfill pose', {
          reason: backfillGuard.dropped[0].reason,
          tex: fallbackPose.tex,
        });
      }
    } else {
      backfillOutcome = 'no_posable_problem';
      turnTypeLogger.warn('turn_type=problem_introduction with no posable problem; board left empty', {
        turnType: generatedResult.structuredTurnType,
      });
    }
  }

  // ── Stage 5c.2: STRUCTURED-PATH METRICS (Phase 6) ──
  // One passive record per structured turn — turn_type, audit mismatches,
  // and the Stage 5c.1 backfill outcome — so the flag-on misclassification
  // and backfill rates are observable in aggregate (scraped via
  // GET /api/admin/structured-tutor-metrics). Same gate as the audit
  // (isStructuredTurn), so a turn with a botched/null turn_type still
  // counts toward the denominator instead of vanishing. llmBoardCount is
  // the model's raw pre-guard emission — what it actually tried to draw,
  // not what survived the pedagogy guard.
  if (isStructuredTurn) {
    try {
      structuredMetrics.recordStructuredTurn({
        turnType: generatedResult.structuredTurnType,
        llmBoardCount: rawLlmBoardCommands.length,
        mismatches: auditMismatches,
        backfill: backfillOutcome,
      });
    } catch (metricsErr) {
      // Metrics must never break a response.
      turnTypeLogger.warn('structured metrics record failed (non-fatal)', { error: metricsErr.message });
    }
  }

  // ── Stage 5c.3: BOARD-REFERENCE BACKSTOP ──
  // The LLM is supposed to emit a board card when the student points at the
  // work board ("show me on the board"), but tag compliance is unreliable and
  // the deterministic synthesizer only fires on a posable problem statement —
  // neither covers a student referencing a problem that's already in play. When
  // the student explicitly references the board yet nothing survived the turn,
  // re-pose the pinned problem so the board isn't left empty. Unlike the
  // turn-type backfill this is NOT gated on the structured flag — it runs on
  // all production traffic. Conservative by construction: tight reference
  // detection + fires only on an empty board + poses ground-truth tex (the pin,
  // else a verbatim tutor sentence). Worst case on a false positive is
  // re-drawing the current problem.
  if (verified.boardCommands.length === 0
      && ctx.conversation
      && detectBoardReference(message)) {
    const pinnedTex = ctx.conversation?.boardProblem?.tex || null;
    const backstopPose = pinnedTex
      ? { action: 'pose', tex: pinnedTex }
      : synthesizeFallbackPose({ tutorResponse: verified.text, studentMessage: message });

    if (backstopPose) {
      const backstopGuard = enforcePedagogyRule({
        commands: [backstopPose],
        userMessage: message,
        recentUserMessages: recentUserMessagesForBoard,
        lastBoardActionInConversation: ctx.conversation?.lastBoardAction || null,
      });
      if (backstopGuard.allowed.length > 0) {
        verified.boardCommands = backstopGuard.allowed;
        boardLogger.info('Board-reference backstop posed problem', {
          source: pinnedTex ? 'pin' : 'fallback',
          tex: backstopPose.tex,
        });
      }
    } else {
      boardLogger.warn('Board referenced but nothing posable; board left empty', {});
    }
  }

  // ── Stage 5c.2: AUTO-CLEAR ON NEW PROBLEM ──
  // All pose sources are final now. If this turn poses a genuinely NEW
  // problem while an older one is pinned, prepend the `clear` the model
  // should have emitted — otherwise the previous problem's cards (including
  // interactive tools) stay stacked above the new work.
  {
    const beforeLen = verified.boardCommands.length;
    verified.boardCommands = synthesizeAutoClear({
      commands: verified.boardCommands,
      previousProblemTex: ctx.conversation?.boardProblem?.tex || null,
    });
    if (verified.boardCommands.length > beforeLen) {
      boardLogger.info('Auto-clear prepended for new problem pose', {
        previous: ctx.conversation?.boardProblem?.tex || null,
      });
    }
  }

  // Read-only `example` cards are teaching aids, not moves in the student's
  // solve cycle — they must not advance lastBoardAction (which gates clear-after-
  // verify and the synthesizer's cycle-closed logic) or touch the pin. Track
  // state on the solve-cycle cards only; a turn that emitted ONLY example cards
  // leaves conversation state exactly as it was.
  const cycleCards = verified.boardCommands.filter(c => c.action !== 'example');
  if (cycleCards.length > 0 && ctx.conversation) {
    const lastEmitted = cycleCards[cycleCards.length - 1].action;
    ctx.conversation.lastBoardAction = lastEmitted;

    // Pin / unpin the canonical board problem so future turns anchor to
    // it instead of re-parsing intermediate scratch work (or leaving a
    // stale problem on the board). A pose — including an auto-advance
    // clear+pose or a turn-type backfill — sets the pin; a verify/clear
    // that ends the cycle drops it.
    const poseCard = [...cycleCards].reverse().find(c => c.action === 'pose');
    if (poseCard && poseCard.tex) {
      ctx.conversation.boardProblem = { tex: poseCard.tex, posedAt: new Date() };
      ctx.conversation.markModified?.('boardProblem');
    } else if (lastEmitted === 'verify' || lastEmitted === 'clear') {
      ctx.conversation.boardProblem = null;
      ctx.conversation.markModified?.('boardProblem');
    }
  }

  // Persistent Problem Card lifecycle (Live Workspace spec §4, MVP #20): fold
  // this turn's board into conversation.boardLedger so a reload / session
  // switch can replay the board — the in-focus derivation AND the rail of
  // finished problems — instead of coming back blank. ALL verified commands
  // are folded (not just cycleCards): the client renders example/scaffold
  // lines too, and a faithful replay must include them. Non-fatal by design.
  if (verified.boardCommands.length > 0 && ctx.conversation) {
    try {
      // How much help THIS turn gave (spec §12 ladder) — max-folded onto the
      // problem in focus, so the completed card records the heaviest support
      // the student needed anywhere in the problem. Read back by persist's
      // mastery update: an answer reached at ladder ≥5 is not independent.
      const turnAssistance = assistanceLevelForTurn({
        decisionAction: decision?.action,
        scaffoldLevel: decision?.scaffoldLevel,
        boardCommands: verified.boardCommands,
      });
      ctx.conversation.boardLedger = applyTurnToLedger(
        ctx.conversation.boardLedger, verified.boardCommands, new Date(),
        { assistance: turnAssistance, sourceRef: ctx.sourceRef || null }
      );
      ctx.conversation.markModified?.('boardLedger');
    } catch (ledgerErr) {
      boardLogger.warn('Board ledger update failed (non-fatal)', { error: ledgerErr.message });
    }
  }

  // ── Stage 5d: XP CEREMONY TAGS (Phase C) ──
  // Extract <XP size="..." reason="..." /> ceremony tags from verify.text
  // and strip them from the visible message. Purely visual — does NOT
  // award XP (that stays the job of <CORE_BEHAVIOR_XP> + Tier 1/2).
  // Cap at 3 ceremonies per turn so a runaway model can't confetti-bomb
  // the chat. No pedagogy guard needed: the model can decide when a
  // moment deserves amplification.
  const xpParsed = parseXpTags(verified.text);
  if (xpParsed.xpCommands.length > 0) {
    verified.text = xpParsed.cleanedText;
    verified.xpCommands = xpParsed.xpCommands.slice(0, 3);
  } else {
    verified.xpCommands = [];
  }

  // ── Stage 5e: VISUAL TAB TAGS (Phase D) ──
  // Extract <GRAPH fn="..."/> and <TILES expression="..."/> tags from
  // verify.text and strip them from the visible message. These switch
  // the workspace tab on the client to a focused tool (Graph or Tiles)
  // rather than dropping a card into the board timeline — coexists
  // with <BOARD action="graph"/>. Cap at 2 per turn so a single reply
  // can't whipsaw the workspace through several tab changes.
  const visualTabParsed = parseVisualTabTags(verified.text);
  if (visualTabParsed.visualTabCommands.length > 0) {
    verified.text = visualTabParsed.cleanedText;
    verified.visualTabCommands = visualTabParsed.visualTabCommands.slice(0, 2);
  } else if (tilesTabBackfill) {
    // The tutor promised tiles in prose but emitted no <TILES/> tag — the
    // board would silently contradict the chat ("Take a look now…" over the
    // previous topic's tool). Backfill the tab command it should have sent.
    verified.visualTabCommands = [tilesTabBackfill];
    boardLogger.info('Tiles-promise backfill added TILES tab command', {
      expression: tilesTabBackfill.expression,
    });
  } else {
    verified.visualTabCommands = [];
  }

  // ── Stage 5f: INTERNAL-TAG SCRUB (last line of defense) ──
  // After every legitimate side-channel tag has been extracted above,
  // strip any internal scaffolding the model echoed into the prose —
  // an injected [ANSWER_PRE_CHECK: ...] directive, or a board command
  // the model wrote as raw JSON instead of a <BOARD/> tag. This is the
  // authoritative student-facing text (returned as `text` below and
  // sent as the `complete` event, which REPLACES the streamed bubble),
  // so scrubbing here fixes the persisted leak regardless of what
  // flickered mid-stream. Guarded by a cheap predicate — no-op on the
  // clean common case.
  if (hasInternalTags(verified.text)) {
    boardLogger.warn('Internal scaffolding leaked into tutor text; scrubbed', {
      conversationId: ctx.conversation?._id ? String(ctx.conversation._id) : null,
    });
    verified.text = stripInternalTags(verified.text);
  }
  // Unbalanced \( / \[ delimiters render as raw source in the bubble —
  // drop the orphans (balanced math is untouched). Cheap, so unconditional.
  verified.text = stripOrphanMathDelims(verified.text);

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
      masteryCompleted: false,
      masterySuccess: false,
      badgeAwarded: null,
      iepGoalUpdates: [],
      learningCards: [],
      courseProgressUpdate: null,
      aiTimeUsed: 0,
      freeWeeklySecondsRemaining: null,
    };
    console.log('[Pipeline] Persist: SKIPPED (skipPersist=true)');
  } else {
    // ── Update learning engines (BKT, FSRS, ConsistencyScorer) ──
    // These run BEFORE persist so the updated states are saved with the user document.
    // Resolve the skill in focus the same way the tutor-plan/badge updates do
    // (activeSkill, else the current tutor-plan target). Using ctx.activeSkill.skillId
    // directly keyed BKT/FSRS/SmartScore state under "undefined" whenever activeSkill
    // lacked a skillId but a target existed — so a whole session's mastery evidence
    // pooled into one bogus bucket instead of the skill being taught.
    const resolvedSkillId = ctx.activeSkill?.skillId || tutorPlan?.currentTarget?.skillId || null;
    // Resilience (mode-A attribution): currentTarget goes transiently null — it's
    // cleared when a skill reads as mastered (tutorPlanManager) and isn't re-set on
    // a turn that resolves no skill. On such a turn a clean, verified solve would
    // credit NOTHING and the progress bar wouldn't move. So fall back to the skill
    // the student is plainly working on: the most-recently-worked in-progress skill
    // in the plan. The verified-attempt gate below is unchanged, so this only ever
    // routes a real completed problem to a real in-progress skill — never invents one.
    const engineSkillId = resolvedSkillId || recentPracticeSkillId(tutorPlan);
    if (!resolvedSkillId && engineSkillId) {
      console.log(`[Pipeline] Attribution fallback: crediting to in-progress skill "${engineSkillId}" (no active target this turn)`);
    }
    // The verified answer feeds skillMastery's pillars/rung too, not just BKT.
    // This replaces the disabled <SKILL_MASTERED> tag path — without it, chat
    // practice never advanced skillMastery and the progress card sat frozen.
    let masteryAttempt = null;
    if (engineSkillId && diagnosis.type !== 'no_answer' && diagnosis.type !== 'unverifiable') {
      try {
        updateLearningEngines(ctx.user, engineSkillId, diagnosis, observation);
      } catch (err) {
        console.error('[Pipeline] Learning engine update error (non-fatal):', err.message);
      }
      // Only a completed attempt counts as evidence — a correct-but-partial
      // answer is still in progress (mirrors persist's problemAnswered gate).
      if (diagnosis.type !== 'correct_partial') {
        masteryAttempt = { skillId: engineSkillId, correct: diagnosis.isCorrect === true };
      }
    }

    try {
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
        masteryAttempt,
      });
    } catch (persistErr) {
      console.error('[Pipeline] Persist stage failed (non-fatal):', persistErr.message);
      // Return safe defaults so the student still gets their response
      persistResults = {
        xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
        problemAnswered: false,
        wasCorrect: false,
        wasSkipped: false,
        leveledUp: false,
        tutorsUnlocked: [],
        avatarBuilderUnlocked: false,
        masteryCompleted: false,
        masterySuccess: false,
        badgeAwarded: null,
        iepGoalUpdates: [],
      learningCards: [],
        courseProgressUpdate: null,
        aiTimeUsed: 0,
        freeWeeklySecondsRemaining: null,
      };
    }

    // ── Update Tutor Plan after interaction (evidence-driven) ──
    if (tutorPlan) {
      try {
        const targetSkillId = ctx.activeSkill?.skillId || tutorPlan.currentTarget?.skillId;
        const notes = [];
        let shouldAdvance = false;
        let advanceToPhase = null;
        let familiarityChange = null;

        // ── 1. Phase advancement — driven by phaseState (unified tracker) ──
        // The decide stage already evaluated and updated phaseState via
        // evaluatePhaseAdvancement(). Read the result from phaseState to
        // sync tutor plan instruction phases.
        //
        // CAUTION: lessonPhaseManager and TutorPlan use different phase
        // enums. phaseState carries values like 'intro' / 'warmup' that are
        // not valid TutorPlan.currentTarget.instructionPhase values. Sync
        // only when the phaseState value is a valid target-phase enum, so
        // Mongoose validation doesn't silently abort the save.
        const VALID_INSTRUCTION_PHASES = [
          'prerequisite-review', 'vocabulary', 'concept-intro',
          'i-do', 'we-do', 'you-do', 'mastery-check',
        ];
        const phaseState = ctx.phaseState || ctx.conversation?.phaseState;
        if (phaseState && tutorPlan.currentTarget?.instructionPhase) {
          const currentPhase = phaseState.currentPhase || phaseState.phase;
          const planPhase = tutorPlan.currentTarget.instructionPhase;

          if (currentPhase
              && currentPhase !== planPhase
              && VALID_INSTRUCTION_PHASES.includes(currentPhase)) {
            shouldAdvance = true;
            advanceToPhase = currentPhase;
            console.log(`[Pipeline] Syncing plan phase: ${planPhase} → ${currentPhase}`);
            notes.push({
              content: `Phase synced to ${currentPhase}`,
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
    // Signals the client to open the timed practice-ACT runner. Extracted in
    // verify (shared choke point) so it fires on both /api/chat and course-chat.
    launchPracticeAct: verified.extracted?.launchPracticeAct || false,
    // Tutor-proposed notebook idea (§7.6) — the client asks the student.
    ideaSuggestion: verified.extracted?.ideaSuggestion || null,
    // Tutor pointing at a specific board line (§8) — the client makes it glow.
    boardPoint: verified.extracted?.boardPoint || null,
    // Tutor finished coaching the current missed question → advance the ACT
    // bootcamp review queue (handled in routes/chat.js after the pipeline).
    reviewNext: verified.extracted?.reviewNext || false,
    visualCommands: verified.visualCommands,
    boardCommands: verified.boardCommands || [],
    // Fix B: when set, the client opens an in-chat challenge card for this skill.
    launchChallenge: launchChallenge || null,
    xpCommands: verified.xpCommands || [],
    visualTabCommands: verified.visualTabCommands || [],
    drawingSequence: verified.drawingSequence,
    boardContext: verified.boardContext,
    xpBreakdown: persistResults.xpBreakdown,
    problemResult: persistResults.problemAnswered
      ? (persistResults.wasCorrect ? 'correct' : 'incorrect')
      : null,
    // Parallel worked example flag — drives the "🔄 Similar problem" UI badge.
    // Gated on BOTH the decision (intent) AND the verified response text
    // (actual behavior). The decide stage sometimes routes to WORKED_EXAMPLE
    // / EXIT_RAMP from cumulative wrong-counts that include misdiagnosed
    // turns, so action alone is unreliable — we confirm the tutor's reply
    // actually introduces a parallel example before tagging the turn.
    isParallelExample:
      (decision.action === ACTIONS.WORKED_EXAMPLE || decision.action === ACTIONS.EXIT_RAMP)
      && detectParallelExampleIntroduction(verified.text),
    // Error annotation: misconception label for frontend display (no answer revealed)
    errorAnnotation: (diagnosis.isCorrect === false && diagnosis.misconception) ? {
      name: diagnosis.misconception.name,
      description: diagnosis.misconception.description || null,
      source: diagnosis.misconception.source, // 'library' or 'ai_analysis'
    } : null,
    leveledUp: persistResults.leveledUp,
    tutorsUnlocked: persistResults.tutorsUnlocked,
    masteryCompleted: persistResults.masteryCompleted || false,
    masterySuccess: persistResults.masterySuccess || false,
    badgeAwarded: persistResults.badgeAwarded || null,
    iepGoalUpdates: persistResults.iepGoalUpdates,
    // Notebook cards minted this turn (AHA / activated reminders) — the
    // client celebrates them (Live Workspace spec §7).
    learningCards: persistResults.learningCards || [],
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
  // key BKT / FSRS / consistency state on the canonical unified skill id, so a
  // concept's learning state never splits across a legacy id and its unified id
  skillId = canonicalSkillId(skillId);
  // Safety net: never key per-skill learning state under an undefined id. Callers
  // should pass a resolved skill, but if none is in focus there's nothing to track.
  // (Belt and braces with the caller's guard — every write below is state[skillId].)
  if (!skillId) return;
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

/**
 * Whether Stage 5c.1 should backfill a PROBLEM pose this turn. True when the
 * turn genuinely introduces a problem but no pose survived upstream. Two
 * independent signals:
 *   • the model's self-declared `problem_introduction` turn_type, or
 *   • — only onto an EMPTY board — the decide stage's `present_problem` action.
 * The decide action is pipeline ground truth (not a model self-report), so it
 * catches the model under-declaring its turn_type on a conversational lead-in,
 * which is what made the pose lag behind the chat. Restricting the decide signal
 * to an empty board (no pinned problem) means it can never re-pose a problem
 * already in play or mistake an intermediate line for a new one.
 *
 * @param {object} p
 * @param {string|null} p.structuredTurnType
 * @param {string|null} p.decisionAction
 * @param {string|null} p.pinnedTex
 * @returns {boolean}
 */
function shouldBackfillProblemPose({ structuredTurnType, decisionAction, pinnedTex } = {}) {
  if (structuredTurnType === 'problem_introduction') return true;
  return decisionAction === 'present_problem' && !pinnedTex;
}

module.exports = {
  runPipeline,
  shouldBackfillProblemPose,
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
