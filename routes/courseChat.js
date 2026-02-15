// routes/courseChat.js
// Dedicated chat endpoint for structured course sessions.
// Completely independent from the main /api/chat pipeline.
// Course context is REQUIRED — if it can't load, the request fails loudly.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const User = require('../models/user');
const Conversation = require('../models/conversation');
const CourseSession = require('../models/courseSession');
const { buildCourseSystemPrompt, loadCourseContext } = require('../utils/coursePrompt');
const { callLLM, callLLMStream } = require('../utils/llmGateway');
const { sendSafetyConcernAlert } = require('../utils/emailService');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const { calculateXpBoostFactor } = require('../utils/promptCompressor');
const { detectTopic } = require('../utils/activitySummarizer');
const { filterAnswerKeyResponse } = require('../utils/worksheetGuard');

const PRIMARY_CHAT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY_LENGTH = 40;

// Per-user lock to prevent concurrent course-chat processing
const courseChatLocks = new Map();
function acquireCourseLock(userId) {
    const key = userId.toString();
    if (!courseChatLocks.has(key)) {
        courseChatLocks.set(key, Promise.resolve());
    }
    let release;
    const newLock = new Promise(resolve => { release = resolve; });
    const prev = courseChatLocks.get(key);
    courseChatLocks.set(key, newLock);
    return prev.then(() => release);
}
setInterval(() => { if (courseChatLocks.size > 500) courseChatLocks.clear(); }, 10 * 60 * 1000);

