// server.js — Main entry point for M∆THM∆TIΧ AI backend
require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// ✅ MongoDB connection (optional — remove if unused)
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));
}

// ✅ Routes
const uploadRoute = require("./routes/upload");
const loginRoute = require("./routes/login");
const signupRoute = require("./routes/signup");
const memoryRoute = require("./routes/memory");
const chatRoute = require("./routes/chat"); 
const imageRoute = require("./routes/image");//


app.use("/upload", uploadRoute);
app.use("/login", loginRoute);
app.use("/signup", signupRoute);
app.use("/save-summary", memoryRoute);
app.use("/chat", chatRoute); 
app.use("/image", imageRoute);//


// ✅ Serve index.html as default
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ 404 fallback
app.use((req, res) => {
  res.status(404).send("🔍 Route not found.");
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 M∆THM∆TIΧ AI running on http://localhost:${PORT}`);
});