// Forcing a file update for Git

// routes/chat.js

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const Curriculum = require('../models/curriculum');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/openaiClient");
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const axios = require('axios');
const { getTutorsToUnlock } = require('../utils/unlockTutors');
const { parseAIDrawingCommands } = require('../utils/aiDrawingTools');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, role, childId } = req.body;
    if (!userId || !message) return res.status(400).json({ message: "User ID and message are required." });
    if (message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Message too long.` });

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

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found." });

        let activeConversation;
        if (user.activeConversationId) {
            activeConversation = await Conversation.findById(user.activeConversationId);
        }
        if (!activeConversation || !activeConversation.isActive) {
            activeConversation = new Conversation({ userId: user._id, messages: [] });
            user.activeConversationId = activeConversation._id;
            await user.save();
        }

        activeConversation.messages.push({ role: 'user', content: message });

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

        const recentMessagesForAI = activeConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        const formattedMessagesForLLM = recentMessagesForAI
            .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content)
            .map(msg => ({ role: msg.role, content: msg.content }));

        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor.name, null, 'student', curriculumContext);
        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...formattedMessagesForLLM];

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { system: systemPrompt, temperature: 0.7, max_tokens: 400 });
        let aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";

        // Parse AI drawing commands using the new high-level tools
        const { drawingSequence, cleanedText } = parseAIDrawingCommands(aiResponseText);
        const dynamicDrawingSequence = drawingSequence;
        aiResponseText = cleanedText;

        const xpAwardMatch = aiResponseText.match(/<AWARD_XP:(\d+),([^>]+)>/);
        let bonusXpAwarded = 0;
        let bonusXpReason = '';
        if (xpAwardMatch) {
            const rawXpAmount = parseInt(xpAwardMatch[1], 10);
            // SECURITY FIX: Cap XP awards to prevent exploitation
            bonusXpAwarded = Math.min(Math.max(rawXpAmount, BRAND_CONFIG.xpAwardRange.min), BRAND_CONFIG.xpAwardRange.max);
            bonusXpReason = xpAwardMatch[2] || 'AI Bonus Award';
            aiResponseText = aiResponseText.replace(xpAwardMatch[0], '').trim();
        }

        // SAFETY LOGGING: Check if AI flagged safety concern
        const safetyConcernMatch = aiResponseText.match(/<SAFETY_CONCERN>([^<]+)<\/SAFETY_CONCERN>/);
        if (safetyConcernMatch) {
            console.error(`🚨 SAFETY CONCERN - User ${userId} (${user.firstName} ${user.lastName}) - ${safetyConcernMatch[1]}`);
            aiResponseText = aiResponseText.replace(safetyConcernMatch[0], '').trim();
            // TODO: Consider sending alert email to admin or incrementing warning counter on user
        }

        activeConversation.messages.push({ role: 'assistant', content: aiResponseText });

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

        // Update live tracking fields for teacher dashboard
        activeConversation.currentTopic = detectTopic(activeConversation.messages);
        const stats = calculateProblemStats(activeConversation.messages);
        activeConversation.problemsAttempted = stats.attempted;
        activeConversation.problemsCorrect = stats.correct;
        activeConversation.lastActivity = new Date();

        await activeConversation.save();

        let xpAward = BRAND_CONFIG.baseXpPerTurn + bonusXpAwarded;
        user.xp = (user.xp || 0) + xpAward;
        
        let specialXpAwardedMessage = bonusXpAwarded > 0 ? `${bonusXpAwarded} XP (${bonusXpReason})` : `${xpAward} XP`;
        let xpForNextLevel = (user.level || 1) * BRAND_CONFIG.xpPerLevel;
        if (user.xp >= xpForNextLevel) {
            user.level += 1;
            specialXpAwardedMessage = `LEVEL_UP! New level: ${user.level}`;
        }

        const tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
		if (tutorsJustUnlocked.length > 0) {
			user.unlockedItems.push(...tutorsJustUnlocked);
			user.markModified('unlockedItems');
		}

        await user.save();
        
        const xpForCurrentLevelStart = (user.level - 1) * BRAND_CONFIG.xpPerLevel;
        const userXpInCurrentLevel = user.xp - xpForCurrentLevelStart;

        res.json({
			text: aiResponseText,
			userXp: userXpInCurrentLevel,
			userLevel: user.level,
			xpNeeded: xpForNextLevel,
			specialXpAwarded: specialXpAwardedMessage,
			voiceId: currentTutor.voiceId,
			newlyUnlockedTutors: tutorsJustUnlocked,
			drawingSequence: dynamicDrawingSequence
		});

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
        const conversationKey = `parent_${parentId}_child_${childId}`;
        let parentConversation = await Conversation.findOne({
            userId: parentId,
            metadata: { childId: childId }
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
            max_tokens: 500
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
            if (session.currentTopic) {
                prompt += `- ${session.currentTopic}`;
                if (session.problemsAttempted) {
                    prompt += ` (${session.problemsCorrect || 0}/${session.problemsAttempted} correct)`;
                }
                if (session.strugglingWith) {
                    prompt += ` - Struggling with: ${session.strugglingWith}`;
                }
                prompt += `\n`;
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

module.exports = router;