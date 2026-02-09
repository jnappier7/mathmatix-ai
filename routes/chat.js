// Forcing a file update for Git

// routes/chat.js

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { promptInjectionFilter } = require('../middleware/promptInjection');
const { sendSafetyConcernAlert } = require('../utils/emailService');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Curriculum = require('../models/curriculum');
const StudentUpload = require('../models/studentUpload');
const Skill = require('../models/skill');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM, callLLMStream } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const axios = require('axios');
const { getTutorsToUnlock } = require('../utils/unlockTutors');
const { parseAIDrawingCommands } = require('../utils/aiDrawingTools');
const { parseVisualTeaching } = require('../utils/visualTeachingParser');
const { enforceVisualTeaching } = require('../utils/visualCommandEnforcer');
const { injectFewShotExamples } = require('../utils/visualCommandExamples');
const { detectAndFetchResource } = require('../utils/resourceDetector');
const GradingResult = require('../models/gradingResult');
const { updateFluencyTracking, evaluateResponseTime, calculateAdaptiveTimeLimit } = require('../utils/adaptiveFluency');
const { processAIResponse } = require('../utils/chatBoardParser');
const ScreenerSession = require('../models/screenerSession');
const { needsAssessment } = require('../services/chatService');

// Performance optimizations
const contextCache = require('../utils/contextCache');
const { buildSystemPrompt: buildCompressedPrompt, determineTier, calculateXpBoostFactor } = require('../utils/promptCompressor');
const { processMathMessage, verifyAnswer } = require('../utils/mathSolver');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective teaching model (GPT-4o-mini)
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

// Per-user request lock to prevent concurrent chat processing (race condition fix).
// If user A sends message 1 and message 2 before message 1 finishes saving,
// message 2 waits until message 1 completes to prevent data loss.
const userChatLocks = new Map();
function acquireUserLock(userId) {
    const key = userId.toString();
    if (!userChatLocks.has(key)) {
        userChatLocks.set(key, Promise.resolve());
    }
    let release;
    const newLock = new Promise(resolve => { release = resolve; });
    const previousLock = userChatLocks.get(key);
    userChatLocks.set(key, newLock);
    return previousLock.then(() => release);
}
// Cleanup stale locks periodically (prevent memory leak for inactive users)
setInterval(() => {
    // Map only holds resolved promises for inactive users — safe to clear
    if (userChatLocks.size > 1000) userChatLocks.clear();
}, 10 * 60 * 1000);

/**
 * Extract a student's answer from their chat message.
 * Returns the answer value as a string, or null if the message doesn't look like an answer.
 * Handles: "7", "-3", "x = 7", "3/4", "the answer is 7", "I got 3.5", etc.
 */
