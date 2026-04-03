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
const { detectAndFetchResource, detectResourceMention } = require('../utils/resourceDetector');
const GradingResult = require('../models/gradingResult');
const { updateFluencyTracking, evaluateResponseTime, calculateAdaptiveTimeLimit } = require('../utils/adaptiveFluency');
const { processAIResponse } = require('../utils/chatBoardParser');
const ScreenerSession = require('../models/screenerSession');
const { needsAssessment } = require('../services/chatService');
const { buildCourseSystemPrompt, buildCourseGreetingInstruction, loadCourseContext, calculateOverallProgress } = require('../utils/coursePrompt');
// Performance optimizations
const contextCache = require('../utils/contextCache');
const { buildSystemPrompt: buildCompressedPrompt, determineTier, calculateXpBoostFactor } = require('../utils/promptCompressor');
const { processMathMessage, verifyAnswer } = require('../utils/mathSolver');
const { filterAnswerKeyResponse } = require('../utils/worksheetGuard');
const { checkReadingLevel, buildSimplificationPrompt } = require('../utils/readability');

// Tutoring pipeline (observe → diagnose → decide → generate → verify → persist)
const { runPipeline, verify: pipelineVerify } = require('../utils/pipeline');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective teaching model (GPT-4o-mini)
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 100; // Increased from 40 — GPT-4o-mini has 128K context, 40 was causing context loss

