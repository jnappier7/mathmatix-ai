// routes/masteryChat.js
// ⚠️  DEPRECATED — Mastery mode is now handled by /api/chat with { mastery: true }.
// The frontend (mastery-chat.html) now calls /api/chat directly, and the pipeline's
// decide stage + persist stage handle phase transitions, answer verification,
// badge tracking, and skill unlocking.
//
// This file is kept temporarily for backwards compatibility while any cached
// clients update. It will be removed in a future release.
//
// Dedicated endpoint for mastery mode chat sessions (LEGACY)

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { promptInjectionFilter } = require('../middleware/promptInjection');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM, callLLMStream } = require("../utils/llmGateway");
const TUTOR_CONFIG = require('../utils/tutorConfig');
const { selectWarmupSkill } = require('../utils/prerequisiteMapper');
const {
  initializeLessonPhase,
  getPhasePrompt,
  evaluatePhaseTransition,
  transitionPhase,
  PHASES
} = require('../utils/lessonPhaseManager');
const { verify: pipelineVerify, observe: pipelineObserve, diagnose: pipelineDiagnose } = require('../utils/pipeline');
const { assemblePrompt } = require('../utils/pipeline/generate');
const { decide } = require('../utils/pipeline/decide');
const { computeSessionMood, buildMoodDirective } = require('../utils/pipeline/sessionMood');
const { emitGamificationEvent } = require('../utils/gamificationEvents');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective teaching model (GPT-4o-mini)
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

// ============================================================================
// HELPER FUNCTIONS - Answer Tracking & Mastery Completion
// ============================================================================

/**
 * Parse AI response for answer result markers and update progress counters
 * Looks for: <ANSWER_RESULT correct="true|false" problem="N"/>
 */
async function trackAnswerResults(aiResponse, user, phaseState) {
    const currentPhase = phaseState.currentPhase;

    // Only track in YOU_DO and MASTERY_CHECK phases
    if (currentPhase !== PHASES.YOU_DO && currentPhase !== PHASES.MASTERY_CHECK) {
        return;
    }

    // Parse answer result markers
    const markerRegex = /<ANSWER_RESULT\s+correct="(true|false)"\s+problem="(\d+)"\s*\/>/gi;
    const matches = [...aiResponse.matchAll(markerRegex)];

    if (matches.length === 0) {
        return; // No answers to track
    }

    const activeBadge = user.masteryProgress.activeBadge;

    for (const match of matches) {
        const correct = match[1] === 'true';
        const problemNum = parseInt(match[2]);

        // Increment counters
        activeBadge.problemsCompleted = (activeBadge.problemsCompleted || 0) + 1;
        if (correct) {
            activeBadge.problemsCorrect = (activeBadge.problemsCorrect || 0) + 1;
        }

        console.log(`[Answer Tracked] Problem ${problemNum}: ${correct ? 'Correct' : 'Incorrect'}`);
        console.log(`   Progress: ${activeBadge.problemsCompleted}/${activeBadge.requiredProblems} (${activeBadge.problemsCorrect} correct)`);
    }

    user.markModified('masteryProgress');
}

/**
 * Remove answer tracking markers from AI response before showing to student
 * Removes: <ANSWER_RESULT correct="true|false" problem="N"/>
 */
function cleanResponseMarkers(aiResponse) {
    return aiResponse.replace(/<ANSWER_RESULT\s+correct="(true|false)"\s+problem="(\d+)"\s*\/>/gi, '').trim();
}

/**
 * Check if mastery has been achieved and unlock skill if successful
 * Returns: { completed: boolean, success: boolean, skillUnlocked: boolean }
 */
