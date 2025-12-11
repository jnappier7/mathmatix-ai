const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const axios = require('axios');

const upload = multer({ storage: multer.memoryStorage() });

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
            return res.status(400).json({
                success: false,
                message: 'Only image files are supported'
            });
        }

        console.log(`[gradeWork] Processing work for user: ${user.firstName} ${user.lastName}`);

        // Convert image to base64 for vision API
        const base64Image = file.buffer.toString('base64');
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
[For each annotation, provide precise positioning using: ANNOTATION|type|x|y|text]
Where:
- type: "check" (correct), "error" (mistake), "warning" (careful), or "info" (note)
- x: horizontal position as percentage (0-100, where 0=left edge, 100=right edge)
- y: vertical position as percentage (0-100, where 0=top, 100=bottom)
- text: annotation text describing the issue/praise (max 50 chars)

IMPORTANT: Look at WHERE each problem is located on the page and position annotations directly next to the relevant work.

Examples:
ANNOTATION|check|15|20|Problem 1: Correct!
ANNOTATION|error|65|25|Problem 2: Sign error
ANNOTATION|check|15|45|Problem 3: Perfect
ANNOTATION|error|65|50|Problem 4: Wrong inequality
ANNOTATION|warning|15|70|Problem 5: Check graph
ANNOTATION|check|65|75|Problem 6: Great work!

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
        const annotationRegex = /ANNOTATION\|(\w+)\|([\d\.]+)\|([\d\.]+)\|(.+)/g;
        let match;
        while ((match = annotationRegex.exec(aiResponse)) !== null) {
            annotations.push({
                type: match[1], // check, error, warning, info
                x: parseFloat(match[2]), // x position as percentage (0-100)
                y: parseFloat(match[3]), // y position as percentage (0-100)
                text: match[4].trim()
            });
        }

        console.log(`[gradeWork] Parsed ${annotations.length} annotations`);

        // Award XP based on completion (not score, to encourage practice)
        const xpEarned = 15; // Base XP for submitting work for grading
        const bonusXp = score >= 80 ? 10 : 0; // Bonus for high scores

        user.xp = (user.xp || 0) + xpEarned + bonusXp;
        await user.save();

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

        res.status(500).json({
            success: false,
            message: 'Failed to grade work. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