// ============================================================
//  POST /api/course-chat
//  Dedicated course chat — course context is REQUIRED
// ============================================================
router.post('/', async (req, res) => {
    const userId = req.user._id;
    const releaseLock = await acquireCourseLock(userId);

    try {
        const { message, responseTime, isGreeting } = req.body;

        // ── Greeting mode: silent course intro ──────────────
        if (isGreeting) {
            releaseLock();
            return handleCourseGreeting(req, res, userId);
        }

        // ── Validate input ──────────────────────────────────
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ message: 'Message content is required.' });
        }
        const messageText = message.trim().substring(0, 2000);

        // ── Load user ───────────────────────────────────────
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // ── Load course session (REQUIRED) ──────────────────
        if (!user.activeCourseSessionId) {
            return res.status(400).json({ message: 'No active course session. Please enroll or activate a course first.' });
        }

        const courseSession = await CourseSession.findById(user.activeCourseSessionId);
        if (!courseSession || courseSession.status !== 'active') {
            return res.status(400).json({ message: 'Course session not found or inactive.' });
        }

        // ── Load pathway (REQUIRED) ─────────────────────────
        const pathwayFile = path.join(__dirname, '../public/resources', `${courseSession.courseId}-pathway.json`);
        if (!fs.existsSync(pathwayFile)) {
            return res.status(500).json({ message: `Course pathway not found: ${courseSession.courseId}` });
        }
        const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
        const isParentCourse = pathway.audience === 'parent';

        // ── Load current module (REQUIRED) ──────────────────
        const currentPathwayModule = (pathway.modules || []).find(m => m.moduleId === courseSession.currentModuleId);
        if (!currentPathwayModule) {
            return res.status(500).json({ message: `Module ${courseSession.currentModuleId} not found in pathway.` });
        }

        let moduleData = { title: currentPathwayModule.title, skills: currentPathwayModule.skills || [] };
        if (currentPathwayModule.moduleFile) {
            const moduleFile = path.join(__dirname, '../public/modules', courseSession.courseId, currentPathwayModule.moduleFile);
            if (fs.existsSync(moduleFile)) {
                moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
            }
        }

        // ── Load or create course conversation ──────────────
        let conversation;
        if (courseSession.conversationId) {
            conversation = await Conversation.findById(courseSession.conversationId);
        }
        if (!conversation) {
            // Create a fresh conversation for this course
            conversation = new Conversation({
                userId: user._id,
                conversationName: courseSession.courseName,
                topic: courseSession.courseName,
                topicEmoji: '📚',
                conversationType: 'topic'
            });
            await conversation.save();
            courseSession.conversationId = conversation._id;
            await courseSession.save();
        }
        // Always ensure it's active
        if (!conversation.isActive) {
            conversation.isActive = true;
        }

        // ── Save user message ───────────────────────────────
        conversation.messages.push({
            role: 'user',
            content: messageText,
            timestamp: new Date(),
            responseTime: responseTime || null
        });

        // ── Build message history for AI ────────────────────
        const recentMessages = conversation.messages.slice(-MAX_HISTORY_LENGTH);
        const formattedMessages = recentMessages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // ── Build system prompt ─────────────────────────────
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId : 'default';
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];

        const systemPrompt = buildCourseSystemPrompt({
            userProfile: user,
            tutorProfile: currentTutor,
            courseSession,
            pathway,
            scaffoldData: moduleData,
            currentModule: currentPathwayModule
        });

        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...formattedMessages];

        console.log(`📚 [CourseChat] ${user.firstName} → ${courseSession.courseName} / ${courseSession.currentModuleId}`);

        // ── Call AI ─────────────────────────────────────────
        const useStreaming = req.query.stream === 'true';
        let aiResponseText = '';
        const aiStartTime = Date.now();
        let clientDisconnected = false;

        if (useStreaming) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            req.on('close', () => { clientDisconnected = true; });

            try {
                const stream = await callLLMStream(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });
                let buffer = '';
                const isClaudeModel = PRIMARY_CHAT_MODEL.startsWith('claude-');

                for await (const chunk of stream) {
                    if (clientDisconnected) break;
                    let content = '';
                    if (isClaudeModel) {
                        if (chunk.type === 'content_block_delta' && chunk.delta?.text) content = chunk.delta.text;
                    } else {
                        content = chunk.choices[0]?.delta?.content || '';
                    }
                    if (content) {
                        buffer += content;
                        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
                    }
                }
                aiResponseText = buffer.trim() || "I'm not sure how to respond.";
            } catch (streamErr) {
                console.error('[CourseChat] Stream failed, falling back:', streamErr.message);
                const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });
                aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: aiResponseText })}\n\n`);
            }
        } else {
            const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 1500 });
            aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
        }

        // ── Answer-key safety filter ────────────────────────
        const answerKeyCheck = filterAnswerKeyResponse(aiResponseText, userId);
        if (answerKeyCheck.wasFiltered) {
            aiResponseText = answerKeyCheck.text;
            if (useStreaming && !clientDisconnected) {
                try { res.write(`data: ${JSON.stringify({ type: 'replacement', content: aiResponseText })}\n\n`); } catch (e) {}
            }
        }

        // ── Parse structured tags from AI response ──────────

        // XP Ladder
        const xpLadder = BRAND_CONFIG.xpLadder;
        const xpBreakdown = { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 };

        // Tier 3: Core Behavior XP
        const coreBehaviorMatch = aiResponseText.match(/<CORE_BEHAVIOR_XP:(\d+),([^>]+)>/);
        if (coreBehaviorMatch) {
            const rawAmount = parseInt(coreBehaviorMatch[1], 10);
            const behavior = coreBehaviorMatch[2].trim();
            const xpBoostInfo = calculateXpBoostFactor(user.level);
            const maxAllowed = Math.round(xpLadder.maxTier3PerTurn * xpBoostInfo.factor);
            xpBreakdown.tier3 = Math.min(Math.round(rawAmount * xpBoostInfo.factor), maxAllowed);
            xpBreakdown.tier3Behavior = behavior;
            aiResponseText = aiResponseText.replace(coreBehaviorMatch[0], '').trim();
        }

        // Safety concern
        const safetyConcernMatch = aiResponseText.match(/<SAFETY_CONCERN>([^<]+)<\/SAFETY_CONCERN>/);
        if (safetyConcernMatch) {
            console.error(`🚨 SAFETY CONCERN - User ${userId} (${user.firstName}) - ${safetyConcernMatch[1]}`);
            aiResponseText = aiResponseText.replace(safetyConcernMatch[0], '').trim();
            sendSafetyConcernAlert(
                { userId: userId.toString(), firstName: user.firstName, lastName: user.lastName, username: user.username, gradeLevel: user.gradeLevel },
                safetyConcernMatch[1], messageText
            ).catch(err => console.error('Safety alert email failed:', err));
        }

        // Skill mastery
        const skillMasteredMatch = aiResponseText.match(/<SKILL_MASTERED:([^>]+)>/);
        if (skillMasteredMatch) {
            const skillId = skillMasteredMatch[1].trim();
            user.skillMastery = user.skillMastery || new Map();
            const existing = user.skillMastery.get(skillId) || {};
            const pillars = existing.pillars || {
                accuracy: { correct: 0, total: 0, percentage: 0, threshold: 0.90 },
                independence: { hintsUsed: 0, hintsAvailable: 15, hintThreshold: 3 },
                transfer: { contextsAttempted: [], contextsRequired: 3 },
                retention: { retentionChecks: [], failed: false }
            };
            pillars.accuracy.correct += 1;
            pillars.accuracy.total += 1;
            pillars.accuracy.percentage = pillars.accuracy.correct / pillars.accuracy.total;

            const accuracyScore = Math.min(pillars.accuracy.percentage / 0.90, 1.0);
            const independenceScore = pillars.independence.hintsUsed <= pillars.independence.hintThreshold ? 1.0
                : Math.max(0, 1.0 - (pillars.independence.hintsUsed - pillars.independence.hintThreshold) * 0.15);
            const transferScore = Math.min(pillars.transfer.contextsAttempted.length / pillars.transfer.contextsRequired, 1.0);
            const masteryScore = Math.round(((accuracyScore + independenceScore + transferScore) / 3) * 100);

            const meetsAll = pillars.accuracy.percentage >= 0.90 && pillars.accuracy.total >= 3
                && pillars.independence.hintsUsed <= pillars.independence.hintThreshold
                && pillars.transfer.contextsAttempted.length >= pillars.transfer.contextsRequired;

            const newStatus = meetsAll ? 'mastered' : pillars.accuracy.total >= 2 ? 'practicing' : 'learning';

            user.skillMastery.set(skillId, { ...existing, status: newStatus, pillars, masteryScore, lastPracticed: new Date() });
            user.markModified('skillMastery');
            aiResponseText = aiResponseText.replace(skillMasteredMatch[0], '').trim();
            console.log(`📈 [CourseChat] Skill ${skillId}: ${newStatus} (${masteryScore}%)`);
        }

        // Problem result tracking
        const problemResultMatch = aiResponseText.match(/<PROBLEM_RESULT:(correct|incorrect|skipped)>/i);
        let problemAnswered = false;
        let wasCorrect = false;

        if (problemResultMatch) {
            const result = problemResultMatch[1].toLowerCase();
            problemAnswered = true;
            wasCorrect = result === 'correct';
            aiResponseText = aiResponseText.replace(problemResultMatch[0], '').trim();
            console.log(`📊 [CourseChat] Problem: ${result}`);
        } else {
            // Keyword fallback for backward compat
            const userMsg = messageText.trim();
            const looksLikeAnswer = userMsg.length < 100 && (/^-?\d+/.test(userMsg) || /^[a-z]\s*=/i.test(userMsg) || userMsg.split(' ').length <= 10);
            if (looksLikeAnswer) {
                const lower = aiResponseText.toLowerCase();
                if (/correct|exactly|great job|perfect|well done/.test(lower)) {
                    problemAnswered = true; wasCorrect = true;
                } else if (/not quite|try again|almost|incorrect|not exactly/.test(lower)) {
                    problemAnswered = true; wasCorrect = false;
                }
            }
        }

        // Interactive graph tool detection (student courses only — parents don't use interactive graphs)
        // Strategy: 1) Exact tag match  2) Keyword fallback if AI forgot the tag
        let graphToolConfig = null;

        // 1. Check for explicit <GRAPH_TOOL> tag (with or without attributes)
        const graphToolMatch = !isParentCourse && aiResponseText.match(/<GRAPH_TOOL(?:\s+([^>]*))?\s*>/i);
        if (graphToolMatch) {
            const attrs = {};
            if (graphToolMatch[1]) {
                graphToolMatch[1].replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
            }
            graphToolConfig = {
                type: attrs.type || 'plot-line',
                expectedSlope: attrs.slope != null ? parseFloat(attrs.slope) : null,
                expectedIntercept: attrs.intercept != null ? parseFloat(attrs.intercept) : null,
                xMin: attrs.xMin ? parseInt(attrs.xMin) : -10,
                xMax: attrs.xMax ? parseInt(attrs.xMax) : 10,
                yMin: attrs.yMin ? parseInt(attrs.yMin) : -10,
                yMax: attrs.yMax ? parseInt(attrs.yMax) : 10
            };
            aiResponseText = aiResponseText.replace(graphToolMatch[0], '').trim();
            console.log(`📐 [CourseChat] Graph tool (tag): ${graphToolConfig.type}`);
        }

        // 2. Keyword fallback — AI described the graph but forgot the tag
        if (!graphToolConfig && !isParentCourse) {
            const lower = aiResponseText.toLowerCase();
            const mentionsGraphing = /\b(plot|graph)\b.*\b(line|point|grid)\b/i.test(lower)
                || /\b(interactive grid|coordinate grid|coordinate plane)\b/i.test(lower);
            const currentSkills = (moduleData.skills || []).join(' ').toLowerCase();
            const isGraphModule = /graph|slope|intercept|linear|coordinate/.test(currentSkills);

            if (mentionsGraphing && isGraphModule) {
                // Try to extract slope/intercept from the AI's response text
                // Look for patterns like y = 2x + 3, slope of 2, intercept of 3
                let slope = null, intercept = null;
                const eqMatch = aiResponseText.match(/y\s*=\s*(-?\d*\.?\d*)\s*x\s*([+-]\s*\d+\.?\d*)?/i);
                if (eqMatch) {
                    slope = eqMatch[1] === '' || eqMatch[1] === '-' ? (eqMatch[1] === '-' ? -1 : 1) : parseFloat(eqMatch[1]);
                    intercept = eqMatch[2] ? parseFloat(eqMatch[2].replace(/\s/g, '')) : 0;
                }

                graphToolConfig = {
                    type: 'plot-line',
                    expectedSlope: slope,
                    expectedIntercept: intercept,
                    xMin: -10, xMax: 10, yMin: -10, yMax: 10
                };
                console.log(`📐 [CourseChat] Graph tool (keyword fallback): slope=${slope}, intercept=${intercept}`);
            }
        }

        if (problemAnswered) {
            conversation.problemsAttempted = (conversation.problemsAttempted || 0) + 1;
            if (wasCorrect) conversation.problemsCorrect = (conversation.problemsCorrect || 0) + 1;
        }

        // ── Save AI response to conversation ────────────────
        conversation.messages.push({
            role: 'assistant',
            content: aiResponseText,
            timestamp: new Date()
        });
        conversation.currentTopic = courseSession.courseName;
        conversation.lastActivity = new Date();

        // Clean invalid messages before save
        if (Array.isArray(conversation.messages)) {
            conversation.messages = conversation.messages.filter(msg =>
                msg.content && typeof msg.content === 'string' && msg.content.trim() !== ''
            );
        }
        await conversation.save();

        // ── XP calculation (student courses only) ─────────────
        let leveledUp = false;
        let tutorsJustUnlocked = [];
        const aiProcessingSeconds = Math.ceil((Date.now() - aiStartTime) / 1000);

        if (!isParentCourse) {
            xpBreakdown.tier1 = xpLadder.tier1.amount;

            if (wasCorrect && xpBreakdown.tier2 === 0) {
                const recent = conversation.messages.slice(-6);
                const usedHint = recent.some(m => m.role === 'user' && /\b(hint|help|stuck|don't know|idk|confused)\b/i.test(m.content));
                xpBreakdown.tier2 = usedHint ? xpLadder.tier2.correct : xpLadder.tier2.clean;
                xpBreakdown.tier2Type = usedHint ? 'correct' : 'clean';
            }

            xpBreakdown.total = xpBreakdown.tier1 + xpBreakdown.tier2 + xpBreakdown.tier3;

            // Course boost: always 1.5x in course mode
            const courseBoost = 1.5;
            xpBreakdown.total = Math.round(xpBreakdown.total * courseBoost);
            xpBreakdown.courseBoost = courseBoost;

            user.xp = (user.xp || 0) + xpBreakdown.total;

            // XP analytics
            if (!user.xpLadderStats) user.xpLadderStats = { lifetimeTier1: 0, lifetimeTier2: 0, lifetimeTier3: 0, tier3Behaviors: [] };
            user.xpLadderStats.lifetimeTier1 += xpBreakdown.tier1;
            user.xpLadderStats.lifetimeTier2 += xpBreakdown.tier2;
            user.xpLadderStats.lifetimeTier3 += xpBreakdown.tier3;
            if (xpBreakdown.tier3 > 0 && xpBreakdown.tier3Behavior) {
                const eb = user.xpLadderStats.tier3Behaviors.find(b => b.behavior === xpBreakdown.tier3Behavior);
                if (eb) { eb.count += 1; eb.lastEarned = new Date(); }
                else { user.xpLadderStats.tier3Behaviors.push({ behavior: xpBreakdown.tier3Behavior, count: 1, lastEarned: new Date() }); }
            }
            user.markModified('xpLadderStats');

            // Level check
            while (user.xp >= BRAND_CONFIG.cumulativeXpForLevel((user.level || 1) + 1)) {
                user.level += 1;
                leveledUp = true;
            }

            const { getTutorsToUnlock } = require('../utils/unlockTutors');
            tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
            if (tutorsJustUnlocked.length > 0) {
                user.unlockedItems.push(...tutorsJustUnlocked);
                user.markModified('unlockedItems');
            }
        }

        // AI time tracking (both parent and student)
        user.weeklyAISeconds = (user.weeklyAISeconds || 0) + aiProcessingSeconds;
        user.totalAISeconds = (user.totalAISeconds || 0) + aiProcessingSeconds;

        await user.save();

        // ── Build response ──────────────────────────────────
        let responseData;

        if (isParentCourse) {
            // Parent response: clean, no gamification
            responseData = {
                text: aiResponseText,
                voiceId: currentTutor.voiceId,
                aiTimeUsed: aiProcessingSeconds,
                courseContext: {
                    courseId: courseSession.courseId,
                    courseName: courseSession.courseName,
                    currentModuleId: courseSession.currentModuleId,
                    overallProgress: courseSession.overallProgress
                }
            };
        } else {
            // Student response: full gamification
            const xpForLevelStart = BRAND_CONFIG.cumulativeXpForLevel(user.level);
            const xpInLevel = Math.max(0, user.xp - xpForLevelStart);

            const accom = user.iepPlan?.accommodations;
            const iepFeatures = accom ? {
                autoReadAloud: accom.audioReadAloud || false,
                showCalculator: accom.calculatorAllowed || false,
                useHighContrast: accom.largePrintHighContrast || false,
                extendedTimeMultiplier: accom.extendedTime ? 1.5 : 1.0,
                mathAnxietySupport: accom.mathAnxietySupport || false,
                chunkedAssignments: accom.chunkedAssignments || false
            } : null;

            responseData = {
                text: aiResponseText,
                userXp: xpInLevel,
                userLevel: user.level,
                xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level),
                voiceId: currentTutor.voiceId,
                newlyUnlockedTutors: tutorsJustUnlocked,
                iepFeatures,
                problemResult: problemAnswered ? (wasCorrect ? 'correct' : 'incorrect') : null,
                sessionStats: {
                    problemsAttempted: conversation.problemsAttempted || 0,
                    problemsCorrect: conversation.problemsCorrect || 0
                },
                xpLadder: {
                    tier1: xpBreakdown.tier1,
                    tier2: xpBreakdown.tier2,
                    tier2Type: xpBreakdown.tier2Type,
                    tier3: xpBreakdown.tier3,
                    tier3Behavior: xpBreakdown.tier3Behavior,
                    total: xpBreakdown.total,
                    leveledUp
                },
                aiTimeUsed: aiProcessingSeconds,
                freeWeeklySecondsRemaining: (!user.subscriptionTier || user.subscriptionTier === 'free')
                    ? Math.max(0, (20 * 60) - (user.weeklyAISeconds || 0))
                    : null,
                // Interactive tools
                graphTool: graphToolConfig,
                // Course-specific fields
                courseContext: {
                    courseId: courseSession.courseId,
                    courseName: courseSession.courseName,
                    currentModuleId: courseSession.currentModuleId,
                    overallProgress: courseSession.overallProgress
                }
            };
        }

        if (useStreaming) {
            if (!clientDisconnected) {
                try {
                    res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
                    res.end();
                } catch (e) {}
            }
        } else {
            res.json(responseData);
        }

    } catch (error) {
        console.error('[CourseChat] Error:', error);
        if (res.headersSent) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong.' })}\n\n`);
                res.end();
            } catch (e) {}
        } else {
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    } finally {
        releaseLock();
    }
});

