const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  res.status(410).json({ error: "🔒 This image generation route has been permanently disabled." });
});

module.exports = router;
