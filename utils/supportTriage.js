// utils/supportTriage.js
// AI-powered support ticket triage
// Analyzes incoming tickets, decides if AI can resolve or should escalate to human

const { callLLM } = require('./openaiClient');
const logger = require('./logger').child({ module: 'supportTriage' });

// Categories that always escalate to human
const ALWAYS_ESCALATE = ['billing', 'data-privacy'];

// Knowledge base for common issues the AI can resolve
const PLATFORM_KNOWLEDGE = `
You are a helpful support assistant for MATHMATIX AI, an AI-powered math tutoring platform.

PLATFORM FEATURES:
- AI math tutoring with personalized lessons (chat-based)
- Multiple tutor personas students can choose from
- Mastery mode with placement tests, interviews, and badges
- Adaptive screener (Starting Point) for skill placement
- Growth Check for quick progress assessments
- Course catalog with guided lessons
- Gamification: daily quests, weekly challenges, badges, leaderboards, streaks
- Grade Work: upload homework photos for AI grading
- Fact fluency games (Number Run, Fact Fluency Blaster)
- Avatar builder for custom student avatars
- Math input with equation palette and handwriting support
- Voice chat and text-to-speech
- Celeration charts and learning curve visualizations
- File upload for worksheets
- Dark mode support
- Multiple languages supported (English, Spanish, French, Arabic, Chinese, Vietnamese, Somali, Russian, German)

ROLES:
- Students: Main users, access tutoring chat, games, assessments
- Teachers: Manage rosters, view student progress, IEP accommodations, send announcements, upload resources
- Parents: Monitor child progress, message teachers, view weekly reports
- Admins: Platform management, analytics, bulk operations

COMMON SETTINGS:
- Change password: Settings page (gear icon)
- Change language: Settings page > Language preference
- Change tutor: Settings page > Tutor selection or /pick-tutor.html
- Change avatar: Settings page or /avatar-builder.html
- Dark mode: Toggle in settings or sidebar

ACCOUNT ISSUES:
- Forgot password: Use "Forgot Password?" link on login page
- Can't log in with Google/Microsoft: May need to complete enrollment with a class code at /oauth-enrollment.html
- Email verification: Check spam folder, request new verification email from login page

COMMON TROUBLESHOOTING:
- Chat not loading: Try refreshing the page, clear browser cache, check internet connection
- Math symbols not displaying: MathJax loads lazily, wait a moment or refresh
- File upload failing: Check file size (max varies by plan), supported formats: images, PDFs
- Voice not working: Check browser microphone permissions, try Chrome or Edge
- Slow responses: AI processing can take a few seconds, especially for complex problems
`;

/**
 * Triage a support ticket using AI
 * @param {Object} ticket - The support ticket data
 * @param {string} ticket.category - Issue category
 * @param {string} ticket.subject - Issue subject
 * @param {string} ticket.description - Issue description
 * @param {string} ticket.userRole - User's role (student, teacher, parent)
 * @returns {Promise<Object>} Triage result with { handled, confidence, response, reason, suggestedPriority }
 */
