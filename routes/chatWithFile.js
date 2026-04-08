const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const { isAuthenticated } = require('../middleware/auth');
const { promptInjectionFilter } = require('../middleware/promptInjection');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const StudentUpload = require('../models/studentUpload');
const TutorPlan = require('../models/tutorPlan');
const { generateSystemPrompt } = require('../utils/prompt');
const TUTOR_CONFIG = require('../utils/tutorConfig');
const BRAND_CONFIG = require('../utils/brand');
const pdfOcr = require('../utils/pdfOcr');
const { validateUpload, uploadRateLimiter } = require('../middleware/uploadSecurity');
const { callLLM } = require('../utils/llmGateway');
const { applyWorksheetGuard, filterAnswerKeyResponse } = require('../utils/worksheetGuard');
const { runPipeline, verify: pipelineVerify } = require('../utils/pipeline');
const { UPLOAD_CONTEXT_REMINDER } = require('../utils/visualCapabilities');

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

        // Process all files in parallel for faster uploads
        const fileProcessingPromises = files.map(async (file) => {
            console.log(`[chatWithFile] Processing file: ${file.originalname} (${file.mimetype})`);

            if (file.mimetype === 'application/pdf') {
                console.log(`[chatWithFile] Using Mathpix PDF endpoint for: ${file.originalname}`);
                const fileBuffer = fsSync.readFileSync(file.path);
                const extractedText = await pdfOcr(fileBuffer, file.originalname);

                if (extractedText && extractedText.trim()) {
                    console.log(`[chatWithFile] Extracted ${extractedText.length} characters from PDF`);
                    return { type: 'pdf', filename: file.originalname, text: extractedText };
                } else {
                    console.warn(`[chatWithFile] No text extracted from PDF: ${file.originalname}`);
                    return { type: 'pdf', filename: file.originalname, text: `[Could not extract text from ${file.originalname}]` };
                }
            } else {
                console.log(`[chatWithFile] Using Vision API for: ${file.originalname}`);
                let fileBuffer = fsSync.readFileSync(file.path);
                try {
                    fileBuffer = await sharp(fileBuffer)
                        .rotate()
                        .withMetadata({})
                        .toBuffer();
                } catch (stripErr) {
                    console.warn('[chatWithFile] EXIF strip failed:', stripErr.message);
                }
                const base64 = fileBuffer.toString('base64');
                const dataUrl = `data:${file.mimetype};base64,${base64}`;
                return {
                    type: 'image',
                    content: { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
                };
            }
        });

        let fileResults;
        try {
            fileResults = await Promise.all(fileProcessingPromises);
        } catch (processingError) {
            console.error(`[chatWithFile] File processing error:`, processingError.message);
            files.forEach(f => { if (f.path) try { fsSync.unlinkSync(f.path); } catch(e) {} });
            return res.status(500).json({
                message: `Failed to process files: ${processingError.message}`,
                error: 'FILE_PROCESSING_ERROR'
            });
        }

        // Separate results into images and PDFs
        for (const result of fileResults) {
            if (result.type === 'pdf') {
                pdfTexts.push({ filename: result.filename, text: result.text });
            } else {
                imageContents.push(result.content);
            }
        }

        console.log(`[chatWithFile] Prepared ${imageContents.length} image(s) for vision API, ${pdfTexts.length} PDF(s) processed`);

        // --- Step 2: Build pipeline context and run through unified pipeline ---
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

        // Add PDF extracted text to the message with smart truncation
        if (pdfTexts.length > 0) {
            const MAX_PDF_CHARS = 12000; // ~3k tokens, leaves room for system prompt + history
            const pdfContent = pdfTexts.map(({ filename, text }) => {
                if (text.length > MAX_PDF_CHARS) {
                    console.log(`[chatWithFile] Truncating PDF content from ${text.length} to ${MAX_PDF_CHARS} chars: ${filename}`);
                    return `[Content from ${filename} — showing first ${MAX_PDF_CHARS} of ${text.length} characters]\n${text.substring(0, MAX_PDF_CHARS)}\n\n[... content truncated. Ask the student which section or problem they need help with if the relevant content may be in the truncated portion.]`;
                }
                return `[Content from ${filename}]\n${text}`;
            }).join('\n\n');
            combinedText = `${combinedText}\n\n${pdfContent}`;
        }

        // ANTI-CHEAT: Append worksheet detection guard (centralized in utils/worksheetGuard.js)
        // IMPORTANT: Apply ONLY to the AI message, NOT to the stored/displayed conversation message.
        const guardedText = applyWorksheetGuard(combinedText);

        // Store user message in conversation (text only, for history) — WITHOUT the guard
        activeConversation.messages.push({ role: 'user', content: combinedText });

        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;

        // Build upload context description so the system prompt knows files are present
        const fileDescriptions = files.map(f => f.originalname).join(', ');
        const uploadContext = `Student uploaded ${files.length} file(s): ${fileDescriptions}. You CAN see this content — reference it directly.`;

        const systemPrompt = generateSystemPrompt(user.toObject(), tutor, null, 'student', null, uploadContext);

        // Build formatted messages for the pipeline.
        // History uses text-only messages. The LAST user message is replaced with
        // the vision-formatted version so the LLM sees the uploaded images.
        const recentMessages = activeConversation.messages.slice(-40)
            .filter(msg => ['user', 'assistant'].includes(msg.role) && msg.content && msg.content.trim().length > 0)
            .map(m => ({ role: m.role, content: m.content }));

        // Replace the last user message with vision-formatted version (text + images)
        // UPLOAD_CONTEXT_REMINDER is injected RIGHT NEXT to the image so the AI
        // literally cannot miss the instruction to reference what it sees.
        // Uses guardedText so the AI sees the worksheet detection instruction.
        if (recentMessages.length > 0 && recentMessages[recentMessages.length - 1].role === 'user') {
            if (imageContents.length > 0) {
                // Multimodal: text + images for vision API
                recentMessages[recentMessages.length - 1] = {
                    role: 'user',
                    content: [
                        { type: "text", text: `${UPLOAD_CONTEXT_REMINDER}\n\n${guardedText}` },
                        ...imageContents
                    ]
                };
            } else {
                // PDF-only: just use the guarded text (no images to attach)
                recentMessages[recentMessages.length - 1] = {
                    role: 'user',
                    content: `${UPLOAD_CONTEXT_REMINDER}\n\n${guardedText}`
                };
            }
        }

        const aiStartTime = Date.now();

        // Pre-load TutorPlan (avoids duplicate DB query inside pipeline)
        let preloadedTutorPlan = null;
        try {
            preloadedTutorPlan = await TutorPlan.findOne({ userId: user._id });
        } catch (err) {
            console.error('[chatWithFile] TutorPlan load error (non-fatal):', err.message);
        }

        // --- Run through the FULL tutoring pipeline ---
        // This ensures file uploads get the same Socratic enforcement, anti-cheat,
        // instructional mode detection, and learning engine updates as regular chat.
        let pipelineResult;
        try {
            pipelineResult = await runPipeline(combinedText, {
                user,
                conversation: activeConversation,
                systemPrompt,
                formattedMessages: recentMessages,
                activeSkill: null,
                tutorPlan: preloadedTutorPlan,
                phaseState: activeConversation.phaseState || null,
                hasRecentUpload: true,
                stream: false,
                res: null,
                aiProcessingStartTime: aiStartTime,
            });
        } catch (pipelineError) {
            // Pipeline failed — fall back to direct LLM call so student always gets a response
            console.error('[chatWithFile] Pipeline FALLBACK triggered:', pipelineError.message);

            const fallbackMessages = [
                { role: 'system', content: systemPrompt },
                ...recentMessages,
            ];

            let fallbackText;
            try {
                const completion = await callLLM(PRIMARY_CHAT_MODEL, fallbackMessages, {
                    temperature: 0.55,
                    max_tokens: 1500,
                });
                fallbackText = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond.";
            } catch (llmError) {
                console.error('[chatWithFile] Fallback LLM call also failed:', llmError.message);
                fallbackText = "I'm having trouble right now. Could you try again?";
            }

            // Run verify stage on fallback response
            try {
                const verified = await pipelineVerify(fallbackText, {
                    userId: userId?.toString(),
                    userMessage: combinedText,
                    iepReadingLevel: user.iepPlan?.readingLevel || null,
                    firstName: user.firstName,
                    isStreaming: false,
                });
                fallbackText = verified.text;
            } catch (verifyErr) {
                const answerKeyCheck = filterAnswerKeyResponse(fallbackText, userId);
                if (answerKeyCheck.wasFiltered) fallbackText = answerKeyCheck.text;
            }

            // Build a minimal pipelineResult for the fallback path
            activeConversation.messages.push({ role: 'assistant', content: fallbackText.trim() });
            await activeConversation.save();

            pipelineResult = {
                text: fallbackText,
                xpBreakdown: { tier1: 0, tier2: 0, tier2Type: null, tier3: 0, tier3Behavior: null, total: 0 },
                leveledUp: false,
                tutorsUnlocked: [],
                avatarBuilderUnlocked: false,
                visualCommands: null,
                drawingSequence: null,
                problemResult: null,
                suggestions: null,
                _pipeline: { fallback: true, error: pipelineError.message },
            };
        }

        let aiResponseText = pipelineResult.text;

        // --- Step 3: Save uploaded files to student's resource library ---
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
                if (fileType === 'pdf') {
                    // Match by filename since PDF indices may not align with file indices
                    const pdfMatch = pdfTexts.find(p => p.filename === file.originalname);
                    extractedText = pdfMatch?.text || '';
                }
                // Images: extractedText stays empty (vision API handles images directly,
                // there's no text extraction to store)

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

        // XP and leveling are handled by the pipeline's persist stage.
        // The user document was modified in-place by the pipeline.
        const xpForCurrentLevelStart = BRAND_CONFIG.cumulativeXpForLevel(user.level);

        res.json({
            text: aiResponseText,
            userXp: Math.max(0, user.xp - xpForCurrentLevelStart),
            userLevel: user.level,
            xpNeeded: BRAND_CONFIG.xpRequiredForLevel(user.level),
            specialXpAwarded: pipelineResult.xpBreakdown
                ? `${pipelineResult.xpBreakdown.total} XP`
                : `${BRAND_CONFIG.baseXpPerTurn} XP`,
            voiceId: tutor.voiceId,
            newlyUnlockedTutors: pipelineResult.tutorsUnlocked || [],
            avatarBuilderUnlocked: pipelineResult.avatarBuilderUnlocked || false,
            drawingSequence: pipelineResult.drawingSequence || null,
            visualCommands: pipelineResult.visualCommands || null,
            problemResult: pipelineResult.problemResult || null,
            suggestions: pipelineResult.suggestions || null,
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

module.exports = router;
