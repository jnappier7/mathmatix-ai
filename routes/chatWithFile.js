const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { isAuthenticated } = require('../middleware/auth');
const { promptInjectionFilter } = require('../middleware/promptInjection');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const StudentUpload = require('../models/studentUpload');
const { generateSystemPrompt } = require('../utils/prompt');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const { getTutorsToUnlock } = require('../utils/unlockTutors');
const pdfOcr = require('../utils/pdfOcr');
const { validateUpload, uploadRateLimiter } = require('../middleware/uploadSecurity');
const { anthropic, openai, retryWithExponentialBackoff } = require('../utils/openaiClient');
const { applyWorksheetGuard } = require('../utils/worksheetGuard');

// CTO REVIEW FIX: Use diskStorage instead of memoryStorage to prevent server crashes
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});
const PRIMARY_CHAT_MODEL = "gpt-4o-mini"; // Fast, cost-effective teaching model (GPT-4o-mini)

router.post('/',
    isAuthenticated,
    promptInjectionFilter,
    uploadRateLimiter,
    upload.any(),
    validateUpload,
    async (req, res) => {
    try {
        const { message, fileCount } = req.body;
        const userId = req.user?._id;

    if (!userId) return res.status(401).json({ message: "Not authenticated." });

        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ message: "At least one file is required." });
        }

        console.log(`Processing ${files.length} file(s) for user ${userId}`);

        // --- Step 1: Hybrid Processing (Best of Both Worlds) ---
        // Images → Vision API (Claude/GPT/Gemini method)
        // PDFs → Mathpix specialized endpoint
        const imageContents = [];
        const pdfTexts = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[chatWithFile] Processing file: ${file.originalname} (${file.mimetype})`);

            if (file.mimetype === 'application/pdf') {
                // PDFs: Use Mathpix /v3/pdf endpoint (specialized for documents)
                console.log(`[chatWithFile] Using Mathpix PDF endpoint for: ${file.originalname}`);

                try {
                    // Read file from disk
                    const fileBuffer = fsSync.readFileSync(file.path);
                    const extractedText = await pdfOcr(fileBuffer, file.originalname);

                    if (extractedText && extractedText.trim()) {
                        pdfTexts.push({
                            filename: file.originalname,
                            text: extractedText
                        });
                        console.log(`[chatWithFile] Extracted ${extractedText.length} characters from PDF`);
                    } else {
                        pdfTexts.push({
                            filename: file.originalname,
                            text: `[Could not extract text from ${file.originalname}]`
                        });
                        console.warn(`[chatWithFile] No text extracted from PDF: ${file.originalname}`);
                    }
                } catch (pdfError) {
                    console.error(`[chatWithFile] PDF processing error for ${file.originalname}:`, pdfError.message);
                    // Clean up all temp files before returning error
                    files.forEach(f => { if (f.path) try { fsSync.unlinkSync(f.path); } catch(e) {} });
                    return res.status(500).json({
                        message: `Failed to process PDF: ${pdfError.message}`,
                        error: 'PDF_PROCESSING_ERROR'
                    });
                }
            } else {
                // Images: Use GPT-4o-mini vision directly (fast, native)
                console.log(`[chatWithFile] Using Vision API for: ${file.originalname}`);
                // Read file from disk
                const fileBuffer = fsSync.readFileSync(file.path);
                const base64 = fileBuffer.toString('base64');
                const dataUrl = `data:${file.mimetype};base64,${base64}`;

                imageContents.push({
                    type: "image_url",
                    image_url: {
                        url: dataUrl,
                        detail: "high" // Use high detail for better text reading
                    }
                });
            }
        }

        console.log(`[chatWithFile] Prepared ${imageContents.length} image(s) for vision API, ${pdfTexts.length} PDF(s) processed`);

        // --- Step 2: Run Chat Logic with Vision API ---
        const user = await User.findById(userId);
        let activeConversation = await Conversation.findById(user.activeConversationId);
        if (!activeConversation || !activeConversation.isActive) {
            activeConversation = new Conversation({ userId: user._id, messages: [] });
            await activeConversation.save(); // Save conversation first to get valid _id
            user.activeConversationId = activeConversation._id;
            await user.save(); // Save user with new conversation reference
        }

        // Build combined message with PDF text and user message
        let combinedText = message || "Can you help me with this?";

        // Add PDF extracted text to the message
        if (pdfTexts.length > 0) {
            const pdfContent = pdfTexts.map(({ filename, text }) =>
                `[Content from ${filename}]\n${text}`
            ).join('\n\n');
            combinedText = `${combinedText}\n\n${pdfContent}`;
        }

        // ANTI-CHEAT: Append worksheet detection guard (centralized in utils/worksheetGuard.js)
        combinedText = applyWorksheetGuard(combinedText);

        // Store user message in conversation (text only, for history)
        activeConversation.messages.push({ role: 'user', content: combinedText });

        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;
        const systemPrompt = generateSystemPrompt(user.toObject(), tutor, null, 'student');

        // Build messages for AI with vision content
        const recentMessages = activeConversation.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));

        // Create user message with text (including PDF content) and images (Vision API format)
        const visionUserMessage = {
            role: 'user',
            content: [
                { type: "text", text: combinedText },
                ...imageContents
            ]
        };

        const messagesForAI = [
            { role: 'system', content: systemPrompt },
            ...recentMessages.slice(0, -1), // All messages except the last (we'll replace it with vision version)
            visionUserMessage
        ];

        // Call LLM with vision support (Claude primary, OpenAI fallback)
        const isClaudeModel = PRIMARY_CHAT_MODEL.startsWith('claude-');
        let aiResponseText;

        if (isClaudeModel && anthropic) {
            // PRIMARY: Try Claude vision API
            try {
                console.log(`[chatWithFile] Calling Claude vision API (${PRIMARY_CHAT_MODEL})...`);

                // Convert to Claude format: extract system, convert images
                const systemMessage = messagesForAI.find(m => m.role === 'system')?.content;
                const userMessages = messagesForAI.filter(m => m.role !== 'system');

                // Convert image formats from OpenAI to Claude
                const claudeContent = [];
                for (const item of visionUserMessage.content) {
                    if (item.type === 'text') {
                        claudeContent.push({ type: 'text', text: item.text });
                    } else if (item.type === 'image_url') {
                        // Extract base64 data from data URL
                        const match = item.image_url.url.match(/^data:image\/(.*?);base64,(.*)$/);
                        if (match) {
                            const [, mediaType, base64Data] = match;
                            claudeContent.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: `image/${mediaType}`,
                                    data: base64Data
                                }
                            });
                        }
                    }
                }

                const completion = await retryWithExponentialBackoff(() =>
                    anthropic.messages.create({
                        model: PRIMARY_CHAT_MODEL,
                        max_tokens: 400,
                        temperature: 0.7,
                        system: systemMessage,
                        messages: [
                            ...userMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
                            { role: 'user', content: claudeContent }
                        ]
                    })
                );

                aiResponseText = completion.content[0]?.text?.trim() || "I'm not sure how to respond.";
                console.log('[chatWithFile] Received response from Claude');

            } catch (claudeError) {
                console.warn(`[chatWithFile] Claude failed:`, claudeError.message);
                console.warn('[chatWithFile] Falling back to GPT-4o-mini...');

                // FALLBACK: Try OpenAI vision API
                const fallbackModel = 'gpt-4o-mini';
                const completion = await retryWithExponentialBackoff(() =>
                    openai.chat.completions.create({
                        model: fallbackModel,
                        messages: messagesForAI,
                        temperature: 0.7,
                        max_tokens: 400
                    })
                );

                aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
                console.log('[chatWithFile] Received response from GPT-4o-mini (fallback)');
            }
        } else {
            // OpenAI model requested or no Anthropic key
            const model = isClaudeModel ? 'gpt-4o-mini' : PRIMARY_CHAT_MODEL;
            console.log(`[chatWithFile] Calling OpenAI vision API (${model})...`);

            const completion = await retryWithExponentialBackoff(() =>
                openai.chat.completions.create({
                    model: model,
                    messages: messagesForAI,
                    temperature: 0.7,
                    max_tokens: 400
                })
            );

            aiResponseText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
            console.log('[chatWithFile] Received response from OpenAI');
        }

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

        // CRITICAL FIX: Clean invalid messages before save
        if (activeConversation.messages && Array.isArray(activeConversation.messages)) {
            const originalLength = activeConversation.messages.length;
            activeConversation.messages = activeConversation.messages.filter(msg => {
                return msg.content && typeof msg.content === 'string' && msg.content.trim() !== '';
            });
            if (activeConversation.messages.length !== originalLength) {
                console.warn(`[ChatWithFile] Removed ${originalLength - activeConversation.messages.length} invalid messages`);
            }
        }

        await activeConversation.save();

        // --- Step 4: Save uploaded files to student's resource library ---
        const savedUploads = [];
        const uploadsDir = path.join(__dirname, '../uploads');

        // Ensure uploads directory exists
        try {
            await fs.mkdir(uploadsDir, { recursive: true });
        } catch (mkdirErr) {
            console.error('[chatWithFile] Failed to create uploads directory:', mkdirErr);
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                // Generate unique filename
                const timestamp = Date.now();
                const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
                const storedFilename = `${userId}_${timestamp}_${sanitizedName}`;
                const filePath = path.join(uploadsDir, storedFilename);

                // Save file to disk (FIXED: read from file.path since using diskStorage, not file.buffer)
                const fileBuffer = await fs.readFile(file.path);
                await fs.writeFile(filePath, fileBuffer);
                console.log(`[chatWithFile] Saved file to: ${filePath}`);

                // Determine file type
                const fileType = file.mimetype === 'application/pdf' ? 'pdf' : 'image';

                // Get extracted text for this file
                let extractedText = '';
                if (fileType === 'pdf' && pdfTexts.length > i) {
                    extractedText = pdfTexts[i].text || '';
                } else if (fileType === 'image') {
                    extractedText = combinedText; // The text includes user message + any extracted content
                }

                // Create database record
                const studentUpload = new StudentUpload({
                    userId: user._id,
                    originalFilename: file.originalname,
                    storedFilename: storedFilename,
                    filePath: filePath,
                    fileType: fileType,
                    mimeType: file.mimetype,
                    fileSize: file.size,
                    extractedText: extractedText.substring(0, 10000), // Limit to 10k chars
                    conversationId: activeConversation._id
                });

                await studentUpload.save();
                savedUploads.push(studentUpload._id);
                console.log(`[chatWithFile] Saved upload record: ${studentUpload._id}`);

            } catch (saveError) {
                console.error(`[chatWithFile] Error saving file ${file.originalname}:`, saveError);
                // Continue with other files even if one fails
            }
        }

        let xpAward = BRAND_CONFIG.baseXpPerTurn + bonusXpAwarded;
        user.xp = (user.xp || 0) + xpAward;

        let specialXpAwardedMessage = bonusXpAwarded > 0 ? `${bonusXpAwarded} XP (${bonusXpReason})` : `${xpAward} XP`;
        while (user.xp >= BRAND_CONFIG.cumulativeXpForLevel((user.level || 1) + 1)) {
            user.level += 1;
            specialXpAwardedMessage = `LEVEL_UP! New level: ${user.level}`;
        }

        const tutorsJustUnlocked = getTutorsToUnlock(user.level, user.unlockedItems || []);
		if (tutorsJustUnlocked.length > 0) {
			// Ensure unlockedItems is initialized before pushing
			if (!user.unlockedItems) {
				user.unlockedItems = [];
			}
			user.unlockedItems.push(...tutorsJustUnlocked);
			user.markModified('unlockedItems');
		}
        await user.save();

        const xpForCurrentLevelStart = BRAND_CONFIG.cumulativeXpForLevel(user.level);

        // Clean up all temp files after successful processing
        files.forEach(file => {
            if (file.path) {
                try {
                    fsSync.unlinkSync(file.path);
                    console.log(`[chatWithFile] Cleaned up temp file: ${file.path}`);
                } catch (cleanupErr) {
                    console.error(`[chatWithFile] Failed to cleanup ${file.path}:`, cleanupErr.message);
                }
            }
        });

        res.json({
            text: aiResponseText,
            userXp: user.xp - xpForCurrentLevelStart,
            userLevel: user.level,
            xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level),
            specialXpAwarded: specialXpAwardedMessage,
            voiceId: tutor.voiceId,
            newlyUnlockedTutors: tutorsJustUnlocked,
            drawingSequence: null // Add drawing logic here if needed for file uploads
        });

    } catch (error) {
        console.error("ERROR: Chat-with-file route failed:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        // Clean up temp files on error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (file.path) {
                    try {
                        fsSync.unlinkSync(file.path);
                    } catch (cleanupErr) {
                        console.error(`Failed to cleanup temp file: ${cleanupErr.message}`);
                    }
                }
            });
        }

        // Return more helpful error message
        if (error.response?.status === 400) {
            return res.status(400).json({
                message: "The request to process your file was invalid. The PDF content might be too large.",
                error: error.response?.data?.error?.message || "Bad request"
            });
        }

        res.status(500).json({ message: "An internal server error occurred." });
    }
});

module.exports = router;// JavaScript Document