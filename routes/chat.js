// Forcing a file update for Git

// routes/chat.js

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
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
const { updateFluencyTracking, evaluateResponseTime, calculateAdaptiveTimeLimit } = require('../utils/adaptiveFluency');
const { processAIResponse } = require('../utils/chatBoardParser');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective teaching model (GPT-4o-mini)
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

router.post('/', isAuthenticated, async (req, res) => {
    const { message, role, childId, responseTime } = req.body;
const userId = req.user?._id;
if (!message) return res.status(400).json({ message: "Message is required." });
 if (message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Message too long.` });

    // Log response time if provided (from ghost timer)
    if (responseTime) {
        console.log(`[Fluency] User ${userId} responded in ${responseTime.toFixed(1)}s`);
    }

    // Handle parent chat separately
    if (role === 'parent' && childId) {
        return handleParentChat(req, res, userId, childId, message);
    }

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

        // Fetch curriculum context if student has a teacher
        let curriculumContext = null;
        if (user.teacherId) {
            try {
                const curriculum = await Curriculum.getActiveCurriculum(user.teacherId);
                if (curriculum && curriculum.autoSyncWithAI) {
                    curriculumContext = curriculum.getAIContext();
                }
            } catch (error) {
                console.error('Error fetching curriculum context:', error);
                // Continue without curriculum context if there's an error
            }
        }

        // Detect and fetch teacher resource if mentioned in message
        let resourceContext = null;
        if (user.teacherId) {
            try {
                const detectedResource = await detectAndFetchResource(user.teacherId, message);
                if (detectedResource) {
                    console.log(`📚 Resource detected and fetched: ${detectedResource.displayName}`);
                    resourceContext = detectedResource;
                }
            } catch (error) {
                console.error('Error detecting/fetching resource:', error);
                // Continue without resource context if there's an error
            }
        }

        // Fetch recent student uploads for AI context (personalization)
        let uploadContext = null;
        try {
            const recentUploads = await StudentUpload.find({ userId: user._id })
                .sort({ uploadedAt: -1 })
                .limit(5)
                .select('originalFilename extractedText uploadedAt fileType')
                .lean();

            if (recentUploads && recentUploads.length > 0) {
                // Build a context summary of recent uploads
                const uploadsSummary = recentUploads.map((upload, idx) => {
                    const daysAgo = Math.floor((Date.now() - new Date(upload.uploadedAt)) / (1000 * 60 * 60 * 24));
                    const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

                    // Include excerpt of extracted text (first 200 chars)
                    const textExcerpt = upload.extractedText ?
                        upload.extractedText.substring(0, 200) + (upload.extractedText.length > 200 ? '...' : '') :
                        '';

                    return `${idx + 1}. "${upload.originalFilename}" (${upload.fileType}, uploaded ${timeStr})${textExcerpt ? `\n   Content excerpt: "${textExcerpt}"` : ''}`;
                }).join('\n');

                uploadContext = {
                    count: recentUploads.length,
                    summary: uploadsSummary
                };

                console.log(`📁 Injected ${recentUploads.length} recent uploads into AI context`);
            }
        } catch (error) {
            console.error('Error fetching student uploads for context:', error);
            // Continue without upload context if there's an error
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

        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor, null, 'student', curriculumContext, uploadContext, masteryContext, likedMessages, fluencyContext, conversationContextForPrompt);
        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...formattedMessagesForLLM];

        // Check if client wants streaming (via query parameter)
        const useStreaming = req.query.stream === 'true';

        let aiResponseText = '';

        if (useStreaming) {
            // STREAMING MODE: Use Server-Sent Events for real-time response
            console.log('📡 Streaming mode activated');

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            try {
                const stream = await callLLMStream(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });

                // Buffer to collect the complete response for database storage
                let fullResponseBuffer = '';

                // Stream chunks to client as they arrive
                // Handle both Claude and OpenAI streaming formats
                const isClaudeModel = PRIMARY_CHAT_MODEL.startsWith('claude-');

                for await (const chunk of stream) {
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

            // Security: Cap at max tier 3 amount
            xpBreakdown.tier3 = Math.min(rawAmount, xpLadder.maxTier3PerTurn);
            xpBreakdown.tier3Behavior = behavior;
            aiResponseText = aiResponseText.replace(coreBehaviorMatch[0], '').trim();

            console.log(`🎖️ [XP Tier 3] Core Behavior: +${xpBreakdown.tier3} XP for "${behavior}"`);
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
            console.error(`🚨 SAFETY CONCERN - User ${userId} (${user.firstName} ${user.lastName}) - ${safetyConcernMatch[1]}`);
            aiResponseText = aiResponseText.replace(safetyConcernMatch[0], '').trim();
            // TODO: Consider sending alert email to admin or incrementing warning counter on user
        }

        // SKILL MASTERY TRACKING: Parse AI skill progression tags
        const skillMasteredMatch = aiResponseText.match(/<SKILL_MASTERED:([^>]+)>/);
        if (skillMasteredMatch) {
            const skillId = skillMasteredMatch[1].trim();
            user.skillMastery = user.skillMastery || new Map();
            user.skillMastery.set(skillId, {
                status: 'mastered',
                masteryScore: 1.0,
                masteredDate: new Date(),
                notes: 'AI-determined mastery through conversation'
            });

            // Add to recent wins
            if (!user.learningProfile.recentWins) {
                user.learningProfile.recentWins = [];
            }
            const displayName = skillId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            user.learningProfile.recentWins.unshift({
                skill: skillId,
                description: `Mastered ${displayName}`,
                date: new Date()
            });
            // Keep only last 10 wins
            user.learningProfile.recentWins = user.learningProfile.recentWins.slice(0, 10);

            user.markModified('skillMastery');
            user.markModified('learningProfile');
            aiResponseText = aiResponseText.replace(skillMasteredMatch[0], '').trim();

            console.log(`✓ Student ${user.firstName} mastered skill: ${skillId}`);
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

        // Check for level up
        let xpForNextLevel = (user.level || 1) * BRAND_CONFIG.xpPerLevel;
        let leveledUp = false;
        if (user.xp >= xpForNextLevel) {
            user.level += 1;
            leveledUp = true;
        }

        const tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
        if (tutorsJustUnlocked.length > 0) {
            user.unlockedItems.push(...tutorsJustUnlocked);
            user.markModified('unlockedItems');
        }

        await user.save();

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
            xpNeeded: xpForNextLevel,
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
            }
        };

        if (useStreaming) {
            // Send final metadata as 'complete' event
            res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
            res.end();
        } else {
            // Non-streaming: send as regular JSON
            res.json(responseData);
        }

    } catch (error) {
        console.error("ERROR: Chat route failed:", error);
        res.status(500).json({ message: "An internal server error occurred." });
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

        // Build system prompt for parent-teacher conference
        const systemPrompt = generateParentTeacherPrompt(child, recentSessions, curriculumContext, parent);

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
            voiceId: "default",
            newlyUnlockedTutors: [],
            drawingSequence: null
        });

    } catch (error) {
        console.error("ERROR: Parent chat failed:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
}

// Generate system prompt for parent-teacher conference
function generateParentTeacherPrompt(child, recentSessions, curriculumContext, parent) {
    const childName = `${child.firstName} ${child.lastName}`;
    const parentName = `${parent.firstName} ${parent.lastName}`;

    let prompt = `You are a knowledgeable, supportive math teacher having a conference with a parent.

PARENT: ${parentName}
STUDENT: ${childName}
Grade: ${child.gradeLevel || 'Not specified'}
Math Course: ${child.mathCourse || 'Not specified'}

STUDENT PROFILE:
- Current Level: ${child.level || 1}
- Total XP: ${child.xp || 0}
- Total Active Learning Time: ${child.totalActiveTutoringMinutes || 0} minutes
`;

    // Add IEP information if available
    if (child.iepPlan) {
        prompt += `\nIEP ACCOMMODATIONS:\n`;
        const accom = child.iepPlan.accommodations || {};
        if (accom.extendedTime) prompt += `- Extended time on assignments\n`;
        if (accom.calculatorAllowed) prompt += `- Calculator permitted\n`;
        if (accom.audioReadAloud) prompt += `- Audio read-aloud support\n`;
        if (accom.chunkedAssignments) prompt += `- Assignments broken into smaller chunks\n`;
        if (accom.mathAnxietySupport) prompt += `- Math anxiety support strategies\n`;

        if (child.iepPlan.goals && child.iepPlan.goals.length > 0) {
            prompt += `\nIEP GOALS:\n`;
            child.iepPlan.goals.forEach(goal => {
                prompt += `- ${goal.description} (Status: ${goal.status}, Progress: ${goal.currentProgress || 0}%)\n`;
            });
        }
    }

    // Add recent learning activity
    if (recentSessions && recentSessions.length > 0) {
        prompt += `\nRECENT LEARNING ACTIVITY:\n`;
        recentSessions.slice(0, 5).forEach(session => {
            const topic = session.currentTopic && session.currentTopic !== 'mathematics'
                ? session.currentTopic
                : null;

            if (topic) {
                prompt += `- Topic: ${topic}`;
                if (session.problemsAttempted) {
                    prompt += ` (${session.problemsCorrect || 0}/${session.problemsAttempted} correct)`;
                }
                if (session.strugglingWith) {
                    prompt += ` - Struggling with: ${session.strugglingWith}`;
                }
                prompt += `\n`;
            }

            // Always include summary if available (provides context even when topic detection failed)
            if (session.summary) {
                prompt += `  Summary: ${session.summary}\n`;
            }
        });
    }

    // Add curriculum context
    if (curriculumContext) {
        prompt += `\nCURRENT CURRICULUM:\n${curriculumContext}\n`;
    }

    prompt += `\nYOUR ROLE:
- Discuss ${childName}'s progress, strengths, and areas for improvement
- Answer parent questions about their child's learning
- Suggest specific strategies parents can use to support their child at home
- Be encouraging but honest about challenges
- Reference specific topics and skills from their recent work
- If discussing struggles, explain them clearly and offer actionable advice
- Keep responses concise (2-3 paragraphs maximum)
- Use a warm, professional teacher tone

Focus on concrete observations from ${childName}'s actual work and provide practical, actionable guidance for ${parentName}.`;

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

        // Accumulate seconds
        user.totalActiveSeconds = (user.totalActiveSeconds || 0) + activeSeconds;
        user.weeklyActiveSeconds = (user.weeklyActiveSeconds || 0) + activeSeconds;

        // Update minutes (derived from seconds for display)
        user.totalActiveTutoringMinutes = Math.floor(user.totalActiveSeconds / 60);
        user.weeklyActiveTutoringMinutes = Math.floor(user.weeklyActiveSeconds / 60);

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

module.exports = router;