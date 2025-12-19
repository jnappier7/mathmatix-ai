const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const { gradeWithVision } = require('../utils/llmGateway'); // CTO REVIEW FIX: Use unified LLMGateway
const { validateUpload, uploadRateLimiter } = require('../middleware/uploadSecurity');

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

/**
 * POST /api/grade-work
 * Analyzes student's written math work and provides grading with feedback
 *
 * Security: Rate limited, file validation, access control
 */
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
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        if (!file.mimetype.startsWith('image/')) {
            // Clean up temp file
            if (file.path) fs.unlinkSync(file.path);
            return res.status(400).json({
                success: false,
                message: 'Only image files are supported'
            });
        }

        console.log(`[gradeWork] Processing work for user: ${user.firstName} ${user.lastName}`);

        // Read file from disk and convert to base64 for vision API
        const fileBuffer = fs.readFileSync(file.path);
        const base64Image = fileBuffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

        // Prepare grading prompt for AI with rigorous mathematical verification
        const gradingPrompt = `You are an expert math teacher grading a student's work. You must be MATHEMATICALLY RIGOROUS and ACCURATE.

# YOUR GRADING PROCESS (CRITICAL - FOLLOW EXACTLY):

## STEP 1: SOLVE EACH PROBLEM YOURSELF FIRST
Before grading, solve each problem in the image from scratch. Show your work:
- Identify each problem/question
- Solve it step-by-step with complete mathematical rigor
- Write out the correct answer
- This is your ANSWER KEY

## STEP 2: VERIFY STUDENT'S WORK AGAINST YOUR SOLUTION
Compare each step of the student's work to your correct solution:
- Check if they used the correct method
- Verify each arithmetic operation (addition, subtraction, multiplication, division)
- Check algebraic manipulations (combining like terms, factoring, distributing)
- Verify signs (positive/negative)
- Check if they simplified correctly
- Verify final answer matches yours

## STEP 3: COMMON ERROR PATTERNS TO CHECK
- **Arithmetic errors**: Did they add/subtract/multiply/divide correctly?
- **Sign errors**: Did they lose a negative sign? Distribute incorrectly?
- **Algebraic errors**: Did they combine unlike terms? Forget to apply operations to both sides?
- **Order of operations**: Did they follow PEMDAS correctly?
- **Graphing errors**: Did they plot points correctly? Choose correct direction for inequality?
- **Solution set errors**: Did they write the solution in correct notation?

## STEP 4: ASSIGN GRADE
Score out of 100 based on:
- **Correct final answer (40 points)**: Full credit only if answer is exactly correct
- **Correct methodology (40 points)**: Full credit only if approach and steps are sound
- **Work shown clearly (20 points)**: Partial credit based on clarity

BE STRICT: Mathematical correctness is binary. x = 8 is not the same as x = 64.

# OUTPUT FORMAT:

**SOLUTION KEY (YOUR WORK FIRST):**
[Solve each problem yourself step-by-step. This proves you know the correct answer.]

Problem 1: [Problem statement]
Step 1: [Your step]
Step 2: [Your step]
...
✓ CORRECT ANSWER: [Your answer]

Problem 2: [Problem statement]
[Your solution steps]
✓ CORRECT ANSWER: [Your answer]

[Continue for all problems...]

**SCORE: [number]/100**

**VERIFICATION:**
Problem 1:
- Student's answer: [Their answer]
- Correct answer: [Your answer from solution key]
- ✅ CORRECT / ❌ INCORRECT: [Explanation]
- Method used: ✅ VALID / ❌ INVALID: [Why]

Problem 2:
- Student's answer: [Their answer]
- Correct answer: [Your answer]
- ✅ CORRECT / ❌ INCORRECT: [Explanation]
- Method used: ✅ VALID / ❌ INVALID: [Why]

[Continue for all problems...]

**ANNOTATIONS:**
Study the image layout carefully. For each annotation:
ANNOTATION|type|x|y|mark

Where:
- type: "check" (✓), "miss" (✗), "partial" (-pts), "circle" (circle answer), "note" (brief text)
- x: horizontal % (0=left, 100=right)
- y: vertical % (0=top, 100=bottom)
- mark: Brief mark (✓, ✗, -2, "Check algebra", "Wrong sign", etc.)

**POSITIONING TIPS:**
- Top-left area: x=10-20, y=15-25
- Middle: x=30-70, y=40-60
- Right side: x=70-85, y=[appropriate vertical]
- Use 5-10% margins from edges

Examples:
ANNOTATION|check|15|20|✓
ANNOTATION|miss|15|45|✗
ANNOTATION|partial|40|30|-3
ANNOTATION|circle|75|50|
ANNOTATION|note|15|65|Wrong sign

**DETAILED ERROR ANALYSIS:**
[For each error found, explain precisely what went wrong]

Problem X, Step Y:
❌ ERROR: [Specific mistake]
→ WHY IT'S WRONG: [Mathematical explanation]
→ CORRECT APPROACH: [What they should have done]

**OVERALL FEEDBACK:**
[2-3 sentences: encouraging but honest about errors]

**WHAT TO PRACTICE:**
- [Specific skill: "Division with negative numbers", "Distributing across parentheses", etc.]
- [Another specific skill if needed]

REMEMBER: Accuracy matters. Be mathematically rigorous. Verify your own solution first, then grade accordingly.`;

        // CTO REVIEW FIX: Call LLMGateway for consistent AI interaction
        // Using lower temperature (0.3) for mathematical accuracy, higher tokens for detailed analysis
        const aiResponse = await gradeWithVision({
            imageDataUrl: dataUrl,
            prompt: gradingPrompt
        }, {
            maxTokens: 3000,      // More tokens for detailed step-by-step verification
            temperature: 0.3      // Lower temperature for mathematical precision
        });

        console.log('[gradeWork] AI grading response received (via LLMGateway)');

        // Parse the score from the response
        const scoreMatch = aiResponse.match(/\*\*SCORE:\s*(\d+)\/100\*\*/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

        // Parse annotations from the response
        const annotations = [];
        const annotationRegex = /ANNOTATION\|(\w+)\|([\d\.]+)\|([\d\.]+)\|(.*)$/gm;
        let match;
        while ((match = annotationRegex.exec(aiResponse)) !== null) {
            annotations.push({
                type: match[1], // check, miss, partial, circle, note
                x: parseFloat(match[2]), // x position as percentage (0-100)
                y: parseFloat(match[3]), // y position as percentage (0-100)
                mark: match[4].trim() // The mark to draw (✓, ✗, -1, text, etc.)
            });
        }

        console.log(`[gradeWork] Parsed ${annotations.length} annotations`);

        // Award XP based on completion (not score, to encourage practice)
        const xpEarned = 15; // Base XP for submitting work for grading
        const bonusXp = score >= 80 ? 10 : 0; // Bonus for high scores

        user.xp = (user.xp || 0) + xpEarned + bonusXp;
        await user.save();

        // Clean up temp file after successful processing
        if (file.path) {
            fs.unlinkSync(file.path);
            console.log('[gradeWork] Cleaned up temp file:', file.path);
        }

        // Return grading results with annotations
        res.json({
            success: true,
            score: `${score}/100`,
            scorePercent: score,
            feedback: aiResponse,
            annotations: annotations,
            imageData: dataUrl, // Return the image so frontend can draw on it
            xpEarned: xpEarned + bonusXp,
            message: 'Work graded successfully'
        });

    } catch (error) {
        console.error('[gradeWork] Error:', error.message);

        // Clean up temp file on error
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (cleanupErr) {
                console.error('[gradeWork] Failed to cleanup temp file:', cleanupErr.message);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to grade work. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