// Per-user request lock to prevent concurrent chat processing (race condition fix).
// If user A sends message 1 and message 2 before message 1 finishes saving,
// message 2 waits until message 1 completes to prevent data loss.
const userChatLocks = new Map();
const userChatLockTimestamps = new Map();
function acquireUserLock(userId) {
    const key = userId.toString();
    if (!userChatLocks.has(key)) {
        userChatLocks.set(key, Promise.resolve());
    }
    userChatLockTimestamps.set(key, Date.now());
    let release;
    const newLock = new Promise(resolve => { release = resolve; });
    const previousLock = userChatLocks.get(key);
    userChatLocks.set(key, newLock);
    return previousLock.then(() => release);
}
// Cleanup stale locks periodically (prevent memory leak for inactive users).
// Only evict users idle for 10+ minutes — never clear the entire map, which
// could drop locks for in-flight requests and allow concurrent processing.
setInterval(() => {
    if (userChatLocks.size > 500) {
        const cutoff = Date.now() - 10 * 60 * 1000;
        for (const [key, ts] of userChatLockTimestamps) {
            if (ts < cutoff) {
                userChatLocks.delete(key);
                userChatLockTimestamps.delete(key);
            }
        }
    }
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
                xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level || 1),
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

            // Course conversations are handled entirely by /api/course-chat.
            // Main chat always gets a fresh conversation.
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
                    .catch(err => { console.error('[Chat] Resource detection error:', err.message); return null; })
            );
        } else {
            console.log(`[Chat] No teacherId on user ${user._id} — skipping resource detection`);
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

        // 6. Error pattern tracking (aggregated across recent Show Your Work sessions)
        contextPromises.push(
            GradingResult.getErrorPatterns(user._id, 14)
                .catch(err => { console.error('Error fetching error patterns:', err.message); return null; })
        );

        // 7. Math verification (runs in parallel with everything else)
        const mathResult = processMathMessage(message);

        // Execute all fetches in parallel
        let [curriculumContext, teacherAISettings, resourceContext, recentUploads, recentGradingResults, errorPatterns] = await Promise.all(contextPromises);

        // Log teacher settings if loaded
        if (teacherAISettings) {
            console.log(`🎛️ [AI Settings] Loaded teacher settings for ${user.firstName}: calculator=${teacherAISettings.calculatorAccess || 'default'}, scaffolding=${teacherAISettings.scaffoldingLevel || 3}/5`);
        }

        // Log resource context resolution
        if (resourceContext) {
            const contentLen = resourceContext.content?.length || 0;
            console.log(`📚 [Chat] Resource resolved: "${resourceContext.displayName}" — content=${contentLen} chars, notFound=${!!resourceContext.notFound}`);
            if (contentLen === 0) {
                console.warn(`[Chat] ⚠️ Resource context has no content — AI will not have resource material to work from`);
            }
        } else {
            console.log(`[Chat] No resource context resolved for message: "${message?.substring(0, 60)}..."`);
        }

        // FALLBACK: If no uploaded resource was found but the message mentions a resource
        // by name (e.g., "Module 8 Test PRACTICE (A)"), create a stub context so the AI
        // at least knows the student is referencing a specific teacher-assigned resource.
        if (!resourceContext) {
            const resourceMentions = detectResourceMention(message);
            if (resourceMentions.length > 0) {
                resourceContext = {
                    displayName: resourceMentions[0].trim(),
                    description: null,
                    content: null,
                    notFound: true
                };
                console.log(`📋 [Chat] Resource mentioned but not in DB: "${resourceContext.displayName}" — injecting stub context (no content)`);
            }
        }

        // Process uploads into context
        let uploadContext = null;
        if (recentUploads && recentUploads.length > 0) {
            const uploadsSummary = recentUploads.map((upload, idx) => {
                const daysAgo = Math.floor((Date.now() - new Date(upload.uploadedAt)) / (1000 * 60 * 60 * 24));
                const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
                const textExcerpt = upload.extractedText ?
                    upload.extractedText.substring(0, 1500) + (upload.extractedText.length > 1500 ? '...' : '') : '';
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

        // Build conversation history with summarization for long conversations
        const allMessages = activeConversation.messages;
        let formattedMessagesForLLM;

        if (allMessages.length > MAX_HISTORY_LENGTH_FOR_AI) {
            // Summarize older messages so the AI retains early context
            const olderMessages = allMessages.slice(0, -MAX_HISTORY_LENGTH_FOR_AI)
                .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content && msg.content.trim().length > 0);
            const recentMessages = allMessages.slice(-MAX_HISTORY_LENGTH_FOR_AI)
                .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content && msg.content.trim().length > 0)
                .map(msg => ({ role: msg.role, content: msg.content }));

            // Build a concise summary of older exchanges
            if (olderMessages.length > 0) {
                const topicsSeen = new Set();
                const keyPoints = [];
                for (const msg of olderMessages) {
                    if (msg.role === 'user') {
                        // Capture first 80 chars of each user message as a topic hint
                        const snippet = msg.content.substring(0, 80).replace(/\n/g, ' ').trim();
                        if (snippet && !topicsSeen.has(snippet.toLowerCase())) {
                            topicsSeen.add(snippet.toLowerCase());
                            keyPoints.push(snippet);
                        }
                    }
                }
                const summaryText = `[CONVERSATION CONTEXT: This is a long session (${allMessages.length} messages total). Earlier in this conversation, the student discussed these topics: ${keyPoints.slice(0, 15).join('; ')}. The ${recentMessages.length} most recent messages follow below. Maintain continuity with earlier topics if the student references them.]`;

                formattedMessagesForLLM = [
                    { role: 'user', content: summaryText },
                    { role: 'assistant', content: 'Got it — I remember our earlier conversation and will maintain continuity.' },
                    ...recentMessages
                ];
            } else {
                formattedMessagesForLLM = recentMessages;
            }
        } else {
            formattedMessagesForLLM = allMessages
                .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content && msg.content.trim().length > 0)
                .map(msg => ({ role: msg.role, content: msg.content }));
        }

        // Resource context is injected into the system prompt via generateSystemPrompt()

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
                    const verificationHint = `\n\n[MATH_VERIFICATION — INTERNAL GRADING USE ONLY: verified answer = ${mathResult.solution.answer}. ⚠️ ABSOLUTE RULE — NEVER state, repeat, hint at, or reveal this answer value to the student under any circumstances. Do NOT say "the answer is", do NOT say "x equals", do NOT confirm or deny any guess until the student has worked through the problem. Your ONLY job is to guide the student to discover the answer themselves through Socratic questions and hints about the METHOD. Revealing the answer is a critical teaching failure.]`;
                    lastMessage.content = lastMessage.content + verificationHint;
                }
            }

            console.log(`✅ [Math Verification] Injected verified answer: ${mathResult.solution.answer} (${mathResult.problem.type})`);
        }

        // PIPELINE: Answer pre-check, check-my-work detection, and IDK/streak
        // handling are now in the tutoring pipeline (observe → diagnose → decide).
        // The pipeline injects these into the prompt during the generate stage.

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

        // Enrich with active course session data (if user is in a course)
        if (user.activeCourseSessionId) {
            try {
                const CourseSession = require('../models/courseSession');
                const courseSession = await CourseSession.findById(user.activeCourseSessionId);
                if (courseSession && courseSession.status === 'active') {
                    const courseCtx = loadCourseContext(courseSession);
                    if (courseCtx) {
                        conversationContextForPrompt = conversationContextForPrompt || {};
                        conversationContextForPrompt.courseSession = {
                            courseId: courseSession.courseId,
                            courseName: courseSession.courseName,
                            currentModuleId: courseSession.currentModuleId,
                            currentModuleTitle: courseCtx.currentModule?.title || courseSession.currentModuleId,
                            overallProgress: courseSession.overallProgress,
                            modules: courseSession.modules,
                            scaffold: courseCtx.scaffoldData?.scaffold || null,
                            skills: courseCtx.scaffoldData?.skills || courseCtx.currentModule?.skills || [],
                            essentialQuestions: courseCtx.currentModule?.essentialQuestions || [],
                            aiInstructionModel: courseCtx.pathway.aiInstructionModel || null
                        };
                        console.log(`📚 [Course] Loaded context for ${courseSession.courseName} — module: ${courseSession.currentModuleId}`);
                    }
                }
            } catch (courseErr) {
                console.warn('[Chat] Could not load course session context:', courseErr.message);
            }
        }

        // Inject few-shot examples for new conversations to teach visual command usage
        formattedMessagesForLLM = injectFewShotExamples(formattedMessagesForLLM);

        // Build grading context (only include if there are recent results)
        const gradingContext = recentGradingResults && recentGradingResults.length > 0 ? recentGradingResults : null;

        // Use dedicated course prompt when in course mode, generic prompt otherwise
        let systemPrompt;
        let courseScaffoldCtx = null; // Captured for step-context reminder below

        if (!systemPrompt && conversationContextForPrompt?.courseSession && !masteryContext) {
            // COURSE MODE: Use the dedicated instructor-led prompt
            const courseSessionDoc = await require('../models/courseSession').findById(user.activeCourseSessionId);
            const courseCtx = courseSessionDoc ? loadCourseContext(courseSessionDoc) : null;
            if (courseCtx) {
                systemPrompt = buildCourseSystemPrompt({
                    userProfile: studentProfileForPrompt,
                    tutorProfile: currentTutor,
                    courseSession: courseSessionDoc,
                    pathway: courseCtx.pathway,
                    scaffoldData: courseCtx.scaffoldData,
                    currentModule: courseCtx.currentModule,
                    resourceContext
                });
                // Capture scaffold info for recency-boosted reminder
                const scaffold = courseCtx.scaffoldData?.scaffold || [];
                if (scaffold.length > 1) {
                    courseScaffoldCtx = {
                        stepIdx: courseSessionDoc.currentScaffoldIndex || 0,
                        totalSteps: scaffold.length,
                        stepTitle: scaffold[courseSessionDoc.currentScaffoldIndex || 0]?.title
                    };
                }
            } else {
                systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor, null, 'student', curriculumContext, uploadContext, masteryContext, likedMessages, fluencyContext, conversationContextForPrompt, teacherAISettings, gradingContext, errorPatterns, resourceContext, message, formattedMessagesForLLM);
            }
        }

        if (!systemPrompt) {
            systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor, null, 'student', curriculumContext, uploadContext, masteryContext, likedMessages, fluencyContext, conversationContextForPrompt, teacherAISettings, gradingContext, errorPatterns, resourceContext, message, formattedMessagesForLLM);
        }

        // ── Inject step-context reminder into last user message ──
        // System prompt fades in long conversations. Appending a brief
        // reminder to the last user message keeps the scaffold tag
        // instruction in the AI's attention window.
        if (courseScaffoldCtx?.stepTitle && formattedMessagesForLLM.length > 0) {
            const lastMsg = formattedMessagesForLLM[formattedMessagesForLLM.length - 1];
            if (lastMsg?.role === 'user') {
                lastMsg.content += `\n\n[STEP ${courseScaffoldCtx.stepIdx + 1}/${courseScaffoldCtx.totalSteps}: "${courseScaffoldCtx.stepTitle}" — emit <SCAFFOLD_ADVANCE> when complete, before discussing the next topic.]`;
            }
        }

        // Check if client wants streaming (via query parameter)
        const useStreaming = req.query.stream === 'true';

        // =====================================================
        // TUTORING PIPELINE
        // observe → diagnose → decide → generate → verify → persist
        // =====================================================
        const aiStartTime = Date.now();
        let clientDisconnected = false;

        // Set up streaming if requested
        if (useStreaming) {
            console.log('📡 Streaming mode activated');
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Prevent proxy/ISP buffering (Nginx, Spectrum, etc.)
            res.flushHeaders();
            req.on('close', () => { clientDisconnected = true; });
        }

        // Determine if student has recent uploads (for observe stage)
        const hasRecentUpload = recentUploads && recentUploads.length > 0 &&
            recentUploads.some(u => {
                const daysAgo = Math.floor((Date.now() - new Date(u.uploadedAt)) / (1000 * 60 * 60 * 24));
                return daysAgo <= 1;
            });

        // Run the 6-stage pipeline with direct-LLM fallback
        let pipelineResult;
        try {
            // Map mastery badge to pipeline's activeSkill format
            const activeSkill = masteryContext ? {
                skillId: masteryContext.skillId,
                displayName: masteryContext.badgeName || masteryContext.skillId,
                teachingGuidance: null, // Pulled from skill library by decide stage if needed
            } : null;

            pipelineResult = await runPipeline(message, {
                user,
                conversation: activeConversation,
                systemPrompt,
                formattedMessages: formattedMessagesForLLM,
                activeSkill,
                phaseState: activeConversation.phaseState || null,
                hasRecentUpload,
                stream: useStreaming,
                res: useStreaming ? res : null,
                aiProcessingStartTime: aiStartTime,
            });
        } catch (pipelineError) {
            // Pipeline failed — fall back to direct LLM call so student always gets a response
            console.error('[Pipeline] FALLBACK triggered:', pipelineError.message);

            const fallbackMessages = [
                { role: 'system', content: systemPrompt },
                ...formattedMessagesForLLM,
            ];

            let fallbackText;
            try {
                const completion = await callLLM(PRIMARY_CHAT_MODEL, fallbackMessages, {
                    temperature: 0.5,
                    max_tokens: 1200,
                });
                fallbackText = completion.choices[0]?.message?.content?.trim()
                    || "I'm sorry, I had a hiccup! Could you say that again?";
            } catch (llmError) {
                console.error('[Pipeline] Fallback LLM also failed:', llmError.message);
                fallbackText = "I'm having trouble thinking right now. Could you try sending that again in a moment?";
            }

            // Run verify on fallback response (anti-cheat + LaTeX normalization)
            try {
                const fallbackVerified = await pipelineVerify(fallbackText, {
                    userId: user._id?.toString(),
                    userMessage: message,
                    iepReadingLevel: user.iepPlan?.readingLevel || null,
                    firstName: user.firstName,
                    isStreaming: false,
                });
                fallbackText = fallbackVerified.text;
                if (fallbackVerified.flags.length > 0) {
                    console.log(`[Pipeline] Fallback verify: ${fallbackVerified.flags.join(', ')}`);
                }
            } catch (verifyErr) {
                console.error('[Pipeline] Fallback verify failed (using unverified):', verifyErr.message);
            }

            // Minimal conversation save so the message isn't lost
            try {
                activeConversation.messages.push({ role: 'user', content: message });
                activeConversation.messages.push({ role: 'assistant', content: fallbackText });
                activeConversation.lastActivity = new Date();
                await activeConversation.save();
            } catch (saveErr) {
                console.error('[Pipeline] Fallback conversation save failed:', saveErr.message);
            }

            pipelineResult = {
                text: fallbackText,
                xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
                visualCommands: null,
                drawingSequence: null,
                boardContext: null,
                iepGoalUpdates: [],
                problemResult: null,
                sessionStats: null,
                tutorsUnlocked: null,
                avatarBuilderUnlocked: false,
                leveledUp: false,
                gamification: null,
                aiTimeUsed: null,
                freeWeeklySecondsRemaining: null,
                _pipeline: { fallback: true, error: pipelineError.message },
            };
        }

        let aiResponseText = pipelineResult.text;

        // NOTE: Anti-cheat, reading level, visual commands, tag extraction,
        // XP, skill tracking, IEP goals, and conversation save are all
        // handled inside the pipeline's verify + persist stages.
        // When fallback is active, only the conversation save above runs.

        // ── Fire-and-forget post-pipeline tasks ──

        // Smart auto-naming (update session name if still generic)
        const { smartAutoName } = require('../services/chatService');
        smartAutoName(activeConversation._id).catch(err =>
            console.error('[Chat] Smart auto-name failed:', err)
        );

        // Quest system update
        if (pipelineResult.problemResult) {
            updateQuestProgress(user._id, pipelineResult.problemResult === 'correct', activeConversation.currentTopic).catch(err => {
                console.error('[Quest] Failed to update quest progress:', err.message);
            });
        }

        // Course scaffold progression (complex, stays in chat.js for now)
        let courseProgressUpdate = pipelineResult.courseProgressUpdate;
        if (user.activeCourseSessionId && conversationContextForPrompt?.courseSession) {
            try {
                const CourseSessionModel = require('../models/courseSession');
                const hasScaffoldAdvance = /<\s*SCAFFOLD_ADVANCE\s*>/i.test(pipelineResult.text);
                const hasModuleComplete = /<\s*MODULE_COMPLETE\s*>/i.test(pipelineResult.text);

                if (hasScaffoldAdvance || hasModuleComplete) {
                    const csDoc = await CourseSessionModel.findById(user.activeCourseSessionId);
                    if (csDoc && csDoc.status === 'active') {
                        const courseCtx = loadCourseContext(csDoc);
                        const totalSteps = courseCtx?.scaffoldData?.scaffold?.length || 1;
                        const currentIdx = csDoc.currentScaffoldIndex || 0;
                        const mod = csDoc.modules.find(m => m.moduleId === csDoc.currentModuleId);

                        if (hasModuleComplete && mod) {
                            mod.status = 'completed';
                            mod.scaffoldProgress = 100;
                            mod.completedAt = new Date();
                            const modIdx = csDoc.modules.findIndex(m => m.moduleId === csDoc.currentModuleId);
                            if (modIdx >= 0 && modIdx < csDoc.modules.length - 1) {
                                const nextMod = csDoc.modules[modIdx + 1];
                                if (nextMod.status === 'locked') nextMod.status = 'available';
                                nextMod.startedAt = new Date();
                                csDoc.currentModuleId = nextMod.moduleId;
                            }
                            csDoc.currentScaffoldIndex = 0;
                            csDoc.overallProgress = calculateOverallProgress(csDoc.modules);
                            const doneCount = csDoc.modules.filter(m => m.status === 'completed').length;
                            if (doneCount === csDoc.modules.length) {
                                csDoc.status = 'completed';
                                csDoc.completedAt = new Date();
                            }
                            csDoc.markModified('modules');
                            await csDoc.save();
                            courseProgressUpdate = {
                                event: 'module_complete',
                                moduleId: mod.moduleId,
                                overallProgress: csDoc.overallProgress,
                                nextModuleId: csDoc.currentModuleId,
                                courseComplete: csDoc.status === 'completed',
                            };
                        } else if (hasScaffoldAdvance && mod) {
                            const newIdx = Math.min(currentIdx + 1, totalSteps - 1);
                            csDoc.currentScaffoldIndex = newIdx;
                            mod.scaffoldProgress = Math.round((newIdx / totalSteps) * 100);
                            if (mod.status === 'available') { mod.status = 'in_progress'; mod.startedAt = mod.startedAt || new Date(); }
                            csDoc.overallProgress = calculateOverallProgress(csDoc.modules);
                            csDoc.markModified('modules');
                            await csDoc.save();
                            const nextStep = courseCtx?.scaffoldData?.scaffold?.[newIdx];
                            courseProgressUpdate = {
                                event: 'scaffold_advance',
                                scaffoldIndex: newIdx,
                                scaffoldTotal: totalSteps,
                                scaffoldProgress: mod.scaffoldProgress,
                                overallProgress: csDoc.overallProgress,
                                stepTitle: nextStep?.title || null,
                            };
                        }
                    }
                }
            } catch (courseErr) {
                console.error('[Course] Scaffold progression error:', courseErr.message);
            }
        }

        // ── Build IEP features for frontend ──
        const accom = user.iepPlan?.accommodations;
        const iepFeatures = accom ? {
            autoReadAloud: accom.audioReadAloud || false,
            showCalculator: accom.calculatorAllowed || false,
            useHighContrast: accom.largePrintHighContrast || false,
            extendedTimeMultiplier: accom.extendedTime ? 1.5 : 1.0,
            mathAnxietySupport: accom.mathAnxietySupport || false,
            chunkedAssignments: accom.chunkedAssignments || false,
            reducedDistraction: accom.reducedDistraction || false,
            breaksAsNeeded: accom.breaksAsNeeded || false,
            digitalMultiplicationChart: accom.digitalMultiplicationChart || false,
            customAccommodations: accom.custom || [],
            readingLevel: user.iepPlan?.readingLevel || null,
            preferredScaffolds: user.iepPlan?.preferredScaffolds || [],
        } : null;

        // ── Build response from pipeline result ──
        const xpForCurrentLevelStart = BRAND_CONFIG.cumulativeXpForLevel(user.level);
        const userXpInCurrentLevel = Math.max(0, user.xp - xpForCurrentLevelStart);

        const responseData = {
            text: aiResponseText,
            userXp: userXpInCurrentLevel,
            userLevel: user.level,
            xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level),
            voiceId: currentTutor.voiceId,
            newlyUnlockedTutors: pipelineResult.tutorsUnlocked,
            avatarBuilderUnlocked: pipelineResult.avatarBuilderUnlocked || false,
            drawingSequence: pipelineResult.drawingSequence,
            visualCommands: pipelineResult.visualCommands,
            boardContext: pipelineResult.boardContext,
            iepFeatures,
            iepGoalUpdates: pipelineResult.iepGoalUpdates?.length > 0 ? pipelineResult.iepGoalUpdates : null,
            problemResult: pipelineResult.problemResult,
            sessionStats: pipelineResult.sessionStats,
            xpLadder: {
                ...pipelineResult.xpBreakdown,
                leveledUp: pipelineResult.leveledUp,
            },
            aiTimeUsed: pipelineResult.aiTimeUsed,
            freeWeeklySecondsRemaining: pipelineResult.freeWeeklySecondsRemaining,
            courseProgress: courseProgressUpdate || null,
            suggestions: pipelineResult.suggestions || null,
            gamification: pipelineResult.gamification || null,
            nextActions: pipelineResult.nextActions || [],
            reviewSummary: pipelineResult.reviewSummary || null,
            _pipeline: pipelineResult._pipeline,
        };

        if (useStreaming) {
            if (!clientDisconnected) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
                    res.end();
                } catch (writeErr) {
                    console.error('[Stream] Failed to send completion event:', writeErr.message);
                }
            }
        } else {
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

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ error: 'Message content is required.' });
        }
        parentConversation.messages.push({ role: 'user', content: message.trim() });

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
                // Only include performance line when we have actual tracked data.
                // When problemsAttempted is 0 it means tracking didn't capture data,
                // NOT that the student didn't try. Omit to prevent false conclusions.
                const performanceLine = session.problemsAttempted > 0
                    ? `- Performance: ${session.problemsCorrect || 0}/${session.problemsAttempted} correct (${Math.round((session.problemsCorrect || 0) / session.problemsAttempted * 100)}%)`
                    : '';
                const struggle = session.strugglingWith || '';
                const summary = session.summary || '';

                return `SESSION ${idx + 1} (${date}${duration ? ', ' + duration : ''}):
${topic ? `- Topic: ${topic}` : ''}
${performanceLine}
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
        if (accom.reducedDistraction) accommodations.push('Reduced Distraction');
        if (accom.breaksAsNeeded) accommodations.push('Breaks As Needed');
        if (accom.digitalMultiplicationChart) accommodations.push('Digital Multiplication Chart');
        if (accom.largePrintHighContrast) accommodations.push('Large Print/High Contrast');

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
7. NEVER interpret missing problem statistics as a lack of effort, motivation, or engagement. If a session has no Performance line, it means our tracking system didn't capture the data — the student was still learning and working. Do NOT suggest the student is unmotivated, disengaged, or needs intervention based on missing stats.

SPECIAL REQUESTS:
- If parent asks to "teach me" or "explain the concept": Teach them the math topic from the SESSION DATA at a beginner level. Use simple examples, step-by-step explanations, and relatable analogies. Make it practical so they can help their child. IMPORTANT: Teach ONE step at a time, then check in before continuing (see CONVERSATIONAL TURN-TAKING below).
- If parent asks about "help at home": Give specific, actionable activities like practice problems, real-world applications, or study tips based on what ${childName} is learning.
- If parent asks about "struggles": Be honest but constructive. Explain WHY a concept might be challenging and suggest how to address it.

CONVERSATIONAL TURN-TAKING (CRITICAL):
This is a CONVERSATION, not a lecture. Follow these rules strictly:

1. ONE CONCEPT PER MESSAGE: Cover one idea, one step, or one piece of information per response. Do NOT pack multiple topics into a single message.
2. KEEP IT SHORT: Maximum 2-3 sentences per response. Think text message, not email. If you need to explain something complex, break it across multiple exchanges.
3. ASK BEFORE CONTINUING: After sharing a piece of information, check in: "Want me to explain that more?" or "Should I show you how to practice that at home?" or "Any questions about that?" — then WAIT for their response.
4. NO LONG BLOCKS: Never send walls of text. No bullet-point dumps. No numbered lists with 5+ items. If you have multiple things to share, give ONE, then ask if they want more.
5. BACK AND FORTH: This should feel like chatting with a teacher at a conference table, not reading a report. Short exchanges, natural flow.
6. LAYERED INFORMATION: Start with the key takeaway, then offer to go deeper. Don't front-load everything.

EXAMPLE - CORRECT (teaching a parent):
Message 1: "${childName} has been working on multiplying fractions. Want me to walk you through it so you can help at home?"
[WAIT FOR PARENT]
Message 2: "The trick is multiply straight across — tops times tops, bottoms times bottoms. So 2/3 × 1/4 = 2/12."
[WAIT FOR PARENT]
Message 3: "Then simplify: 2/12 = 1/6. Want to try one together?"

EXAMPLE - WRONG (DO NOT DO THIS):
"${childName} has been working on fractions. Here's everything you need to know: First, to multiply fractions you multiply the numerators and denominators. For example, 2/3 × 1/4 = 2/12 = 1/6. To add fractions, find a common denominator first. For example, 1/3 + 1/4: the LCD is 12, so 4/12 + 3/12 = 7/12. To divide fractions, flip the second fraction and multiply..."
❌ Way too much at once — information overload

TONE:
- Be yourself (${tutorName}) but slightly more professional for a parent conversation
- Be warm, approachable, and conversational — not formal or stiff
- Keep responses SHORT (2-3 sentences max) and let the conversation flow naturally
- Be honest about challenges while staying encouraging
- Give specific, actionable suggestions for home practice
- Sound like a real teacher at a conference, not a generated report

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
                { summary: { $exists: true, $nin: [null, ''] } },
                { currentTopic: { $exists: true, $nin: [null, ''] } },
                { strugglingWith: { $exists: true, $nin: [null, ''] } }
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

        // Reuse the current active conversation if it's recent and not a
        // course/mastery session. This prevents duplicate conversations when
        // the student refreshes the page or the frontend re-sends the greeting.
        // Demo clones always start fresh — their pre-seeded conversations are
        // for teacher/parent dashboard views, not the student's own chat.
        let activeConversation = null;
        const REUSE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

        if (user.activeConversationId && !user.isDemoClone) {
            const existing = await Conversation.findById(user.activeConversationId);
            if (
                existing &&
                existing.isActive &&
                !existing.isMastery &&
                existing.conversationType !== 'course' &&
                (Date.now() - new Date(existing.lastActivity || existing.startDate).getTime()) < REUSE_WINDOW_MS
            ) {
                // Recent, non-course, non-mastery conversation — reuse it
                activeConversation = existing;
            }
        }

        if (!activeConversation) {
            activeConversation = new Conversation({ userId: user._id, messages: [], isMastery: false });
            user.activeConversationId = activeConversation._id;
            await user.save();
        }

        // If we reused an existing conversation that already has an AI greeting,
        // return that greeting instead of generating (and saving) a duplicate.
        if (activeConversation.messages && activeConversation.messages.length > 0) {
            const lastAiMsg = [...activeConversation.messages]
                .reverse()
                .find(m => m.role === 'assistant');
            if (lastAiMsg) {
                const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId] ? user.selectedTutorId : "default";
                const currentTutor = TUTOR_CONFIG[selectedTutorKey];

                // Update lastActivity so subsequent reuse checks stay fresh
                await Conversation.findByIdAndUpdate(activeConversation._id, { lastActivity: new Date() });

                const useStreaming = req.query.stream === 'true';
                if (useStreaming) {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.setHeader('X-Accel-Buffering', 'no');
                    res.flushHeaders();
                    res.write(`data: ${JSON.stringify({ chunk: lastAiMsg.content })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, voiceId: currentTutor.voiceId, isGreeting: true })}\n\n`);
                    return res.end();
                }
                return res.json({
                    text: lastAiMsg.content,
                    voiceId: currentTutor.voiceId,
                    isGreeting: true,
                    userXp: user.xp || 0,
                    userLevel: user.level || 1,
                    xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level || 1)
                });
            }
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

        // Check if user is in an active course session.
        // skipCourse is set when the user explicitly chose a fresh general session —
        // in that case we must not hijack the conversation into course mode.
        const skipCourse = req.body?.skipCourse === true;
        let courseContext = null;
        let isCourseGreeting = false;
        if (user.activeCourseSessionId && !skipCourse) {
            try {
                const CourseSession = require('../models/courseSession');
                const courseSession = await CourseSession.findById(user.activeCourseSessionId);
                if (courseSession && courseSession.status === 'active') {
                    const ctx = loadCourseContext(courseSession);
                    if (ctx) {
                        courseContext = { courseSession, ...ctx };
                        isCourseGreeting = true;

                        // Switch to the course's conversation so the greeting lands there
                        if (courseSession.conversationId) {
                            const courseConv = await Conversation.findById(courseSession.conversationId);
                            if (courseConv) {
                                activeConversation = courseConv;
                                if (user.activeConversationId?.toString() !== courseConv._id.toString()) {
                                    user.activeConversationId = courseConv._id;
                                    await user.save();
                                }
                            }
                        }
                    }
                }
            } catch (courseErr) {
                console.warn('[Greeting] Could not load course context:', courseErr.message);
            }
        }

        let systemPrompt;
        let greetingInstruction;
        let maxTokens = 150;

        if (isCourseGreeting && courseContext) {
            // COURSE MODE: Use dedicated course prompt
            systemPrompt = buildCourseSystemPrompt({
                userProfile: user.toObject(),
                tutorProfile: currentTutor,
                courseSession: courseContext.courseSession,
                pathway: courseContext.pathway,
                scaffoldData: courseContext.scaffoldData,
                currentModule: courseContext.currentModule
            });
            greetingInstruction = buildCourseGreetingInstruction({
                userProfile: user.toObject(),
                courseSession: courseContext.courseSession,
                pathway: courseContext.pathway,
                scaffoldData: courseContext.scaffoldData,
                currentModule: courseContext.currentModule
            });
            maxTokens = 800; // Course greetings include teaching content
            console.log(`[Greeting] Course mode: ${courseContext.courseSession.courseName}, module: ${courseContext.courseSession.currentModuleId}`);
        } else {
            // GENERAL TUTORING MODE: Build greeting with full student context

            // Build mastery context for greeting (same as regular chat)
            const greetingMasteryContext = user.masteryProgress?.activeBadge ? {
                mode: 'badge-earning',
                badgeName: user.masteryProgress.activeBadge.badgeName,
                skillId: user.masteryProgress.activeBadge.skillId,
                tier: user.masteryProgress.activeBadge.tier,
                problemsCompleted: user.masteryProgress.activeBadge.problemsCompleted || 0,
                problemsCorrect: user.masteryProgress.activeBadge.problemsCorrect || 0,
                requiredProblems: user.masteryProgress.activeBadge.requiredProblems,
                requiredAccuracy: user.masteryProgress.activeBadge.requiredAccuracy
            } : null;

            // Build fluency context for greeting (same as regular chat)
            let greetingFluencyContext = null;
            if (user.fluencyProfile) {
                const avgFluencyZScore = user.fluencyProfile.averageFluencyZScore || 0;
                const speedLevel = avgFluencyZScore < -1.0 ? 'fast'
                                : avgFluencyZScore > 1.0 ? 'slow'
                                : 'normal';
                greetingFluencyContext = {
                    fluencyZScore: avgFluencyZScore,
                    speedLevel,
                    readSpeedModifier: user.learningProfile?.fluencyBaseline?.readSpeedModifier || 1.0,
                    iepExtendedTime: user.iepPlan?.accommodations?.extendedTime || false
                };
            }

            systemPrompt = generateSystemPrompt(user.toObject(), currentTutor, null, 'student', null, null, greetingMasteryContext, [], greetingFluencyContext, null);

            // Check if we should offer Starting Point in this greeting (only once, ever)
            const shouldOfferStartingPoint = !user.startingPointOffered && !user.assessmentCompleted;

            // Build grade-appropriate warm-up examples
            const gradeStr = user.gradeLevel ? String(user.gradeLevel).toLowerCase().replace(/[^0-9k]/g, '') : '';
            const gradeNum = gradeStr === 'k' ? 0 : parseInt(gradeStr) || 6;
            let warmUpExamples;
            if (gradeNum <= 3) {
                warmUpExamples = '"Quick warm-up: what\'s 3 × 7?" or "Let\'s start easy: what\'s 15 + 28?"';
            } else if (gradeNum <= 5) {
                warmUpExamples = '"Quick warm-up: what\'s 3/4 + 1/4?" or "What\'s 12 × 15?"';
            } else if (gradeNum <= 7) {
                warmUpExamples = '"Quick warm-up: what\'s 20% of 80?" or "Simplify: 3x + 5x"';
            } else if (gradeNum <= 9) {
                warmUpExamples = '"Quick warm-up: solve for x: 2x + 3 = 11" or "What\'s the slope of y = 3x - 5?"';
            } else {
                warmUpExamples = '"Quick warm-up: what\'s the derivative of x²?" or "Factor: x² - 9"';
            }
            // If the student has a specific math course, mention it for extra clarity
            const courseHint = user.mathCourse ? ` The student is taking ${user.mathCourse} — make sure the warm-up is relevant to that level, not below it.` : '';

            greetingInstruction = `The student just opened the chat. They haven't typed anything yet - YOU are initiating the conversation. The following is context about them (not something they said). Greet them naturally and briefly based on this context. Don't repeat back their info - just use it to personalize. Keep it to 1-2 sentences. Be casual like texting. If they're new, introduce yourself briefly. If returning, welcome back. If they have incomplete work, mention it casually.

