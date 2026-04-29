// routes/guidedLesson.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// (add input validation)

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { generateSystemPrompt } = require('../utils/prompt');
const User = require('../models/user');
const { callLLM, retryWithExponentialBackoff } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
const { checkReadingLevel, buildSimplificationPrompt } = require('../utils/readability');
const { verify: pipelineVerify } = require('../utils/pipeline');
const { selectWarmupSkill, checkPrerequisiteReadiness } = require('../utils/prerequisiteMapper');
const logger = require('../utils/logger').child({ route: 'guidedLesson' });
const {
  initializeLessonPhase,
  transitionPhase,
  getPhasePrompt,
  PHASES
} = require('../utils/lessonPhaseManager');
const {
  evaluatePhaseAdvancement,
  updatePhaseTracker,
} = require('../utils/phaseEvidenceEvaluator');

// Define a reasonable character limit for user input in lesson context
const MAX_LESSON_INPUT_LENGTH = 1500; // Slightly more generous as it's guided, but still limited

router.use(isAuthenticated, async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        req.userProfile = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve user profile' });
    }
});

router.post('/generate-interactive-lesson', async (req, res) => {
    try {
        const { lessonContext } = req.body;
        const { title, goals, miniLessonConcepts, instructionalStrategies, conversationHistory, phaseState, skillId } = lessonContext;
        const userId = req.userProfile._id;

        // Validate incoming user message (if any)
        const latestUserMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1].content : '';
        if (latestUserMessage && latestUserMessage.length > MAX_LESSON_INPUT_LENGTH) {
            return res.status(400).json({ message: `Your input is too long for this lesson step. Max ${MAX_LESSON_INPUT_LENGTH} characters.` });
        }

        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        const systemPrompt = generateSystemPrompt(userProfile, tutorName);
        let messages = [];

        // ========== ADAPTIVE LESSON PHASE MANAGEMENT ==========
        let currentPhaseState = phaseState;

        // Initialize phase state if this is the first message
        if (!conversationHistory || conversationHistory.length === 0) {
            // Select intelligent warmup based on prerequisites
            const warmupData = selectWarmupSkill(skillId || title, userProfile);

            // Check if student ready for this skill
            const readiness = checkPrerequisiteReadiness(skillId || title, userProfile);
            if (!readiness.ready) {
                logger.warn(`Prerequisite gaps detected: ${readiness.recommendation}`);
            }

            // Initialize adaptive lesson phases
            currentPhaseState = initializeLessonPhase(skillId || title, warmupData);

            logger.info(`Starting adaptive lesson: ${title}`);
            logger.info(`Warmup skill: ${warmupData.skillName}`);
            logger.info(`Current phase: ${currentPhaseState.currentPhase}`);
        }

        // Auto-advance phase based on message count (simple heuristic for now)
        // TODO: Enhance with explicit assessment signal recording
        if (currentPhaseState && conversationHistory.length > 0) {
            const messagesSincePhaseStart = conversationHistory.length -
                (currentPhaseState.phaseHistory.reduce((sum, p) => sum + (p.messageCount || 2), 0));

            // Simple auto-transition logic based on conversation depth
            const phaseEval = evaluatePhaseAdvancement(
                { phase: currentPhaseState.currentPhase, turnsInPhase: currentPhaseState.turnsInPhase || messagesSincePhaseStart, evidenceLog: currentPhaseState.evidenceLog || [] },
                {}, // No per-turn evidence in this legacy path
                {}
            );
            updatePhaseTracker(currentPhaseState, phaseEval, {});

            if (phaseEval.shouldAdvance && phaseEval.nextPhase) {
                currentPhaseState = transitionPhase(currentPhaseState, phaseEval.nextPhase, phaseEval.reasoning);
            } else if (phaseEval.shouldRegress && phaseEval.nextPhase) {
                currentPhaseState = transitionPhase(currentPhaseState, phaseEval.nextPhase, phaseEval.reasoning);
            }
        }

        // Get adaptive phase prompt
        const phasePrompt = currentPhaseState
            ? getPhasePrompt(currentPhaseState, title)
            : '';

        // Build task prompt based on lesson context
        const contextPrompt = `
## Lesson Context
**Target Skill:** ${title}
**Learning Goals:** ${goals.join(', ')}
**Core Concepts:** ${miniLessonConcepts.join(', ')}
**Instructional Strategies Available:** ${instructionalStrategies.join(', ')}

${phasePrompt}

**IMPORTANT REMINDERS:**
- Keep responses conversational and natural (students don't see phase labels)
- Check for understanding frequently
- Adapt to student signals (confidence, accuracy, verbal cues)
- When student demonstrates mastery (${PHASES.MASTERY_CHECK} phase, 80%+ accuracy), end with: **<END_LESSON_DIALOGUE />**
`;

        // Build message array
        if (!conversationHistory || conversationHistory.length === 0) {
            messages.push({ role: 'system', content: systemPrompt + '\n\n' + contextPrompt });
        } else {
            messages.push({ role: 'system', content: systemPrompt + '\n\n' + contextPrompt });
            messages = messages.concat(conversationHistory);
        }

        const lessonAiStart = Date.now();
        const completion = await callLLM("gpt-4o-mini", messages, { temperature: 0.7, max_tokens: 500 });

        // Track AI processing time (server-side, for fair billing)
        const lessonAiSeconds = Math.ceil((Date.now() - lessonAiStart) / 1000);
        if (req.user?._id) {
            User.findByIdAndUpdate(req.user._id, {
                $inc: { weeklyAISeconds: lessonAiSeconds, totalAISeconds: lessonAiSeconds }
            }).catch(err => logger.error('[GuidedLesson] AI time tracking error:', err));
        }

        let aiResponseText = completion.choices[0].message.content.trim();

        // IEP reading level enforcement
        const iepReadingLevel = userProfile.iepPlan?.readingLevel || null;
        if (iepReadingLevel) {
            const readCheck = checkReadingLevel(aiResponseText, iepReadingLevel);
            if (!readCheck.passes) {
                logger.info(
                    `[GuidedLesson] Reading level violation: response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
                );
                try {
                    const simplifyPrompt = buildSimplificationPrompt(aiResponseText, readCheck.targetGrade, userProfile.firstName || 'the student');
                    const simplified = await callLLM("gpt-4o-mini", [{ role: 'system', content: simplifyPrompt }], {
                        temperature: 0.3, max_tokens: 500
                    });
                    const simplifiedText = simplified.choices[0]?.message?.content?.trim();
                    if (simplifiedText && simplifiedText.length > 20) {
                        aiResponseText = simplifiedText;
                        logger.info(`[GuidedLesson] Response simplified to target Grade ${readCheck.targetGrade}`);
                    }
                } catch (err) {
                    logger.error('[GuidedLesson] Simplification failed:', err.message);
                }
            }
        }

        // Pipeline verify (defense-in-depth) — runs answer-key, answer-
        // giveaway, system-tag, and reading-level guards before sending
        // student-facing text. Lesson dialogue tag is preserved by extracting
        // it pre-verify (verify strips system tags by design).
        const lastUserTurn = (conversationHistory || [])
            .filter(m => m?.role === 'user')
            .slice(-1)[0]?.content || '';
        const phaseStateForVerify = currentPhaseState ? {
            currentPhase: currentPhaseState.currentPhase,
            phase: currentPhaseState.currentPhase,
        } : null;
        try {
            const verified = await pipelineVerify(aiResponseText, {
                userId: req.user?._id?.toString?.(),
                userMessage: lastUserTurn,
                iepReadingLevel: userProfile.iepPlan?.readingLevel || null,
                firstName: userProfile.firstName,
                isStreaming: false,
                phaseState: phaseStateForVerify,
            });
            // Verify strips system tags including <END_LESSON_DIALOGUE />,
            // so re-detect the mastery signal on the original text below.
            if (verified.text && verified.text !== aiResponseText) {
                const hadMasterySignal = aiResponseText.includes('<END_LESSON_DIALOGUE />');
                aiResponseText = hadMasterySignal
                    ? verified.text + ' <END_LESSON_DIALOGUE />'
                    : verified.text;
            }
        } catch (err) {
            logger.warn('[GuidedLesson] verify failed (using unverified):', err.message);
        }

        let lessonState = 'continue';
        let cleanMessage = aiResponseText;

        // Check for mastery signal
        if (aiResponseText.includes('<END_LESSON_DIALOGUE />')) {
            lessonState = 'start_assessment';
            cleanMessage = aiResponseText.replace('<END_LESSON_DIALOGUE />', '').trim();

            // Mark as ready for mastery if not already
            if (currentPhaseState) {
                currentPhaseState.readyForMastery = true;
            }
        }

        // Return response with updated phase state
        res.json({
            aiMessage: cleanMessage,
            lessonState: lessonState,
            phaseState: currentPhaseState, // Send back to client for next request
            currentPhase: currentPhaseState?.currentPhase, // For debugging/visibility
            phaseTransitions: currentPhaseState?.transitionLog // For analytics
        });

    } catch (error) {
        logger.error('Error in /generate-interactive-lesson:', error?.response?.data || error.message || error);
        res.status(500).json({ error: 'Failed to generate lesson. Please try again.' });
    }
});

/**
 * OPTIONAL: Record explicit assessment signal
 * Allows frontend to send explicit correct/incorrect/confidence signals
 * Enhances adaptive phase transitions with real formative assessment data
 */
router.post('/record-assessment', async (req, res) => {
    try {
        const { phaseState, responseType, verbalSignal } = req.body;

        if (!phaseState) {
            return res.status(400).json({ error: 'Phase state required' });
        }

        // Record assessment via evidence evaluator
        const isCorrect = responseType === 'CORRECT_FAST' || responseType === 'CORRECT_SLOW';
        const phaseEval = evaluatePhaseAdvancement(
            { phase: phaseState.currentPhase, turnsInPhase: phaseState.turnsInPhase || 0, evidenceLog: phaseState.evidenceLog || [] },
            { diagnosis: { isCorrect } },
            {}
        );
        updatePhaseTracker(phaseState, phaseEval, { diagnosis: { isCorrect } });

        if ((phaseEval.shouldAdvance || phaseEval.shouldRegress) && phaseEval.nextPhase) {
            transitionPhase(phaseState, phaseEval.nextPhase, phaseEval.reasoning);
        }

        res.json({
            success: true,
            phaseState,
            transitionDecision: {
                shouldTransition: phaseEval.shouldAdvance || phaseEval.shouldRegress,
                nextPhase: phaseEval.nextPhase,
                rationale: phaseEval.reasoning,
            },
        });

    } catch (error) {
        logger.error('Error recording assessment:', error);
        res.status(500).json({ error: 'Failed to record assessment' });
    }
});

router.post('/get-scaffolded-hint', async (req, res) => {
    try {
        const { hintContext } = req.body;
        const { problem, userAnswer, correctAnswer, strategies } = hintContext;
        const userProfile = req.userProfile;
        const tutorName = userProfile.selectedTutorId || "M∆THM∆TIΧ AI";

        // Validate user answer length for hints
        if (userAnswer && userAnswer.length > MAX_LESSON_INPUT_LENGTH) {
            return res.status(400).json({ message: `Your answer is too long. Max ${MAX_LESSON_INPUT_LENGTH} characters.` });
        }

        const systemPrompt = generateSystemPrompt(userProfile, tutorName);
        const taskPrompt = `
### Your Task: Provide a Guiding Hint ###
A student needs help with a problem. Use your adaptive teaching strategies to provide a supportive, guiding hint.
- The problem was: "${problem}"
- Their incorrect answer was: "${userAnswer}"
- The correct answer is: "${correctAnswer}"
**Your Instructions:**
1. Acknowledge their effort positively.
2. Gently guide them toward their mistake without explicitly stating it.
3. DO NOT give them the direct answer.
4. Use one of the following teaching strategies to inform your hint: ${strategies.join(', ')}
5. Craft a natural, conversational response that builds confidence.
        `;
        
        const hintAiStart = Date.now();
        const aiHint = await callLLM("gpt-4o-mini", [{ role: "system", content: systemPrompt + taskPrompt }], { temperature: 0.7, max_tokens: 150 }); // Using centralized LLM call

        // Track AI processing time (server-side, for fair billing)
        const hintAiSeconds = Math.ceil((Date.now() - hintAiStart) / 1000);
        if (req.user?._id) {
            User.findByIdAndUpdate(req.user._id, {
                $inc: { weeklyAISeconds: hintAiSeconds, totalAISeconds: hintAiSeconds }
            }).catch(err => logger.error('[GuidedLesson/Hint] AI time tracking error:', err));
        }

        let hintText = aiHint.choices[0].message.content.trim();

        // IEP reading level enforcement
        const hintReadingLevel = userProfile.iepPlan?.readingLevel || null;
        if (hintReadingLevel) {
            const readCheck = checkReadingLevel(hintText, hintReadingLevel);
            if (!readCheck.passes) {
                logger.info(
                    `[GuidedLesson/Hint] Reading level violation: response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
                );
                try {
                    const simplifyPrompt = buildSimplificationPrompt(hintText, readCheck.targetGrade, userProfile.firstName || 'the student');
                    const simplified = await callLLM("gpt-4o-mini", [{ role: 'system', content: simplifyPrompt }], {
                        temperature: 0.3, max_tokens: 150
                    });
                    const simplifiedText = simplified.choices[0]?.message?.content?.trim();
                    if (simplifiedText && simplifiedText.length > 20) {
                        hintText = simplifiedText;
                        logger.info(`[GuidedLesson/Hint] Hint simplified to target Grade ${readCheck.targetGrade}`);
                    }
                } catch (err) {
                    logger.error('[GuidedLesson/Hint] Simplification failed:', err.message);
                }
            }
        }

        // Pipeline verify (defense-in-depth) — hints must never reveal
        // the correct answer, even though `correctAnswer` was passed to
        // the prompt for context. Verify catches an LLM that ignores
        // instruction #3 ("DO NOT give them the direct answer").
        try {
            const verified = await pipelineVerify(hintText, {
                userId: req.user?._id?.toString?.(),
                userMessage: problem,
                iepReadingLevel: userProfile.iepPlan?.readingLevel || null,
                firstName: userProfile.firstName,
                isStreaming: false,
            });
            hintText = verified.text || hintText;
        } catch (err) {
            logger.warn('[GuidedLesson/Hint] verify failed (using unverified):', err.message);
        }

        res.json({ hint: hintText });
    } catch (error) {
        logger.error('Error in /get-scaffolded-hint:', error?.response?.data || error.message || error);
        res.status(500).json({ error: 'Failed to generate hint. Please try again.' });
    }
});

