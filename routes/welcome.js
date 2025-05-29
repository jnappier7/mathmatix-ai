const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  try {
    const user = await User.findById(userId);
    if (!user || !user.name) return res.status(404).send("User not found");

    const last = user.conversations?.at(-1);
    const summary = last?.summary?.trim() || "";

    const prompt = `
You're Mathmatix, a warm and engaging AI math tutor.
Write a short, casual, personalized greeting to welcome ${user.name} back.

If this summary is available, include a reference to it naturally:
"${summary}"

Examples:
- "Hey Jason, welcome back! How did it go on that quiz you were studying for last time?"
- "Yo Jason, last time we tackled some slope problems. Ready to cook again?"

Keep it short. One or two sentences. No robotic intros. Just be real and supportive.
`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const greeting = result.response.text().trim();

    res.send({ greeting });
  } catch (err) {
    console.error("ERROR: Welcome error:", err.message); // Replaced emoji
    res.status(500).send("Failed to generate greeting");
  }
});

module.exports = router;