IMPORTANT: Always end your greeting by asking the student a question or giving them something to respond to — for example, ask what they'd like to work on, reference something from last session, or ask how their day is going. You MAY optionally include a quick warm-up question to build momentum, but only if it feels natural — don't force it. If you do include a warm-up, make sure it matches their grade level and course. For example: ${warmUpExamples}${courseHint} NEVER give a warm-up question that is far below the student's grade level or course — that feels insulting and wastes their time.`;

            // Add Starting Point offer (only on first session, never again)
            if (shouldOfferStartingPoint) {
                greetingInstruction += `

IMPORTANT: This is the student's first session. After your greeting, casually mention the "Starting Point" button in the sidebar. Say something like: "Oh, and when you're ready, hit that glowing Starting Point button on the left — it's a quick quiz to figure out where you're at so I can help you better. It's not a test you can fail, it just helps me know what to focus on. No rush though!"

Keep it casual and low-pressure. Don't make it sound like a test they need to take right now. Just let them know it's there when they're ready. Emphasize it's NOT a pass/fail test — just a way to personalize their experience.`;
            }
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
            res.setHeader('X-Accel-Buffering', 'no'); // Prevent proxy/ISP buffering (Nginx, Spectrum, etc.)
            res.flushHeaders();

            try {
                const stream = await callLLMStream(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.55, max_tokens: maxTokens });
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

                // IEP reading level enforcement (post-stream)
                let greetingText = fullResponse.trim();
                const greetingIepLevel = user.iepPlan?.readingLevel || null;
                if (greetingIepLevel) {
                    const readCheck = checkReadingLevel(greetingText, greetingIepLevel);
                    if (!readCheck.passes) {
                        console.log(
                            `[Greeting] Reading level violation: response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
                        );
                        try {
                            const simplifyPrompt = buildSimplificationPrompt(greetingText, readCheck.targetGrade, user.firstName || 'the student');
                            const simplified = await callLLM(PRIMARY_CHAT_MODEL, [{ role: 'system', content: simplifyPrompt }], {
                                temperature: 0.3, max_tokens: maxTokens
                            });
                            const simplifiedText = simplified.choices[0]?.message?.content?.trim();
                            if (simplifiedText && simplifiedText.length > 20) {
                                greetingText = simplifiedText;
                                res.write(`data: ${JSON.stringify({ type: 'replacement', content: greetingText })}\n\n`);
                                console.log(`[Greeting] Response simplified to target Grade ${readCheck.targetGrade}`);
                            }
                        } catch (err) {
                            console.error('[Greeting] Simplification failed:', err.message);
                        }
                    }
                }

                // Save greeting to conversation (AI message only, no user message)
                activeConversation.messages.push({
                    role: 'assistant',
                    content: greetingText,
                    timestamp: new Date()
                });
                activeConversation.lastActivity = new Date();
                await activeConversation.save();

                // Mark Starting Point as offered (only do this once, ever)
                if (!isCourseGreeting && !user.startingPointOffered && !user.assessmentCompleted) {
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
            const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.8, max_tokens: maxTokens });
            let greetingText = completion.choices[0].message.content.trim();

            // IEP reading level enforcement
            const nsGreetingIepLevel = user.iepPlan?.readingLevel || null;
            if (nsGreetingIepLevel) {
                const readCheck = checkReadingLevel(greetingText, nsGreetingIepLevel);
                if (!readCheck.passes) {
                    console.log(
                        `[Greeting] Reading level violation: response at Grade ${readCheck.responseGrade}, target Grade ${readCheck.targetGrade}`
                    );
                    try {
                        const simplifyPrompt = buildSimplificationPrompt(greetingText, readCheck.targetGrade, user.firstName || 'the student');
                        const simplified = await callLLM(PRIMARY_CHAT_MODEL, [{ role: 'system', content: simplifyPrompt }], {
                            temperature: 0.3, max_tokens: maxTokens
                        });
                        const simplifiedText = simplified.choices[0]?.message?.content?.trim();
                        if (simplifiedText && simplifiedText.length > 20) {
                            greetingText = simplifiedText;
                            console.log(`[Greeting] Response simplified to target Grade ${readCheck.targetGrade}`);
                        }
                    } catch (err) {
                        console.error('[Greeting] Simplification failed:', err.message);
                    }
                }
            }

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
            if (!isCourseGreeting && !user.startingPointOffered && !user.assessmentCompleted) {
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
                xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level || 1)
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