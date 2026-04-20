// routes/upload.js
//
// OCR-only file upload endpoint.
//
// This route extracts text from an uploaded image or PDF and returns it.
// It does NOT call the LLM — all tutoring flows through /api/chat, which
// runs the full verify pipeline (worksheet guard, answer-key filter,
// worked-solution detector, LaTeX normalization, visual command
// enforcement, streaming replacements, etc.). Keeping this endpoint
// OCR-only eliminates the parallel entry point that previously bypassed
// those guards.
//
// Consumers just display the extracted text (preview pane, debug page);
// when the student actually wants help, the chat client sends the file
// through /api/chat.
const express = require("express");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const router = express.Router();
const User = require("../models/user");
const ocr = require("../utils/ocr");
const pdfOcr = require("../utils/pdfOcr");
const { validateUpload } = require('../middleware/uploadSecurity');

// Allowed MIME types for upload file filter (defense-in-depth alongside validateUpload middleware)
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

// CTO REVIEW FIX: Use diskStorage instead of memoryStorage to prevent server crashes
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images (JPG, PNG, WEBP) and PDFs are allowed.'), false);
        }
    }
});

router.post("/", upload.single("file"), validateUpload, async (req, res) => {
    try {
        const file = req.file;

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

        if (!req.user || !req.user._id) {
            if (file.path) await fs.unlink(file.path).catch(() => {});
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Verify the user exists — keeps the auth contract identical to before.
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            if (file.path) await fs.unlink(file.path).catch(() => {});
            return res.status(404).json({ error: "User profile not found." });
        }

        console.log('[Upload API] OCR file from disk:', file.path);

        let extracted;
        try {
            let fileBuffer = await fs.readFile(file.path);

            // COMPLIANCE: Strip EXIF metadata (GPS, device info, timestamps)
            // from images before sending them to the OCR provider.
            if (file.mimetype !== 'application/pdf') {
                try {
                    fileBuffer = await sharp(fileBuffer)
                        .rotate()          // Auto-rotate based on EXIF orientation before stripping
                        .withMetadata({})  // Strip all EXIF/IPTC/XMP metadata
                        .toBuffer();
                } catch (stripError) {
                    console.warn('[Upload API] EXIF strip failed, continuing with original:', stripError.message);
                }
            }

            if (file.mimetype === 'application/pdf') {
                extracted = await pdfOcr(fileBuffer, file.originalname);
            } else {
                const base64Image = `data:${file.mimetype};base64,${fileBuffer.toString("base64")}`;
                extracted = await ocr(base64Image);
            }
        } catch (ocrError) {
            console.error('[Upload API] OCR processing error:', ocrError.message);
            if (file.path) await fs.unlink(file.path).catch(() => {});
            return res.status(500).json({
                error: `Failed to process file: ${ocrError.message}`,
                extractedText: ""
            });
        }

        if (file.path) {
            await fs.unlink(file.path).catch(() => {});
        }

        if (!extracted || extracted.trim() === '') {
            return res.status(200).json({ extractedText: "" });
        }

        console.log('[Upload API] Extracted text, length:', extracted.length);
        return res.json({ extractedText: extracted });

    } catch (err) {
        console.error("ERROR in /api/upload:", err);
        if (req.file && req.file.path) {
            await fs.unlink(req.file.path).catch(cleanupErr => {
                console.error('Failed to cleanup temp file:', cleanupErr);
            });
        }
        res.status(500).json({ error: "An unexpected error occurred on the server." });
    }
});

module.exports = router;