async function checkMasteryCompletion(user, activeBadge) {
    const problemsCompleted = activeBadge.problemsCompleted || 0;
    const problemsCorrect = activeBadge.problemsCorrect || 0;
    const requiredProblems = activeBadge.requiredProblems || 6;
    const requiredAccuracy = activeBadge.requiredAccuracy || 0.80;

    // Not done yet
    if (problemsCompleted < requiredProblems) {
        return { completed: false, success: false, skillUnlocked: false };
    }

    // Calculate accuracy
    const accuracy = problemsCorrect / problemsCompleted;
    const success = accuracy >= requiredAccuracy;

    console.log(`[Mastery Check] Completed: ${problemsCompleted}/${requiredProblems}`);
    console.log(`   Accuracy: ${Math.round(accuracy * 100)}% (required: ${Math.round(requiredAccuracy * 100)}%)`);
    console.log(`   Result: ${success ? 'PASSED ✓' : 'FAILED ✗'}`);

    if (success) {
        // Unlock skill on skill map
        const skillId = activeBadge.skillId;

        if (!user.skillMastery) {
            user.skillMastery = new Map();
        }

        user.skillMastery.set(skillId, {
            status: 'mastered',
            masteredDate: new Date(),
            accuracy: accuracy,
            attempts: problemsCompleted
        });

        user.markModified('skillMastery');
        await user.save();

        console.log(`[Skill Unlocked] ${skillId} → ⭐ Mastered!`);

        return { completed: true, success: true, skillUnlocked: true };
    }

    return { completed: true, success: false, skillUnlocked: false };
}

/**
 * POST /api/mastery/chat
 * Handle chat messages in mastery mode (badge earning sessions)
 */
