const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const { getTutorsToUnlock } = require('../utils/unlockTutors');
const axios = require('axios');

const upload = multer({ storage: multer.memoryStorage() });
const PRIMARY_CHAT_MODEL = "gpt-4o-mini";

router.post('/', isAuthenticated, upload.any(), async (req, res) => {
    try {
        const { userId, message, fileCount } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ message: "At least one file is required." });
        }

        console.log(`Processing ${files.length} file(s) for user ${userId}`);

        // --- Step 1: Prepare files for Vision API (like Claude/GPT/Gemini) ---
        // Instead of OCR pre-processing, send files directly to GPT-4o-mini's vision
        const imageContents = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[chatWithFile] Processing file: ${file.originalname} (${file.mimetype})`);

            // Convert file to base64 data URL
            const base64 = file.buffer.toString('base64');
            const dataUrl = `data:${file.mimetype};base64,${base64}`;

            imageContents.push({
                type: "image_url",
                image_url: {
                    url: dataUrl,
                    detail: "high" // Use high detail for better text reading
                }
            });
        }

        console.log(`[chatWithFile] Prepared ${imageContents.length} file(s) for vision API`);

        // --- Step 2: Run Chat Logic with Vision API ---
        const user = await User.findById(userId);
        let activeConversation = await Conversation.findById(user.activeConversationId);
        if (!activeConversation) {
            activeConversation = new Conversation({ userId: user._id, messages: [] });
            user.activeConversationId = activeConversation._id;
        }

        // Store user message in conversation (text only, for history)
        const userMessageText = message || "Can you help me with this?";
        activeConversation.messages.push({ role: 'user', content: userMessageText });

        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;
        const systemPrompt = generateSystemPrompt(user.toObject(), tutor, null, 'student');

        // Build messages for AI with vision content
        const recentMessages = activeConversation.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));

        // Create user message with both text and images (Vision API format)
        const visionUserMessage = {
            role: 'user',
            content: [
                { type: "text", text: userMessageText },
                ...imageContents
            ]
        };

        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            ...recentMessages.slice(0, -1), // All messages except the last (we'll replace it with vision version)
            visionUserMessage
        ];

        // Call OpenAI directly with vision support
        console.log('[chatWithFile] Calling GPT-4o-mini with vision...');
        const completion = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: PRIMARY_CHAT_MODEL,
                messages: messagesForAI,
                temperature: 0.7,
                max_tokens: 400
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let aiResponseText = completion.data.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
        console.log('[chatWithFile] Received response from GPT-4o-mini');

        // --- Step 3: Handle Post-Processing (XP, Unlocks, etc.) ---
        // (This logic is copied and adapted from your chat.js)
        const xpAwardMatch = aiResponseText.match(/<AWARD_XP:(\d+),([^>]+)>/);
        let bonusXpAwarded = 0, bonusXpReason = '';
        if (xpAwardMatch) {
            bonusXpAwarded = parseInt(xpAwardMatch[1], 10);
            bonusXpReason = xpAwardMatch[2] || 'AI Bonus Award';
            aiResponseText = aiResponseText.replace(xpAwardMatch[0], '').trim();
        }

        activeConversation.messages.push({ role: 'assistant', content: aiResponseText });
        await activeConversation.save();
        
        let xpAward = BRAND_CONFIG.baseXpPerTurn + bonusXpAwarded;
        user.xp = (user.xp || 0) + xpAward;
        let xpForNextLevel = (user.level || 1) * BRAND_CONFIG.xpPerLevel;
        
        let specialXpAwardedMessage = bonusXpAwarded > 0 ? `${bonusXpAwarded} XP (${bonusXpReason})` : `${xpAward} XP`;
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

        res.json({
            text: aiResponseText,
            userXp: user.xp - xpForCurrentLevelStart,
            userLevel: user.level,
            xpNeeded: xpForNextLevel,
            specialXpAwarded: specialXpAwardedMessage,
            voiceId: tutor.voiceId,
            newlyUnlockedTutors: tutorsJustUnlocked,
            drawingSequence: null // Add drawing logic here if needed for file uploads
        });

    } catch (error) {
        console.error("ERROR: Chat-with-file route failed:", error);
        res.status(500).json({ message: "An internal server error occurred." });
    }
});

module.exports = router;// JavaScript Document