const express = require('express');
const router = express.Router();
const User = require('../models/user');
const Skill = require('../models/skill');
const Conversation = require('../models/conversation');
const aiService = require('../services/aiService');

// Grade-to-skill mapping for starting point
const GRADE_STARTING_SKILLS = {
  6: 'one-step-equations-addition',
  7: 'one-step-equations-multiplication',
  8: 'two-step-equations',
  9: 'solving-multi-step-equations',
  10: 'equations-variables-both-sides'
};

/**
 * POST /api/assessment/start
 * Begins conversational assessment for a student
 */
router.post('/start', async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if assessment already completed
    if (user.learningProfile.assessmentCompleted) {
      return res.json({
        alreadyCompleted: true,
        message: 'Assessment already completed',
        completedDate: user.learningProfile.assessmentDate
      });
    }

    // Create a new conversation for assessment
    const assessmentConversation = new Conversation({
      userId: user._id,
      conversationName: `Assessment - ${new Date().toLocaleDateString()}`,
      isAssessment: true,
      messages: []
    });

    await assessmentConversation.save();

    // Set as active conversation
    user.activeConversationId = assessmentConversation._id;
    await user.save();

    // Initial AI prompt for assessment
    const systemPrompt = buildAssessmentPrompt(user);

    const initialMessage = {
      role: 'system',
      content: systemPrompt
    };

    const welcomeMessage = {
      role: 'assistant',
      content: `Welcome to MathMatix! I'm ${user.selectedTutorId === 'maya' ? 'Maya' : 'Mr. Nappier'}.\n\nBefore we dive in, I'd love to understand where you're at with math. This isn't a test - just a conversation so I can help you most effectively.\n\nQuick question: What grade are you in, and what are you currently studying in math class?`
    };

    assessmentConversation.messages.push(initialMessage, welcomeMessage);
    await assessmentConversation.save();

    res.json({
      conversationId: assessmentConversation._id,
      message: welcomeMessage.content,
      assessmentStarted: true
    });

  } catch (error) {
    console.error('Error starting assessment:', error);
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

/**
 * POST /api/assessment/respond
 * Handle student response during assessment
 */
router.post('/respond', async (req, res) => {
  try {
    const userId = req.session?.userId;
    const { message, conversationId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    const conversation = await Conversation.findById(conversationId);

    if (!conversation || conversation.userId.toString() !== userId) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message
    });

    // Get AI response
    const messages = conversation.messages.filter(m => m.role !== 'system');
    const systemPrompt = conversation.messages.find(m => m.role === 'system')?.content;

    const aiResponse = await aiService.chat(
      messages.map(m => ({ role: m.role, content: m.content })),
      systemPrompt
    );

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse
    });

    await conversation.save();

    // Check if assessment is complete (AI will signal this)
    if (aiResponse.includes('<ASSESSMENT_COMPLETE>')) {
      await completeAssessment(user, conversation, aiResponse);
    }

    res.json({
      message: aiResponse,
      assessmentComplete: aiResponse.includes('<ASSESSMENT_COMPLETE>')
    });

  } catch (error) {
    console.error('Error in assessment response:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

/**
 * Build system prompt for assessment
 */
function buildAssessmentPrompt(user) {
  return `You are conducting an initial skills assessment for a math student. Your goal is to determine what skills they have mastered so you can place them appropriately.

ASSESSMENT STRATEGY:
1. Start by asking their grade level and current math topic (already done in welcome message)
2. Based on their answer, choose an appropriate starting skill from this list:
   - Grade 6: One-step equations (addition/subtraction)
   - Grade 7: One-step equations (multiplication/division)
   - Grade 8: Two-step equations
   - Grade 9+: Multi-step equations

3. Use ADAPTIVE QUESTIONING:
   - If they answer correctly: Jump UP 2 levels in difficulty
   - If they answer incorrectly: Drop DOWN 1 level in difficulty
   - Ask follow-up: "Can you explain your thinking?"

4. Cover these skill areas (as appropriate for grade):
   - Integer operations
   - Order of operations
   - Combining like terms
   - Equations (one-step, two-step, multi-step)
   - Distributive property
   - Ratios and proportions
   - Percent
   - Graphing basics
   - Slope

5. Mix problem-solving with self-reporting:
   - Direct problems: "Solve this: 2x + 5 = 13"
   - Self-check: "Have you worked with ratios before?"
   - Understanding: "Explain how you would solve this"

6. Keep it CONVERSATIONAL and ENCOURAGING:
   - "Nice work!"
   - "No worries, let's try something different"
   - "You're doing great"

7. Aim for 8-12 questions total (10-15 minutes)

8. When you have enough information, signal completion with:
   <ASSESSMENT_COMPLETE>
   <MASTERED>skill-id-1,skill-id-2,skill-id-3</MASTERED>
   <LEARNING>skill-id-4,skill-id-5</LEARNING>
   <READY>skill-id-6,skill-id-7</READY>
   </ASSESSMENT_COMPLETE>

9. Then provide a friendly summary for the student

SKILL IDs TO USE:
- integers-understanding
- integer-addition
- integer-subtraction
- integer-all-operations
- order-of-operations
- combining-like-terms
- distributive-property
- one-step-equations-addition
- one-step-equations-multiplication
- two-step-equations
- solving-multi-step-equations
- equations-variables-both-sides
- literal-equations
- ratios-and-rates
- proportions
- percent-basics
- percent-problems
- coordinate-plane-basics
- graphing-linear-equations
- slope-basics
- slope-intercept-form
- intro-to-functions

Be friendly, encouraging, and efficient. This is not a formal test - it's a conversation to help the student.`;
}

/**
 * Complete assessment and update user profile
 */
async function completeAssessment(user, conversation, aiResponse) {
  try {
    // Parse AI's assessment results
    const masteredMatch = aiResponse.match(/<MASTERED>(.*?)<\/MASTERED>/);
    const learningMatch = aiResponse.match(/<LEARNING>(.*?)<\/LEARNING>/);
    const readyMatch = aiResponse.match(/<READY>(.*?)<\/READY>/);

    const masteredSkills = masteredMatch ? masteredMatch[1].split(',').map(s => s.trim()) : [];
    const learningSkills = learningMatch ? learningMatch[1].split(',').map(s => s.trim()) : [];
    const readySkills = readyMatch ? readyMatch[1].split(',').map(s => s.trim()) : [];

    // Update user's skill mastery
    for (const skillId of masteredSkills) {
      user.skillMastery.set(skillId, {
        status: 'mastered',
        masteryScore: 1.0,
        masteredDate: new Date(),
        notes: 'Demonstrated in initial assessment'
      });
    }

    for (const skillId of learningSkills) {
      user.skillMastery.set(skillId, {
        status: 'learning',
        masteryScore: 0.5,
        learningStarted: new Date(),
        notes: 'Partially demonstrated in assessment'
      });
    }

    for (const skillId of readySkills) {
      user.skillMastery.set(skillId, {
        status: 'ready',
        masteryScore: 0,
        notes: 'Prerequisites met, ready to learn'
      });
    }

    // Mark assessment as completed
    user.learningProfile.assessmentCompleted = true;
    user.learningProfile.assessmentDate = new Date();

    // Determine initial placement (highest mastered skill)
    if (masteredSkills.length > 0) {
      user.learningProfile.initialPlacement = masteredSkills[masteredSkills.length - 1];
    }

    await user.save();

    // Update conversation
    conversation.isAssessmentComplete = true;
    await conversation.save();

  } catch (error) {
    console.error('Error completing assessment:', error);
    throw error;
  }
}

/**
 * GET /api/assessment/status
 * Check if user has completed assessment
 */
router.get('/status', async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      assessmentCompleted: user.learningProfile.assessmentCompleted || false,
      assessmentDate: user.learningProfile.assessmentDate,
      initialPlacement: user.learningProfile.initialPlacement
    });

  } catch (error) {
    console.error('Error checking assessment status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

module.exports = router;
