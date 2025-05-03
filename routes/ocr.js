// ocr.js – Mathpix-powered OCR for Mathmatix AI
const axios = require("axios");

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID;
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY;

if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) {
  throw new Error("Missing Mathpix API credentials in .env");
}

const recognizeMathpix = async (base64Image) => {
  const headers = {
    "app_id": MATHPIX_APP_ID,
    "app_key": MATHPIX_APP_KEY,
    "Content-Type": "application/json"
  };

  const body = {
    src: base64Image,
    formats: ["text", "latex_styled"],
    data_options: {
      include_asciimath: false,
      include_latex: true,
      include_text: true
    }
  };

  try {
    const res = await axios.post("https://api.mathpix.com/v3/text", body, { headers });

    const text = res.data.text || "";
    const latex = res.data.latex_styled || "";

    const combined = `${text}\n\nLaTeX:\n${latex}`;
    return combined.trim() || "⚠️ No recognizable math or text found.";
  } catch (err) {
    console.error("Mathpix OCR error:", err?.response?.data || err.message);
    return "⚠️ OCR failed. Check API or file format.";
  }
};

module.exports = recognizeMathpix;
