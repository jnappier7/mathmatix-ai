// check-summaries.js - Check for session summaries in database
require('dotenv').config();
const mongoose = require('mongoose');
const Conversation = require('./models/conversation');

async function checkSummaries() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database\n');

    // Find recent conversations that ended (isActive: false) with summaries
    const recentWithSummaries = await Conversation.find({
      isActive: false,
      summary: { $ne: null, $exists: true }
    })
    .sort({ lastActivity: -1 })
    .limit(5)
    .select('lastActivity summary currentTopic problemsAttempted problemsCorrect isActive')
    .lean();

    console.log('=== Recent Conversations with Summaries ===');
    if (recentWithSummaries.length === 0) {
      console.log('❌ No conversations with summaries found.');
    } else {
      recentWithSummaries.forEach((conv, i) => {
        console.log(`\n[${i+1}] Last Activity: ${conv.lastActivity}`);
        console.log(`    isActive: ${conv.isActive}`);
        console.log(`    Topic: ${conv.currentTopic || 'None'}`);
        console.log(`    Problems: ${conv.problemsCorrect}/${conv.problemsAttempted}`);

        // Check if summary looks like a prompt (bad) or real summary (good)
        const isBadSummary = conv.summary.includes('--- End Session Transcript ---') ||
                            conv.summary.includes('Please provide a summary') ||
                            conv.summary.includes('**Concise (1-3 paragraphs)**');

        console.log(`    Summary Type: ${isBadSummary ? '❌ RAW PROMPT (BAD)' : '✅ AI SUMMARY (GOOD)'}`);
        console.log(`    Summary Preview: ${conv.summary ? conv.summary.substring(0, 150) + '...' : 'None'}`);
      });
    }

    // Check for recent inactive conversations WITHOUT summaries
    const recentWithoutSummaries = await Conversation.find({
      isActive: false,
      $or: [
        { summary: null },
        { summary: { $exists: false } }
      ]
    })
    .sort({ lastActivity: -1 })
    .limit(5)
    .select('lastActivity currentTopic problemsAttempted messages')
    .lean();

    console.log('\n\n=== Recent Inactive Conversations WITHOUT Summaries ===');
    if (recentWithoutSummaries.length === 0) {
      console.log('✅ All inactive conversations have summaries!');
    } else {
      console.log(`⚠️  Found ${recentWithoutSummaries.length} conversations without summaries:`);
      recentWithoutSummaries.forEach((conv, i) => {
        console.log(`\n[${i+1}] Last Activity: ${conv.lastActivity}`);
        console.log(`    Topic: ${conv.currentTopic || 'None'}`);
        console.log(`    Problems: ${conv.problemsAttempted || 0}`);
        console.log(`    Messages: ${conv.messages?.length || 0}`);
      });
    }

    // Check for currently active conversations
    const activeConvs = await Conversation.find({ isActive: true })
      .sort({ lastActivity: -1 })
      .limit(3)
      .select('lastActivity currentTopic problemsAttempted messages')
      .lean();

    console.log('\n\n=== Currently Active Conversations ===');
    if (activeConvs.length === 0) {
      console.log('No active conversations (all students logged out).');
    } else {
      activeConvs.forEach((conv, i) => {
        console.log(`\n[${i+1}] Last Activity: ${conv.lastActivity}`);
        console.log(`    Topic: ${conv.currentTopic || 'None'}`);
        console.log(`    Problems: ${conv.problemsAttempted || 0}`);
        console.log(`    Messages: ${conv.messages?.length || 0}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n\nDisconnected from database');
  } catch (err) {
    console.error('Error:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkSummaries();
