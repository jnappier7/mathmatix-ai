// routes/upload.js - CORRECTED
const express = require("express");
const multer = require("multer");
const router = express.Router();
const { generateSystemPrompt } = require("../utils/prompt");
const User = require("../models/user");
const { callLLM } = require("../utils/openaiClient");
const ocr = require("../utils/ocr");
const pdfToImage = require("../utils/pdf-to-image");

const PRIMARY_UPLOAD_AI_MODEL = "gpt-4o-mini";

const upload = multer({ storage: multer.memoryStorage() });

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
                hasBuffer: !!file.buffer,
                bufferLength: file.buffer?.length
            } : null
        });

        if (!file) {
            return res.status(400).json({ error: "No file uploaded." });
        }

        // Get userId from authenticated session (req.user is set by isAuthenticated middleware)
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Fetch the user profile for personalized prompt generation
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(404).json({ error: "User profile not found for prompt generation." });
        }

        // Convert PDF to image if necessary
        const isPDF = file.mimetype.includes("pdf");
        let imageBuffer;

        if (isPDF) {
            imageBuffer = await pdfToImage(file.buffer);
            // If PDF conversion fails (e.g., missing dependencies), return helpful error
            if (!imageBuffer) {
                return res.status(400).json({
                    error: "PDF processing is temporarily unavailable. Please convert your PDF to an image (PNG/JPG) and try again."
                });
            }
        } else {
            // For images, use the buffer directly
            imageBuffer = file.buffer;
        }

        // Verify we have a valid buffer
        if (!imageBuffer || imageBuffer.length === 0) {
            return res.status(400).json({ error: "Failed to process the file. Please try again with a different file." });
        }
        
        // Perform OCR
        const base64Image = `data:${isPDF ? 'image/png' : file.mimetype};base64,${imageBuffer.toString("base64")}`;
        const extracted = await ocr(base64Image);
        
        if (!extracted || extracted.trim() === '') {
            return res.status(200).json({ 
                text: "I couldn't read any text from that image. Could you try a clearer picture or type out the problem?",
                extracted: "" 
            });
        }

        // Generate the personalized system prompt
        const systemPrompt = generateSystemPrompt(user);
        
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here's the math text from an uploaded image/PDF: """${extracted}""". Please help me understand it. Start by re-stating the problem clearly.` }
        ];

        // Use the centralized LLM call function
        const completion = await callLLM(PRIMARY_UPLOAD_AI_MODEL, messages, { max_tokens: 400 });

        const reply = completion.choices[0]?.message?.content?.trim() || "No feedback generated.";
        
        return res.json({ text: reply, extracted });

    } catch (err) {
        console.error("ERROR in /api/upload:", err);
        // Provide a more generic error to the client for security
        res.status(500).json({ error: "An unexpected error occurred on the server." });
    }
});

module.exports = router;