function extractStudentAnswer(message) {
    const text = message.trim();

    // Skip long messages - answers are short
    if (text.length > 100) return null;

    // Pattern: "x = 7" or "y = -3.5" (variable assignment)
    const varAssignment = text.match(/^[a-z]\s*=\s*(-?\d+\.?\d*(?:\/\d+)?)/i);
    if (varAssignment) return varAssignment[1];

    // Pattern: just a number "-7", "3.5", "42"
    const justNumber = text.match(/^(-?\d+\.?\d*)$/);
    if (justNumber) return justNumber[1];

    // Pattern: a fraction "3/4" or "-1/2"
    const fraction = text.match(/^(-?\d+\s*\/\s*\d+)$/);
    if (fraction) return fraction[1].replace(/\s/g, '');

    // Pattern: number embedded in short answer phrase
    // "the answer is 7", "I got 3.5", "it's -2", "equals 7", "i think 5", "its 12"
    const answerPhrase = text.match(/(?:answer\s+is|i\s+got|it'?s|equals?|i\s+think)\s*(-?\d+\.?\d*(?:\s*\/\s*\d+)?)/i);
    if (answerPhrase) return answerPhrase[1].replace(/\s/g, '');

    return null;
}

/**
 * Update daily quests and weekly challenges when a problem is answered
 * This runs in the background and doesn't block the chat response
 * @param {ObjectId} userId - The user's ID
 * @param {boolean} wasCorrect - Whether the problem was answered correctly
 * @param {string} topic - The current topic/skill being practiced
 */
async function updateQuestProgress(userId, wasCorrect, topic) {
    try {
        const user = await User.findById(userId);
        if (!user) return;

        // Helper to calculate streak
        function calculateStreak(user) {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const lastPractice = user.dailyQuests?.lastPracticeDate
                ? new Date(user.dailyQuests.lastPracticeDate) : null;
            if (!lastPractice) return 1;
            lastPractice.setHours(0, 0, 0, 0);
            const daysDiff = Math.floor((now - lastPractice) / (1000 * 60 * 60 * 24));
            if (daysDiff === 0) return user.dailyQuests?.currentStreak || 1;
            if (daysDiff === 1) return (user.dailyQuests?.currentStreak || 0) + 1;
            return 1; // Streak broken
        }

        // Helper to check if current week
        function isCurrentWeek(date) {
            if (!date) return false;
            const d = new Date();
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            d.setDate(diff);
            d.setHours(0, 0, 0, 0);
            return new Date(date) >= d;
        }

        let questsCompleted = [];
        let challengesCompleted = [];

        // ============= DAILY QUESTS =============
        if (user.dailyQuests && user.dailyQuests.quests && user.dailyQuests.quests.length > 0) {
            // Update streak
            const newStreak = calculateStreak(user);
            user.dailyQuests.currentStreak = newStreak;
            user.dailyQuests.lastPracticeDate = new Date();
            if (newStreak > (user.dailyQuests.longestStreak || 0)) {
                user.dailyQuests.longestStreak = newStreak;
            }

            if (!user.dailyQuests.todayProgress) {
                user.dailyQuests.todayProgress = {};
            }

            user.dailyQuests.quests.forEach(quest => {
                if (quest.completed) return;

                let progressIncrease = 0;

                switch (quest.target) {
                    case 'problemsCorrect':
                        if (wasCorrect) progressIncrease = 1;
                        break;
                    case 'dailyPractice':
                        progressIncrease = 1; // Auto-complete streak keeper
                        break;
                    case 'consecutiveCorrect':
                        if (!user.dailyQuests.todayProgress.consecutiveCorrect) {
                            user.dailyQuests.todayProgress.consecutiveCorrect = 0;
                        }
                        if (wasCorrect) {
                            user.dailyQuests.todayProgress.consecutiveCorrect++;
                            quest.progress = Math.max(quest.progress || 0,
                                user.dailyQuests.todayProgress.consecutiveCorrect);
                        } else {
                            user.dailyQuests.todayProgress.consecutiveCorrect = 0;
                        }
                        break;
                    case 'skillsPracticed':
                        if (topic) {
                            if (!user.dailyQuests.todayProgress.skillsPracticed) {
                                user.dailyQuests.todayProgress.skillsPracticed = [];
                            }
                            if (!user.dailyQuests.todayProgress.skillsPracticed.includes(topic)) {
                                user.dailyQuests.todayProgress.skillsPracticed.push(topic);
                            }
                            quest.progress = user.dailyQuests.todayProgress.skillsPracticed.length;
                        }
                        break;
                }

                if (progressIncrease > 0 && quest.target !== 'consecutiveCorrect' && quest.target !== 'skillsPracticed') {
                    quest.progress = Math.min((quest.progress || 0) + progressIncrease, quest.targetCount);
                }

                // Check if quest completed
                if (quest.progress >= quest.targetCount && !quest.completed) {
                    quest.completed = true;
                    quest.completedAt = new Date();
                    user.dailyQuests.totalQuestsCompleted = (user.dailyQuests.totalQuestsCompleted || 0) + 1;
                    user.xp = (user.xp || 0) + quest.xpReward;
                    questsCompleted.push(quest.name);
                }
            });

            user.markModified('dailyQuests');
        }

        // ============= WEEKLY CHALLENGES =============
        if (user.weeklyChallenges && user.weeklyChallenges.challenges &&
            isCurrentWeek(user.weeklyChallenges.weekStartDate)) {

            if (!user.weeklyChallenges.weeklyProgress) {
                user.weeklyChallenges.weeklyProgress = {};
            }

            user.weeklyChallenges.challenges.forEach(challenge => {
                if (challenge.completed) return;

                let progressIncrease = 0;

                switch (challenge.targetType) {
                    case 'problemsSolved':
                        if (wasCorrect) progressIncrease = 1;
                        break;
                    case 'weeklyAccuracy':
                        if (!user.weeklyChallenges.weeklyProgress.totalProblems) {
                            user.weeklyChallenges.weeklyProgress.totalProblems = 0;
                            user.weeklyChallenges.weeklyProgress.correctProblems = 0;
                        }
                        user.weeklyChallenges.weeklyProgress.totalProblems++;
                        if (wasCorrect) {
                            user.weeklyChallenges.weeklyProgress.correctProblems++;
                        }
                        const accuracy = Math.round(
                            (user.weeklyChallenges.weeklyProgress.correctProblems /
                                user.weeklyChallenges.weeklyProgress.totalProblems) * 100
                        );
                        if (accuracy >= challenge.targetCount) {
                            challenge.progress = challenge.targetCount;
                        }
                        break;
                    case 'domainsPracticed':
                        if (topic) {
                            if (!user.weeklyChallenges.weeklyProgress.domainsPracticed) {
                                user.weeklyChallenges.weeklyProgress.domainsPracticed = [];
                            }
                            if (!user.weeklyChallenges.weeklyProgress.domainsPracticed.includes(topic)) {
                                user.weeklyChallenges.weeklyProgress.domainsPracticed.push(topic);
                            }
                            challenge.progress = user.weeklyChallenges.weeklyProgress.domainsPracticed.length;
                        }
                        break;
                }

                if (progressIncrease > 0 && challenge.targetType !== 'weeklyAccuracy' &&
                    challenge.targetType !== 'domainsPracticed') {
                    challenge.progress = Math.min((challenge.progress || 0) + progressIncrease, challenge.targetCount);
                }

                // Check if challenge completed
                if (challenge.progress >= challenge.targetCount && !challenge.completed) {
                    challenge.completed = true;
                    challenge.completedAt = new Date();
                    user.weeklyChallenges.completedChallengesAllTime =
                        (user.weeklyChallenges.completedChallengesAllTime || 0) + 1;
                    user.xp = (user.xp || 0) + challenge.xpReward;
                    challengesCompleted.push(challenge.name);
                }
            });

            user.markModified('weeklyChallenges');
        }

        await user.save();

        if (questsCompleted.length > 0 || challengesCompleted.length > 0) {
            console.log(`[Quest] User ${user.firstName} completed: Daily=[${questsCompleted.join(', ')}], Weekly=[${challengesCompleted.join(', ')}]`);
        }
    } catch (error) {
        console.error('[Quest] Error updating progress:', error.message);
    }
}

/**
 * Detect problem context type from student message for transfer pillar tracking.
 * Returns a context category or null if undetectable.
 */
function detectProblemContext(message) {
    if (!message || typeof message !== 'string') return null;
    const lower = message.toLowerCase();
    if (/\b(word problem|story|scenario|real.?world|application)\b/.test(lower)) return 'word-problem';
    if (/\b(graph|plot|chart|coordinate|axis|slope)\b/.test(lower)) return 'graphical';
    if (/\b(draw|picture|diagram|model|visual)\b/.test(lower)) return 'visual';
    if (/\d+\s*[+\-*/÷×^=<>]\s*\d+/.test(message)) return 'numeric';
    if (/\b(explain|why|how|what does|prove|show that)\b/.test(lower)) return 'conceptual';
    return 'numeric'; // Default: most math interactions are numeric
}

router.post('/', isAuthenticated, promptInjectionFilter, async (req, res) => {
    const { message, role, childId, responseTime, isGreeting } = req.body;
    const userId = req.user?._id;

    // Allow empty message only for greeting requests
    if (!isGreeting && !message) return res.status(400).json({ message: "Message is required." });
    if (message && message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Message too long.` });

    // Log response time if provided (from ghost timer)
    if (responseTime) {
        console.log(`[Fluency] User ${userId} responded in ${responseTime.toFixed(1)}s`);
    }

    // Handle parent chat separately
    if (role === 'parent' && childId) {
        return handleParentChat(req, res, userId, childId, message);
    }

    // ========== GREETING MODE: AI initiates conversation ==========
    // When isGreeting is true, we build a context-rich "introduction" message
    // that the user doesn't see, but the AI responds to naturally
    if (isGreeting) {
        return handleGreetingRequest(req, res, userId);
    }

    // Acquire per-user lock to prevent concurrent message processing
    // This ensures messages are saved sequentially, preventing data loss
    const releaseLock = await acquireUserLock(userId);

    try { // Lock-guarded block — finally releases lock at end

    // SAFETY FILTER: Block inappropriate content
    const inappropriatePatterns = [
        /\b(sex|porn|penis|vagina|breast|dick|cock|pussy|fuck|shit|ass|damn|bitch)\b/i,
        /\b(drug|weed|cocaine|alcohol|beer|wine|drunk)\b/i,
        /\b(gun|weapon|kill|murder|suicide|bomb)\b/i
    ];

    const messageClean = message.toLowerCase();
    const containsInappropriate = inappropriatePatterns.some(pattern => pattern.test(messageClean));

    if (containsInappropriate) {
        console.warn(`⚠️ SAFETY FILTER TRIGGERED - User ${userId} - Message: ${message.substring(0, 50)}...`);
        return res.json({
            text: "I'm here to help you learn math in a safe, respectful way. That topic isn't appropriate for our tutoring session. Let's focus on math! What math topic would you like to work on?",
            userXp: 0,
            userLevel: 1,
            xpNeeded: 200,
            specialXpAwarded: "",
            voiceId: "default",
            newlyUnlockedTutors: [],
            drawingSequence: null,
            safetyFilter: true
        });
    }

    // PLACEMENT ASSESSMENT REQUEST DETECTION
    // Students cannot request placement assessments - only teachers/admins/parents can trigger them
    const placementKeywords = [
        /\b(placement|skills?)\s+(test|assessment|exam)\b/i,
        /\btake\s+(a|an|the)?\s*(placement|skills?|initial)?\s*(test|assessment)\b/i,
        /\bneed to take\b.*\b(placement)\s*(test|assessment)\b/i
    ];

    const isPlacementRequest = placementKeywords.some(pattern => pattern.test(messageClean));

    if (isPlacementRequest) {
        console.log(`📋 PLACEMENT REQUEST DETECTED (declined) - User ${userId} - Message: "${message.substring(0, 100)}..."`);
        const user = await User.findById(userId);

        if (user && user.assessmentCompleted) {
            // Already completed - can't retake
            return res.json({
                text: "You've already done your placement assessment! I'm using those results to give you the right level of problems. If your teacher or parent thinks you need a new assessment, they can request one for you. What would you like to work on?",
                userXp: 0,
                userLevel: user.level || 1,
                xpNeeded: (user.level || 1) * BRAND_CONFIG.xpPerLevel,
                specialXpAwarded: "",
                voiceId: TUTOR_CONFIG[user.selectedTutorId || "default"].voiceId,
                newlyUnlockedTutors: [],
                drawingSequence: null,
                triggerAssessment: false
            });
        }
        // First-time user asking about placement - let normal flow handle it (welcome will offer it)
    }

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        let activeConversation;
        if (user.activeConversationId) {
            activeConversation = await Conversation.findById(user.activeConversationId);
        }
        // Create new conversation if: no conversation, inactive, OR it's a mastery conversation
        // This prevents mastery messages from appearing in regular chat
        if (!activeConversation || !activeConversation.isActive || activeConversation.isMastery) {
            // IMPROVED: End the old session properly before creating a new one
            // This handles the case where student closed tab without logging out
            if (activeConversation && activeConversation.isActive && activeConversation.messages.length > 0) {
                try {
                    const { generateSessionSummary: generateAISummary, detectTopic } = require('../utils/activitySummarizer');

                    // Generate summary for the old session
                    activeConversation.currentTopic = activeConversation.currentTopic || detectTopic(activeConversation.messages);
                    const studentName = `${user.firstName} ${user.lastName}`;

                    try {
                        const aiSummary = await generateAISummary(activeConversation, studentName);
                        activeConversation.summary = aiSummary;
                    } catch (summaryError) {
                        // Fallback summary
                        activeConversation.summary = `${studentName} worked on ${activeConversation.currentTopic || 'mathematics'} for ${activeConversation.activeMinutes || 0} minutes.`;
                    }

                    activeConversation.isActive = false;
                    await activeConversation.save();
                    console.log(`📝 [Session] Auto-ended previous session ${activeConversation._id} for user ${user._id}`);
                } catch (endError) {
                    console.error('[Session] Error auto-ending previous session:', endError);
                    // Still mark as inactive even if summary fails
                    activeConversation.isActive = false;
                    activeConversation.summary = `Session ended - ${activeConversation.activeMinutes || 0} minutes`;
                    await activeConversation.save();
                }
            }

            activeConversation = new Conversation({ userId: user._id, messages: [], isMastery: false });
            user.activeConversationId = activeConversation._id;
            await user.save();
        }

        // CRITICAL FIX: Validate user message before saving
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ message: "Message content is required and cannot be empty." });
        }

        activeConversation.messages.push({
            role: 'user',
            content: message.trim(),
            timestamp: new Date(),
            responseTime: responseTime || null
        });

        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId] ? user.selectedTutorId : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];
        const studentProfileForPrompt = user.toObject();

        // PERFORMANCE OPTIMIZATION: Parallel fetch of all context data
        // These queries are independent and can run simultaneously
        const contextStartTime = Date.now();

        // Build parallel fetch promises
        const contextPromises = [];

        // 1. Curriculum context (with caching)
        if (user.teacherId) {
            contextPromises.push(
                contextCache.getOrFetch('curriculum', user.teacherId.toString(), async () => {
                    const curriculum = await Curriculum.getActiveCurriculum(user.teacherId);
                    if (curriculum && curriculum.autoSyncWithAI) {
                        return curriculum.getAIContext();
                    }
                    return null;
                }).catch(err => { console.error('Error fetching curriculum:', err.message); return null; })
            );
        } else {
            contextPromises.push(Promise.resolve(null));
        }

        // 2. Teacher AI settings (with caching)
        if (user.teacherId) {
            contextPromises.push(
                contextCache.getOrFetch('teacherSettings', user.teacherId.toString(), async () => {
                    const teacher = await User.findById(user.teacherId).select('classAISettings').lean();
                    return teacher?.classAISettings || null;
                }).catch(err => { console.error('Error fetching teacher settings:', err.message); return null; })
            );
        } else {
            contextPromises.push(Promise.resolve(null));
        }

        // 3. Resource detection
        if (user.teacherId) {
            contextPromises.push(
                detectAndFetchResource(user.teacherId, message)
                    .catch(err => { console.error('Error detecting resource:', err.message); return null; })
            );
        } else {
            contextPromises.push(Promise.resolve(null));
        }

        // 4. Recent uploads
        contextPromises.push(
            StudentUpload.find({ userId: user._id })
                .sort({ uploadedAt: -1 })
                .limit(5)
                .select('originalFilename extractedText uploadedAt fileType')
                .lean()
                .catch(err => { console.error('Error fetching uploads:', err.message); return []; })
        );

        // 5. Recent grading/analysis results (Show Your Work)
        contextPromises.push(
            GradingResult.find({ userId: user._id })
                .sort({ createdAt: -1 })
                .limit(3)
                .select('problemCount correctCount problems overallFeedback whatWentWell practiceRecommendations createdAt')
                .lean()
                .catch(err => { console.error('Error fetching grading results:', err.message); return []; })
        );

        // 6. Math verification (runs in parallel with everything else)
        const mathResult = processMathMessage(message);

        // Execute all fetches in parallel
        const [curriculumContext, teacherAISettings, resourceContext, recentUploads, recentGradingResults] = await Promise.all(contextPromises);

        // Log teacher settings if loaded
        if (teacherAISettings) {
            console.log(`🎛️ [AI Settings] Loaded teacher settings for ${user.firstName}: calculator=${teacherAISettings.calculatorAccess || 'default'}, scaffolding=${teacherAISettings.scaffoldingLevel || 3}/5`);
        }

        // Log resource if detected
        if (resourceContext) {
            console.log(`📚 Resource detected and fetched: ${resourceContext.displayName}`);
        }

        // Process uploads into context
        let uploadContext = null;
        if (recentUploads && recentUploads.length > 0) {
            const uploadsSummary = recentUploads.map((upload, idx) => {
                const daysAgo = Math.floor((Date.now() - new Date(upload.uploadedAt)) / (1000 * 60 * 60 * 24));
                const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
                const textExcerpt = upload.extractedText ?
                    upload.extractedText.substring(0, 200) + (upload.extractedText.length > 200 ? '...' : '') : '';
                return `${idx + 1}. "${upload.originalFilename}" (${upload.fileType}, uploaded ${timeStr})${textExcerpt ? `\n   Content excerpt: "${textExcerpt}"` : ''}`;
            }).join('\n');

            uploadContext = { count: recentUploads.length, summary: uploadsSummary };
            console.log(`📁 Injected ${recentUploads.length} recent uploads into AI context`);
        }

        // Log parallel fetch performance
        const contextFetchTime = Date.now() - contextStartTime;
        console.log(`⚡ [Performance] Parallel context fetch completed in ${contextFetchTime}ms`);

        // Log math detection result
        if (mathResult.hasMath) {
            console.log(`🧮 [Math Solver] Detected ${mathResult.problem.type} problem, answer: ${mathResult.solution?.answer || 'N/A'}`);
        }

        const recentMessagesForAI = activeConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        let formattedMessagesForLLM = recentMessagesForAI
            .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content && msg.content.trim().length > 0)
            .map(msg => ({ role: msg.role, content: msg.content }));

        // If a resource was detected, inject it into the conversation
        if (resourceContext) {
            const resourceMessage = `[SYSTEM: Student is referencing "${resourceContext.displayName}"${resourceContext.description ? ` - ${resourceContext.description}` : ''}. Content:\n\n${resourceContext.content}\n\nPlease help the student with their question about this resource.]`;

            // Replace the last user message with one that includes the resource context
            if (formattedMessagesForLLM.length > 0) {
                const lastMessage = formattedMessagesForLLM[formattedMessagesForLLM.length - 1];
                if (lastMessage.role === 'user') {
                    lastMessage.content = resourceMessage + '\n\nStudent question: ' + lastMessage.content;
                }
            }
        }

        // MATH VERIFICATION: Inject verified answer into context for LLM accuracy
        let mathVerificationContext = null;
        if (mathResult.hasMath && mathResult.solution?.success) {
            mathVerificationContext = {
                problemType: mathResult.problem.type,
                verifiedAnswer: mathResult.solution.answer,
                steps: mathResult.solution.steps || []
            };

            // Inject verification hint into the last user message
            if (formattedMessagesForLLM.length > 0) {
                const lastMessage = formattedMessagesForLLM[formattedMessagesForLLM.length - 1];
                if (lastMessage.role === 'user') {
                    // Add hidden verification context that the LLM can use
                    const verificationHint = `\n\n[MATH_VERIFICATION: The correct answer for this ${mathResult.problem.type} problem is ${mathResult.solution.answer}. Use this to verify your response but do NOT give the answer directly - guide the student to discover it.]`;
                    lastMessage.content = lastMessage.content + verificationHint;
                }
            }

            console.log(`✅ [Math Verification] Injected verified answer: ${mathResult.solution.answer} (${mathResult.problem.type})`);
        }

        // ANSWER PRE-CHECK: When student submits a short answer, verify it against the last problem
        // This prevents the AI from saying "almost there" or "let's check" when the student is actually correct
        if (!mathVerificationContext) {
            const studentAnswer = extractStudentAnswer(message);
            if (studentAnswer !== null) {
                // Look back through recent AI messages to find the problem that was posed
                const recentAIMessages = formattedMessagesForLLM
                    .filter(msg => msg.role === 'assistant')
                    .slice(-3);

                for (let i = recentAIMessages.length - 1; i >= 0; i--) {
                    const problemResult = processMathMessage(recentAIMessages[i].content);
                    if (problemResult.hasMath && problemResult.solution?.success) {
                        const verification = verifyAnswer(studentAnswer, problemResult.solution.answer);
                        const isCorrect = verification.isCorrect;

                        // Inject definitive correctness signal into the student's message
                        const lastMessage = formattedMessagesForLLM[formattedMessagesForLLM.length - 1];
                        if (lastMessage.role === 'user') {
                            if (isCorrect) {
                                lastMessage.content += `\n\n[ANSWER_PRE_CHECK: VERIFIED CORRECT. The student's answer "${studentAnswer}" matches the correct answer "${problemResult.solution.answer}". Confirm they are correct immediately. Do NOT say "let's check", "almost", "not quite", or imply any doubt.]`;
                            } else {
                                lastMessage.content += `\n\n[ANSWER_PRE_CHECK: VERIFIED INCORRECT. The student answered "${studentAnswer}" but the correct answer is "${problemResult.solution.answer}". Guide them toward the correct answer using Socratic method.]`;
                            }
                        }

                        console.log(`🔍 [Answer Pre-Check] Student: "${studentAnswer}", Correct: "${problemResult.solution.answer}", Result: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
                        break;
                    }
                }
            }
        }

        // Pass mastery mode context if student has an active badge
        const masteryContext = user.masteryProgress?.activeBadge ? {
            mode: 'badge-earning',
            badgeName: user.masteryProgress.activeBadge.badgeName,
            skillId: user.masteryProgress.activeBadge.skillId,
            tier: user.masteryProgress.activeBadge.tier,
            problemsCompleted: user.masteryProgress.activeBadge.problemsCompleted || 0,
            problemsCorrect: user.masteryProgress.activeBadge.problemsCorrect || 0,
            requiredProblems: user.masteryProgress.activeBadge.requiredProblems,
            requiredAccuracy: user.masteryProgress.activeBadge.requiredAccuracy
        } : null;

        // Extract liked messages for rapport building
        const likedMessages = recentMessagesForAI
            .filter(msg => msg.role === 'assistant' && msg.reaction)
            .map(msg => ({ content: msg.content.substring(0, 150), reaction: msg.reaction }));

        // DIRECTIVE 2: Extract fluency profile for adaptive difficulty
        let fluencyContext = null;
        if (user.fluencyProfile) {
            const avgFluencyZScore = user.fluencyProfile.averageFluencyZScore || 0;
            const speedLevel = avgFluencyZScore < -1.0 ? 'fast'
                            : avgFluencyZScore > 1.0 ? 'slow'
                            : 'normal';

            // Check for IEP extended time accommodation
            const hasExtendedTime = user.iepPlan?.accommodations?.extendedTime || false;

            fluencyContext = {
                fluencyZScore: avgFluencyZScore,
                speedLevel,
                readSpeedModifier: user.learningProfile?.fluencyBaseline?.readSpeedModifier || 1.0,
                iepExtendedTime: hasExtendedTime
            };

            console.log(`📊 [Adaptive] Fluency context: z=${avgFluencyZScore.toFixed(2)}, speed=${speedLevel}${hasExtendedTime ? ', IEP Extended Time (1.5x)' : ''}`);
        }

        // Build conversation context if session has a specific topic/name
        let conversationContextForPrompt = null;
        if (activeConversation && (activeConversation.conversationName !== 'Math Session' || activeConversation.topic)) {
            conversationContextForPrompt = {
                conversationName: activeConversation.conversationName,
                topic: activeConversation.topic,
                topicEmoji: activeConversation.topicEmoji
            };
        }

        // Inject few-shot examples for new conversations to teach visual command usage
        formattedMessagesForLLM = injectFewShotExamples(formattedMessagesForLLM);

        // Build grading context (only include if there are recent results)
        const gradingContext = recentGradingResults && recentGradingResults.length > 0 ? recentGradingResults : null;

        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor, null, 'student', curriculumContext, uploadContext, masteryContext, likedMessages, fluencyContext, conversationContextForPrompt, teacherAISettings, gradingContext);
        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...formattedMessagesForLLM];

        // Check if client wants streaming (via query parameter)
        const useStreaming = req.query.stream === 'true';

        let aiResponseText = '';
        const aiStartTime = Date.now(); // Track AI processing time (server-side, for fair billing)

        // Track client disconnect for streaming mode (declared here for scope access)
        let clientDisconnected = false;

        if (useStreaming) {
            // STREAMING MODE: Use Server-Sent Events for real-time response
            console.log('📡 Streaming mode activated');

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            req.on('close', () => { clientDisconnected = true; });

            try {
                const stream = await callLLMStream(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });

                // Buffer to collect the complete response for database storage
                let fullResponseBuffer = '';

                // Stream chunks to client as they arrive
                // Handle both Claude and OpenAI streaming formats
                const isClaudeModel = PRIMARY_CHAT_MODEL.startsWith('claude-');

                for await (const chunk of stream) {
                    if (clientDisconnected) {
                        console.log('[Stream] Client disconnected mid-stream, stopping');
                        break;
                    }
                    let content = '';

                    if (isClaudeModel) {
                        // Claude streaming format: events with type 'content_block_delta'
                        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
                            content = chunk.delta.text;
                        }
                    } else {
                        // OpenAI streaming format: choices[0].delta.content
                        content = chunk.choices[0]?.delta?.content || '';
                    }

                    if (content) {
                        // Smart spacing for Claude tokens: Add space after punctuation if next chunk doesn't start with space
                        if (isClaudeModel && fullResponseBuffer.length > 0) {
                            const lastChar = fullResponseBuffer[fullResponseBuffer.length - 1];
                            const firstChar = content[0];
                            const needsSpace = /[.!?:,;]/.test(lastChar) &&
                                             firstChar !== ' ' &&
                                             firstChar !== '\n' &&
                                             !/^[.!?:,;)]/.test(firstChar); // Don't add space before punctuation

                            if (needsSpace) {
                                content = ' ' + content;
                            }
                        }

                        fullResponseBuffer += content;

                        // Send chunk to client via SSE
                        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
                    }
                }

                aiResponseText = fullResponseBuffer.trim() || "I'm not sure how to respond.";

                // Continue with post-processing...
                // (XP awards, drawing commands, etc. will be handled below and sent as final event)

            } catch (streamError) {
                console.error('ERROR: Streaming failed, falling back to non-streaming:', streamError.message);
                // Fallback to non-streaming if streaming fails
                const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });
                aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: aiResponseText })}\n\n`);
            }
        } else {
            // NON-STREAMING MODE: Original behavior
            const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { system: systemPrompt, temperature: 0.7, max_tokens: 1500 });
            aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
        }

        // Track AI processing time server-side (only counts AI generation, not reading/thinking/idle)
        const aiProcessingSeconds = Math.ceil((Date.now() - aiStartTime) / 1000);
        const previousWeeklyAI = user.weeklyAISeconds || 0;
        const updatedWeeklyAI = previousWeeklyAI + aiProcessingSeconds;

        // Always increment AI time counters
        const aiTimeUpdate = { $inc: { weeklyAISeconds: aiProcessingSeconds, totalAISeconds: aiProcessingSeconds } };

        // Deduct from pack balance only for seconds beyond the free weekly allowance (20 min)
        const FREE_WEEKLY = 20 * 60;
        if ((user.subscriptionTier === 'pack_60' || user.subscriptionTier === 'pack_120') && user.packSecondsRemaining > 0) {
            const prevPaid = Math.max(0, previousWeeklyAI - FREE_WEEKLY);
            const newPaid = Math.max(0, updatedWeeklyAI - FREE_WEEKLY);
            const packDeduction = newPaid - prevPaid;
            if (packDeduction > 0) {
                aiTimeUpdate.$inc.packSecondsRemaining = -packDeduction;
            }
        }

        User.findByIdAndUpdate(userId, aiTimeUpdate)
            .catch(err => console.error('[Chat] AI time tracking error:', err));

        // ENFORCE visual teaching: Auto-inject commands if AI forgot to use them
        aiResponseText = enforceVisualTeaching(message, aiResponseText);

        // Parse visual teaching commands (whiteboard, algebra tiles, images, manipulatives)
        const visualResult = parseVisualTeaching(aiResponseText);
        const visualCommands = visualResult.visualCommands;
        aiResponseText = visualResult.cleanedText;

        // Extract drawing sequence from visual commands for backward compatibility
        const dynamicDrawingSequence = visualCommands.whiteboard.length > 0 && visualCommands.whiteboard[0].sequence
            ? visualCommands.whiteboard[0].sequence
            : null;

        // BOARD-FIRST CHAT INTEGRATION: Parse board references
        const boardParsed = processAIResponse(aiResponseText);
        aiResponseText = boardParsed.text; // Cleaned text with [BOARD_REF:...] removed
        const boardContext = boardParsed.boardContext; // { targetObjectId, type, allReferences }

        // =====================================================
        // XP LADDER SYSTEM (Three Tiers)
        // Tier 1: Silent turn XP (engagement)
        // Tier 2: Performance XP (correct answers)
        // Tier 3: Core Behavior XP (learning identity)
        // =====================================================

        const xpLadder = BRAND_CONFIG.xpLadder;
        const xpBreakdown = {
            tier1: 0,       // Silent turn XP
            tier2: 0,       // Performance XP
            tier2Type: null, // 'correct' or 'clean'
            tier3: 0,       // Core behavior XP
            tier3Behavior: null, // The specific behavior being rewarded
            total: 0
        };

        // TIER 3: Core Behavior XP (AI explicitly awards for learning identity moments)
        // Format: <CORE_BEHAVIOR_XP:amount,behavior>
        // Example: <CORE_BEHAVIOR_XP:50,caught_own_error>
        const coreBehaviorMatch = aiResponseText.match(/<CORE_BEHAVIOR_XP:(\d+),([^>]+)>/);
        if (coreBehaviorMatch) {
            const rawAmount = parseInt(coreBehaviorMatch[1], 10);
            const behavior = coreBehaviorMatch[2].trim();

            // Calculate new user XP boost (fades over time based on level)
            const xpBoostInfo = calculateXpBoostFactor(user.level);
            const boostedAmount = Math.round(rawAmount * xpBoostInfo.factor);

            // Security: Cap at max tier 3 amount (cap is also boosted for new users)
            const maxAllowed = Math.round(xpLadder.maxTier3PerTurn * xpBoostInfo.factor);
            xpBreakdown.tier3 = Math.min(boostedAmount, maxAllowed);
            xpBreakdown.tier3Behavior = behavior;
            xpBreakdown.tier3Boosted = xpBoostInfo.factor > 1;
            aiResponseText = aiResponseText.replace(coreBehaviorMatch[0], '').trim();

            const boostLabel = xpBoostInfo.factor > 1 ? ` (${xpBoostInfo.factor}x new user boost!)` : '';
            console.log(`🎖️ [XP Tier 3] Core Behavior: +${xpBreakdown.tier3} XP for "${behavior}"${boostLabel}`);
        }

        // LEGACY: Support old <AWARD_XP> tag (treat as Tier 2 for backward compatibility)
        const legacyXpMatch = aiResponseText.match(/<AWARD_XP:(\d+),([^>]+)>/);
        if (legacyXpMatch && !coreBehaviorMatch) {
            const rawAmount = parseInt(legacyXpMatch[1], 10);
            // Treat legacy awards as Tier 2 (capped at tier 2 max)
            xpBreakdown.tier2 = Math.min(rawAmount, xpLadder.maxTier2PerTurn);
            xpBreakdown.tier2Type = 'legacy';
            aiResponseText = aiResponseText.replace(legacyXpMatch[0], '').trim();
        }

        // SAFETY LOGGING: Check if AI flagged safety concern
        const safetyConcernMatch = aiResponseText.match(/<SAFETY_CONCERN>([^<]+)<\/SAFETY_CONCERN>/);
        if (safetyConcernMatch) {
            const concernDescription = safetyConcernMatch[1];
            console.error(`🚨 SAFETY CONCERN - User ${userId} (${user.firstName} ${user.lastName}) - ${concernDescription}`);
            aiResponseText = aiResponseText.replace(safetyConcernMatch[0], '').trim();

            // Send urgent alert email to admin (fire and forget - don't block response)
            sendSafetyConcernAlert(
                {
                    userId: userId.toString(),
                    firstName: user.firstName,
                    lastName: user.lastName,
                    username: user.username,
                    gradeLevel: user.gradeLevel
                },
                concernDescription,
                message // The student's message for context
            ).catch(err => console.error('Failed to send safety alert email:', err));
        }

        // SKILL MASTERY TRACKING: Parse AI skill progression tags
        // AI sends <SKILL_MASTERED:skillId> as evidence — NOT an instant decree.
        // We record it as a correct demonstration and only promote to 'mastered'
        // when the 4-Pillar thresholds are genuinely met.
        const skillMasteredMatch = aiResponseText.match(/<SKILL_MASTERED:([^>]+)>/);
        if (skillMasteredMatch) {
            const skillId = skillMasteredMatch[1].trim();
            user.skillMastery = user.skillMastery || new Map();
            const existing = user.skillMastery.get(skillId) || {};

            // Initialize pillar data if missing
            const pillars = existing.pillars || {
                accuracy: { correct: 0, total: 0, percentage: 0, threshold: 0.90 },
                independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3, autoStepUsed: false },
                transfer: { contextsAttempted: [], contextsRequired: 3, formatVariety: false },
                retention: { retentionChecks: [], failed: false }
            };

            // Record this as a correct demonstration
            pillars.accuracy.correct = (pillars.accuracy.correct || 0) + 1;
            pillars.accuracy.total = (pillars.accuracy.total || 0) + 1;
            pillars.accuracy.percentage = pillars.accuracy.total > 0
                ? pillars.accuracy.correct / pillars.accuracy.total : 0;

            // Check if hint was used recently (independence pillar)
            const recentMsgs = activeConversation.messages.slice(-6);
            const usedHint = recentMsgs.some(msg =>
                msg.role === 'user' && /\b(hint|help|stuck|don't know|idk|confused)\b/i.test(msg.content)
            );
            if (usedHint) {
                pillars.independence.hintsUsed = (pillars.independence.hintsUsed || 0) + 1;
            }

            // Detect context type for transfer pillar
            const contextType = detectProblemContext(message);
            if (contextType && !pillars.transfer.contextsAttempted.includes(contextType)) {
                pillars.transfer.contextsAttempted.push(contextType);
            }

            // Calculate overall mastery score (0-100) from pillar progress
            const accuracyScore = Math.min(pillars.accuracy.percentage / 0.90, 1.0);
            const independenceScore = pillars.independence.hintsUsed <= pillars.independence.hintThreshold ? 1.0
                : Math.max(0, 1.0 - (pillars.independence.hintsUsed - pillars.independence.hintThreshold) * 0.15);
            const transferScore = Math.min(pillars.transfer.contextsAttempted.length / pillars.transfer.contextsRequired, 1.0);
            const masteryScore = Math.round(((accuracyScore + independenceScore + transferScore) / 3) * 100);

            // Determine status: only 'mastered' if all pillars meet thresholds
            const meetsAccuracy = pillars.accuracy.percentage >= 0.90 && pillars.accuracy.total >= 3;
            const meetsIndependence = pillars.independence.hintsUsed <= pillars.independence.hintThreshold;
            const meetsTransfer = pillars.transfer.contextsAttempted.length >= pillars.transfer.contextsRequired;
            const allPillarsMet = meetsAccuracy && meetsIndependence && meetsTransfer;

            let newStatus = existing.status || 'practicing';
            if (allPillarsMet) {
                newStatus = 'mastered';
            } else if (pillars.accuracy.total >= 2) {
                newStatus = 'practicing';
            } else {
                newStatus = 'learning';
            }

            user.skillMastery.set(skillId, {
                ...existing,
                status: newStatus,
                masteryScore: masteryScore,
                masteryType: 'verified',
                lastPracticed: new Date(),
                consecutiveCorrect: (existing.consecutiveCorrect || 0) + 1,
                totalAttempts: (existing.totalAttempts || 0) + 1,
                masteredDate: newStatus === 'mastered' ? (existing.masteredDate || new Date()) : existing.masteredDate,
                pillars: pillars,
                notes: `AI-verified demonstration (${pillars.accuracy.correct}/${pillars.accuracy.total} correct)`
            });

            // Only add to recent wins if genuinely mastered
            if (newStatus === 'mastered' && existing.status !== 'mastered') {
                if (!user.learningProfile.recentWins) {
                    user.learningProfile.recentWins = [];
                }
                const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                user.learningProfile.recentWins.unshift({
                    skill: skillId,
                    description: `Mastered ${displayName}`,
                    date: new Date()
                });
                user.learningProfile.recentWins = user.learningProfile.recentWins.slice(0, 10);
                user.markModified('learningProfile');
                console.log(`✓ Student ${user.firstName} MASTERED skill: ${skillId} (all pillars met)`);
            } else {
                console.log(`→ Student ${user.firstName} demonstrated skill: ${skillId} (${masteryScore}% mastery, status: ${newStatus})`);
            }

            user.markModified('skillMastery');
            aiResponseText = aiResponseText.replace(skillMasteredMatch[0], '').trim();
        }

        const skillStartedMatch = aiResponseText.match(/<SKILL_STARTED:([^>]+)>/);
        if (skillStartedMatch) {
            const skillId = skillStartedMatch[1].trim();
            user.skillMastery = user.skillMastery || new Map();
            user.skillMastery.set(skillId, {
                status: 'learning',
                masteryScore: 0.3,
                learningStarted: new Date(),
                notes: 'Currently learning with AI'
            });
            user.markModified('skillMastery');
            aiResponseText = aiResponseText.replace(skillStartedMatch[0], '').trim();

            console.log(`→ Student ${user.firstName} started learning: ${skillId}`);
        }

        const learningInsightMatch = aiResponseText.match(/<LEARNING_INSIGHT:([^>]+)>/);
        if (learningInsightMatch) {
            const insight = learningInsightMatch[1].trim();

            // Add to memorable conversations
            if (!user.learningProfile.memorableConversations) {
                user.learningProfile.memorableConversations = [];
            }
            user.learningProfile.memorableConversations.unshift({
                date: new Date(),
                summary: insight,
                context: 'Learning insight from AI'
            });
            // Keep only last 10
            user.learningProfile.memorableConversations = user.learningProfile.memorableConversations.slice(0, 10);

            user.markModified('learningProfile');
            aiResponseText = aiResponseText.replace(learningInsightMatch[0], '').trim();

            console.log(`💡 Learning insight for ${user.firstName}: ${insight}`);
        }

        // IEP GOAL PROGRESS TRACKING: Parse AI IEP goal progress tags
        // Format: <IEP_GOAL_PROGRESS:goal-description,+5> or <IEP_GOAL_PROGRESS:0,+5> (using index)
        const iepGoalProgressMatch = aiResponseText.match(/<IEP_GOAL_PROGRESS:([^,]+),([+-]\d+)>/);
        if (iepGoalProgressMatch && user.iepPlan && user.iepPlan.goals) {
            const goalIdentifier = iepGoalProgressMatch[1].trim();
            const progressChange = parseInt(iepGoalProgressMatch[2], 10);

            // Find the goal by description (partial match) or by index
            let targetGoal = null;
            let goalIndex = -1;

            // Try to find by index first (if it's a number)
            const goalIndexNum = parseInt(goalIdentifier, 10);
            if (!isNaN(goalIndexNum) && goalIndexNum >= 0 && goalIndexNum < user.iepPlan.goals.length) {
                targetGoal = user.iepPlan.goals[goalIndexNum];
                goalIndex = goalIndexNum;
            } else {
                // Find by description (partial match, case insensitive)
                for (let i = 0; i < user.iepPlan.goals.length; i++) {
                    const goal = user.iepPlan.goals[i];
                    if (goal.description && goal.description.toLowerCase().includes(goalIdentifier.toLowerCase())) {
                        targetGoal = goal;
                        goalIndex = i;
                        break;
                    }
                }
            }

            if (targetGoal && targetGoal.status === 'active') {
                // Update progress
                const oldProgress = targetGoal.currentProgress || 0;
                const newProgress = Math.max(0, Math.min(100, oldProgress + progressChange));
                targetGoal.currentProgress = newProgress;

                // Add to history
                if (!targetGoal.history) {
                    targetGoal.history = [];
                }
                targetGoal.history.push({
                    date: new Date(),
                    editorId: userId,
                    field: 'currentProgress',
                    from: oldProgress,
                    to: newProgress
                });

                // Check if goal is completed
                if (newProgress >= 100 && targetGoal.status === 'active') {
                    targetGoal.status = 'completed';
                    console.log(`🎯 IEP Goal COMPLETED for ${user.firstName}: ${targetGoal.description}`);
                }

                user.markModified('iepPlan');
                aiResponseText = aiResponseText.replace(iepGoalProgressMatch[0], '').trim();

                console.log(`📊 IEP Goal progress updated for ${user.firstName}: "${targetGoal.description}" ${oldProgress}% → ${newProgress}% (${progressChange > 0 ? '+' : ''}${progressChange}%)`);
            }
        }

        // CRITICAL FIX: Validate AI response before saving
        if (!aiResponseText || typeof aiResponseText !== 'string' || aiResponseText.trim() === '') {
            console.error('[Chat] ERROR: AI response is empty or invalid, using fallback message');
            aiResponseText = "I'm having trouble generating a response right now. Could you please rephrase your question?";
        }

        activeConversation.messages.push({ role: 'assistant', content: aiResponseText.trim() });

        // Real-time struggle detection and activity tracking
        const { detectStruggle, detectTopic, calculateProblemStats } = require('../utils/activitySummarizer');

        // Detect if student is struggling in recent messages
        const struggleInfo = detectStruggle(activeConversation.messages.slice(-10));
        if (struggleInfo.isStruggling) {
            activeConversation.alerts = activeConversation.alerts || [];

            // Only create new alert if not already alerted for this struggle recently
            const recentStruggleAlert = activeConversation.alerts.find(a =>
                a.type === 'struggle' &&
                !a.acknowledged &&
                (Date.now() - new Date(a.timestamp).getTime()) < 10 * 60 * 1000 // Within last 10 minutes
            );

            if (!recentStruggleAlert) {
                activeConversation.alerts.push({
                    type: 'struggle',
                    message: `Struggling with ${struggleInfo.strugglingWith}`,
                    timestamp: new Date(),
                    acknowledged: false,
                    severity: struggleInfo.severity
                });
            }
            activeConversation.strugglingWith = struggleInfo.strugglingWith;
        }

        // PROBLEM RESULT TRACKING: Parse structured tags for accurate stats
        // Format: <PROBLEM_RESULT:correct|incorrect|skipped>
        // This MUST happen before saving so stats are persisted correctly
        const problemResultMatch = aiResponseText.match(/<PROBLEM_RESULT:(correct|incorrect|skipped)>/i);
        let problemAnswered = false;
        let wasCorrect = false;
        let wasSkipped = false;

        if (problemResultMatch) {
            const result = problemResultMatch[1].toLowerCase();
            problemAnswered = true;
            wasCorrect = result === 'correct';
            wasSkipped = result === 'skipped';
            // Remove the tag from the response text
            aiResponseText = aiResponseText.replace(problemResultMatch[0], '').trim();
            console.log(`📊 [Problem Tracking] Result: ${result} (via structured tag)`);
        } else {
            // FALLBACK: Detect from AI response keywords (less accurate, for backward compatibility)
            const latestAIResponse = aiResponseText.toLowerCase();

            // Only use keyword fallback if student appears to have answered (message is short/answer-like)
            // This reduces false positives from the AI using these words in explanations
            const userMessage = message.trim();
            const looksLikeAnswer = userMessage.length < 100 && (
                /^-?\d+/.test(userMessage) || // Starts with a number
                /^x\s*=/.test(userMessage.toLowerCase()) || // Variable assignment
                /^[a-z]\s*=/.test(userMessage.toLowerCase()) || // Single variable
                userMessage.split(' ').length <= 10 // Short response
            );

            if (looksLikeAnswer) {
                // Detect correctness from AI response
                if (latestAIResponse.includes('correct') || latestAIResponse.includes('exactly') ||
                    latestAIResponse.includes('great job') || latestAIResponse.includes('perfect') ||
                    latestAIResponse.includes('well done')) {
                    problemAnswered = true;
                    wasCorrect = true;
                    console.log(`📊 [Problem Tracking] Result: correct (via keyword fallback)`);
                } else if (latestAIResponse.includes('not quite') || latestAIResponse.includes('try again') ||
                           latestAIResponse.includes('almost') || latestAIResponse.includes('incorrect') ||
                           latestAIResponse.includes('not exactly')) {
                    problemAnswered = true;
                    wasCorrect = false;
                    console.log(`📊 [Problem Tracking] Result: incorrect (via keyword fallback)`);
                }
            }
        }

        // Update conversation stats incrementally when a problem is answered
        if (problemAnswered) {
            // Increment the counters directly (don't recalculate from all messages)
            activeConversation.problemsAttempted = (activeConversation.problemsAttempted || 0) + 1;
            if (wasCorrect) {
                activeConversation.problemsCorrect = (activeConversation.problemsCorrect || 0) + 1;
            }
            // Store the result in the last AI message for historical accuracy
            const lastMsgIndex = activeConversation.messages.length - 1;
            if (lastMsgIndex >= 0) {
                activeConversation.messages[lastMsgIndex].problemResult =
                    wasCorrect ? 'correct' : (wasSkipped ? 'skipped' : 'incorrect');
            }
        }

        // Update live tracking fields for teacher dashboard
        activeConversation.currentTopic = detectTopic(activeConversation.messages);
        // NOTE: We no longer recalculate problemsAttempted/problemsCorrect from all messages
        // Stats are now tracked incrementally above for accuracy
        activeConversation.lastActivity = new Date();

        // CRITICAL FIX: Clean invalid messages before save to prevent validation errors
        // This removes any messages with undefined/empty content that may exist from previous bugs
        if (activeConversation.messages && Array.isArray(activeConversation.messages)) {
            const originalLength = activeConversation.messages.length;
            activeConversation.messages = activeConversation.messages.filter(msg => {
                return msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
            });
            if (activeConversation.messages.length !== originalLength) {
                console.warn(`[Chat] Removed ${originalLength - activeConversation.messages.length} invalid messages before save`);
            }
        }

        await activeConversation.save();

        // Smart auto-naming: Update session name if it's still generic
        // Fire-and-forget to not block the response
        const { smartAutoName } = require('../services/chatService');
        smartAutoName(activeConversation._id).catch(err =>
            console.error('[Chat] Smart auto-name failed:', err)
        );

        // Track badge progress if user has an active badge
        if (user.masteryProgress?.activeBadge) {

            // Update badge progress if a problem was answered
            if (problemAnswered) {
                const activeBadge = user.masteryProgress.activeBadge;
                activeBadge.problemsCompleted = (activeBadge.problemsCompleted || 0) + 1;
                if (wasCorrect) {
                    activeBadge.problemsCorrect = (activeBadge.problemsCorrect || 0) + 1;
                }

                // Check if badge is complete and AUTO-AWARD
                const accuracy = activeBadge.problemsCorrect / activeBadge.problemsCompleted;
                if (activeBadge.problemsCompleted >= activeBadge.requiredProblems &&
                    accuracy >= activeBadge.requiredAccuracy) {

                    // Award the badge if not already earned
                    if (!user.badges) user.badges = [];
                    const alreadyEarned = user.badges.find(b => b.badgeId === activeBadge.badgeId);

                    if (!alreadyEarned) {
                        user.badges.push({
                            badgeId: activeBadge.badgeId,
                            earnedDate: new Date(),
                            score: Math.round(accuracy * 100)
                        });

                        // Award XP bonus for earning badge
                        const badgeXpBonus = 500;
                        user.xp = (user.xp || 0) + badgeXpBonus;

                        console.log(`🎖️ BADGE EARNED: ${activeBadge.badgeName} (${Math.round(accuracy * 100)}% accuracy) - Awarded ${badgeXpBonus} bonus XP`);
                    }
                }

                user.markModified('masteryProgress');
            }
        }

        // =====================================================
        // XP LADDER: Calculate all three tiers
        // =====================================================

        // TIER 1: Silent turn XP (always awarded, never shown)
        xpBreakdown.tier1 = xpLadder.tier1.amount;

        // TIER 2: Performance XP (awarded on correct answers)
        // Determine if this was a "clean" solution (no hints used in recent turns)
        if (wasCorrect && xpBreakdown.tier2 === 0) {
            // Check if student used hints recently (look at last few messages for hint requests)
            const recentMessages = activeConversation.messages.slice(-6);
            const askedForHint = recentMessages.some(msg =>
                msg.role === 'user' &&
                /\b(hint|help|stuck|don't know|idk|confused)\b/i.test(msg.content)
            );

            if (askedForHint) {
                // Basic correct (used hints)
                xpBreakdown.tier2 = xpLadder.tier2.correct;
                xpBreakdown.tier2Type = 'correct';
            } else {
                // Clean solution (no hints)
                xpBreakdown.tier2 = xpLadder.tier2.clean;
                xpBreakdown.tier2Type = 'clean';
            }
            console.log(`✨ [XP Tier 2] Performance: +${xpBreakdown.tier2} XP (${xpBreakdown.tier2Type})`);
        }

        // Calculate total XP
        xpBreakdown.total = xpBreakdown.tier1 + xpBreakdown.tier2 + xpBreakdown.tier3;
        user.xp = (user.xp || 0) + xpBreakdown.total;

        // Update XP Ladder analytics for "grinding vs growing" analysis
        if (!user.xpLadderStats) {
            user.xpLadderStats = { lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 0, tier3Behaviors: [] };
        }
        user.xpLadderStats.lifetimeTier1 = (user.xpLadderStats.lifetimeTier1 || 0) + xpBreakdown.tier1;
        user.xpLadderStats.lifetimeTier2 = (user.xpLadderStats.lifetimeTier2 || 0) + xpBreakdown.tier2;
        user.xpLadderStats.lifetimeTier3 = (user.xpLadderStats.lifetimeTier3 || 0) + xpBreakdown.tier3;

        // Track Tier 3 behavior types for detailed analytics
        if (xpBreakdown.tier3 > 0 && xpBreakdown.tier3Behavior) {
            const existingBehavior = user.xpLadderStats.tier3Behaviors.find(
                b => b.behavior === xpBreakdown.tier3Behavior
            );
            if (existingBehavior) {
                existingBehavior.count += 1;
                existingBehavior.lastEarned = new Date();
            } else {
                user.xpLadderStats.tier3Behaviors.push({
                    behavior: xpBreakdown.tier3Behavior,
                    count: 1,
                    lastEarned: new Date()
                });
            }
        }
        user.markModified('xpLadderStats');

        // Check for level up (loop handles multi-level jumps from large XP awards)
        let leveledUp = false;
        let xpForNextLevel = (user.level || 1) * BRAND_CONFIG.xpPerLevel;
        while (user.xp >= xpForNextLevel) {
            user.level += 1;
            leveledUp = true;
            xpForNextLevel = user.level * BRAND_CONFIG.xpPerLevel;
        }

        const tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
        if (tutorsJustUnlocked.length > 0) {
            user.unlockedItems.push(...tutorsJustUnlocked);
            user.markModified('unlockedItems');
        }

        await user.save();

        // =====================================================
        // QUEST SYSTEM INTEGRATION: Update daily/weekly progress
        // =====================================================
        // Fire-and-forget: Don't block chat response for quest updates
        if (problemAnswered) {
            updateQuestProgress(user._id, wasCorrect, activeConversation.currentTopic).catch(err => {
                console.error('[Quest] Failed to update quest progress:', err.message);
            });
        }

        const xpForCurrentLevelStart = (user.level - 1) * BRAND_CONFIG.xpPerLevel;
        const userXpInCurrentLevel = user.xp - xpForCurrentLevelStart;

        // Log XP breakdown for analytics
        console.log(`📊 [XP Ladder] User ${user.firstName}: Tier1=${xpBreakdown.tier1} (silent), Tier2=${xpBreakdown.tier2} (${xpBreakdown.tier2Type || 'none'}), Tier3=${xpBreakdown.tier3} (${xpBreakdown.tier3Behavior || 'none'}) = Total ${xpBreakdown.total}`);

        // Prepare IEP accommodation features for frontend
        const iepFeatures = user.iepPlan?.accommodations ? {
            autoReadAloud: user.iepPlan.accommodations.audioReadAloud || false,
            showCalculator: user.iepPlan.accommodations.calculatorAllowed || false,
            useHighContrast: user.iepPlan.accommodations.largePrintHighContrast || false,
            extendedTimeMultiplier: user.iepPlan.accommodations.extendedTime ? 1.5 : 1.0,
            mathAnxietySupport: user.iepPlan.accommodations.mathAnxietySupport || false,
            chunkedAssignments: user.iepPlan.accommodations.chunkedAssignments || false
        } : null;

        const responseData = {
            text: aiResponseText,
            userXp: userXpInCurrentLevel,
            userLevel: user.level,
            xpNeeded: BRAND_CONFIG.xpPerLevel,
            voiceId: currentTutor.voiceId,
            newlyUnlockedTutors: tutorsJustUnlocked,
            drawingSequence: dynamicDrawingSequence,
            visualCommands: visualCommands,
            boardContext: boardContext,
            iepFeatures: iepFeatures,
            problemResult: problemAnswered ? (wasCorrect ? 'correct' : 'incorrect') : null,
            sessionStats: {
                problemsAttempted: activeConversation.problemsAttempted || 0,
                problemsCorrect: activeConversation.problemsCorrect || 0
            },
            // XP LADDER: Tiered XP data for frontend rendering
            xpLadder: {
                tier1: xpBreakdown.tier1,           // Silent (frontend ignores)
                tier2: xpBreakdown.tier2,           // Performance XP
                tier2Type: xpBreakdown.tier2Type,   // 'correct', 'clean', or null
                tier3: xpBreakdown.tier3,           // Core behavior XP
                tier3Behavior: xpBreakdown.tier3Behavior, // Behavior name for display
                total: xpBreakdown.total,
                leveledUp: leveledUp
            },
            // Free tier countdown: seconds of AI time remaining this week
            aiTimeUsed: aiProcessingSeconds,
            freeWeeklySecondsRemaining: (!user.subscriptionTier || user.subscriptionTier === 'free')
                ? Math.max(0, (20 * 60) - updatedWeeklyAI)
                : null
        };

        if (useStreaming) {
            // Send final metadata as 'complete' event (skip if client already gone)
            if (!clientDisconnected) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
                    res.end();
                } catch (writeErr) {
                    console.error('[Stream] Failed to send completion event:', writeErr.message);
                }
            }
        } else {
            // Non-streaming: send as regular JSON
            res.json(responseData);
        }

    } catch (error) {
        console.error("ERROR: Chat route failed:", error);
        // Prevent "headers already sent" crash during streaming mode
        if (res.headersSent) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' })}\n\n`);
                res.end();
            } catch (writeErr) {
                console.error("ERROR: Failed to send error event on stream:", writeErr.message);
            }
        } else {
            res.status(500).json({ message: "An internal server error occurred." });
        }
    }

    } finally {
        // Always release the per-user lock so the next message can proceed
        releaseLock();
    }
});

