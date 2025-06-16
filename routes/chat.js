const express = require("express");
const router = express.Router();
const openai = require("../utils/openaiClient");
const User = require("../models/User");
const { generateSystemPrompt } = require("../utils/prompt");
const saveConversation = require("../routes/memory");
const fetch = require('node-fetch');
const TUTOR_CONFIG = require("../utils/tutorConfig");
const { extractGraphTag, extractImagePrompt } = require("../utils/postprocess"); // NEW: Import for graph/image tag extraction

const SESSION_TRACKER = {};

async function generateAndSaveSummary(userId, messageLog, studentProfile) {
  try {
    const response = await fetch(`${process.env.NODE_ENV === 'production' ? 'https://mathmatix.ai' : 'http://localhost:5000'}/api/generate-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageLog, studentProfile })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`ERROR: Failed to generate summary from AI: ${response.status} - ${errorBody}`);
      return null;
    }

    const data = await response.json();
    return data.summary;
  } catch (error) {
    console.error('ERROR: Error calling summary generation API:', error);
    return null;
  }
}

router.post("/", async (req, res) => {
  const { userId, message, role, childId } = req.body; // userId is the SENDER's ID
  let xpPerTurn = 2; // Default for students, will be 0 for parents
  const msPerMinute = 60 * 1000;

  console.log("LOG: Received message:", message);
  console.log("LOG: sender userId:", userId);
  console.log("LOG: role:", role);
  if (childId) console.log("LOG: childId (if parent chat):", childId);

  let senderUser; // This is the user sending the message (student or parent)
  try {
    senderUser = await User.findById(userId);
    if (!senderUser) return res.status(404).json({ error: "Sender user not found." });
  } catch (err) {
    console.error("ERROR: DB error fetching sender user:", err);
    return res.status(500).json({ error: "Server error fetching sender user." });
  }

  // --- Determine AI persona and voice based on sender (or selected tutor for student) ---
  let tutorNameForPrompt = TUTOR_CONFIG.default.name;
  let voiceIdForThisTurn = TUTOR_CONFIG.default.voiceId;

  if (role === 'student' && senderUser.selectedTutorId) {
      const selectedTutorKey = senderUser.selectedTutorId && TUTOR_CONFIG[senderUser.selectedTutorId]
                               ? senderUser.selectedTutorId
                               : "default";
      const currentTutor = TUTOR_CONFIG[selectedTutorKey];
      voiceIdForThisTurn = currentTutor.voiceId;
      tutorNameForPrompt = currentTutor.name;
  }
  // For 'parent' role, the AI is always 'M∆THM∆TIΧ AI' by default or a fixed parent-facing persona.
  // The voice could also be fixed for parent-facing AI or dynamically chosen. For now, it defaults.

  let systemPrompt;
  let conversationSessionId = userId; // ID for SESSION_TRACKER, typically sender's ID

  // --- NEW: Contextualize prompt if sender is parent ---
  let childProfileForPrompt = null;
  if (role === "parent" && childId) {
    const child = await User.findById(childId); // Fetch the specific child's profile
    if (!child) return res.status(404).json({ text: "Child not found for parent chat context." });

    childProfileForPrompt = {
        _id: child._id,
        firstName: child.firstName,
        lastName: child.lastName,
        gradeLevel: child.gradeLevel,
        mathCourse: child.mathCourse,
        xp: child.xp,
        level: child.level,
        totalActiveTutoringMinutes: child.totalActiveTutoringMinutes,
        // Include recent session summaries for the child
        recentSummaries: child.conversations
            .filter(session => session.summary && session.messages?.length > 1)
            .sort((a, b) => b.date - a.date)
            .slice(0, 3) // Get last 3 summaries
            .map(s => `On ${s.date.toLocaleDateString()}: ${s.summary}`),
        iepPlan: child.iepPlan || null // Include IEP plan for parent context
    };
    // The system prompt for parent chat should reflect the AI's role when talking to a parent
    systemPrompt = generateSystemPrompt(senderUser.toObject(), tutorNameForPrompt, childProfileForPrompt, role); // Pass parent's profile, tutor name, childProfile and role
    conversationSessionId = `${userId}_${childId}`; // Parent chat sessions are unique per parent-child pair
    xpPerTurn = 0; // Parents don't earn XP per turn
  } else {
    // Standard student/teacher/admin chat
    systemPrompt = generateSystemPrompt(senderUser.toObject(), tutorNameForPrompt, null, role); // Pass sender's profile, tutor name, null for childProfile and the role
  }
  // --- END NEW ---


  let session = SESSION_TRACKER[conversationSessionId]; // Use conversationSessionId for session tracking
  if (!session) {
    session = {
      history: [],
      messageLog: [],
      systemPrompt,
      activeStartTime: Date.now(),
      currentSessionMinutes: 0
    };
    SESSION_TRACKER[conversationSessionId] = session;
  } else {
    session.activeStartTime = Date.now();
    session.systemPrompt = systemPrompt; // Always update system prompt in case user profile or child context changed
  }

  session.messageLog.push({ role: "user", content: message });

  try {
    const messages = [
      { role: "system", content: session.systemPrompt },
      ...session.history,
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      temperature: 0.7
    });

    let text = completion.choices[0].message.content;
    let specialXpAwarded = 0;
    let imageUrl = null; // NEW: Initialize imageUrl for image/graph handling

    // XP is only awarded for student interactions, not parent-tutor conferences
    if (role === 'student') {
        const xpTagRegex = /<AWARD_XP:(\d+)>/;
        const xpMatch = text.match(xpTagRegex);

        if (xpMatch) {
            specialXpAwarded = parseInt(xpMatch[1], 10);
            text = text.replace(xpTagRegex, '').trim();
            console.log(`LOG: Backend detected and extracted ${specialXpAwarded} bonus XP.`);
        } else {
            console.log("LOG: Backend did NOT detect <AWARD_XP> tag in AI response.");
        }
    } else {
        // If parent role, ensure XP is 0
        specialXpAwarded = 0;
        xpPerTurn = 0;
    }

    // --- Graph/Image Generation Logic (NEW ADDITION) ---
    const graphExpressions = extractGraphTag(text); // Extract expressions from [GRAPH:...] tag
    if (graphExpressions) {
        console.log("LOG: Detected GRAPH tag in AI response. Expressions:", graphExpressions);
        // Make a request to your local /graph/snapshot endpoint
        try {
            // Ensure this URL is correct for your local server
            const graphResponse = await fetch(`${process.env.NODE_ENV === 'production' ? 'https://mathmatix.ai' : 'http://localhost:5000'}/graph/snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expressions: graphExpressions.split(',').map(e => e.trim()) })
            });
            const graphData = await graphResponse.json();
            if (graphResponse.ok && graphData.image) {
                imageUrl = graphData.image; // This will be the base64 image URL
                text = text.replace(/\[GRAPH:\s*(.*?)\]/i, '').trim(); // Remove the tag from the AI text response
                console.log("LOG: Graph image generated and URL obtained.");
            } else {
                console.error("ERROR: Failed to get graph image from /graph/snapshot:", graphData.error || graphResponse.statusText);
            }
        } catch (graphErr) {
            console.error("ERROR: Error calling graph generation service:", graphErr);
        }
    }
    // You can add similar logic here for [IMAGE:...] if you enable image.js later
    // const imagePrompt = extractImagePrompt(text);
    // if (imagePrompt) {
    //     // Call your /image route here, if enabled and implemented
    // }
    // --- End Graph/Image Generation Logic ---

    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: text });
    session.messageLog.push({ role: "model", content: text });

    const turnEndTime = Date.now();
    const turnDurationMs = turnEndTime - session.activeStartTime;
    const turnMinutes = turnDurationMs / msPerMinute;
    session.currentSessionMinutes += turnMinutes;

    // Update XP and minutes ONLY for student role (userToUpdate is senderUser for students)
    if (role === 'student') {
        senderUser.xp = (senderUser.xp || 0) + xpPerTurn + specialXpAwarded;
        senderUser.totalActiveTutoringMinutes = (senderUser.totalActiveTutoringMinutes || 0) + turnMinutes;
        senderUser.weeklyActiveTutoringMinutes = (senderUser.weeklyActiveTutoringMinutes || 0) + turnMinutes;

        const XP_TO_LEVEL_UP = 100;
        if (senderUser.xp >= ((senderUser.level || 0) * XP_TO_LEVEL_UP)) {
            senderUser.level = (senderUser.level || 0) + 1;
            senderUser.xp = senderUser.xp % XP_TO_LEVEL_UP;
        }
    } else if (role === 'parent') {
        // For parent chat, parent's lastLogin updated by passport, no XP or minutes here
        // The child's data is passed in prompt, not updated here
    }


    try {
        await senderUser.save(); // Save the senderUser document
        console.log(`LOG: Sender user ${senderUser.username} saved to DB.`);
    } catch (dbErr) {
        console.error("ERROR: Failed to save sender user document to DB:", dbErr);
    }

    res.json({
        text,
        modelUsed: "gpt-4o",
        userXp: senderUser.xp, // Send sender's XP
        userLevel: senderUser.level, // Send sender's Level
        specialXpAwarded,
        voiceId: voiceIdForThisTurn,
        imageUrl: imageUrl // NEW: Send imageUrl to the frontend
    });
  } catch (err) {
    console.error("ERROR: OpenAI chat error:", err);
    res.status(500).json({ error: "AI chat error. Please try again." });
  }
});

router.post("/select-tutor", async (req, res) => {
    const { userId, tutorId } = req.body;

    if (!userId || !tutorId) {
        return res.status(400).json({ success: false, message: "User ID and Tutor ID are required." });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        user.selectedTutorId = tutorId;
        await user.save();

        res.json({ success: true, message: "Tutor selected successfully!", tutorId: user.selectedTutorId });

    } catch (error) {
        console.error("ERROR: Failed to save selected tutor:", error);
        res.status(500).json({ success: false, message: "Server error saving tutor selection." });
    }
});

module.exports = router;
module.exports.generateAndSaveSummary = generateAndSaveSummary;
module.exports.SESSION_TRACKER = SESSION_TRACKER;