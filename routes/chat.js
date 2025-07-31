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

const ACCOMMODATION_TRIGGERS = {
    'focus_mode_trigger': { type: 'info', text: "It looks like you might benefit from a focused session! I can help minimize distractions and keep us on track." },
    'multiplication_chart_trigger': { type: 'info', text: "Need a quick reference? Here's a multiplication chart!" },
    'anxiety_support_trigger': { type: 'info', text: "Take a deep breath. It's okay to feel stuck. We'll work through this together, one step at a time." },
    'visual_aid_request': { type: 'info', text: "Great idea! A visual representation might help. Let's try drawing this out." },
    'simplified_language_request': { type: 'info', text: "Understood. I'll simplify my explanations and use more direct language." },
    'step_by-step_breakdown': { type: 'info', text: "Let's break this problem down into smaller, manageable steps." },
    'concept_review_needed': { type: 'info', text: "It seems like a quick review of the core concept might be helpful here." },
};

router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ message: "User ID and message are required." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

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
        
        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            ...formattedMessagesForLLM
        ];

        let aiResponseText;
        let frontendAccommodationTrigger = null;
        let frontendChunkedInstruction = null;
        let bonusXpAwarded = 0;
        let bonusXpReason = '';

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, {
            system: systemPrompt,
            temperature: 0.7,
            max_tokens: 400
        });

       aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond to that. Could you try rephrasing?";

        let dynamicDrawingSequence = null;
        // --- FINAL, MOST ROBUST REGEX ---
        const drawingRegex = /"drawingSequence"\s*:\s*(\[[\s\S]*?\])/s;
        const drawingMatch = aiResponseText.match(drawingRegex);

        if (drawingMatch && drawingMatch[1]) {
            try {
                dynamicDrawingSequence = JSON.parse(drawingMatch[1]);
                aiResponseText = aiResponseText.replace(drawingMatch[0], '').replace(/```json|```/g, '').trim();
            } catch (e) {
                console.error("Error parsing drawingSequence from AI response:", e);
                dynamicDrawingSequence = null;
            }
        }

        const xpMentionRegex = /\b(\d+)\s*XP\b/i;
        const hasXpMention = xpMentionRegex.test(aiResponseText);
        const hasXpTag = aiResponseText.includes('<AWARD_XP:');

        if (hasXpMention && !hasXpTag) {
            const points = aiResponseText.match(xpMentionRegex)[1];
            aiResponseText += ` <AWARD_XP:${points},For your excellent work!>`;
        }

        let isMasteryQuiz = false;
        if (aiResponseText.includes('<MASTERY_QUIZ_START>')) {
            isMasteryQuiz = true;
            aiResponseText = aiResponseText
                .replace(/<MASTERY_QUIZ_START>/g, '')
                .replace(/<\/MASTERY_QUIZ_END>/g, '');
        }

        const xpAwardMatch = aiResponseText.match(/<AWARD_XP:(\d+),([^>]+)>/);
        if (xpAwardMatch) {
            bonusXpAwarded = parseInt(xpAwardMatch[1], 10);
            bonusXpReason = xpAwardMatch[2] || 'AI Bonus Award';
            aiResponseText = aiResponseText.replace(xpAwardMatch[0], '').trim();
        }
        
        Object.keys(ACCOMMODATION_TRIGGERS).forEach(trigger => {
            if (aiResponseText.includes(`[ACCOMMODATION_TRIGGER:${trigger}]`)) {
                frontendAccommodationTrigger = ACCOMMODATION_TRIGGERS[trigger];
                aiResponseText = aiResponseText.replace(`[ACCOMMODATION_TRIGGER:${trigger}]`, '').trim();
            }
        });

        const chunkMatch = aiResponseText.match(/\[CHUNK_PROGRESS:(\d+)\/(\d+)\]/);
        if (chunkMatch) {
            frontendChunkedInstruction = { current: parseInt(chunkMatch[1]), total: parseInt(chunkMatch[2]) };
            aiResponseText = aiResponseText.replace(chunkMatch[0], '').trim();
        }

        activeConversation.messages.push({ role: 'assistant', content: aiResponseText });
        activeConversation.lastActivity = new Date();
        
        if (activeConversation.messages.length > MAX_HISTORY_LENGTH_FOR_AI) {
            activeConversation.messages = activeConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        }

        await activeConversation.save();

        let xpAward = BRAND_CONFIG.baseXpPerTurn + bonusXpAwarded;
        let specialXpAwardedMessage = bonusXpAwarded > 0 ? `${bonusXpAwarded} XP (${bonusXpReason})` : `${xpAward} XP`;

        user.xp = (user.xp || 0) + xpAward;
        user.xpHistory.push({ amount: xpAward, reason: bonusXpReason || "Turn Completion" });
        
        let currentLevel = user.level || 1;
        let xpForNextLevel = currentLevel * BRAND_CONFIG.xpPerLevel;
        
        if (user.xp >= xpForNextLevel) {
            user.level += 1;
            specialXpAwardedMessage = `LEVEL_UP! New level: ${user.level}`;
        }

		const tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
		if (tutorsJustUnlocked.length > 0) {
			user.unlockedItems.push(...tutorsJustUnlocked);
			user.markModified('unlockedItems');
			await user.save();
		}

        user.lastLogin = new Date();
        await user.save();

        const xpForCurrentLevelStart = (user.level - 1) * BRAND_CONFIG.xpPerLevel;
        const userXpInCurrentLevel = user.xp - xpForCurrentLevelStart;
        const xpNeededForThisLevel = user.level * BRAND_CONFIG.xpPerLevel;

        const updatedUserData = {
            level: user.level,
            xpForCurrentLevel: userXpInCurrentLevel,
            xpForNextLevel: xpNeededForThisLevel
        };

        if (activeConversation.messages.length % 10 === 0) {
            axios.post(`http://localhost:${process.env.PORT || 3000}/api/summary`, {
                messageLog: activeConversation.messages,
                studentProfile: studentProfileForPrompt,
                conversationId: activeConversation._id
            }).catch(err => console.error('ERROR: Failed to trigger session summary:', err.message));
        }

       res.json({
			text: aiResponseText,
			userXp: updatedUserData.xpForCurrentLevel,
			userLevel: updatedUserData.level,
			xpNeeded: updatedUserData.xpForNextLevel,
			specialXpAwarded: specialXpAwardedMessage,
			voiceId: currentTutor.voiceId,
			isMasteryQuiz: isMasteryQuiz, 
			accommodationPrompt: frontendAccommodationTrigger,
			chunkedInstruction: frontendChunkedInstruction,
			newlyUnlockedTutors: tutorsJustUnlocked,
			drawingSequence: dynamicDrawingSequence
		});

    } catch (error) {
        console.error("ERROR: Chat route failed:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

module.exports = router;