// routes/uploadClassify.js
//
// Lightweight "what is this image?" classifier for the unified upload UX.
//
// The student no longer has to pre-decide between "Grade my work" and
// "Upload" before they've taken the picture. They just snap/attach a photo;
// the card calls this endpoint to figure out whether the image shows
// *completed student work* (→ suggest "Check my work") or a *fresh/blank
// problem* with nothing worked yet (→ suggest "Help me with this"). The
// client uses the result only to PRE-SELECT a one-tap chip — the student
// still confirms, so a wrong guess is cheap.
//
// This is intentionally cheap and OCR-free: a single gpt-4o-mini vision call
// with a tiny token budget. It does NOT grade, does NOT return answers, and
// does NOT persist anything. The real grading path (/api/grade-work) and the
// tutoring path (/api/chat) keep all of their anti-cheat guards — this only
// routes the student to the right one.
//
// Mounted at /api/upload/classify BEFORE the premium-gated /api/upload so the
// suggestion works for every signed-in student; the paywall still lives on the
// grade/tutoring action the chip actually triggers.
const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const router = express.Router();
const { gradeWithVision } = require('../utils/llmGateway');
const { validateUpload } = require('../middleware/uploadSecurity');

const ALLOWED_MIMETYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images can be classified.'), false);
    }
});

const CLASSIFY_PROMPT = `You are sorting a photo a student just took of their math. Decide ONE thing: does the image show the student's OWN worked attempt (handwritten steps, written answers, work shown), or is it an unworked problem (a blank/printed worksheet, a textbook page, or a typed problem with nothing solved yet)?

Respond with ONLY a JSON object, no prose, no code fence:
{
  "hasWork": true|false,        // true if the student has clearly written work or answers
  "problemCount": <integer>,    // how many distinct problems are visible (0 if unclear)
  "confidence": 0.0-1.0,        // how sure you are about hasWork
  "reason": "<≤12 words, e.g. 'answers written for all 4 problems'>"
}

Do NOT solve anything. Do NOT include any answers. Only classify.`;

// Map the raw model judgement into the intent the client pre-selects.
function deriveIntent({ hasWork, confidence }) {
    if (confidence != null && confidence < 0.55) return 'ambiguous';
    return hasWork ? 'check_work' : 'get_help';
}

function parseClassification(raw) {
    if (!raw) return null;
    // Tolerate code fences / stray prose around the JSON.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const obj = JSON.parse(match[0]);
        return {
            hasWork: !!obj.hasWork,
            problemCount: Number.isFinite(obj.problemCount) ? obj.problemCount : 0,
            confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : null,
            reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 80) : ''
        };
    } catch (_) {
        return null;
    }
}

router.post('/', upload.single('file'), validateUpload, async (req, res) => {
    const file = req.file;
    try {
        if (!file) return res.status(400).json({ error: 'No file uploaded.' });
        if (!req.user || !req.user._id) {
            await fs.unlink(file.path).catch(() => {});
            return res.status(401).json({ error: 'Authentication required.' });
        }

        let buffer = await fs.readFile(file.path);
        // Strip EXIF (GPS/device) and normalize orientation before sending out.
        try {
            buffer = await sharp(buffer).rotate().withMetadata({}).toBuffer();
        } catch (e) {
            console.warn('[ClassifyAPI] EXIF strip failed, using original:', e.message);
        }

        const imageDataUrl = `data:${file.mimetype};base64,${buffer.toString('base64')}`;

        let raw;
        try {
            raw = await gradeWithVision(
                { imageDataUrl, prompt: CLASSIFY_PROMPT, user: req.user },
                { model: 'gpt-4o-mini', maxTokens: 120, temperature: 0 }
            );
        } catch (e) {
            // Vision failed — tell the client to fall back to a neutral chooser.
            console.warn('[ClassifyAPI] vision classify failed (non-fatal):', e.message);
            return res.status(200).json({ intent: 'ambiguous', hasWork: null, problemCount: 0, confidence: null, reason: '' });
        }

        const parsed = parseClassification(raw);
        if (!parsed) {
            return res.status(200).json({ intent: 'ambiguous', hasWork: null, problemCount: 0, confidence: null, reason: '' });
        }

        return res.status(200).json({ intent: deriveIntent(parsed), ...parsed });
    } catch (err) {
        console.error('[ClassifyAPI] unexpected error:', err.message);
        // Never block the upload UX on a classifier error.
        return res.status(200).json({ intent: 'ambiguous', hasWork: null, problemCount: 0, confidence: null, reason: '' });
    } finally {
        if (file && file.path) await fs.unlink(file.path).catch(() => {});
    }
});

module.exports = router;
// Exposed for unit testing the (brittle) parsing + routing logic without a
// live vision call. The router itself is still the default export.
module.exports.parseClassification = parseClassification;
module.exports.deriveIntent = deriveIntent;
