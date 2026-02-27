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
const { buildCourseSystemPrompt, buildCourseGreetingInstruction, loadCourseContext, calculateOverallProgress } = require('../utils/coursePrompt');
const { callLLM, callLLMStream } = require('../utils/llmGateway');
const { sendSafetyConcernAlert } = require('../utils/emailService');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const { calculateXpBoostFactor } = require('../utils/promptCompressor');
const { detectTopic } = require('../utils/activitySummarizer');
const { filterAnswerKeyResponse } = require('../utils/worksheetGuard');
const { detectAndFetchResource, detectResourceMention } = require('../utils/resourceDetector');
const { buildProgressUpdate } = require('../utils/progressState');
const { verify: pipelineVerify } = require('../utils/pipeline');
const { computeSessionMood, buildMoodDirective } = require('../utils/pipeline/sessionMood');
const { detectGraphTool, processScaffoldAdvance, processModuleComplete, processSkillMastery } = require('../utils/pipeline/coursePersist');

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
            // moduleFile is stored as "/modules/{courseId}/file.json" — resolve relative to public/
            const moduleFile = path.join(__dirname, '../public', currentPathwayModule.moduleFile);
            if (fs.existsSync(moduleFile)) {
                moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
                console.log(`[CourseChat] Loaded scaffold data: ${moduleData.scaffold?.length || 0} steps from ${currentPathwayModule.moduleFile}`);
            } else {
                console.warn(`[CourseChat] ⚠️ Module file not found: ${moduleFile} — scaffold will have no steps`);
            }
        } else {
            console.warn(`[CourseChat] ⚠️ No moduleFile defined for module ${currentPathwayModule.moduleId} — scaffold will be empty`);
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

        // ── Mark module as in_progress on first student message ──
        const activeMod = courseSession.modules.find(m => m.moduleId === courseSession.currentModuleId);
        if (activeMod && activeMod.status === 'available') {
            activeMod.status = 'in_progress';
            activeMod.startedAt = activeMod.startedAt || new Date();
            courseSession.markModified('modules');
            await courseSession.save();
            console.log(`▶ [CourseChat] Module ${activeMod.moduleId} marked in_progress on first message`);
        }

        // ── Detect teacher resource mentions ─────────────────
        let resourceContext = null;
        if (user.teacherId) {
            try {
                resourceContext = await detectAndFetchResource(user.teacherId, messageText);
            } catch (err) {
                console.error('[CourseChat] Resource detection error:', err.message);
            }
        }
        // Fallback: resource mentioned by name but not found in DB
        if (!resourceContext) {
            const resourceMentions = detectResourceMention(messageText);
            if (resourceMentions.length > 0) {
                resourceContext = {
                    displayName: resourceMentions[0].trim(),
                    description: null,
                    content: null,
                    notFound: true
                };
                console.log(`📋 [CourseChat] Resource mentioned but not in DB: "${resourceContext.displayName}"`);
            }
        }

        // ── Build system prompt ─────────────────────────────
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId : 'default';
        const currentTutor = TUTOR_CONFIG[selectedTutorKey];

        let systemPrompt = buildCourseSystemPrompt({
            userProfile: user,
            tutorProfile: currentTutor,
            courseSession,
            pathway,
            scaffoldData: moduleData,
            currentModule: currentPathwayModule,
            resourceContext
        });

        // ── Session mood (emotional arc) ──
        const sessionMood = computeSessionMood(conversation.messages, {
            sessionStart: conversation.createdAt || conversation.startDate,
        });
        const moodDirective = buildMoodDirective(sessionMood);
        if (moodDirective) {
            systemPrompt += '\n\n' + moodDirective;
            console.log(`[CourseChat] Mood: ${sessionMood.trajectory} (energy: ${sessionMood.energy}${sessionMood.inFlow ? ', IN FLOW' : ''}${sessionMood.fatigueSignal ? ', FATIGUE' : ''})`);
        }

        // ── Inject step-context reminder into last user message ──
        // The system prompt (at position 0) fades in long conversations.
        // Appending a brief reminder to the last user message keeps the
        // scaffold tag instruction in the AI's attention window.
        const scaffold = moduleData?.scaffold || [];
        if (scaffold.length > 1) {
            const stepIdx = courseSession.currentScaffoldIndex || 0;
            const currentStep = scaffold[stepIdx];
            if (currentStep && formattedMessages.length > 0) {
                const lastMsg = formattedMessages[formattedMessages.length - 1];
                if (lastMsg?.role === 'user') {
                    lastMsg.content += `\n\n[STEP ${stepIdx + 1}/${scaffold.length}: "${currentStep.title}" — emit <SCAFFOLD_ADVANCE> when complete, before discussing the next topic.]`;
                }
            }
        }

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

        // ── Pipeline verify (anti-cheat + tag extraction + LaTeX + reading level) ──
        const xpLadder = BRAND_CONFIG.xpLadder;
        const xpBreakdown = { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 };
        let problemAnswered = false;
        let wasCorrect = false;
        let courseProgressUpdate = null;
        let graphToolConfig = null;

        try {
            const verified = await pipelineVerify(aiResponseText, {
                userId: userId?.toString(),
                userMessage: messageText,
                iepReadingLevel: user.iepPlan?.readingLevel || null,
                firstName: user.firstName,
                isStreaming: useStreaming,
                res: useStreaming ? res : null,
            });
            aiResponseText = verified.text;

            if (verified.flags.length > 0) {
                console.log(`[CourseChat] Verify: ${verified.flags.join(', ')}`);
            }

            const ext = verified.extracted;

            // Tier 3: Core Behavior XP
            if (ext.coreBehaviorXp) {
                const xpBoostInfo = calculateXpBoostFactor(user.level);
                const maxAllowed = Math.round(xpLadder.maxTier3PerTurn * xpBoostInfo.factor);
                xpBreakdown.tier3 = Math.min(Math.round(ext.coreBehaviorXp.amount * xpBoostInfo.factor), maxAllowed);
                xpBreakdown.tier3Behavior = ext.coreBehaviorXp.behavior;
            }

            // Safety concern
            if (ext.safetyConcern) {
                console.error(`🚨 SAFETY CONCERN - User ${userId} (${user.firstName}) - ${ext.safetyConcern}`);
                sendSafetyConcernAlert(
                    { userId: userId.toString(), firstName: user.firstName, lastName: user.lastName, username: user.username, gradeLevel: user.gradeLevel },
                    ext.safetyConcern, messageText
                ).catch(err => console.error('Safety alert email failed:', err));
            }

            // Skill mastery
            if (ext.skillMastered) {
                processSkillMastery(user, ext.skillMastered);
                console.log(`📈 [CourseChat] Skill ${ext.skillMastered}: mastery updated`);
            }

            // Problem result
            if (ext.problemResult) {
                problemAnswered = true;
                wasCorrect = ext.problemResult === 'correct';
                console.log(`📊 [CourseChat] Problem: ${ext.problemResult}`);
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

            // Graph tool detection (runs on verify-cleaned text)
            graphToolConfig = detectGraphTool(aiResponseText, {
                isParentCourse,
                moduleSkills: moduleData?.skills || [],
            });
            if (graphToolConfig) {
                // Strip the tag from response if detected by tag match
                if (graphToolConfig._source === 'tag') {
                    aiResponseText = aiResponseText.replace(/<GRAPH_TOOL(?:\s+[^>]*)?\s*>/gi, '').trim();
                }
                console.log(`📐 [CourseChat] Graph tool (${graphToolConfig._source}): ${graphToolConfig.type}`);
                delete graphToolConfig._source;
            }

            // Scaffold & module progression (via coursePersist)
            if (ext.scaffoldAdvance || ext.moduleComplete) {
                // In streaming mode, verify already sent a replacement event to strip tags
                console.log(`[CourseChat:Progression] Tags: SCAFFOLD_ADVANCE=${!!ext.scaffoldAdvance}, MODULE_COMPLETE=${!!ext.moduleComplete}`);

                try {
                    if (ext.moduleComplete) {
                        courseProgressUpdate = processModuleComplete(courseSession);
                        await courseSession.save();

                        // Award module completion XP
                        if (courseProgressUpdate.xpAwarded) {
                            try {
                                const userService = require('../services/userService');
                                await userService.awardXP(user._id, courseProgressUpdate.xpAwarded, `Module complete: ${courseProgressUpdate.moduleId}`);
                            } catch (xpErr) {
                                user.xp = (user.xp || 0) + courseProgressUpdate.xpAwarded;
                            }
                        }
                        console.log(`🎓 [CourseChat] ${user.firstName} completed module ${courseProgressUpdate.moduleId} — progress: ${courseSession.overallProgress}%`);

                    } else if (ext.scaffoldAdvance) {
                        courseProgressUpdate = processScaffoldAdvance(courseSession, moduleData, conversation, wasCorrect);
                        if (courseProgressUpdate) {
                            await courseSession.save();
                            console.log(`📈 [CourseChat] ${user.firstName} advanced scaffold → step ${courseProgressUpdate.scaffoldIndex + 1}/${courseProgressUpdate.scaffoldTotal}`);
                        }
                    }
                } catch (progressErr) {
                    console.error('[CourseChat] Scaffold progression error:', progressErr.message);
                }
            }

        } catch (verifyErr) {
            // Fallback: just run answer-key filter if verify fails
            console.error('[CourseChat] Verify failed, falling back to answer-key filter:', verifyErr.message);
            const answerKeyCheck = filterAnswerKeyResponse(aiResponseText, userId);
            if (answerKeyCheck.wasFiltered) {
                aiResponseText = answerKeyCheck.text;
            }
        }

        if (problemAnswered) {
            conversation.problemsAttempted = (conversation.problemsAttempted || 0) + 1;
            if (wasCorrect) conversation.problemsCorrect = (conversation.problemsCorrect || 0) + 1;
        }

        // ── Save AI response to conversation ────────────────
        // problemResult is persisted so the scaffold advance counter survives
        // across requests (previously it was never saved, causing the MIN_CORRECT
        // gate to be permanently blocked at practice steps).
        const aiMsg = {
            role: 'assistant',
            content: aiResponseText,
            timestamp: new Date()
        };
        if (problemAnswered) {
            aiMsg.problemResult = wasCorrect ? 'correct' : 'incorrect';
        }
        conversation.messages.push(aiMsg);
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

        // AI time tracking — use atomic $inc to prevent race conditions with concurrent requests
        await User.findByIdAndUpdate(user._id, {
            $inc: { weeklyAISeconds: aiProcessingSeconds, totalAISeconds: aiProcessingSeconds }
        });
        // Update local copy for any downstream reads in this request
        user.weeklyAISeconds = (user.weeklyAISeconds || 0) + aiProcessingSeconds;
        user.totalAISeconds = (user.totalAISeconds || 0) + aiProcessingSeconds;

        await user.save();

        // ── Build progressUpdate (ALWAYS — every response) ──
        // Determine last assessment signal for this turn
        let lastSignal = null;
        let signalSource = null;
        if (problemAnswered) {
            // Binary signal from <PROBLEM_RESULT> tag — not real timing data.
            // signalSource tracks which generator produced this so future code
            // doesn't confuse it with lessonPhaseManager telemetry.
            lastSignal = wasCorrect ? 'correct_fast' : 'incorrect_close';
            signalSource = 'problem_result';
        }

        const progressUpdate = buildProgressUpdate({
            courseSession,
            moduleData,
            conversation,
            lastSignal,
            signalSource,
            showCheckpoint: false
        });

        // Persist the course-wide floor so it survives reloads
        const newFloor = progressUpdate.progressFloorPct;
        if (newFloor > (courseSession.progressFloorPct || 0)) {
            courseSession.progressFloorPct = newFloor;
            courseSession.overallProgress = progressUpdate.overallPct;
            await courseSession.save();
        }

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
                    currentLessonId: courseSession.currentLessonId,
                    overallProgress: courseSession.overallProgress
                },
                courseProgress: courseProgressUpdate,
                progressUpdate
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
                    currentLessonId: courseSession.currentLessonId,
                    overallProgress: courseSession.overallProgress
                },
                courseProgress: courseProgressUpdate,
                progressUpdate
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
            // moduleFile is stored as "/modules/{courseId}/file.json" — resolve relative to public/
            const moduleFile = path.join(__dirname, '../public', currentPathwayModule.moduleFile);
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

        // Idempotency: if conversation already has a greeting, return it instead of generating a new one
        // This prevents duplicate welcome messages when a user re-enters a course session
        if (conversation.messages && conversation.messages.length > 0) {
            const lastMsg = conversation.messages[conversation.messages.length - 1];
            if (lastMsg.role === 'assistant') {
                const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
                    ? user.selectedTutorId : 'default';
                const currentTutor = TUTOR_CONFIG[selectedTutorKey];
                console.log(`📚 [CourseGreeting] ${user.firstName} → returning existing greeting (idempotent)`);
                const greetingProgress = buildProgressUpdate({
                    courseSession, moduleData, conversation, lastSignal: null, showCheckpoint: false
                });
                return res.json({
                    text: lastMsg.content,
                    voiceId: currentTutor.voiceId,
                    isGreeting: true,
                    courseContext: {
                        courseId: courseSession.courseId,
                        courseName: courseSession.courseName,
                        currentModuleId: courseSession.currentModuleId,
                        overallProgress: courseSession.overallProgress
                    },
                    progressUpdate: greetingProgress
                });
            }
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
                const scaffoldIndex = courseSession.currentScaffoldIndex || 0;
                const totalSteps = (moduleData.scaffold || []).length;
                ghostMessage = `Hi, I'm ${user.firstName}. I'm coming back to continue ${courseSession.courseName}. ` +
                    `I'm on module: ${moduleData.title || courseSession.currentModuleId}` +
                    (totalSteps > 0 ? ` (step ${scaffoldIndex + 1} of ${totalSteps}). ` : '. ') +
                    `My overall progress is ${courseSession.overallProgress || 0}%.`;
            } else {
                const scaffoldIndex = courseSession.currentScaffoldIndex || 0;
                const totalSteps = (moduleData.scaffold || []).length;
                ghostMessage = `Hi, I'm ${user.firstName}. I'm continuing ${courseSession.courseName}. ` +
                    `I've completed ${completedModules} module${completedModules !== 1 ? 's' : ''} ` +
                    `and I'm now on: ${moduleData.title || courseSession.currentModuleId}` +
                    (totalSteps > 0 ? ` (step ${scaffoldIndex + 1} of ${totalSteps}).` : '.');
            }

            greetingInstruction = buildCourseGreetingInstruction({
                userProfile: user,
                courseSession,
                pathway,
                scaffoldData: moduleData,
                currentModule: currentPathwayModule
            });
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

        const newGreetingProgress = buildProgressUpdate({
            courseSession, moduleData, conversation, lastSignal: null, showCheckpoint: false
        });

        res.json({
            text: greetingText,
            voiceId: currentTutor.voiceId,
            isGreeting: true,
            courseContext: {
                courseId: courseSession.courseId,
                courseName: courseSession.courseName,
                currentModuleId: courseSession.currentModuleId,
                overallProgress: courseSession.overallProgress
            },
            progressUpdate: newGreetingProgress
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
