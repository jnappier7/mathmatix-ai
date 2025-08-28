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

const PRIMARY_CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ message: "User ID and message are required." });
    if (message.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Message too long.` });

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

        let dynamicDrawingSequence = [];
        
        // --- FIX IS HERE ---
        const drawLineRegex = /\[DRAW_LINE:([\d\s,]+)\]/g;
        const drawTextRegex = /\[DRAW_TEXT:([\d\s,]+),([^\]]+)\]/g;
        
        let match;
        while ((match = drawLineRegex.exec(aiResponseText)) !== null) {
            const points = match[1].split(',').map(Number);
            if (points.length === 4) {
                dynamicDrawingSequence.push({ type: 'line', points });
            }
        }
        while ((match = drawTextRegex.exec(aiResponseText)) !== null) {
            const position = match[1].split(',').map(Number);
            const content = match[2];
            if (position.length === 2) {
                dynamicDrawingSequence.push({ type: 'text', position, content });
            }
        }

        aiResponseText = aiResponseText.replace(drawLineRegex, '').replace(drawTextRegex, '').trim();
        if (dynamicDrawingSequence.length === 0) {
            dynamicDrawingSequence = null;
        }

        const xpAwardMatch = aiResponseText.match(/<AWARD_XP:(\d+),([^>]+)>/);
        let bonusXpAwarded = 0;
        let bonusXpReason = '';
        if (xpAwardMatch) {
            bonusXpAwarded = parseInt(xpAwardMatch[1], 10);
            bonusXpReason = xpAwardMatch[2] || 'AI Bonus Award';
            aiResponseText = aiResponseText.replace(xpAwardMatch[0], '').trim();
        }

        activeConversation.messages.push({ role: 'assistant', content: aiResponseText });
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