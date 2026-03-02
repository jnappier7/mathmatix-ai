const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const GradingResult = require('../models/gradingResult');
const { gradeWithVision } = require('../utils/llmGateway');
const { validateUpload, uploadRateLimiter } = require('../middleware/uploadSecurity');
const { detectBlankWork, stripCorrectAnswers } = require('../utils/worksheetGuard');
const pdfOcr = require('../utils/pdfOcr');

// Disk storage to avoid memory bloat on large uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ============================================================================
// ANALYSIS PROMPT — feedback-first, no numerical grading
// ============================================================================

const ANALYSIS_PROMPT = `You are a warm, Socratic math tutor looking at a student's handwritten work.
Your job is to GUIDE them toward understanding — not grade them or hand them answers.
Talk like a real tutor sitting next to a student, not a grading rubric.

# CRITICAL FIRST STEP: DETECT BLANK OR UNATTEMPTED WORK

🚨 **BEFORE ANALYZING ANYTHING, check if the student has actually written work on the page.**

Look for these signs of a BLANK or UNATTEMPTED worksheet:
- Only PRINTED/TYPED text (questions, directions, headers) — no handwriting
- Blank answer spaces, empty lines, or unfilled boxes
- A worksheet header with "Name:", "Date:", "Period:" that may be blank
- Multiple numbered problems with no student work between or beside them
- Clean, untouched paper with only the printed assignment

**IF THE WORKSHEET IS BLANK OR HAS NO STUDENT WORK, you MUST respond with ONLY this JSON:**

\`\`\`json
{
  "noWorkDetected": true,
  "problems": [],
  "overallFeedback": "I can see your worksheet but it looks like you haven't started yet! Give the problems a shot first, then send me another photo and I'll check your work.",
  "whatWentWell": "",
  "practiceRecommendations": [],
  "skillsAssessed": []
}
\`\`\`

**Do NOT solve the problems. Do NOT provide answers. Do NOT create an answer key.**
A blank worksheet with solved answers is CHEATING — you would be doing their homework for them.

**IF ONLY SOME PROBLEMS HAVE STUDENT WORK:** Only analyze the problems where you can see actual student handwriting or work. Skip blank problems entirely — do not solve them or include them in the response.

# YOUR APPROACH (ONLY if student work IS present)

## 1. VERIFY ANSWERS YOURSELF (privately)
Before reviewing the student's work, solve each attempted problem from scratch.
You need verified answers to check their work, but NEVER include your solutions for problems the student left blank.

## 2. COMPARE — then GUIDE
For correct problems: quick, specific praise. Keep it short — name what they did well in one sentence.

For incorrect problems: be a TUTOR, not a textbook.
- Name one thing they DID right (setup, approach, partial step) — one sentence.
- Point to WHERE things went off track — be specific about the step.
- Ask ONE guiding question so they can discover the mistake themselves. This is the most important part.
- Do NOT explain the full correction. Ask a question that leads them there.

TONE: Talk to them, not about them. Like you're sitting next to them pointing at their paper.
- Good: "Look at step 3 — what happens to that sign when you distribute the negative?"
- Bad: "The student incorrectly distributed the negative sign, resulting in an error."

## 3. CATEGORIZE ERRORS (for internal tracking)
Tag each error: arithmetic | sign | algebraic | order-of-operations | graphing | notation | conceptual | incomplete | other

# OUTPUT — RESPOND WITH ONLY THIS JSON (inside \`\`\`json fences)

\`\`\`json
{
  "noWorkDetected": false,
  "problems": [
    {
      "problemNumber": 1,
      "problemStatement": "Brief restatement of the problem",
      "studentAnswer": "What the student wrote (MUST be actual handwriting you can see — not the printed problem text)",
      "isCorrect": true,
      "strengths": "Nice — you distributed correctly and combined like terms.",
      "errors": [],
      "feedback": "Nailed it."
    },
    {
      "problemNumber": 2,
      "problemStatement": "...",
      "studentAnswer": "...",
      "isCorrect": false,
      "strengths": "Good setup — you showed your steps, which is exactly what I want to see.",
      "errors": [
        {
          "step": "Step 3",
          "description": "Distributed the negative incorrectly: -(2x - 6) became -2x - 6 instead of -2x + 6",
          "category": "sign",
          "correction": "When you distribute a negative, what happens to EACH sign inside the parentheses?"
        }
      ],
      "feedback": "Your setup is solid. Look at step 3 — when you distributed that negative, what should happen to the minus sign inside the parentheses? Rework from there and see what you get."
    }
  ],
  "overallFeedback": "Short, conversational — 2-3 sentences max. Name what's working, point to what needs another look, end with a nudge to retry.",
  "whatWentWell": "One sentence: what does this student clearly understand?",
  "practiceRecommendations": ["Distributing negatives across parentheses", "Checking signs after each step"],
  "skillsAssessed": ["linear-equations", "distribution"]
}
\`\`\`

RULES:
- Respond ONLY with the JSON block (inside \`\`\`json fences). No preamble.
- **NEVER include a "correctAnswer" field.** NEVER. Not even close. Not as a hint, not reworded, not "the answer should be..." Guide them to discover it.
- **The "correction" field in errors must be a QUESTION, not an answer.** It should be a Socratic prompt that leads the student to find the fix themselves. Good: "When you distribute a negative, what happens to each sign inside?" Bad: "The answer should be x = 6." Bad: "You should get -2x + 6." If you catch yourself writing the answer, rewrite it as a question.
- **Feedback must be SHORT.** 1-2 sentences for correct problems. 2-3 sentences for incorrect — a strength, a pointer, and a question. No paragraphs.
- Do NOT assign numerical scores, grades, or percentages anywhere.
- Talk TO the student ("your setup looks good") not ABOUT them ("the student's setup was correct").
- Always find a strength, even in wrong answers.
- **studentAnswer MUST reflect actual handwritten work visible in the image — NOT the printed problem text.** If you cannot distinguish student handwriting from printed text for a problem, mark it as having no work detected.
- Use LaTeX notation for ALL math expressions in feedback, answers, and corrections. Wrap inline math with \\( and \\), and display math with \\[ and \\]. Example: "You wrote \\(x = -3\\) but check what happens when you distribute the negative."
- The studentAnswer field MUST use LaTeX for any math.`;

