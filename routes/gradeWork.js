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

Format your response as follows:

**SCORE: [number]/100**

**PROBLEM IDENTIFIED:**
[Describe what problem they were solving]

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

        // Award XP based on completion (not score, to encourage practice)
        const xpEarned = 15; // Base XP for submitting work for grading
        const bonusXp = score >= 80 ? 10 : 0; // Bonus for high scores

        user.xp = (user.xp || 0) + xpEarned + bonusXp;
        await user.save();

        // Return grading results
        res.json({
            success: true,
            score: `${score}/100`,
            scorePercent: score,
            feedback: aiResponse,
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
