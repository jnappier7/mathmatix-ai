// routes/guidedLesson.js - PHASE 1: Backend Routing & Core Setup - Batch 2
// (add input validation)

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { generateSystemPrompt } = require('../utils/prompt');
const User = require('../models/user');
const { callLLM, retryWithExponentialBackoff } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
const { selectWarmupSkill, checkPrerequisiteReadiness } = require('../utils/prerequisiteMapper');
const {
  initializeLessonPhase,
  recordAssessment,
  evaluatePhaseTransition,
  transitionPhase,
  getPhasePrompt,
  PHASES
} = require('../utils/lessonPhaseManager');

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
                console.log(`⚠️ Prerequisite gaps detected: ${readiness.recommendation}`);
            }

            // Initialize adaptive lesson phases
            currentPhaseState = initializeLessonPhase(skillId || title, warmupData);

            console.log(`🎓 Starting adaptive lesson: ${title}`);
            console.log(`📚 Warmup skill: ${warmupData.skillName}`);
            console.log(`📊 Current phase: ${currentPhaseState.currentPhase}`);
        }

        // Auto-advance phase based on message count (simple heuristic for now)
        // TODO: Enhance with explicit assessment signal recording
        if (currentPhaseState && conversationHistory.length > 0) {
            const messagesSincePhaseStart = conversationHistory.length -
                (currentPhaseState.phaseHistory.reduce((sum, p) => sum + (p.messageCount || 2), 0));

            // Simple auto-transition logic based on conversation depth
            const transitionDecision = evaluatePhaseTransition(currentPhaseState);

            // Override: force transition based on message count if not enough data
            if (currentPhaseState.assessmentData[currentPhaseState.currentPhase].attempts === 0) {
                if (currentPhaseState.currentPhase === PHASES.WARMUP && messagesSincePhaseStart >= 2) {
                    currentPhaseState = transitionPhase(currentPhaseState, PHASES.I_DO, 'Auto-transition: warmup complete');
                } else if (currentPhaseState.currentPhase === PHASES.I_DO && messagesSincePhaseStart >= 2) {
                    currentPhaseState = transitionPhase(currentPhaseState, PHASES.WE_DO, 'Auto-transition: modeling complete');
                } else if (currentPhaseState.currentPhase === PHASES.WE_DO && messagesSincePhaseStart >= 4) {
                    currentPhaseState = transitionPhase(currentPhaseState, PHASES.CHECK_IN, 'Auto-transition: ready for check-in');
                } else if (currentPhaseState.currentPhase === PHASES.CHECK_IN && messagesSincePhaseStart >= 1) {
                    currentPhaseState = transitionPhase(currentPhaseState, PHASES.YOU_DO, 'Auto-transition: moving to independent practice');
                } else if (currentPhaseState.currentPhase === PHASES.YOU_DO && messagesSincePhaseStart >= 5) {
                    currentPhaseState = transitionPhase(currentPhaseState, PHASES.MASTERY_CHECK, 'Auto-transition: checking for mastery');
                }
            } else if (transitionDecision.shouldTransition) {
                currentPhaseState = transitionPhase(
                    currentPhaseState,
                    transitionDecision.nextPhase,
                    transitionDecision.rationale
                );
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

        const completion = await callLLM("gpt-4o", messages, { temperature: 0.7, max_tokens: 500 });

        const aiResponseText = completion.choices[0].message.content.trim();

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
        console.error('Error in /generate-interactive-lesson:', error?.response?.data || error.message || error);
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

        // Record the assessment
        const updatedPhaseState = recordAssessment(phaseState, responseType, verbalSignal);

        // Check if transition needed
        const transitionDecision = evaluatePhaseTransition(updatedPhaseState);

        if (transitionDecision.shouldTransition) {
            transitionPhase(updatedPhaseState, transitionDecision.nextPhase, transitionDecision.rationale);
        }

        res.json({
            success: true,
            phaseState: updatedPhaseState,
            transitionDecision
        });

    } catch (error) {
        console.error('Error recording assessment:', error);
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
        
        const aiHint = await callLLM("gpt-4o", [{ role: "system", content: systemPrompt + taskPrompt }], { temperature: 0.7, max_tokens: 150 }); // Using centralized LLM call

        res.json({ hint: aiHint.choices[0].message.content.trim() });
    } catch (error) {
        console.error('Error in /get-scaffolded-hint:', error?.response?.data || error.message || error);
        res.status(500).json({ error: 'Failed to generate hint. Please try again.' });
    }
});

module.exports = router;