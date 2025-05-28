router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user._id; // ✅ store session

    user.lastLogin = Date.now();
    await user.save();

    res.status(200).json({
      message: "Login successful!",
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        gradeLevel: user.gradeLevel,
        mathCourse: user.mathCourse,
        learningStyle: user.learningStyle,
        tonePreference: user.tonePreference,
        interests: user.interests,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});