// ============================================================
//  Course Greeting — silent first message
//  The AI greets the student with full course/module context.
//  No user message is saved — it looks like the tutor initiated.
// ============================================================
async function handleCourseGreeting(req, res, userId) {
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        if (!user.activeCourseSessionId) {
            return res.status(400).json({ message: 'No active course session.' });
        }

        const courseSession = await CourseSession.findById(user.activeCourseSessionId);
        if (!courseSession || courseSession.status !== 'active') {
            return res.status(400).json({ message: 'Course session not found or inactive.' });
        }

        // Load pathway + module
        const pathwayFile = path.join(__dirname, '../public/resources', `${courseSession.courseId}-pathway.json`);
        if (!fs.existsSync(pathwayFile)) {
            return res.status(500).json({ message: `Course pathway not found: ${courseSession.courseId}` });
        }
        const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
        const currentPathwayModule = (pathway.modules || []).find(m => m.moduleId === courseSession.currentModuleId);

        let moduleData = { title: currentPathwayModule?.title || courseSession.currentModuleId, skills: currentPathwayModule?.skills || [] };
        if (currentPathwayModule?.moduleFile) {
            const moduleFile = path.join(__dirname, '../public/modules', courseSession.courseId, currentPathwayModule.moduleFile);
            if (fs.existsSync(moduleFile)) {
                moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
            }
        }

        // Load or create conversation
        let conversation;
        if (courseSession.conversationId) {
            conversation = await Conversation.findById(courseSession.conversationId);
        }
        if (!conversation) {
            conversation = new Conversation({
                userId: user._id,
                conversationName: courseSession.courseName,
                topic: courseSession.courseName,
                topicEmoji: '📚',
                conversationType: 'topic'
            });
            await conversation.save();
            courseSession.conversationId = conversation._id;
            await courseSession.save();
        }
        if (!conversation.isActive) {
            conversation.isActive = true;
        }

        // Build course prompt
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId : 'default';
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];

        const systemPrompt = buildCourseSystemPrompt({
            userProfile: user,
            tutorProfile: currentTutor,
            courseSession,
            pathway,
            scaffoldData: moduleData,
            currentModule: currentPathwayModule
        });

        // Determine if this is a fresh start or a return
        const hasHistory = conversation.messages && conversation.messages.length > 0;
        const completedModules = (courseSession.modules || []).filter(m => m.status === 'completed').length;
        const isParentCourse = pathway.audience === 'parent';

        let ghostMessage;
        let greetingInstruction;

        if (isParentCourse) {
            // ── Parent-specific ghost messages and greeting instructions ──
            if (!hasHistory && completedModules === 0) {
                ghostMessage = `Hi, I'm ${user.firstName}. I'm a parent and I just started ${courseSession.courseName}. ` +
                    `I want to understand how my child is learning math so I can help at home.`;
            } else if (hasHistory) {
                ghostMessage = `Hi, I'm ${user.firstName}. I'm back to continue ${courseSession.courseName}. ` +
                    `I'm on the topic: ${moduleData.title || courseSession.currentModuleId}. ` +
                    `I've completed ${courseSession.overallProgress || 0}% so far.`;
            } else {
                ghostMessage = `Hi, I'm ${user.firstName}. I'm continuing ${courseSession.courseName}. ` +
                    `I've finished ${completedModules} topic${completedModules !== 1 ? 's' : ''} ` +
                    `and I'm now on: ${moduleData.title || courseSession.currentModuleId}.`;
            }

            greetingInstruction = `A parent just opened their course. They haven't typed anything yet — YOU are initiating. ` +
                `The context below is invisible to them. Greet them warmly as an adult, NOT as a student. ` +
                ((!hasHistory && completedModules === 0)
                    ? `This is their FIRST session. Welcome them to ${courseSession.courseName}. ` +
                      `Acknowledge that modern math can look different from how they learned it — and that's OK. ` +
                      `Preview what they'll learn in this first topic: "${moduleData.title}". ` +
                      `Make them feel comfortable and excited to learn, not tested. `
                    : `They're returning. Welcome them back briefly, remind them where they left off, ` +
                      `and pick up naturally from the current topic. `) +
                `Keep it to 3-4 sentences. Be warm, conversational, and adult-to-adult. ` +
                `End with a casual question that starts the lesson — something like ` +
                `"Have you ever seen this on your child's homework?" or "Ready to dive in?"`;
        } else {
            // ── Student ghost messages and greeting instructions ──
            if (!hasHistory && completedModules === 0) {
                ghostMessage = `Hi, I'm ${user.firstName}. I just enrolled in ${courseSession.courseName}. ` +
                    `I'm in ${user.gradeLevel || 'school'} and ready to start.`;
            } else if (hasHistory) {
                ghostMessage = `Hi, I'm ${user.firstName}. I'm coming back to continue ${courseSession.courseName}. ` +
                    `I'm on module: ${moduleData.title || courseSession.currentModuleId}. ` +
                    `My overall progress is ${courseSession.overallProgress || 0}%.`;
            } else {
                ghostMessage = `Hi, I'm ${user.firstName}. I'm continuing ${courseSession.courseName}. ` +
                    `I've completed ${completedModules} module${completedModules !== 1 ? 's' : ''} ` +
                    `and I'm now on: ${moduleData.title || courseSession.currentModuleId}.`;
            }

            greetingInstruction = `The student just entered their course session. They haven't typed anything yet — YOU are initiating. ` +
                `The context below is invisible to them. Greet them naturally, reference the course/module, and either: ` +
                `(a) if new, welcome them and preview what they'll learn in this module, or ` +
                `(b) if returning, welcome them back and remind them where they left off. ` +
                `Keep it to 2-3 sentences. Be warm but jump into course content quickly. ` +
                `End with a question or prompt that kicks off the first scaffold element.`;
        }

        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            { role: 'system', content: greetingInstruction },
            { role: 'user', content: ghostMessage }
        ];

        console.log(`📚 [CourseGreeting] ${user.firstName} → ${courseSession.courseName} / ${courseSession.currentModuleId}`);

        // Call AI
        const aiStartTime = Date.now();
        const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.8, max_tokens: 250 });
        const greetingText = completion.choices[0]?.message?.content?.trim() || `Welcome to ${courseSession.courseName}! Let's get started.`;

        // Track AI time
        const aiSeconds = Math.ceil((Date.now() - aiStartTime) / 1000);
        User.findByIdAndUpdate(userId, {
            $inc: { weeklyAISeconds: aiSeconds, totalAISeconds: aiSeconds }
        }).catch(err => console.error('[CourseGreeting] AI time tracking error:', err));

        // Save ONLY the AI response (no user message — this is a silent greeting)
        conversation.messages.push({
            role: 'assistant',
            content: greetingText,
            timestamp: new Date()
        });
        conversation.currentTopic = courseSession.courseName;
        conversation.lastActivity = new Date();
        await conversation.save();

        res.json({
            text: greetingText,
            voiceId: currentTutor.voiceId,
            isGreeting: true,
            courseContext: {
                courseId: courseSession.courseId,
                courseName: courseSession.courseName,
                currentModuleId: courseSession.currentModuleId,
                overallProgress: courseSession.overallProgress
            }
        });

    } catch (error) {
        console.error('[CourseGreeting] Error:', error);
        res.status(500).json({
            text: 'Welcome! Let\'s get started with your course.',
            isGreeting: true
        });
    }
}

module.exports = router;
