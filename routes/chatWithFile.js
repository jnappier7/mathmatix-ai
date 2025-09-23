const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLM } = require("../utils/openaiClient");
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const pdfToImage = require('../utils/pdf-to-image');
const ocr = require('../utils/ocr');
const { getTutorsToUnlock } = require('../utils/unlockTutors');

const upload = multer({ storage: multer.memoryStorage() });
const PRIMARY_CHAT_MODEL = "gpt-4o-mini";

router.post('/', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
        const { userId, message } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: "A file is required." });

        // --- Step 1: Process the File ---
        const imageBuffer = file.mimetype.includes("pdf") ? await pdfToImage(file.buffer) : file.buffer;
        if (!imageBuffer) return res.status(500).json({ error: "Failed to convert file." });

        const base64Image = `data:${file.mimetype.includes("pdf") ? 'image/png' : file.mimetype};base64,${imageBuffer.toString("base64")}`;
        const extractedText = await ocr(base64Image);
        
        const combinedMessage = `${message}\n\n[Content from uploaded file: ${file.originalname}]\n${extractedText}`.trim();

        // --- Step 2: Run Chat Logic (Adapted from chat.js) ---
        const user = await User.findById(userId);
        let activeConversation = await Conversation.findById(user.activeConversationId);
        if (!activeConversation) {
            activeConversation = new Conversation({ userId: user._id, messages: [] });
            user.activeConversationId = activeConversation._id;
        }

        activeConversation.messages.push({ role: 'user', content: combinedMessage });
        
        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;
        const systemPrompt = generateSystemPrompt(user.toObject(), tutor.name, null, 'student');
        
        const recentMessages = activeConversation.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));
        const messagesForAI = [{ role: 'system', content: systemPrompt }, ...recentMessages];

        const completion = await callLLM(PRIMARY_CHAT_MODEL, messagesForAI, { temperature: 0.7, max_tokens: 400 });
        let aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";

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