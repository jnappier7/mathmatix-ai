// routes/summary_generator.js
// MODIFIED: Refactored to use the new summaryService.

const express = require('express');
const router = express.Router();
const Conversation = require('../models/conversation');
const { generateSummary } = require('../utils/summaryService'); // MODIFIED: Import the new service

router.post('/', async (req, res) => {
    const { messageLog, studentProfile, conversationId } = req.body;

    // Validation remains the same
    if (!messageLog || !Array.isArray(messageLog) || messageLog.length === 0) {
        return res.status(400).json({ message: "messageLog is required." });
    }
    if (!studentProfile) {
        return res.status(400).json({ message: "studentProfile is required." });
    }
    if (!conversationId) {
        return res.status(400).json({ message: "conversationId is required to save the summary." });
    }

    try {
        // MODIFIED: Call the centralized service
        const summaryText = await generateSummary(messageLog, studentProfile);

        const updatedConversation = await Conversation.findByIdAndUpdate(
            conversationId,
            { $set: { summary: summaryText } },
            { new: true } 
        );

        if (!updatedConversation) {
            console.error(`ERROR: Failed to find and update conversation with ID: ${conversationId}`);
            return res.status(404).json({ message: 'Conversation to update was not found.' });
        }
        
        console.log(`LOG: Conversation summary saved for conversation ID ${conversationId}`);
        res.json({ summary: summaryText });

    } catch (error) {
        console.error('ERROR: AI summarization route error:', error?.message || error);
        res.status(500).json({ message: 'Failed to generate summary.', error: error.message });
    }
});

module.exports = router;