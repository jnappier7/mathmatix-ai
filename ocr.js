// ocr.js — Mathpix OCR for extracting math + text from image or PDF

const axios = require("axios");

module.exports = async function (base64) {
  try {
    const res = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: base64,
        formats: ["text"],
        ocr: ["math", "text"]
      },
      {
        headers: {
          "Content-Type": "application/json",
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY
        }
      }
    );

    return res.data.text || "";
  } catch (err) {
    console.error("🛑 Mathpix OCR error:", err?.response?.data || err.message);
    return "";
  }
};
