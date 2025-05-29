const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  res.status(410).json({ error: "DISABLED: This image generation route has been permanently disabled." }); // Replaced emoji
});

module.exports = router;