const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const GradingResult = require('../models/gradingResult');
const { gradeWithVision } = require('../utils/llmGateway');
const { validateUpload, uploadRateLimiter } = require('../middleware/uploadSecurity');

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
Be MATHEMATICALLY RIGOROUS but talk like a supportive teacher, not a rubric.

# YOUR APPROACH

## 1. SOLVE EVERY PROBLEM YOURSELF (privately)
Before looking at the student's work, solve each problem from scratch.
You need a verified answer key, but the student never sees your scratch work.

## 2. COMPARE — then GUIDE
For correct problems: celebrate SPECIFICALLY what they did well ("nice use of distribution here").
For incorrect problems: DON'T just state the error and correction. Instead, write feedback that:
- Acknowledges what they DID right (setup, approach, partial steps)
- Points to the area where things went off track
- Asks a guiding question so they can discover the mistake ("look at step 3 — what happens to the sign when you distribute a negative?")
- Optionally offers to walk through a similar problem ("let me show you one like this...")

The goal: the student should be able to re-attempt the problem after reading your feedback.

## 3. CATEGORIZE ERRORS (for internal tracking)
Tag each error: arithmetic | sign | algebraic | order-of-operations | graphing | notation | conceptual | incomplete | other

# OUTPUT — RESPOND WITH ONLY THIS JSON (inside \`\`\`json fences)

\`\`\`json
{
  "problems": [
    {
      "problemNumber": 1,
      "problemStatement": "Brief restatement of the problem",
      "studentAnswer": "What the student wrote",
      "correctAnswer": "Your verified correct answer",
      "isCorrect": true,
      "strengths": "Specific praise: what concept or technique they nailed",
      "errors": [],
      "feedback": "This looks right — you distributed correctly and combined like terms. Solid work."
    },
    {
      "problemNumber": 2,
      "problemStatement": "...",
      "studentAnswer": "...",
      "correctAnswer": "...",
      "isCorrect": false,
      "strengths": "You set up the equation correctly and showed every step — that's great.",
      "errors": [
        {
          "step": "Step 3",
          "description": "Distributed the negative incorrectly: -(2x - 6) became -2x - 6 instead of -2x + 6",
          "category": "sign",
          "correction": "When you distribute a negative across parentheses, every sign inside flips."
        }
      ],
      "feedback": "Your setup was solid. Take another look at step 3 — when you distributed the negative, what should happen to the minus sign inside the parentheses? Try reworking from that step and see if you get a different answer."
    }
  ],
  "overallFeedback": "Conversational summary. Start by naming what looks correct. Then gently point to the problems that need another look. End with encouragement or an offer to walk through a similar problem together.",
  "whatWentWell": "Specific strengths — what does this student clearly understand?",
  "practiceRecommendations": ["Distributing negatives across parentheses", "Checking signs after each step"],
  "skillsAssessed": ["linear-equations", "distribution"]
}
\`\`\`

RULES:
- Respond ONLY with the JSON block (inside \`\`\`json fences). No preamble.
- Do NOT assign numerical scores, grades, or percentages anywhere.
- Feedback must be CONVERSATIONAL and SOCRATIC — ask guiding questions, don't just state corrections.
- Always find strengths, even in wrong answers.
- For incorrect problems: guide the student toward discovering the error, don't just hand them the fix.
- Write like you're talking to the student, not writing a report about them.
- Use LaTeX notation for ALL math expressions in feedback, answers, and corrections. Wrap inline math with \\( and \\), and display math with \\[ and \\]. Example: "You wrote \\(x = -3\\) but check what happens when you distribute the negative — you should get \\(-(2x - 6) = -2x + 6\\)."
- The studentAnswer and correctAnswer fields MUST also use LaTeX for any math.`;

// ============================================================================
// PARSE AI RESPONSE
// ============================================================================

function parseAnalysisResponse(raw) {
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

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
    try {
        const file = req.file;
        const user = await User.findById(req.user._id);

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        if (!file.mimetype.startsWith('image/')) {
            if (file.path) fs.unlinkSync(file.path);
            return res.status(400).json({ success: false, message: 'Only image files are supported' });
        }

        console.log(`[gradeWork] Analyzing work for user: ${user.firstName} ${user.lastName}`);

        // Read file and convert to base64 data URL for vision API
        const fileBuffer = fs.readFileSync(file.path);
        const base64Image = fileBuffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

        // Call vision model — low temperature for mathematical accuracy
        const aiResponse = await gradeWithVision({
            imageDataUrl: dataUrl,
            prompt: ANALYSIS_PROMPT
        }, {
            maxTokens: 4000,
            temperature: 0.2
        });

        console.log('[gradeWork] AI analysis received');

        // Parse structured JSON
        const parsed = parseAnalysisResponse(aiResponse);
        const correctCount = parsed.problems.filter(p => p.isCorrect).length;

        // Calculate XP
        const xpEarned = calculateXP(parsed.problems.length, correctCount);
        user.xp = (user.xp || 0) + xpEarned;
        await user.save();

        // Persist to database
        const result = await GradingResult.create({
            userId: user._id,
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

        console.log(`[gradeWork] Saved analysis ${result._id}`);

        // Clean up temp file
        if (file.path) fs.unlinkSync(file.path);

        // Return structured result (no base64 image echo)
        res.json({
            success: true,
            id: result._id,
            problemCount: parsed.problems.length,
            correctCount,
            problems: parsed.problems,
            overallFeedback: parsed.overallFeedback || '',
            whatWentWell: parsed.whatWentWell || '',
            practiceRecommendations: parsed.practiceRecommendations || [],
            xpEarned,
            message: 'Work analyzed successfully'
        });

    } catch (error) {
        console.error('[gradeWork] Error:', error.message);

        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
        }

        if (error instanceof SyntaxError) {
            return res.status(502).json({
                success: false,
                message: 'The AI returned an unexpected format. Please try again.'
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
