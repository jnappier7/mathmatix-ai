// server.js â€” Main entry point for Mâˆ†THMâˆ†TIÎ§ AI backend

require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const puppeteer = require("puppeteer");
puppeteer
  .createBrowserFetcher()
  .download("1108766")
  .then(() => console.log("✅ Chromium downloaded"))
  .catch((err) => console.error("❌ Chromium download failed:", err.message));

const app = express();
const PORT = process.env.PORT || 5000;
const { SYSTEM_PROMPT } = require("./utils/prompt");


// âœ… Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// âœ… Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// âœ… MongoDB connection
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("âœ… Connected to MongoDB"))
  .catch((err) => console.error("âŒ MongoDB connection error:", err));
}

// âœ… Routes
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const memoryRoute = require("./routes/memory").router;
const chatRoute = require("./routes/chat");
const imageRoute = require("./routes/image");
const imageSearchRoute = require("./routes/image-search");


app.use("/upload", uploadRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/chat", chatRoute);
app.use("/image", imageRoute);
app.use("/image-search", imageSearchRoute);


// âœ… Serve index.html as default
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// âœ… 404 fallback
app.use((req, res) => {
  res.status(404).send("ðŸ” Route not found.");
});

// âœ… Start server
app.listen(PORT, () => {
  console.log(`ðŸš€ Mâˆ†THMâˆ†TIÎ§ AI running on http://localhost:${PORT}`);
});

// âœ… Export SYSTEM_PROMPT for use in routes
module.exports = { app, SYSTEM_PROMPT };