async function triageTicket(ticket) {
  const { category, subject, description, userRole } = ticket;

  // Auto-escalate sensitive categories
  if (ALWAYS_ESCALATE.includes(category)) {
    const reason = category === 'billing'
      ? 'Billing issues require human review for account-specific actions.'
      : 'Data privacy requests require human review for compliance.';

    return {
      handled: false,
      confidence: 1.0,
      response: category === 'billing'
        ? "I've received your billing inquiry. A team member will review this and get back to you. Billing questions require personalized attention to ensure we handle your account correctly."
        : "I've received your data privacy request. A team member will handle this personally to ensure full compliance with privacy regulations. We take data privacy seriously.",
      reason,
      suggestedPriority: category === 'data-privacy' ? 'high' : 'medium'
    };
  }

  // Use AI to analyze and attempt resolution
  try {
    const prompt = `${PLATFORM_KNOWLEDGE}

TASK: A user has submitted a support ticket. Analyze it and decide if you can help resolve it, or if it needs to be escalated to a human support agent.

USER ROLE: ${userRole || 'unknown'}
CATEGORY: ${category}
SUBJECT: ${subject}
DESCRIPTION: ${description}

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "canResolve": true/false,
  "confidence": 0.0-1.0,
  "response": "Your helpful response to the user. If you can resolve it, provide a clear answer. If not, acknowledge the issue and explain it will be reviewed by the team.",
  "reason": "Brief internal reason for your decision (not shown to user)",
  "suggestedPriority": "low/medium/high/urgent"
}

GUIDELINES:
- If the question is about how to use a feature, provide clear step-by-step instructions
- If it's a bug report, acknowledge it, suggest basic troubleshooting, but escalate for investigation
- If it's a feature request, acknowledge it warmly and escalate (these need human review)
- For account issues, provide self-service steps if possible
- Be warm, helpful, and concise
- Never make up features that don't exist
- If unsure, escalate (set canResolve to false)
- Keep responses under 500 words`;

    const messages = [
      { role: 'user', content: prompt }
    ];

    const completion = await callLLM('gpt-4o-mini', messages, {
      temperature: 0.3,
      max_tokens: 800
    });

    const rawResponse = completion.choices[0].message.content.trim();

    // Parse the JSON response
    let triageResult;
    try {
      // Handle potential markdown code blocks in response
      const jsonStr = rawResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      triageResult = JSON.parse(jsonStr);
    } catch (parseError) {
      logger.warn('Failed to parse AI triage response, escalating', {
        rawResponse: rawResponse.substring(0, 200),
        error: parseError.message
      });
      return {
        handled: false,
        confidence: 0,
        response: "Thank you for reaching out. I've logged your issue and a team member will review it shortly.",
        reason: 'AI response parsing failed',
        suggestedPriority: 'medium'
      };
    }

    return {
      handled: triageResult.canResolve === true,
      confidence: Math.min(1, Math.max(0, triageResult.confidence || 0)),
      response: triageResult.response || "Thank you for reaching out. We'll look into this.",
      reason: triageResult.reason || 'AI triage',
      suggestedPriority: ['low', 'medium', 'high', 'urgent'].includes(triageResult.suggestedPriority)
        ? triageResult.suggestedPriority
        : 'medium'
    };

  } catch (error) {
    logger.error('AI triage failed', {
      error: error.message,
      category,
      subject
    });

    // Fallback: escalate with a generic acknowledgment
    return {
      handled: false,
      confidence: 0,
      response: "Thank you for contacting us. I've received your message and a team member will review it shortly.",
      reason: `AI triage error: ${error.message}`,
      suggestedPriority: 'medium'
    };
  }
}

/**
 * Generate an AI follow-up response for an existing ticket thread
 * @param {Object} ticket - The full ticket with messages
 * @param {string} newMessage - The user's new message
 * @returns {Promise<Object>} { response, shouldEscalate }
 */
async function generateFollowUp(ticket, newMessage) {
  try {
    // Build conversation history
    const history = ticket.messages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    const prompt = `${PLATFORM_KNOWLEDGE}

You are continuing a support conversation. Here is the original ticket:
CATEGORY: ${ticket.category}
SUBJECT: ${ticket.subject}
ORIGINAL DESCRIPTION: ${ticket.description}

The conversation history follows. Now the user has sent a new message. Respond helpfully.

If you can resolve the issue, do so. If the user is frustrated, unsatisfied with your answer, or the issue clearly needs human intervention, respond with ESCALATE: at the start of your message, followed by a helpful acknowledgment that a human will take over.

Keep responses concise and helpful.`;

    const messages = [
      { role: 'system', content: prompt },
      ...history,
      { role: 'user', content: newMessage }
    ];

    const completion = await callLLM('gpt-4o-mini', messages, {
      temperature: 0.4,
      max_tokens: 600
    });

    const response = completion.choices[0].message.content.trim();
    const shouldEscalate = response.startsWith('ESCALATE:');
    const cleanResponse = shouldEscalate ? response.replace('ESCALATE:', '').trim() : response;

    return {
      response: cleanResponse,
      shouldEscalate
    };

  } catch (error) {
    logger.error('AI follow-up failed', { error: error.message, ticketId: ticket._id });
    return {
      response: "I'm having trouble processing your request right now. A team member will follow up with you.",
      shouldEscalate: true
    };
  }
}

module.exports = {
  triageTicket,
  generateFollowUp
};
