const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const axios = require('axios');

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
 */
router.post('/', isAuthenticated, upload.single('file'), async (req, res) => {
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
Grade like a real teacher with simple, clean marks. For each annotation:
ANNOTATION|type|x|y|mark

Where:
- type: "check" (✓ correct), "miss" (✗ wrong), "partial" (-points deducted), "circle" (circle answer), "note" (brief text)
- x: horizontal position as percentage (0-100, where 0=left, 100=right)
- y: vertical position as percentage (0-100, where 0=top, 100=bottom)
- mark: What to write (examples: "✓", "✗", "-2", "A", "slope=m", etc.) - KEEP IT BRIEF!

**GRADING STYLE:** Mark like a real teacher - use checkmarks for correct, X or "-A" for errors, circle final answers, add brief helpful notes. Position marks RIGHT NEXT TO each problem number or answer.

Examples:
ANNOTATION|check|10|22|✓
ANNOTATION|miss|10|28|✗
ANNOTATION|partial|60|35|-1
ANNOTATION|circle|25|40|
ANNOTATION|note|15|75|slope=rise/run

**STEP-BY-STEP ANALYSIS:**

Step 1: [What they did]
✅ Correct / ❌ Error: [Explanation]

Step 2: [What they did]
✅ Correct / ❌ Error: [Explanation]

[Continue for all steps...]

**OVERALL FEEDBACK:**
[2-3 sentences of encouraging, constructive feedback]

**WHAT TO WORK ON:**
- [Specific skill or concept to practice]
- [Another area for improvement if applicable]

Be specific, encouraging, and educational. Remember this is for learning, not just evaluation.`;

        // Call OpenAI Vision API
        const openaiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: gradingPrompt
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: dataUrl,
                                    detail: 'high'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1500,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiResponse = openaiResponse.data.choices[0].message.content;
        console.log('[gradeWork] AI grading response received');

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

        if (error.response) {
            console.error('[gradeWork] API error:', error.response.data);
        }

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
