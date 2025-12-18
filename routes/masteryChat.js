// routes/masteryChat.js
// Dedicated endpoint for mastery mode chat sessions

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const User = require('../models/user');
const Conversation = require('../models/conversation');
const { generateSystemPrompt } = require('../utils/prompt');
const { callLLMStream } = require("../utils/llmGateway");
const TUTOR_CONFIG = require('../utils/tutorConfig');

const PRIMARY_CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH_FOR_AI = 40;

/**
 * POST /api/mastery/chat
 * Handle chat messages in mastery mode (badge earning sessions)
 */
router.post('/', isAuthenticated, async (req, res) => {
    const { userId, message, responseTime } = req.body;

    if (!userId || !message) {
        return res.status(400).json({ message: "User ID and message are required." });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long.` });
    }

    // Log response time if provided (from ghost timer)
    if (responseTime) {
        console.log(`[Mastery Fluency] User ${userId} responded in ${responseTime.toFixed(1)}s`);
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Check if user has active badge
        if (!user.masteryProgress || !user.masteryProgress.activeBadge) {
            return res.status(400).json({
                message: "No active badge. Please select a badge from the badge map first.",
                redirectTo: '/badge-map.html'
            });
        }

        // Get or create mastery conversation
        let masteryConversation;
        if (user.activeMasteryConversationId) {
            masteryConversation = await Conversation.findById(user.activeMasteryConversationId);
        }

        // Create new mastery conversation if needed
        if (!masteryConversation || !masteryConversation.isActive || !masteryConversation.isMastery) {
            masteryConversation = new Conversation({
                userId: user._id,
                messages: [],
                isMastery: true,
                masteryBadgeId: user.masteryProgress.activeBadge.badgeId,
                masterySkillId: user.masteryProgress.activeBadge.skillId,
                conversationName: `${user.masteryProgress.activeBadge.badgeName} - ${user.masteryProgress.activeBadge.tier}`
            });
            user.activeMasteryConversationId = masteryConversation._id;
            await user.save();
        }

        // Add user message to conversation
        masteryConversation.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date(),
            responseTime: responseTime || null
        });

        // Get tutor config - Mr. Nappier is the default for mastery mode
        const selectedTutorKey = user.selectedTutorId && TUTOR_CONFIG[user.selectedTutorId]
            ? user.selectedTutorId
            : "mr-nappier";
        const currentTutor = TUTOR_CONFIG[selectedTutorKey] || TUTOR_CONFIG["mr-nappier"];

        // Build mastery context from active badge
        const masteryContext = {
            mode: 'badge-earning',
            badgeName: user.masteryProgress.activeBadge.badgeName,
            skillId: user.masteryProgress.activeBadge.skillId,
            tier: user.masteryProgress.activeBadge.tier,
            problemsCompleted: user.masteryProgress.activeBadge.problemsCompleted || 0,
            problemsCorrect: user.masteryProgress.activeBadge.problemsCorrect || 0,
            requiredProblems: user.masteryProgress.activeBadge.requiredProblems,
            requiredAccuracy: user.masteryProgress.activeBadge.requiredAccuracy
        };

        // Generate system prompt (mastery mode - no curriculum, no uploads)
        const systemPrompt = generateSystemPrompt(
            user.toObject(),
            currentTutor.name,
            null,           // childProfile
            'student',      // currentRole
            null,           // curriculumContext - EXCLUDED in mastery mode
            null,           // uploadContext - EXCLUDED in mastery mode
            masteryContext, // masteryContext - THIS IS THE FOCUS
            [],             // likedMessages
            null            // fluencyContext
        );

        // Prepare conversation history for AI
        const recentHistory = masteryConversation.messages.slice(-MAX_HISTORY_LENGTH_FOR_AI);
        const conversationForAI = recentHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        // Check for streaming support
        const isStreaming = req.query.stream === 'true';

        if (isStreaming) {
            // Set up SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            let fullResponse = '';

            try {
                await callLLMStream(
                    PRIMARY_CHAT_MODEL,
                    systemPrompt,
                    conversationForAI,
                    (chunk) => {
                        fullResponse += chunk;
                        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                    },
                    () => {
                        // Save AI response to conversation
                        masteryConversation.messages.push({
                            role: 'assistant',
                            content: fullResponse,
                            timestamp: new Date()
                        });

                        masteryConversation.lastActivity = new Date();
                        masteryConversation.save();

                        // Send completion event
                        res.write(`data: ${JSON.stringify({
                            done: true,
                            fullText: fullResponse,
                            voiceId: currentTutor.voiceId
                        })}\n\n`);
                        res.end();
                    }
                );
            } catch (error) {
                console.error("[Mastery Chat Stream Error]:", error);
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            }
        } else {
            // Non-streaming response
            const aiResponse = await callLLM(PRIMARY_CHAT_MODEL, systemPrompt, conversationForAI);

            // Save AI response
            masteryConversation.messages.push({
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date()
            });

            masteryConversation.lastActivity = new Date();
            await masteryConversation.save();

            res.json({
                text: aiResponse,
                voiceId: currentTutor.voiceId,
                masteryProgress: {
                    badgeName: masteryContext.badgeName,
                    progress: `${masteryContext.problemsCompleted}/${masteryContext.requiredProblems}`,
                    accuracy: masteryContext.problemsCompleted > 0
                        ? Math.round((masteryContext.problemsCorrect / masteryContext.problemsCompleted) * 100)
                        : 0
                }
            });
        }

    } catch (error) {
        console.error("[Mastery Chat Error]:", error);
        res.status(500).json({ message: "Server error during mastery chat." });
    }
});

module.exports = router;
