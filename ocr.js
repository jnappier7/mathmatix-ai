// ocr.js - Mathpix OCR for extracting math + text from image or PDF (rephrased emoji comment)

const axios = require("axios");

module.exports = async function (base64) {
  try {
    const res = await axios.post(
      "https://api.mathpix.com/v3/text",
      {
        src: base64,
        formats: ["text", "latex_styled"],
        data_options: {
          include_latex: true,
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY
        }
      }
    );

    // LOG: Mathpix raw response (rephrased emoji comment)
    console.log("LOG: Mathpix raw response:", res.data);

    return (
      res.data.latex_styled?.trim() ||
      res.data.text?.trim() ||
      ""
    );

  } catch (err) {
    console.error("ERROR: Mathpix OCR error:", err?.response?.data || err.message); // Replaced emoji
    return "";
  }
};