router.post("/", isAuthenticated, promptInjectionFilter, async (req, res) => {
   const { message, responseTime } = req.body;
const userId = req.user?._id;

if (!userId) return res.status(401).json({ message: "Not authenticated." });
if (!message) return res.status(400).json({ message: "Message is required." });


    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long.` });
    }

    // Log response time if provided (from ghost timer)
    if (responseTime) {
        console.log(`[Mastery Fluency] User ${userId} responded in ${responseTime.toFixed(1)}s`);
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Check if user has active badge
        if (!user.masteryProgress || !user.masteryProgress.activeBadge) {
            return res.status(400).json({
                message: "No active badge. Please select a badge from the badge map first.",
                redirectTo: '/badge-map.html'
            });
        }

        // Get or create mastery conversation
        let masteryConversation;
        if (user.activeMasteryConversationId) {
            masteryConversation = await Conversation.findById(user.activeMasteryConversationId);
        }

        // Create new mastery conversation if needed
        if (!masteryConversation || !masteryConversation.isActive || !masteryConversation.isMastery) {
            masteryConversation = new Conversation({
                userId: user._id,
                messages: [],
                isMastery: true,
                masteryBadgeId: user.masteryProgress.activeBadge.badgeId,
                masterySkillId: user.masteryProgress.activeBadge.skillId,
                conversationName: `${user.masteryProgress.activeBadge.badgeName} - ${user.masteryProgress.activeBadge.tier}`
            });
            user.activeMasteryConversationId = masteryConversation._id;
            await user.save();
        }

        // ========== LESSON PHASE MANAGEMENT (Gradual Release) ==========
        // Initialize lesson phase state on first message
        const isFirstMessage = masteryConversation.messages.length === 0;
        const activeBadge = user.masteryProgress.activeBadge;

        if (isFirstMessage) {
            // Select intelligent warmup based on prerequisites
            const warmupData = selectWarmupSkill(
                activeBadge.skillId,
                user.toObject()
            );

            // Initialize structured lesson phases (WARMUP → I DO → WE DO → CHECK-IN → YOU DO → MASTERY)
            const phaseState = initializeLessonPhase(activeBadge.skillId, warmupData);

            // Store phase state in activeBadge for persistence
            activeBadge.phaseState = phaseState;

            console.log(`📚 [Lesson] Starting structured lesson: ${activeBadge.badgeName || activeBadge.skillId}`);
            console.log(`   Warmup: ${warmupData.skillName}`);
            console.log(`   Phase: ${phaseState.currentPhase}`);
        }

        // Get current phase state (or default to intro if missing)
        const phaseState = activeBadge.phaseState || {
            currentPhase: PHASES.INTRO,
            skillId: activeBadge.skillId,
            studentChoice: null
        };

        // Add user message to conversation
        masteryConversation.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date(),
            responseTime: responseTime || null
        });

        // ========== DETECT STUDENT CHOICE (INTRO Phase) ==========
        // If in INTRO phase, detect student's choice from their message
        if (phaseState.currentPhase === PHASES.INTRO) {
            const messageLower = message.toLowerCase();

            // Detect "test me" / "I'm ready" / "skip" / "2"
            const wantsTest =
                messageLower.includes('test') ||
                messageLower.includes('ready') ||
                messageLower.includes('skip') ||
                messageLower.includes('know this') ||
                messageLower.includes('prove') ||
                messageLower.match(/\b2\b/);

            // Detect "teach me" / "step by step" / "help" / "1"
            const wantsLesson =
                messageLower.includes('teach') ||
                messageLower.includes('step') ||
                messageLower.includes('help') ||
                messageLower.includes('show') ||
                messageLower.includes('guide') ||
                messageLower.match(/\b1\b/);

            // Set student choice
            if (wantsTest && !wantsLesson) {
                phaseState.studentChoice = 'test';
                console.log('[INTRO] Student chose: Direct mastery test');
            } else {
                // Default to lesson (safer choice)
                phaseState.studentChoice = 'lesson';
                console.log('[INTRO] Student chose: Structured lesson');
            }

            // Evaluate and execute phase transition
            const transition = evaluatePhaseTransition(phaseState);
            if (transition.shouldTransition) {
                transitionPhase(phaseState, transition.nextPhase, transition.rationale);
                console.log(`[Phase Transition] ${PHASES.INTRO} → ${transition.nextPhase}`);
            }
        }

        // Get tutor config - Mr. Nappier is the default for mastery mode
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId
            : "mr-nappier";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey] || TUTOR_CONFIG["mr-nappier"];

        // Build mastery context from active badge
        const masteryContext = {
            mode: 'badge-earning',
            badgeName: activeBadge.badgeName,
            skillId: activeBadge.skillId,
            tier: activeBadge.tier,
            problemsCompleted: activeBadge.problemsCompleted || 0,
            problemsCorrect: activeBadge.problemsCorrect || 0,
            requiredProblems: activeBadge.requiredProblems,
            requiredAccuracy: activeBadge.requiredAccuracy,
            currentPhase: phaseState.currentPhase  // Add current phase to context
        };

        // Generate system prompt (mastery mode - no curriculum, no uploads)
        const systemPrompt = generateSystemPrompt(
            user.toObject(),
            currentTutor.name,
            null,           // childProfile
            'student',      // currentRole
            null,           // curriculumContext - EXCLUDED in mastery mode
            null,           // uploadContext - EXCLUDED in mastery mode
            masteryContext, // masteryContext - THIS IS THE FOCUS
            [],             // likedMessages
            null            // fluencyContext
        );

        // Add phase-specific instructional guidance (WARMUP → I DO → WE DO → YOU DO → MASTERY)
        const phasePrompt = getPhasePrompt(
            phaseState,
            activeBadge.badgeName || activeBadge.skillId
        );

        // Combine base system prompt with phase-specific instructions
        let fullSystemPrompt = systemPrompt + '\n\n' + phasePrompt;

        // Prepare conversation history for AI
        const recentHistory = masteryConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        const conversationForAI = recentHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        // ── ANSWER VERIFICATION (diagnose stage) ──
        // Run the pipeline's observe + diagnose stages to verify student answers
        // BEFORE the LLM generates a response. This prevents the AI from
        // affirming wrong answers or rejecting correct ones.
        let masteryDiagnosis = null;
        try {
            const recentAssistantMsgs = masteryConversation.messages
                .filter(msg => msg.role === 'assistant')
                .slice(-6)
                .map(msg => ({ content: msg.content }));
            const recentUserMsgs = masteryConversation.messages
                .filter(msg => msg.role === 'user')
                .slice(-6)
                .map(msg => ({ content: msg.content }));

            const observation = pipelineObserve(message, {
                recentUserMessages: recentUserMsgs,
                recentAssistantMessages: recentAssistantMsgs,
                hasRecentUpload: false,
            });

            masteryDiagnosis = await pipelineDiagnose(observation, {
                recentAssistantMessages: recentAssistantMsgs,
                recentUserMessages: recentUserMsgs,
                activeSkill: {
                    skillId: activeBadge.skillId,
                    displayName: activeBadge.badgeName || activeBadge.skillId,
                    teachingGuidance: null,
                },
                user,
            });

            // Inject verification directive into system prompt (authoritative fact)
            const verificationDirective = buildVerificationDirective(masteryDiagnosis);
            if (verificationDirective) {
                fullSystemPrompt += '\n\n' + verificationDirective;
                console.log(`[MasteryChat] Diagnosis: ${masteryDiagnosis.type} (answer: ${masteryDiagnosis.answer}, correct: ${masteryDiagnosis.correctAnswer})`);
            }
        } catch (diagnoseErr) {
            console.error('[MasteryChat] Diagnose stage failed (non-fatal):', diagnoseErr.message);
            // Non-fatal — mastery chat continues without verification
        }

        // Add system prompt to messages array (OpenAI format)
        const messagesForAI = [
            { role: 'system', content: fullSystemPrompt },
            ...conversationForAI
        ];

        // Check for streaming support
        const isStreaming = req.query.stream === 'true';

        // Track AI processing time (server-side, for fair billing — only counts AI generation)
        const aiStartTime = Date.now();

        if (isStreaming) {
            // Set up SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Prevent proxy/ISP buffering (Nginx, Spectrum, etc.)
            res.flushHeaders();

            let fullResponse = '';

            try {
                const stream = await callLLMStream(
                    PRIMARY_CHAT_MODEL,
                    messagesForAI,
                    { temperature: 0.7, max_tokens: 500 }
                );

                // Stream chunks to client as they arrive
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || '';
                    if (content) {
                        fullResponse += content;
                        res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                    }
                }

                // Save AI response to conversation
                masteryConversation.messages.push({
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: new Date()
                });

                masteryConversation.lastActivity = new Date();

                // CRITICAL FIX: Clean invalid messages before save
                if (masteryConversation.messages && Array.isArray(masteryConversation.messages)) {
                    const originalLength = masteryConversation.messages.length;
                    masteryConversation.messages = masteryConversation.messages.filter(msg => {
                        return msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
                    });
                    if (masteryConversation.messages.length !== originalLength) {
                        console.warn(`[MasteryChat] Removed ${originalLength - masteryConversation.messages.length} invalid messages`);
                    }
                }

                await masteryConversation.save();

                // ========== TRACK ANSWER RESULTS (YOU_DO / MASTERY_CHECK) ==========
                // Must run BEFORE verify, which strips the ANSWER_RESULT markers
                await trackAnswerResults(fullResponse, user, phaseState);

                // Run pipeline verify (anti-cheat + reading level + LaTeX + tag stripping)
                // Pass diagnosis context so false-confirmation/rejection guards work
                const verifyAction = masteryDiagnosis?.isCorrect === true ? 'CONFIRM_CORRECT'
                    : masteryDiagnosis?.isCorrect === false ? 'GUIDE_INCORRECT'
                    : null;
                let cleanedResponse;
                try {
                    const verified = await pipelineVerify(fullResponse, {
                        userId: userId?.toString(),
                        userMessage: message,
                        iepReadingLevel: user.iepPlan?.readingLevel || null,
                        firstName: user.firstName,
                        isStreaming: true,
                        res,
                        action: verifyAction,
                        correctAnswer: masteryDiagnosis?.correctAnswer || null,
                        diagnosisType: masteryDiagnosis?.type || null,
                    });
                    cleanedResponse = verified.text;
                    if (verified.flags.length > 0) {
                        console.log(`[MasteryChat] Verify: ${verified.flags.join(', ')}`);
                    }
                } catch (verifyErr) {
                    console.error('[MasteryChat] Verify failed:', verifyErr.message);
                    cleanedResponse = cleanResponseMarkers(fullResponse);
                }

                // Update saved message with cleaned version
                masteryConversation.messages[masteryConversation.messages.length - 1].content = cleanedResponse;

                // ========== GAMIFICATION EVENTS (quests, challenges) ==========
                // Detect if a problem was answered in this response
                const answerMarkers = [...fullResponse.matchAll(/<ANSWER_RESULT\s+correct="(true|false)"/gi)];
                if (answerMarkers.length > 0) {
                    for (const marker of answerMarkers) {
                        const correct = marker[1] === 'true';
                        emitGamificationEvent(user, 'problemSolved', {
                            correct,
                            skillId: activeBadge.skillId,
                        });
                    }
                }

                // Save updated phase state
                user.masteryProgress.activeBadge.phaseState = phaseState;
                user.markModified('masteryProgress');
                await user.save();

                // Track AI processing time server-side (only counts AI generation, not reading/thinking/idle)
                const aiProcessingSecondsStream = Math.ceil((Date.now() - aiStartTime) / 1000);
                User.findByIdAndUpdate(userId, {
                    $inc: { weeklyAISeconds: aiProcessingSecondsStream, totalAISeconds: aiProcessingSecondsStream }
                }).catch(err => console.error('[MasteryChat] AI time tracking error:', err));

                // Check for mastery completion
                const masteryResult = await checkMasteryCompletion(user, activeBadge);

                // Auto-award badge and include celebration data when mastery is achieved
                let badgeAwarded = null;
                if (masteryResult.completed && masteryResult.success) {
                    const alreadyEarned = (user.badges || []).find(b => b.badgeId === activeBadge.badgeId);
                    if (!alreadyEarned) {
                        if (!user.badges) user.badges = [];
                        const accuracy = (activeBadge.problemsCorrect || 0) / (activeBadge.problemsCompleted || 1);
                        user.badges.push({
                            badgeId: activeBadge.badgeId,
                            earnedDate: new Date(),
                            score: Math.round(accuracy * 100),
                        });
                        user.xp = (user.xp || 0) + 500;
                        user.markModified('badges');
                        await user.save();

                        badgeAwarded = {
                            badgeId: activeBadge.badgeId,
                            badgeName: activeBadge.badgeName,
                            tier: activeBadge.tier,
                            xpBonus: 500,
                            totalBadges: user.badges.length,
                        };

                        // Emit skill mastered event for weekly challenges
                        emitGamificationEvent(user, 'skillMastered', { skillId: activeBadge.skillId });
                        await user.save();
                    }
                }

                // Send completion event with celebration data
                res.write(`data: ${JSON.stringify({
                    done: true,
                    fullText: cleanedResponse,
                    voiceId: currentTutor.voiceId,
                    currentPhase: phaseState.currentPhase,
                    masteryCompleted: masteryResult.completed,
                    masterySuccess: masteryResult.success,
                    badgeAwarded,
                })}\n\n`);
                res.end();
            } catch (error) {
                console.error("[Mastery Chat Stream Error]:", error);
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            }
        } else {
            // Non-streaming response
            const aiResponse = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI);

            // Track AI processing time server-side (only counts AI generation, not reading/thinking/idle)
            const aiProcessingSeconds = Math.ceil((Date.now() - aiStartTime) / 1000);
            User.findByIdAndUpdate(userId, {
                $inc: { weeklyAISeconds: aiProcessingSeconds, totalAISeconds: aiProcessingSeconds }
            }).catch(err => console.error('[MasteryChat] AI time tracking error:', err));

            // Save AI response
            masteryConversation.messages.push({
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            });

            masteryConversation.lastActivity = new Date();

            // CRITICAL FIX: Clean invalid messages before save
            if (masteryConversation.messages && Array.isArray(masteryConversation.messages)) {
                const originalLength = masteryConversation.messages.length;
                masteryConversation.messages = masteryConversation.messages.filter(msg => {
                    return msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
                });
                if (masteryConversation.messages.length !== originalLength) {
                    console.warn(`[MasteryChat] Removed ${originalLength - masteryConversation.messages.length} invalid messages`);
                }
            }

            await masteryConversation.save();

            // ========== TRACK ANSWER RESULTS (YOU_DO / MASTERY_CHECK) ==========
            // Must run BEFORE verify, which strips the ANSWER_RESULT markers
            await trackAnswerResults(aiResponse, user, phaseState);

            // Run pipeline verify (anti-cheat + reading level + LaTeX + tag stripping)
            // Pass diagnosis context so false-confirmation/rejection guards work
            const verifyActionNonStream = masteryDiagnosis?.isCorrect === true ? 'CONFIRM_CORRECT'
                : masteryDiagnosis?.isCorrect === false ? 'GUIDE_INCORRECT'
                : null;
            let cleanedResponse;
            try {
                const verified = await pipelineVerify(aiResponse, {
                    userId: userId?.toString(),
                    userMessage: message,
                    iepReadingLevel: user.iepPlan?.readingLevel || null,
                    firstName: user.firstName,
                    isStreaming: false,
                    action: verifyActionNonStream,
                    correctAnswer: masteryDiagnosis?.correctAnswer || null,
                    diagnosisType: masteryDiagnosis?.type || null,
                });
                cleanedResponse = verified.text;
                if (verified.flags.length > 0) {
                    console.log(`[MasteryChat] Verify: ${verified.flags.join(', ')}`);
                }
            } catch (verifyErr) {
                console.error('[MasteryChat] Verify failed:', verifyErr.message);
                cleanedResponse = cleanResponseMarkers(aiResponse);
            }

            // Update saved message with cleaned version
            masteryConversation.messages[masteryConversation.messages.length - 1].content = cleanedResponse;

            // ========== GAMIFICATION EVENTS (quests, challenges) ==========
            const answerMarkersNonStream = [...aiResponse.matchAll(/<ANSWER_RESULT\s+correct="(true|false)"/gi)];
            if (answerMarkersNonStream.length > 0) {
                for (const marker of answerMarkersNonStream) {
                    const correct = marker[1] === 'true';
                    emitGamificationEvent(user, 'problemSolved', {
                        correct,
                        skillId: activeBadge.skillId,
                    });
                }
            }

            // Save updated phase state
            user.masteryProgress.activeBadge.phaseState = phaseState;
            user.markModified('masteryProgress');
            await user.save();

            // Check for mastery completion
            const masteryResult = await checkMasteryCompletion(user, activeBadge);

            // Auto-award badge on completion
            let badgeAwarded = null;
            if (masteryResult.completed && masteryResult.success) {
                const alreadyEarned = (user.badges || []).find(b => b.badgeId === activeBadge.badgeId);
                if (!alreadyEarned) {
                    if (!user.badges) user.badges = [];
                    const accuracy = (activeBadge.problemsCorrect || 0) / (activeBadge.problemsCompleted || 1);
                    user.badges.push({
                        badgeId: activeBadge.badgeId,
                        earnedDate: new Date(),
                        score: Math.round(accuracy * 100),
                    });
                    user.xp = (user.xp || 0) + 500;
                    user.markModified('badges');

                    badgeAwarded = {
                        badgeId: activeBadge.badgeId,
                        badgeName: activeBadge.badgeName,
                        tier: activeBadge.tier,
                        xpBonus: 500,
                        totalBadges: user.badges.length,
                    };

                    emitGamificationEvent(user, 'skillMastered', { skillId: activeBadge.skillId });
                    await user.save();
                }
            }

            res.json({
                text: cleanedResponse,
                voiceId: currentTutor.voiceId,
                currentPhase: phaseState.currentPhase,
                masteryCompleted: masteryResult.completed,
                masterySuccess: masteryResult.success,
                badgeAwarded,
                masteryProgress: {
                    badgeName: masteryContext.badgeName,
                    progress: `${activeBadge.problemsCompleted || 0}/${masteryContext.requiredProblems}`,
                    accuracy: (activeBadge.problemsCompleted || 0) > 0
                        ? Math.round((activeBadge.problemsCorrect / activeBadge.problemsCompleted) * 100)
                        : 0
                }
            });
        }

    } catch (error) {
        console.error("[Mastery Chat Error]:", error);
        res.status(500).json({ message: "Server error during mastery chat." });
    }
});

module.exports = router;
