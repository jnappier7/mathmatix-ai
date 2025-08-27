// NEW FILE: scripts/archiveOldConversations.js
// This script is intended to be run as a scheduled task (e.g., a daily cron job).
// It finds conversations that have been inactive for over 24 hours,
// generates a final summary, replaces the message history with that summary,
// and marks the conversation as inactive.

require("dotenv").config({ path: '../.env' }); // Adjust path to .env if running from scripts/
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const User = require('../models/user');
const { generateSummary } = require('../utils/summaryService'); // We will create this shared service next

async function archiveOldConversations() {
    console.log("ARCHIVAL JOB: Starting to archive old conversations...");

    try {
        await mongoose.connect(process.env.MONGO_URI);

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Find active conversations that haven't been updated in the last 24 hours
        const conversationsToArchive = await Conversation.find({
            isActive: true,
            updatedAt: { $lt: twentyFourHoursAgo }
        });

        if (conversationsToArchive.length === 0) {
            console.log("ARCHIVAL JOB: No conversations to archive.");
            return;
        }

        console.log(`ARCHIVAL JOB: Found ${conversationsToArchive.length} conversations to archive.`);

        for (const convo of conversationsToArchive) {
            try {
                const user = await User.findById(convo.userId).lean();
                if (!user) {
                    console.warn(`ARCHIVAL JOB: User not found for conversation ${convo._id}, skipping.`);
                    continue;
                }

                // Generate a final, comprehensive summary
                const finalSummary = await generateSummary(convo.messages, user);

                // Create a summary message to replace the detailed log
                const summaryMessage = {
                    role: 'system',
                    content: `This conversation has been archived. Final Summary: ${finalSummary}`,
                    timestamp: new Date()
                };

                // Update the conversation document
                convo.summary = finalSummary;
                convo.messages = [summaryMessage]; // Replace message array
                convo.isActive = false; // Mark as inactive

                await convo.save();
                console.log(`ARCHIVAL JOB: Successfully archived conversation ${convo._id}`);

            } catch (err) {
                console.error(`ARCHIVAL JOB: Failed to process conversation ${convo._id}:`, err);
            }
        }
    } catch (error) {
        console.error("ARCHIVAL JOB: A critical error occurred:", error);
    } finally {
        await mongoose.disconnect();
        console.log("ARCHIVAL JOB: Finished.");
    }
}

archiveOldConversations();// JavaScript Document