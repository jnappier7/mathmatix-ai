// Forcing a file update for Git

// routes/chat.js

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
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
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ message: "User ID and message are required." });
    if (message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Message too long.` });

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

        const recentMessagesForAI = activeConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        const formattedMessagesForLLM = recentMessagesForAI
            .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content)
            .map(msg => ({ role: msg.role, content: msg.content }));

        const systemPrompt = generateSystemPrompt(studentProfileForPrompt, currentTutor.name, null, 'student');
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

module.exports = router;