// Handle parent-teacher conference chat
async function handleParentChat(req, res, parentId, childId, message) {
    try {
        // Verify parent has access to this child
        const parent = await User.findById(parentId);
        if (!parent || !parent.children || !parent.children.some(c => c._id.toString() === childId)) {
            return res.status(403).json({ message: "You don't have access to this child's information." });
        }

        // Fetch child's complete information
        const child = await User.findById(childId).lean();
        if (!child) {
            return res.status(404).json({ message: "Child not found." });
        }

        // Get child's recent conversations for context
        const recentSessions = await Conversation.find({ userId: childId })
            .sort({ lastActivity: -1 })
            .limit(10)
            .select('summary currentTopic strugglingWith problemsAttempted problemsCorrect activeMinutes lastActivity')
            .lean();

        // Get child's curriculum context if they have a teacher
        let curriculumContext = null;
        if (child.teacherId) {
            try {
                const curriculum = await Curriculum.getActiveCurriculum(child.teacherId);
                if (curriculum && curriculum.autoSyncWithAI) {
                    curriculumContext = curriculum.getAIContext();
                }
            } catch (error) {
                console.error('Error fetching curriculum context:', error);
            }
        }

        // Get or create parent conversation for this child
        let parentConversation = await Conversation.findOne({
            userId: parentId,
            'metadata.childId': childId
        });

        if (!parentConversation) {
            parentConversation = new Conversation({
                userId: parentId,
                messages: [],
                metadata: { childId: childId, conversationType: 'parent-teacher' }
            });
        }

        parentConversation.messages.push({ role: 'user', content: message });

        // Get the tutor personality the student uses
        const selectedTutorKey = child.selectedTutorId && TUTOR_CONFIG[child.selectedTutorId]
            ? child.selectedTutorId
            : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];

        // Build system prompt for parent-teacher conference
        const systemPrompt = generateParentTeacherPrompt(child, recentSessions, curriculumContext, parent, currentTutor);

        const recentMessages = parentConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        const formattedMessages = recentMessages
            .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content)
            .map(msg => ({ role: msg.role, content: msg.content }));

        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...formattedMessages];

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, {
            system: systemPrompt,
            temperature: 0.7,
            max_tokens: 800
        });

        let aiResponseText = completion.choices[0]?.message?.content?.trim() || "I apologize, I'm having trouble responding right now.";

        parentConversation.messages.push({ role: 'assistant', content: aiResponseText });
        parentConversation.lastActivity = new Date();
        await parentConversation.save();

        res.json({
            text: aiResponseText,
            userXp: 0,
            userLevel: 0,
            xpNeeded: 0,
            specialXpAwarded: "",
            voiceId: currentTutor.voiceId,
            tutorName: currentTutor.name,
            tutorImage: currentTutor.image,
            newlyUnlockedTutors: [],
            drawingSequence: null
        });

    } catch (error) {
        console.error("ERROR: Parent chat failed:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
}

// Generate system prompt for parent-teacher conference
function generateParentTeacherPrompt(child, recentSessions, curriculumContext, parent, tutor) {
    const childName = child.firstName;
    const parentName = parent.firstName;
    const tutorName = tutor?.name || 'Mr. Nappier';
    const tutorPersonality = tutor?.personality || '';

    // Build session summaries section - this is the CORE data the AI must reference
    let sessionData = '';
    let hasRealData = false;

    if (recentSessions && recentSessions.length > 0) {
        const validSessions = recentSessions.filter(s => s.summary || s.currentTopic);

        if (validSessions.length > 0) {
            hasRealData = true;
            sessionData = validSessions.slice(0, 6).map((session, idx) => {
                const date = session.lastActivity ? new Date(session.lastActivity).toLocaleDateString() : 'Recent';
                const duration = session.activeMinutes ? `${session.activeMinutes} min` : '';
                const topic = session.currentTopic && session.currentTopic !== 'mathematics' ? session.currentTopic : '';
                const accuracy = session.problemsAttempted > 0
                    ? `${session.problemsCorrect || 0}/${session.problemsAttempted} correct (${Math.round((session.problemsCorrect || 0) / session.problemsAttempted * 100)}%)`
                    : 'No problems attempted';
                const struggle = session.strugglingWith || '';
                const summary = session.summary || '';

                return `SESSION ${idx + 1} (${date}${duration ? ', ' + duration : ''}):
${topic ? `- Topic: ${topic}` : ''}
- Performance: ${accuracy}
${struggle ? `- Struggled with: ${struggle}` : ''}
${summary ? `- Summary: ${summary}` : ''}`;
            }).join('\n\n');
        }
    }

    // Build IEP section
    let iepSection = '';
    if (child.iepPlan) {
        const accom = child.iepPlan.accommodations || {};
        const accommodations = [];
        if (accom.extendedTime) accommodations.push('Extended Time');
        if (accom.calculatorAllowed) accommodations.push('Calculator Allowed');
        if (accom.audioReadAloud) accommodations.push('Audio Read-Aloud');
        if (accom.chunkedAssignments) accommodations.push('Chunked Assignments');
        if (accom.mathAnxietySupport) accommodations.push('Math Anxiety Support');

        if (accommodations.length > 0) {
            iepSection += `\nACCOMMODATIONS: ${accommodations.join(', ')}`;
        }

        if (child.iepPlan.goals && child.iepPlan.goals.length > 0) {
            iepSection += `\nIEP GOALS:\n`;
            child.iepPlan.goals.forEach(goal => {
                iepSection += `- ${goal.description} (${goal.status}, ${goal.currentProgress || 0}% complete)\n`;
            });
        }
    }

    const prompt = `You are ${tutorName}, ${childName}'s math tutor. You're chatting with their parent, ${parentName}.

YOUR PERSONALITY (use it, but slightly more professional for parent chat):
${tutorPersonality}

STUDENT INFO:
- Name: ${childName}
- Grade: ${child.gradeLevel || 'Not specified'}
- Course: ${child.mathCourse || 'Not specified'}
- Level: ${child.level || 1} (${child.xp || 0} XP)
- Total Time Learning: ${child.totalActiveTutoringMinutes || 0} minutes${iepSection}
${curriculumContext ? `\nCURRICULUM CONTEXT:\n${curriculumContext}` : ''}

=== ${childName.toUpperCase()}'S ACTUAL SESSION DATA ===
${hasRealData ? sessionData : 'No session data available yet.'}
=== END SESSION DATA ===

CRITICAL RULES:
1. ONLY discuss topics, performance, and struggles that appear in the SESSION DATA above
2. DO NOT invent or assume topics the student worked on - if it's not in the data, don't mention it
3. DO NOT make up generic claims about "algebra" or "geometry" unless those words appear in the session data
4. If the parent asks about something not in the data, say you'd need to check or that you haven't covered that topic yet
5. Reference SPECIFIC sessions, dates, accuracy rates, and summaries from the data above
6. If there's no session data, be honest: "${childName} and I haven't had many sessions yet"

SPECIAL REQUESTS:
- If parent asks to "teach me" or "explain the concept": Teach them the math topic from the SESSION DATA at a beginner level. Use simple examples, step-by-step explanations, and relatable analogies. Make it practical so they can help their child.
- If parent asks about "help at home": Give specific, actionable activities like practice problems, real-world applications, or study tips based on what ${childName} is learning.
- If parent asks about "struggles": Be honest but constructive. Explain WHY a concept might be challenging and suggest how to address it.

TONE:
- Be yourself (${tutorName}) but slightly more professional for a parent conversation
- Be warm, approachable, and conversational - not formal or stiff
- Keep responses concise (2-3 short paragraphs max)
- Be honest about challenges while staying encouraging
- Give specific, actionable suggestions for home practice

Chat naturally with ${parentName} about ${childName}'s ACTUAL progress based on the session data above.`;

    return prompt;
}

// Track session time - receives heartbeat updates from frontend
// Accumulates precise seconds and derives minutes for display
router.post('/track-time', isAuthenticated, async (req, res) => {
    try {
        const { activeSeconds } = req.body;
        const userId = req.user?._id;

        if (!userId) return res.status(401).json({ message: "Not authenticated." });
        if (activeSeconds === undefined || activeSeconds < 0) {
            return res.status(400).json({ message: "Valid activeSeconds is required" });
        }

        // Don't track if less than 1 second
        if (activeSeconds < 1) {
            return res.status(200).json({ message: "Time tracked (below minimum)" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // IMPROVED: Track precise seconds and derive minutes
        // This prevents loss of time from rounding (e.g., 5 heartbeats of 25 seconds each = 2 minutes, not 0)

        // Initialize tracking fields if they don't exist
        if (!user.totalActiveSeconds) user.totalActiveSeconds = (user.totalActiveTutoringMinutes || 0) * 60;
        if (!user.weeklyActiveSeconds) user.weeklyActiveSeconds = (user.weeklyActiveTutoringMinutes || 0) * 60;

        // WEEKLY RESET: Check if we need to reset weekly counters
        // Reset occurs if lastWeeklyReset was more than 7 days ago
        const now = new Date();
        const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : new Date(0);
        const daysSinceReset = (now - lastReset) / (1000 * 60 * 60 * 24);

        if (daysSinceReset >= 7) {
            console.log(`[Track-Time] Weekly reset for user ${userId}: ${user.weeklyActiveTutoringMinutes || 0} active min, ${Math.floor((user.weeklyAISeconds || 0) / 60)} AI min -> 0`);
            user.weeklyActiveSeconds = 0;
            user.weeklyActiveTutoringMinutes = 0;
            user.weeklyAISeconds = 0;
            user.lastWeeklyReset = now;
        }

        // Accumulate seconds
        user.totalActiveSeconds = (user.totalActiveSeconds || 0) + activeSeconds;
        user.weeklyActiveSeconds = (user.weeklyActiveSeconds || 0) + activeSeconds;

        // Update minutes (derived from seconds for display)
        user.totalActiveTutoringMinutes = Math.floor(user.totalActiveSeconds / 60);
        user.weeklyActiveTutoringMinutes = Math.floor(user.weeklyActiveSeconds / 60);

        // Pack deduction now happens server-side in the chat route based on AI processing time
        // (not client-reported active time) so reading/thinking time isn't counted

        // Update active conversation if exists
        if (user.activeConversationId) {
            const conversation = await Conversation.findById(user.activeConversationId);
            if (conversation && conversation.isActive) {
                // Initialize activeSeconds if it doesn't exist (migrate from activeMinutes)
                if (conversation.activeSeconds === undefined || conversation.activeSeconds === 0) {
                    conversation.activeSeconds = (conversation.activeMinutes || 0) * 60;
                }

                // Accumulate seconds and derive minutes
                conversation.activeSeconds = (conversation.activeSeconds || 0) + activeSeconds;
                conversation.activeMinutes = Math.floor(conversation.activeSeconds / 60);
                conversation.lastActivity = new Date();

                // CRITICAL FIX: Clean invalid messages before save to prevent validation errors
                if (conversation.messages && Array.isArray(conversation.messages)) {
                    const originalLength = conversation.messages.length;
                    conversation.messages = conversation.messages.filter(msg => {
                        return msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
                    });
                    if (conversation.messages.length !== originalLength) {
                        console.warn(`[Track-Time] Removed ${originalLength - conversation.messages.length} invalid messages before save`);
                    }
                }

                await conversation.save();
            }
        }

        await user.save();

        res.status(200).json({
            message: "Time tracked successfully",
            totalMinutes: user.totalActiveTutoringMinutes,
            weeklyMinutes: user.weeklyActiveTutoringMinutes,
            totalSeconds: user.totalActiveSeconds,
            weeklySeconds: user.weeklyActiveSeconds
        });

    } catch (error) {
        console.error("ERROR: Track time failed:", error);
        res.status(500).json({ message: "Failed to track time" });
    }
});

/**
 * GET /api/chat/last-session
 * Fetch the last conversation session with context for personalized greeting
 */
router.get('/last-session', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;

        // Find the most recent COMPLETED conversation (not active, has meaningful content)
        const lastConversation = await Conversation.findOne({
            userId: userId,
            isActive: false, // Only completed sessions
            $or: [
                { summary: { $exists: true, $ne: null, $ne: '' } },
                { currentTopic: { $exists: true, $ne: null, $ne: '' } },
                { strugglingWith: { $exists: true, $ne: null, $ne: '' } }
            ]
        })
        .sort({ lastActivity: -1 })
        .limit(1)
        .select('summary currentTopic strugglingWith lastActivity problemsAttempted problemsCorrect')
        .lean();

        if (!lastConversation) {
            return res.json({ hasLastSession: false });
        }

        // Calculate how long ago the session was
        const hoursAgo = Math.floor((Date.now() - new Date(lastConversation.lastActivity).getTime()) / (1000 * 60 * 60));

        res.json({
            hasLastSession: true,
            summary: lastConversation.summary,
            currentTopic: lastConversation.currentTopic,
            strugglingWith: lastConversation.strugglingWith,
            problemsAttempted: lastConversation.problemsAttempted || 0,
            problemsCorrect: lastConversation.problemsCorrect || 0,
            hoursAgo: hoursAgo
        });

    } catch (error) {
        console.error("ERROR: Fetch last session failed:", error);
        res.status(500).json({ message: "Failed to fetch last session" });
    }
});

/**
 * GET /api/chat/resume-context
 * Get context for "Continue where you left off" banner
 * Checks active sessions first, then falls back to recent completed sessions
 */
router.get('/resume-context', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user._id;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // First, check for active sessions with meaningful content
        let session = await Conversation.findOne({
            userId,
            isActive: true,
            lastActivity: { $gte: sevenDaysAgo },
            'messages.1': { $exists: true } // At least 2 messages
        })
        .sort({ lastActivity: -1 })
        .select('_id topic topicEmoji conversationName customName currentTopic strugglingWith lastActivity messages problemsAttempted problemsCorrect conversationType')
        .lean();

        // If no active session, check for recent completed sessions
        if (!session) {
            session = await Conversation.findOne({
                userId,
                isActive: false,
                lastActivity: { $gte: sevenDaysAgo },
                'messages.1': { $exists: true }
            })
            .sort({ lastActivity: -1 })
            .select('_id topic topicEmoji conversationName customName currentTopic strugglingWith lastActivity messages problemsAttempted problemsCorrect conversationType summary')
            .lean();
        }

        if (!session) {
            return res.json({ hasResumeContext: false });
        }

        // Get last few messages for context
        const recentMessages = session.messages.slice(-4);
        const lastUserMessage = [...recentMessages].reverse().find(m => m.role === 'user');
        const lastAiMessage = [...recentMessages].reverse().find(m => m.role === 'assistant');

        // Calculate time since last activity
        const msSinceActivity = Date.now() - new Date(session.lastActivity).getTime();
        const hoursSince = Math.floor(msSinceActivity / (1000 * 60 * 60));
        const daysSince = Math.floor(hoursSince / 24);

        let timeAgo;
        if (hoursSince < 1) timeAgo = 'Just now';
        else if (hoursSince < 24) timeAgo = `${hoursSince} hour${hoursSince > 1 ? 's' : ''} ago`;
        else if (daysSince === 1) timeAgo = 'Yesterday';
        else timeAgo = `${daysSince} days ago`;

        // Determine display name
        const displayName = session.customName || session.currentTopic || session.topic || session.conversationName || 'Math Session';

        res.json({
            hasResumeContext: true,
            sessionId: session._id,
            displayName,
            topic: session.currentTopic || session.topic,
            topicEmoji: session.topicEmoji || '📚',
            strugglingWith: session.strugglingWith,
            timeAgo,
            isActive: session.isActive !== false,
            conversationType: session.conversationType,
            stats: {
                messageCount: session.messages.length,
                problemsAttempted: session.problemsAttempted || 0,
                problemsCorrect: session.problemsCorrect || 0
            },
            lastContext: {
                userMessage: lastUserMessage?.content?.substring(0, 100) || null,
                aiMessage: lastAiMessage?.content?.substring(0, 150) || null
            },
            summary: session.summary || null
        });

    } catch (error) {
        console.error("ERROR: Fetch resume context failed:", error);
        res.status(500).json({ message: "Failed to fetch resume context" });
    }
});

