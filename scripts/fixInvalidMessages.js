/**
 * Fix Invalid Messages Script
 *
 * This script finds and fixes conversations with invalid messages (undefined or empty content).
 * It's safe to run multiple times - it will only fix conversations that need fixing.
 *
 * Run with: node scripts/fixInvalidMessages.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Conversation = require('../models/conversation');

async function fixInvalidMessages() {
    try {
        console.log('[Fix Invalid Messages] Starting...');
        console.log('[Fix Invalid Messages] Connecting to database...');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('[Fix Invalid Messages] Connected to database');
        console.log('[Fix Invalid Messages] Scanning all conversations...');

        // Find all conversations
        const allConversations = await Conversation.find({});
        console.log(`[Fix Invalid Messages] Found ${allConversations.length} total conversations`);

        let conversationsFixed = 0;
        let messagesRemoved = 0;

        for (const conversation of allConversations) {
            const originalLength = conversation.messages.length;
            let hadInvalidMessages = false;

            // Filter out messages with invalid content
            conversation.messages = conversation.messages.filter((msg, index) => {
                if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
                    console.log(`  [${conversation._id}] Removing invalid message at index ${index}:`);
                    console.log(`    Role: ${msg.role}`);
                    console.log(`    Content: ${msg.content}`);
                    console.log(`    Timestamp: ${msg.timestamp}`);
                    hadInvalidMessages = true;
                    messagesRemoved++;
                    return false;
                }
                if (!msg.role || (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system')) {
                    console.log(`  [${conversation._id}] Removing message with invalid role at index ${index}: ${msg.role}`);
                    hadInvalidMessages = true;
                    messagesRemoved++;
                    return false;
                }
                return true;
            });

            // Save if we removed any messages
            if (hadInvalidMessages) {
                console.log(`  [${conversation._id}] Fixed: removed ${originalLength - conversation.messages.length} invalid messages (${conversation.messages.length} remaining)`);
                await conversation.save();
                conversationsFixed++;
            }
        }

        console.log('\n[Fix Invalid Messages] Summary:');
        console.log(`  Total conversations scanned: ${allConversations.length}`);
        console.log(`  Conversations fixed: ${conversationsFixed}`);
        console.log(`  Invalid messages removed: ${messagesRemoved}`);
        console.log('[Fix Invalid Messages] Complete!');

        process.exit(0);

    } catch (error) {
        console.error('[Fix Invalid Messages] Error:', error);
        process.exit(1);
    }
}

// Run the script
fixInvalidMessages();
