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

        // Prepare grading prompt for AI
        const gradingPrompt = `You are an expert math teacher grading a student's work. Analyze this image of their written math work carefully.

Your task:
1. **Identify the problem(s)** they were solving
2. **Check each step** of their work for accuracy
3. **Identify errors** and explain what went wrong
4. **Provide corrections** with clear explanations
5. **Give a score** out of 100 based on:
   - Correct final answer (40 points)
   - Correct methodology/steps (40 points)
   - Clear work shown (20 points)
6. **Provide annotation locations** for visual feedback

Format your response as follows:

**SCORE: [number]/100**

**PROBLEM IDENTIFIED:**
[Describe what problem they were solving]

**ANNOTATIONS:**
CRITICAL: Study the image carefully to position annotations precisely. Look at:
- Where each problem number is located
- Where each answer appears
- The layout and spacing of their work
- Estimate percentages by mentally dividing the image into a grid

For each annotation, create a line:
ANNOTATION|type|x|y|mark

Where:
- type: "check" (✓ correct), "miss" (✗ wrong), "partial" (-points deducted), "circle" (circle answer), "note" (brief text)
- x: horizontal position as percentage (0-100, where 0=left edge, 100=right edge, 50=center)
- y: vertical position as percentage (0-100, where 0=top edge, 100=bottom edge, 50=center)
- mark: What to write (examples: "✓", "✗", "-2", "See below", "Check work", etc.) - KEEP IT BRIEF!

**POSITIONING TIPS:**
- For problem #1 at top-left: Try x=10-20, y=15-25
- For work in the middle: Try x=30-70, y=40-60
- For answers on the right side: Try x=70-85, y=[their vertical position]
- Leave 5-10% margin from edges
- If you can't position accurately, add a note explaining which problem it refers to

**GRADING STYLE:**
- Put checkmarks ✓ next to correct answers
- Put X marks next to wrong answers
- Circle final answers
- Add brief notes with context: "See #3", "Check sign", "-2 pts"

Example annotations:
ANNOTATION|check|15|20|✓
ANNOTATION|miss|15|45|✗
ANNOTATION|partial|40|30|-2
ANNOTATION|circle|75|35|
ANNOTATION|note|15|60|Check sign

**STEP-BY-STEP ANALYSIS:**
[For each problem or step, create a numbered item]

Problem/Step 1: [What they did]
✅ Correct / ❌ Error: [Explanation]
→ If error: [What they should have done]

Problem/Step 2: [What they did]
✅ Correct / ❌ Error: [Explanation]
→ If error: [What they should have done]

[Continue for all steps...]

**OVERALL FEEDBACK:**
[2-3 sentences of encouraging, constructive feedback]

**WHAT TO WORK ON:**
- [Specific skill or concept to practice]
- [Another area for improvement if applicable]

Be specific, encouraging, and educational. Remember this is for learning, not just evaluation.`;

        // CTO REVIEW FIX: Call LLMGateway for consistent AI interaction
        const aiResponse = await gradeWithVision({
            imageDataUrl: dataUrl,
            prompt: gradingPrompt
        }, {
            maxTokens: 1500,
            temperature: 0.7
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