// ============================================================================
// PARSE AI RESPONSE
// ============================================================================

function parseAnalysisResponse(raw) {
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    }

    let parsed;

    // First try: parse as-is (works when AI returns properly escaped JSON)
    try {
        parsed = JSON.parse(jsonStr);
    } catch (_) {
        // Second try: fix bare LaTeX backslashes that are invalid JSON escapes.
        // The prompt requires LaTeX like \( and \frac inside JSON string values,
        // which are not valid JSON escape sequences. We double-escape them while
        // preserving valid sequences like \", \\, \n, \/, \uXXXX, etc.
        const fixed = jsonStr.replace(
            /\\(["\\/bfnrt])|\\u([0-9a-fA-F]{4})|\\(.)/g,
            (match, validEsc, unicodeHex, other) => {
                if (validEsc !== undefined) return match;   // e.g. \", \\, \n
                if (unicodeHex !== undefined) return match;  // e.g. \u00A0
                return '\\\\' + other;                       // e.g. \( → \\(
            }
        );
        parsed = JSON.parse(fixed);
    }

    if (!parsed.problems || !Array.isArray(parsed.problems)) {
        throw new Error('AI response missing problems array');
    }

    return parsed;
}

// ============================================================================
// XP — rewards effort, not correctness
// ============================================================================

function calculateXP(problemCount, correctCount) {
    // 10 XP base for submitting work
    let xp = 10;
    // 3 XP per problem analyzed (rewards more work shown)
    xp += problemCount * 3;
    // Small bonus for each correct problem (2 XP each)
    xp += correctCount * 2;
    return xp;
}

// ============================================================================
// POST /api/grade-work — Analyze student work image
// ============================================================================

router.post('/',
    isAuthenticated,
    uploadRateLimiter,
    upload.single('file'),
    validateUpload,
    async (req, res) => {
    let aiResponse = '';
    try {
        const file = req.file;
        const user = await User.findById(req.user._id);
        const previousAttemptId = req.body.previousAttemptId || null;

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const isImage = file.mimetype.startsWith('image/');
        const isPDF = file.mimetype === 'application/pdf';

        if (!isImage && !isPDF) {
            if (file.path) fs.unlinkSync(file.path);
            return res.status(400).json({ success: false, message: 'Only image and PDF files are supported' });
        }

        console.log(`[gradeWork] Analyzing work for user: ${user.firstName} ${user.lastName} (${isPDF ? 'PDF' : 'image'})`);


        if (isPDF) {
            // PDF path: Extract text via Mathpix, then use text-based analysis
            console.log('[gradeWork] Processing PDF with Mathpix OCR...');
            const fileBuffer = fs.readFileSync(file.path);
            let extractedText;
            try {
                extractedText = await pdfOcr(fileBuffer, file.originalname);
            } catch (pdfErr) {
                console.error('[gradeWork] PDF extraction failed:', pdfErr.message);
                if (file.path) fs.unlinkSync(file.path);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to read the PDF. Please try uploading an image instead.'
                });
            }

            if (!extractedText || !extractedText.trim()) {
                if (file.path) fs.unlinkSync(file.path);
                return res.status(400).json({
                    success: false,
                    message: "I couldn't read any text from that PDF. Try taking a photo of your work instead."
                });
            }

            console.log(`[gradeWork] Extracted ${extractedText.length} chars from PDF`);

            // For PDFs with extracted text, use the text-based grading prompt
            const pdfPrompt = `${ANALYSIS_PROMPT}\n\n--- STUDENT'S WORK (extracted from uploaded PDF) ---\n${extractedText.substring(0, 15000)}${extractedText.length > 15000 ? '\n\n[Content truncated — analyze only the problems shown above]' : ''}`;

            // Use callLLM for text-based analysis (no vision needed)
            const { callLLM } = require('../utils/llmGateway');
            const completion = await callLLM('gpt-4o-mini', [
                { role: 'user', content: pdfPrompt }
            ], { max_tokens: 4000, temperature: 0.2 });

            aiResponse = completion.choices[0]?.message?.content?.trim() || '';
        } else {
            // Image path: Use vision API for handwriting recognition
            let fileBuffer = fs.readFileSync(file.path);
            try {
                fileBuffer = await sharp(fileBuffer)
                    .rotate()
                    .withMetadata({})
                    .toBuffer();
            } catch (stripError) {
                console.warn('[gradeWork] EXIF strip failed, continuing with original:', stripError.message);
            }
            const base64Image = fileBuffer.toString('base64');
            const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

            aiResponse = await gradeWithVision({
                imageDataUrl: dataUrl,
                prompt: ANALYSIS_PROMPT
            }, {
                maxTokens: 4000,
                temperature: 0.2
            });
        }

        console.log('[gradeWork] AI analysis received, length:', aiResponse.length);

        // Parse structured JSON
        const parsed = parseAnalysisResponse(aiResponse);

        // ANTI-CHEAT: If AI detected no student work, return early without grading
        if (parsed.noWorkDetected === true) {
            console.log(`[gradeWork] No student work detected for user: ${user.firstName} — rejecting grading`);
            if (file.path) fs.unlinkSync(file.path);
            return res.json({
                success: true,
                noWorkDetected: true,
                problemCount: 0,
                correctCount: 0,
                problems: [],
                overallFeedback: parsed.overallFeedback || "I can see the worksheet, but it looks like you haven't written your answers yet! Give the problems a try first, then snap another photo and I'll check your work.",
                whatWentWell: '',
                practiceRecommendations: [],
                xpEarned: 0,
                message: 'No student work detected'
            });
        }

        // ANTI-CHEAT: Server-side validation — if most studentAnswer fields are empty/blank,
        // the AI may have failed to detect a blank worksheet. Catch it here.
        const blankCheck = detectBlankWork(parsed.problems);

        if (blankCheck.isBlank) {
            console.warn(`[gradeWork] ANTI-CHEAT: ${blankCheck.blankCount}/${blankCheck.totalCount} answers blank — likely blank worksheet from user: ${user.firstName}`);
            if (file.path) fs.unlinkSync(file.path);
            return res.json({
                success: true,
                noWorkDetected: true,
                problemCount: 0,
                correctCount: 0,
                problems: [],
                overallFeedback: "It looks like most of the problems don't have answers written in yet. Try working through them first, then take another photo and I'll give you feedback!",
                whatWentWell: '',
                practiceRecommendations: [],
                xpEarned: 0,
                message: 'Insufficient student work detected'
            });
        }

        // ANTI-CHEAT: Strip any correctAnswer fields that the AI may have included despite instructions.
        // We never want to send correct answers to the student — that's an answer key.
        stripCorrectAnswers(parsed.problems);

        const correctCount = parsed.problems.filter(p => p.isCorrect).length;

        // Calculate XP
        const xpEarned = calculateXP(parsed.problems.length, correctCount);
        user.xp = (user.xp || 0) + xpEarned;
        await user.save();

        // Re-attempt tracking: look up previous attempt to calculate improvement
        let attemptNumber = 1;
        let improvement = null;

        if (previousAttemptId) {
            try {
                const prevResult = await GradingResult.findOne({
                    _id: previousAttemptId,
                    userId: user._id // Security: only allow linking to own results
                }).select('correctCount problemCount attemptNumber').lean();

                if (prevResult) {
                    attemptNumber = (prevResult.attemptNumber || 1) + 1;
                    const prevRate = prevResult.problemCount > 0 ? prevResult.correctCount / prevResult.problemCount : 0;
                    const newRate = parsed.problems.length > 0 ? correctCount / parsed.problems.length : 0;
                    improvement = {
                        previousCorrect: prevResult.correctCount,
                        previousTotal: prevResult.problemCount,
                        currentCorrect: correctCount,
                        currentTotal: parsed.problems.length,
                        delta: correctCount - prevResult.correctCount,
                        improved: newRate > prevRate
                    };
                    console.log(`[gradeWork] Re-attempt #${attemptNumber}: ${prevResult.correctCount}/${prevResult.problemCount} → ${correctCount}/${parsed.problems.length}`);
                }
            } catch (lookupErr) {
                console.warn(`[gradeWork] Could not look up previous attempt ${previousAttemptId}:`, lookupErr.message);
            }
        }

        // Persist to database
        const result = await GradingResult.create({
            userId: user._id,
            previousAttemptId: previousAttemptId || null,
            attemptNumber,
            problemCount: parsed.problems.length,
            correctCount,
            problems: parsed.problems,
            overallFeedback: parsed.overallFeedback || '',
            whatWentWell: parsed.whatWentWell || '',
            practiceRecommendations: parsed.practiceRecommendations || [],
            skillsAssessed: parsed.skillsAssessed || [],
            imageFilename: path.basename(file.path),
            imageMimetype: file.mimetype,
            xpEarned
        });

        console.log(`[gradeWork] Saved analysis ${result._id} (attempt #${attemptNumber})`);

        // Clean up temp file
        if (file.path) fs.unlinkSync(file.path);

        // Return structured result (no base64 image echo)
        res.json({
            success: true,
            id: result._id,
            attemptNumber,
            improvement,
            problemCount: parsed.problems.length,
            correctCount,
            problems: parsed.problems,
            overallFeedback: parsed.overallFeedback || '',
            whatWentWell: parsed.whatWentWell || '',
            practiceRecommendations: parsed.practiceRecommendations || [],
            xpEarned,
            message: improvement && improvement.improved
                ? `Nice improvement! ${improvement.previousCorrect}/${improvement.previousTotal} → ${correctCount}/${parsed.problems.length}`
                : 'Work analyzed successfully'
        });

    } catch (error) {
        console.error('[gradeWork] Error:', error.message);

        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
        }

        if (error instanceof SyntaxError) {
            console.error('[gradeWork] JSON parse failure. Raw AI response (first 500 chars):', (aiResponse || '').substring(0, 500));
            return res.status(502).json({
                success: false,
                message: 'The AI returned an unexpected format. Please try again.'
            });
        }

        // Detect AI service billing/capacity errors and return 503
        const errMsg = (error.message || '').toLowerCase();
        const errStatus = error.status || error.statusCode;
        const isBillingError = errMsg.includes('credit balance') || errMsg.includes('billing') || errMsg.includes('quota');
        const isAuthError = (errStatus === 401 || errStatus === 403) && (errMsg.includes('api') || errMsg.includes('key'));
        if (isBillingError || isAuthError) {
            return res.status(503).json({
                success: false,
                message: 'Our grading service is temporarily unavailable. Please try again later.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to analyze work. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================================================
// GET /api/grade-work/history — Student's analysis history
// ============================================================================

router.get('/history',
    isAuthenticated,
    async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const results = await GradingResult.getHistory(req.user._id, limit);

        res.json({
            success: true,
            results: results.map(r => ({
                id: r._id,
                problemCount: r.problemCount,
                correctCount: r.correctCount,
                status: r.status,
                teacherComment: r.teacherReview?.comment || null,
                xpEarned: r.xpEarned,
                createdAt: r.createdAt
            }))
        });
    } catch (error) {
        console.error('[gradeWork] History error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to load history' });
    }
});

// ============================================================================
// GET /api/grade-work/:id — Full analysis detail
// ============================================================================

router.get('/:id',
    isAuthenticated,
    async (req, res) => {
    try {
        const result = await GradingResult.findById(req.params.id);

        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        // Students can only view their own results
        if (result.userId.toString() !== req.user._id.toString() && req.user.role === 'student') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        res.json({ success: true, result: result.toStudentView() });
    } catch (error) {
        console.error('[gradeWork] Detail error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to load result' });
    }
});

// ============================================================================
// POST /api/grade-work/:id/review — Teacher review / comment
// ============================================================================

router.post('/:id/review',
    isAuthenticated,
    async (req, res) => {
    try {
        if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only teachers can review work' });
        }

        const result = await GradingResult.findById(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        const review = {
            teacherId: req.user._id,
            comment: req.body.comment || '',
            problemComments: req.body.problemComments || []
        };

        result.applyTeacherReview(review);
        await result.save();

        console.log(`[gradeWork] Teacher ${req.user._id} reviewed result ${result._id}`);

        res.json({
            success: true,
            result: result.toStudentView(),
            message: 'Review saved'
        });
    } catch (error) {
        console.error('[gradeWork] Review error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to save review' });
    }
});

module.exports = router;
