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
const ocr = require('../utils/ocr');
const { getTutorsToUnlock } = require('../utils/unlockTutors');

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

        // --- Step 1: Process All Files ---
        const extractedContents = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                // Mathpix supports PDFs natively, so no conversion needed
                const base64Image = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

                console.log(`[chatWithFile] Processing file: ${file.originalname} (${file.mimetype})`);

                // Perform OCR
                const extractedText = await ocr(base64Image);

                extractedContents.push({
                    filename: file.originalname,
                    text: extractedText || `[No text extracted from ${file.originalname}]`
                });

                console.log(`Processed file ${i + 1}/${files.length}: ${file.originalname}`);
            } catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                extractedContents.push({
                    filename: file.originalname,
                    text: `[Error processing ${file.originalname}]`
                });
            }
        }

        // Combine all extracted content
        const fileContentsText = extractedContents
            .map(({ filename, text }) => `[Content from ${filename}]\n${text}`)
            .join('\n\n');

        const combinedMessage = message
            ? `${message}\n\n${fileContentsText}`.trim()
            : fileContentsText;

        // --- Step 2: Run Chat Logic (Adapted from chat.js) ---
        const user = await User.findById(userId);
        let activeConversation = await Conversation.findById(user.activeConversationId);
        if (!activeConversation) {
            activeConversation = new Conversation({ userId: user._id, messages: [] });
            user.activeConversationId = activeConversation._id;
        }

        activeConversation.messages.push({ role: 'user', content: combinedMessage });
        
        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;
        const systemPrompt = generateSystemPrompt(user.toObject(), tutor, null, 'student');
        
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