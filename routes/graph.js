// routes/graph.js

const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");

// Util: Load Desmos and take screenshot with expressions
async function generateGraphImage(expressions) {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto("https://www.desmos.com/calculator", { waitUntil: "networkidle2" });

  await page.waitForSelector(".dcg-expressionarea");

  // Inject expressions
  await page.evaluate((expressions) => {
    const calculator = window.Calculator || Desmos.getCalculator(document.querySelector(".dcg-calculator-container"));
    calculator.setExpressions([]); // Clear existing

    expressions.forEach((expr, i) => {
      calculator.setExpression({ id: `expr${i}`, latex: expr });
    });

    window.calculator = calculator;
  }, expressions);

  // Wait briefly to ensure graph renders
  await page.waitForTimeout(1000);

  const rect = await page.evaluate(() => {
    const rect = document.querySelector(".dcg-graph-inner").getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  const screenshot = await page.screenshot({
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    encoding: "base64"
  });

  await browser.close();
  return screenshot;
}

// POST /graph/snapshot
// Body: { expressions: ["y=x^2", "y=2x"] }
router.post("/snapshot", async (req, res) => {
  const { expressions } = req.body;
  if (!expressions || !Array.isArray(expressions) || expressions.length === 0) {
    return res.status(400).json({ error: "Missing expressions array" });
  }

  try {
    const imageBase64 = await generateGraphImage(expressions);
    res.json({ image: `data:image/png;base64,${imageBase64}` });
  } catch (err) {
    console.error("❌ Graph image generation error:", err);
    res.status(500).json({ error: "Graph generation failed" });
  }
});

module.exports = router;
