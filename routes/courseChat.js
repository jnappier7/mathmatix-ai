// routes/courseChat.js
// Dedicated chat endpoint for structured course sessions.
// Routes through the unified pipeline via courseAdapter for observe/diagnose/decide/generate/verify/persist.
// Course context is REQUIRED — if it can't load, the request fails loudly.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const User = require('../models/user');
const Conversation = require('../models/conversation');
const CourseSession = require('../models/courseSession');
const { buildCourseSystemPrompt, buildCourseGreetingInstruction } = require('../utils/coursePrompt');
const { callLLM } = require('../utils/llmGateway');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const { detectAndFetchResource, detectResourceMention } = require('../utils/resourceDetector');
const { buildProgressUpdate } = require('../utils/progressState');
const { runPipeline, verify: pipelineVerify } = require('../utils/pipeline');
const { buildCoursePipelineContext, postProcessCourseResult } = require('../utils/pipeline/courseAdapter');

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
            // Name it after the current module so sessions are distinguishable
            const moduleName = currentPathwayModule.title || courseSession.courseName;
            conversation = new Conversation({
                userId: user._id,
                conversationName: moduleName,
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

        // ── Route through unified pipeline via course adapter ──
        // Previously this was 300+ lines of inline logic (prompt build, LLM call,
        // verify, scaffold, XP). Now it flows through the same pipeline as chat,
        // getting observe, diagnose, decide, generate, verify, persist — plus
        // tutor plan awareness, instructional modes, and smart suggestions.
        const useStreaming = req.query.stream === 'true';
        const aiStartTime = Date.now();

        console.log(`📚 [CourseChat] ${user.firstName} → ${courseSession.courseName} / ${courseSession.currentModuleId}`);

        // Build pipeline context with course enrichment
        const courseCtx = await buildCoursePipelineContext({
            user,
            courseSession,
            conversation,
            formattedMessages,
            resourceContext,
        });

        // Set up streaming if requested
        if (useStreaming) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
        }

        // Run the unified pipeline (observe → diagnose → decide → generate → verify → persist)
        const pipelineResult = await runPipeline(messageText, {
            user,
            conversation,
            systemPrompt: courseCtx.systemPrompt,
            formattedMessages: courseCtx.formattedMessages,
            activeSkill: courseCtx.activeSkill,
            phaseState: null,
            hasRecentUpload: false,
            stream: useStreaming,
            res: useStreaming ? res : null,
            aiProcessingStartTime: aiStartTime,
            _course: courseCtx._course,
        });

        // Course-specific post-processing (scaffold advance, module complete, graph tools)
        const wasCorrect = pipelineResult.problemResult === 'correct';
        const problemAnswered = pipelineResult.problemResult !== null;
        const courseResult = await postProcessCourseResult(
            pipelineResult,
            courseCtx._course,
            conversation,
            problemAnswered ? wasCorrect : null,
        );

        const aiResponseText = courseResult.text;
        const courseProgressUpdate = courseResult.courseProgressUpdate;
        const graphToolConfig = courseResult.graphToolConfig;
        const currentTutor = courseCtx._course.currentTutor;

        // Module completion XP award
        if (courseProgressUpdate?.xpAwarded) {
            try {
                const userService = require('../services/userService');
                await userService.awardXP(user._id, courseProgressUpdate.xpAwarded, `Module complete: ${courseProgressUpdate.moduleId}`);
            } catch (xpErr) {
                user.xp = (user.xp || 0) + courseProgressUpdate.xpAwarded;
                await user.save();
            }
            if (courseProgressUpdate.moduleId) {
                console.log(`🎓 [CourseChat] ${user.firstName} completed module ${courseProgressUpdate.moduleId} — progress: ${courseSession.overallProgress}%`);
            }
        }

        // Use pipeline's XP and persist results
        const xpBreakdown = pipelineResult.xpBreakdown || { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 };
        const leveledUp = pipelineResult.leveledUp || false;
        const tutorsJustUnlocked = pipelineResult.tutorsUnlocked || [];
        const avatarBuilderUnlocked = pipelineResult.avatarBuilderUnlocked || false;
        const aiProcessingSeconds = pipelineResult.aiTimeUsed || Math.ceil((Date.now() - aiStartTime) / 1000);

        // progressUpdate and floor persistence already handled by postProcessCourseResult
        const progressUpdate = courseResult.progressUpdate;

        // ── Build response ──────────────────────────────────
        let responseData;

        if (isParentCourse) {
            // Parent response: clean, no gamification
            responseData = {
                text: aiResponseText,
                voiceId: currentTutor.voiceId,
                aiTimeUsed: aiProcessingSeconds,
                courseContext: courseResult.courseContext,
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
                avatarBuilderUnlocked,
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
                courseContext: courseResult.courseContext,
                courseProgress: courseProgressUpdate,
                progressUpdate
            };
        }

        if (useStreaming) {
            try {
                res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
                res.end();
            } catch (e) {
                // Client disconnected — safe to ignore
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
            const isCheckpoint = moduleData?.type === 'assessment' || moduleData?.diagnosticMode || currentPathwayModule?.isCheckpoint;

            if (isCheckpoint) {
                // Checkpoint-specific ghost message — tell the AI how many problems have been attempted
                const totalProblems = (moduleData.assessmentProblems || []).length;
                const attemptedCount = (conversation.messages || [])
                    .filter(m => m.role === 'assistant' && m.problemResult).length;
                const nextProblem = attemptedCount + 1;

                if (!hasHistory) {
                    ghostMessage = `Hi, I'm ${user.firstName}. I'm starting the ${moduleData.title || 'checkpoint'}. ` +
                        `This is an assessment with ${totalProblems} problems. I'm ready to begin.`;
                } else {
                    ghostMessage = `Hi, I'm ${user.firstName}. I'm continuing the ${moduleData.title || 'checkpoint'}. ` +
                        `I've completed ${attemptedCount} of ${totalProblems} problems so far. ` +
                        `Present problem ${Math.min(nextProblem, totalProblems)} next.`;
                }

                greetingInstruction = `The student is starting a checkpoint assessment. ` +
                    `Present Problem 1 of ${totalProblems} immediately. ` +
                    `Do NOT teach or explain concepts. Just present the first problem and let them answer.`;
            } else if (!hasHistory && completedModules === 0) {
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

            if (!isCheckpoint) {
                greetingInstruction = buildCourseGreetingInstruction({
                    userProfile: user,
                    courseSession,
                    pathway,
                    scaffoldData: moduleData,
                    currentModule: currentPathwayModule
                });
            }
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
        let greetingText = completion.choices[0]?.message?.content?.trim() || `Welcome to ${courseSession.courseName}! Let's get started.`;

        // Run verify for LaTeX normalization and answer-key filtering
        try {
            const verified = await pipelineVerify(greetingText, {
                userId: userId?.toString(),
                userMessage: '',
                iepReadingLevel: user.iepPlan?.readingLevel || null,
                firstName: user.firstName,
            });
            greetingText = verified.text;
            if (verified.flags.length > 0) {
                console.log(`[CourseGreeting] Verify: ${verified.flags.join(', ')}`);
            }
        } catch (verifyErr) {
            console.error('[CourseGreeting] Verify failed, using raw greeting:', verifyErr.message);
        }

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

        const isCheckpointModule = moduleData?.type === 'assessment' || moduleData?.diagnosticMode || currentPathwayModule?.isCheckpoint;

        res.json({
            text: isCheckpointModule ? null : greetingText,
            voiceId: currentTutor.voiceId,
            isGreeting: true,
            isCheckpoint: isCheckpointModule || false,
            checkpointTitle: isCheckpointModule ? (moduleData?.title || 'Checkpoint') : undefined,
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
