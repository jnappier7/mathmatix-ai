// routes/upload.js - CORRECTED
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { generateSystemPrompt } = require("../utils/prompt");
const User = require("../models/user");
const { callLLM } = require("../utils/llmGateway"); // CTO REVIEW FIX: Use unified LLMGateway
const ocr = require("../utils/ocr");
const pdfOcr = require("../utils/pdfOcr");
const TUTOR_CONFIG = require('../utils/tutorConfig');

const PRIMARY_UPLOAD_AI_MODEL = "gpt-4o-mini";

// CTO REVIEW FIX: Use diskStorage instead of memoryStorage to prevent server crashes
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post("/", upload.single("file"), async (req, res) => {
    try {
        const file = req.file;

        // Debug logging
        console.log('[Upload API] Request received:', {
            hasFile: !!file,
            hasUser: !!req.user,
            fileInfo: file ? {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                path: file.path
            } : null
        });

        if (!file) {
            return res.status(400).json({ error: "No file uploaded." });
        }

        // Get userId from authenticated session (req.user is set by isAuthenticated middleware)
        if (!req.user || !req.user._id) {
            // Clean up temp file
            if (file.path) fs.unlinkSync(file.path);
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Fetch the user profile for personalized prompt generation
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            // Clean up temp file
            if (file.path) fs.unlinkSync(file.path);
            return res.status(404).json({ error: "User profile not found for prompt generation." });
        }

        console.log('[Upload API] Processing file from disk:', file.path);

        // Perform OCR - use appropriate processor based on file type
        let extracted;
        try {
            // Read file from disk into buffer for OCR processing
            const fileBuffer = fs.readFileSync(file.path);

            if (file.mimetype === 'application/pdf') {
                // Use Mathpix /v3/pdf endpoint for PDFs
                console.log('[Upload API] Processing PDF with Mathpix...');
                extracted = await pdfOcr(fileBuffer, file.originalname);
            } else {
                // Use Mathpix /v3/text endpoint for images
                console.log('[Upload API] Processing image with Mathpix...');
                const base64Image = `data:${file.mimetype};base64,${fileBuffer.toString("base64")}`;
                extracted = await ocr(base64Image);
            }
        } catch (ocrError) {
            console.error('[Upload API] OCR processing error:', ocrError.message);
            // Clean up temp file
            if (file.path) fs.unlinkSync(file.path);
            return res.status(500).json({
                error: `Failed to process file: ${ocrError.message}`,
                extractedText: ""
            });
        }

        if (!extracted || extracted.trim() === '') {
            console.warn('[Upload API] No text extracted from file');
            // Clean up temp file
            if (file.path) fs.unlinkSync(file.path);
            return res.status(200).json({
                text: "I couldn't read any text from that file. Could you try a clearer picture or type out the problem?",
                extractedText: ""
            });
        }

        console.log('[Upload API] Successfully extracted text, length:', extracted.length);

        // Get tutor configuration
        const tutor = TUTOR_CONFIG[user.selectedTutorId] || TUTOR_CONFIG.default;

        // Generate the personalized system prompt
        const systemPrompt = generateSystemPrompt(user, tutor, null, 'student');

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here's the math text from an uploaded image/PDF: """${extracted}""". Please help me understand it. Start by re-stating the problem clearly.` }
        ];

        // Use the centralized LLM call function
        const completion = await callLLM(PRIMARY_UPLOAD_AI_MODEL, messages, { max_tokens: 400 });

        const reply = completion.choices[0]?.message?.content?.trim() || "No feedback generated.";

        // Clean up temp file after successful processing
        if (file.path) {
            fs.unlinkSync(file.path);
            console.log('[Upload API] Cleaned up temp file:', file.path);
        }

        return res.json({ text: reply, extractedText: extracted });

    } catch (err) {
        console.error("ERROR in /api/upload:", err);
        // Clean up temp file on error
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupErr) {
                console.error('Failed to cleanup temp file:', cleanupErr);
            }
        }
        // Provide a more generic error to the client for security
        res.status(500).json({ error: "An unexpected error occurred on the server." });
    }
});

module.exports = router;