/**
 * Record that a student submitted paper work during the paper-practice phase.
 * Called by the frontend after Show Your Work upload completes during a guided lesson.
 * Advances the phase past the paper gate.
 *
 * POST /api/guidedLesson/paper-submitted
 */
router.post('/paper-submitted', async (req, res) => {
    try {
        const { phaseState, gradingResultId } = req.body;

        if (!phaseState) {
            return res.status(400).json({ error: 'Phase state required' });
        }

        if (phaseState.currentPhase !== 'paper-practice') {
            return res.json({
                success: true,
                phaseState,
                message: 'Not in paper practice phase — no action taken'
            });
        }

        // Mark paper as submitted in the assessment data
        if (phaseState.assessmentData && phaseState.assessmentData['paper-practice']) {
            phaseState.assessmentData['paper-practice'].paperSubmitted = true;
            phaseState.assessmentData['paper-practice'].gradingResultId = gradingResultId || null;
            phaseState.assessmentData['paper-practice'].submittedAt = new Date();
        }

        // Record evidence signal for paper upload
        const phaseEval = evaluatePhaseAdvancement(
            {
                phase: phaseState.currentPhase,
                turnsInPhase: phaseState.turnsInPhase || 0,
                evidenceLog: [...(phaseState.evidenceLog || []), 'paper_work_uploaded']
            },
            {},
            {}
        );
        updatePhaseTracker(phaseState, phaseEval, {});

        // Advance past paper practice to check-in
        if (phaseEval.shouldAdvance && phaseEval.nextPhase) {
            transitionPhase(phaseState, phaseEval.nextPhase, phaseEval.reasoning);
        } else {
            // Force advance — paper was submitted, that's the gate
            transitionPhase(phaseState, 'check-in', 'Paper work uploaded and analyzed — moving to confidence check');
        }

        // Track unplugged work for badges (increment counter on user)
        if (req.user?._id) {
            const User = require('../models/user');
            await User.findByIdAndUpdate(req.user._id, {
                $inc: { 'paperPractice.totalSubmissions': 1 },
                $set: { 'paperPractice.lastSubmittedAt': new Date() }
            });
        }

        logger.info(`[GuidedLesson] Paper work submitted during lesson, advancing past paper-practice phase`);

        res.json({
            success: true,
            phaseState,
            currentPhase: phaseState.currentPhase,
            message: 'Paper work received! Moving on to the next phase.'
        });

    } catch (error) {
        logger.error('Error recording paper submission:', error);
        res.status(500).json({ error: 'Failed to record paper submission' });
    }
});

module.exports = router;