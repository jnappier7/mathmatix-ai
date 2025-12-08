// ocr.js - Mathpix OCR for extracting math + text from image or PDF (rephrased emoji comment)

const axios = require("axios");

module.exports = async function (base64) {
  try {
    // Validate API credentials
    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      console.error('[ocr] ERROR: Mathpix API credentials not configured');
      throw new Error('Mathpix API credentials not configured. Please contact support.');
    }

    console.log('[ocr] Sending image to Mathpix API...');
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

    console.log("[ocr] Mathpix response received:", {
      hasLatex: !!res.data.latex_styled,
      hasText: !!res.data.text,
      confidence: res.data.confidence
    });

    const extracted = (
      res.data.latex_styled?.trim() ||
      res.data.text?.trim() ||
      ""
    );

    if (!extracted) {
      console.warn('[ocr] No text extracted from image');
    }

    return extracted;

  } catch (err) {
    console.error("[ocr] Mathpix OCR error:", {
      message: err.message,
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data
    });

    // Re-throw the error so it can be handled by the caller
    throw new Error(`Image OCR failed: ${err.message}`);
  }
};