// ========== GREETING HANDLER: AI-initiated conversation ==========
// Builds a context-rich "ghost message" the user doesn't see,
// but the AI responds to naturally - creating the illusion of AI initiating
async function handleGreetingRequest(req, res, userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        // Get or create conversation (same logic as main chat)
        let activeConversation;
        if (user.activeConversationId) {
            activeConversation = await Conversation.findById(user.activeConversationId);
        }
        if (!activeConversation || !activeConversation.isActive || activeConversation.isMastery) {
            activeConversation = new Conversation({ userId: user._id, messages: [], isMastery: false });
            user.activeConversationId = activeConversation._id;
            await user.save();
        }

        // Gather context for the ghost message
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId] ? user.selectedTutorId : "default";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];

        // Get temporal context (EST/EDT)
        const now = new Date();
        const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hour = estTime.getHours();
        const dayOfWeek = estTime.getDay();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        let timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isLateNight = hour >= 21 || hour < 6;

        // Check assessment/screener status
        const activeScreenerSession = await ScreenerSession.getActiveSession(userId);
        const assessmentNeeded = await needsAssessment(userId);

        // Get last conversation context
        let lastSessionContext = '';
        let strugglingWith = '';

        if (activeConversation.messages && activeConversation.messages.length > 0) {
            // Recent messages in current conversation
            const recentTopics = activeConversation.messages
                .filter(m => m.role === 'assistant')
                .slice(-3)
                .map(m => m.content.substring(0, 100))
                .join(' ');
            if (activeConversation.currentTopic) {
                lastSessionContext = `Last time we worked on ${activeConversation.currentTopic}.`;
            }
            if (activeConversation.strugglingWith) {
                strugglingWith = activeConversation.strugglingWith;
            }
        } else {
            // Check archived conversations
            const lastArchived = await Conversation.findOne({
                userId: user._id,
                summary: { $ne: null }
            }).sort({ lastActivity: -1 });

            if (lastArchived) {
                if (lastArchived.summary) {
                    lastSessionContext = `Last session: ${lastArchived.summary}`;
                }
                if (lastArchived.strugglingWith) {
                    strugglingWith = lastArchived.strugglingWith;
                }
            }
        }

        // Build the context-rich ghost message (student "introducing" themselves)
        let ghostMessageParts = [];

        // Basic intro
        ghostMessageParts.push(`Hi, I'm ${user.firstName}`);

        // Grade/course context
        if (user.gradeLevel) {
            ghostMessageParts.push(`I'm in ${user.gradeLevel}`);
        } else if (user.grade) {
            ghostMessageParts.push(`I'm a ${user.grade} student`);
        }
        if (user.mathCourse) {
            ghostMessageParts.push(`taking ${user.mathCourse}`);
        }

        // Time context
        ghostMessageParts.push(`It's ${dayNames[dayOfWeek]} ${timeOfDay}${isLateNight ? ' (late)' : ''}${isWeekend ? ' (weekend)' : ''}`);

        // User state context
        if (!user.learningProfile?.rapportBuildingComplete) {
            ghostMessageParts.push("This is my first time here");
        } else if (activeScreenerSession && !user.assessmentCompleted) {
            const questionsCompleted = activeScreenerSession.questionCount || 0;
            ghostMessageParts.push(`I started a placement test but didn't finish (got through ${questionsCompleted} questions)`);
        } else if (assessmentNeeded && user.assessmentCompleted) {
            ghostMessageParts.push("It's been a while since my last placement test");
        } else if (assessmentNeeded && !user.assessmentCompleted && (user.level || 1) < 5) {
            ghostMessageParts.push("I haven't taken a placement test yet");
        }

        // Session context
        if (lastSessionContext) {
            ghostMessageParts.push(lastSessionContext);
        }
        if (strugglingWith) {
            ghostMessageParts.push(`I've been having trouble with ${strugglingWith}`);
        }

        // Learning preferences from profile
        if (user.learningProfile?.rapportAnswers) {
            const answers = user.learningProfile.rapportAnswers;
            if (answers.mathFeeling) ghostMessageParts.push(`Math makes me feel ${answers.mathFeeling}`);
            if (answers.interests) ghostMessageParts.push(`I'm interested in ${answers.interests}`);
        }

        const ghostMessage = ghostMessageParts.join('. ') + '.';

        console.log(`[Greeting] Ghost message for ${user.firstName}: "${ghostMessage.substring(0, 100)}..."`);

        // Build messages for AI - the ghost message is the "user" message
        // but we add a system instruction to respond as if initiating
        const systemPrompt = generateSystemPrompt(user.toObject(), currentTutor, null, 'student', null, null, null, [], null, null);

        // Check if we should offer Starting Point in this greeting (only once, ever)
        const shouldOfferStartingPoint = !user.startingPointOffered && !user.assessmentCompleted;

        let greetingInstruction = `The student just opened the chat. They haven't typed anything yet - YOU are initiating the conversation. The following is context about them (not something they said). Greet them naturally and briefly based on this context. Don't repeat back their info - just use it to personalize. Keep it to 1-2 sentences. Be casual like texting. If they're new, introduce yourself briefly. If returning, welcome back. If they have incomplete work, mention it casually.`;

        // Add Starting Point offer (only on first session, never again)
        if (shouldOfferStartingPoint) {
            greetingInstruction += `

IMPORTANT: This is the student's first session. After your greeting, casually mention the "Starting Point" button in the sidebar. Say something like: "Oh, and when you're ready, hit that glowing Starting Point button on the left - it's a quick quiz to figure out where you're at so I can help you better. No rush though!"

Keep it casual and low-pressure. Don't make it sound like a test they need to take right now. Just let them know it's there when they're ready.`;
        }

        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            {
                role: 'system',
                content: greetingInstruction
            },
            { role: 'user', content: ghostMessage }
        ];

        // Check if streaming is requested
        const useStreaming = req.query.stream === 'true';
        const greetingAiStart = Date.now();

        if (useStreaming) {
            // STREAMING MODE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            try {
                const stream = await callLLMStream(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.8, max_tokens: 150 });
                let fullResponse = '';

                for await (const chunk of stream) {
                    let content = '';
                    if (chunk.choices?.[0]?.delta?.content) {
                        content = chunk.choices[0].delta.content;
                    }
                    if (content) {
                        fullResponse += content;
                        res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                    }
                }

                // Track AI processing time
                const greetingAiSeconds = Math.ceil((Date.now() - greetingAiStart) / 1000);
                User.findByIdAndUpdate(userId, {
                    $inc: { weeklyAISeconds: greetingAiSeconds, totalAISeconds: greetingAiSeconds }
                }).catch(err => console.error('[Greeting] AI time tracking error:', err));

                // Save greeting to conversation (AI message only, no user message)
                activeConversation.messages.push({
                    role: 'assistant',
                    content: fullResponse.trim(),
                    timestamp: new Date()
                });
                activeConversation.lastActivity = new Date();
                await activeConversation.save();

                // Mark Starting Point as offered (only do this once, ever)
                if (shouldOfferStartingPoint) {
                    await User.findByIdAndUpdate(userId, {
                        startingPointOffered: true,
                        startingPointOfferedAt: new Date()
                    });
                    console.log(`[Greeting] Marked Starting Point as offered for user ${userId}`);
                }

                // Send completion with metadata
                res.write(`data: ${JSON.stringify({
                    done: true,
                    voiceId: currentTutor.voiceId,
                    isGreeting: true
                })}\n\n`);
                res.end();

            } catch (streamError) {
                console.error('[Greeting] Stream error:', streamError);
                res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
                res.end();
            }

        } else {
            // NON-STREAMING MODE
            const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.8, max_tokens: 150 });
            const greetingText = completion.choices[0].message.content.trim();

            // Track AI processing time
            const greetingAiSeconds = Math.ceil((Date.now() - greetingAiStart) / 1000);
            User.findByIdAndUpdate(userId, {
                $inc: { weeklyAISeconds: greetingAiSeconds, totalAISeconds: greetingAiSeconds }
            }).catch(err => console.error('[Greeting] AI time tracking error:', err));

            // Save greeting to conversation
            activeConversation.messages.push({
                role: 'assistant',
                content: greetingText,
                timestamp: new Date()
            });
            activeConversation.lastActivity = new Date();
            await activeConversation.save();

            // Mark Starting Point as offered (only do this once, ever)
            if (shouldOfferStartingPoint) {
                await User.findByIdAndUpdate(userId, {
                    startingPointOffered: true,
                    startingPointOfferedAt: new Date()
                });
                console.log(`[Greeting] Marked Starting Point as offered for user ${userId}`);
            }

            res.json({
                text: greetingText,
                voiceId: currentTutor.voiceId,
                isGreeting: true,
                userXp: user.xp || 0,
                userLevel: user.level || 1,
                xpNeeded: (user.level || 1) * BRAND_CONFIG.xpPerLevel
            });
        }

    } catch (error) {
        console.error('[Greeting] Error:', error);

        // Fallback greeting
        const fallbackGreetings = [
            "Hey! What do you need help with?",
            "Hi there! What are you working on?",
            "Hey! Ready to do some math?"
        ];
        const fallback = fallbackGreetings[Math.floor(Math.random() * fallbackGreetings.length)];

        res.json({
            text: fallback,
            voiceId: 'default',
            isGreeting: true,
            error: 'Greeting generation failed'
        });
    }
}

module.exports = router;