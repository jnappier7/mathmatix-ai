// ocr.js - Mathpix OCR for extracting math + text from image or PDF (rephrased emoji comment)

const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Mathpix keeps submitted images by default to improve its models. Student
// work is an education record, so every request opts out: with this flag
// Mathpix processes the image and discards it rather than retaining it.
// Pinned by tests/unit/mathpixPrivacy.test.js and disclosed on
// public/subprocessors.html. Ask Mathpix support to pin this at the account
// level too, so a request that forgets the flag is still covered.
const MATHPIX_PRIVACY_METADATA = Object.freeze({ improve_mathpix: false });

async function ocr(base64) {
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
        },
        metadata: { ...MATHPIX_PRIVACY_METADATA }
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
}

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.tiff': 'image/tiff'
};

/**
 * Path-based variant for callers that hold a file on disk
 * (routes/teacherResources.js, utils/resourceDetector.js). Those callers
 * destructured `performOCR` from this module before it existed, so the
 * call threw "performOCR is not a function" inside a try/catch and teacher
 * resource uploads silently indexed with no text.
 * @returns {Promise<{text: string}>}
 */
async function performOCR(filePath) {
  const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  return { text: await ocr(dataUrl) };
}

module.exports = ocr;
module.exports.performOCR = performOCR;
module.exports.MATHPIX_PRIVACY_METADATA = MATHPIX_PRIVACY_METADATA;