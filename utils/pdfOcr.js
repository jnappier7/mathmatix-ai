// pdfOcr.js - Mathpix PDF processing using /v3/pdf endpoint

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { MATHPIX_PRIVACY_METADATA } = require("./ocr");

const authHeaders = () => ({
  app_id: process.env.MATHPIX_APP_ID,
  app_key: process.env.MATHPIX_APP_KEY
});

/**
 * Permanently delete a submitted document and its derived outputs from
 * Mathpix. Best-effort: a failure here is logged, never surfaced, because the
 * text has already been retrieved (or the job already failed) and the student
 * should not see an error for our cleanup. Mathpix keeps only billing
 * metadata (page count, timestamps) after this call.
 */
async function deleteFromMathpix(pdfId) {
  try {
    await axios.delete(`https://api.mathpix.com/v3/pdf/${pdfId}`, { headers: authHeaders() });
    console.log(`[pdfOcr] Deleted ${pdfId} from Mathpix`);
  } catch (err) {
    console.warn(`[pdfOcr] Could not delete ${pdfId} from Mathpix:`, err?.response?.status || err.message);
  }
}

/**
 * Extract text from PDF using Mathpix /v3/pdf endpoint.
 *
 * Privacy: the upload opts out of Mathpix retention (improve_mathpix=false)
 * and the document is deleted from Mathpix as soon as the text is retrieved —
 * or as soon as the job fails or times out. The extracted text is the only
 * thing that persists, and it persists here, not there.
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} filename - Original filename
 * @returns {Promise<string>} Extracted text
 */
async function processPDF(pdfBuffer, filename) {
  let pdfId = null;
  try {
    console.log(`[pdfOcr] Starting PDF processing for: ${filename}`);

    // Validate API credentials
    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      console.error('[pdfOcr] ERROR: Mathpix API credentials not configured');
      throw new Error('Mathpix API credentials not configured. Please contact support.');
    }

    // Step 1: Upload PDF to Mathpix
    const formData = new FormData();
    formData.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    formData.append('options_json', JSON.stringify({
      conversion_formats: { md: true },  // Use 'md' (Markdown) format
      metadata: { ...MATHPIX_PRIVACY_METADATA }
    }));

    console.log(`[pdfOcr] Uploading PDF to Mathpix API...`);
    const uploadResponse = await axios.post(
      "https://api.mathpix.com/v3/pdf",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          app_id: process.env.MATHPIX_APP_ID,
          app_key: process.env.MATHPIX_APP_KEY
        },
        maxBodyLength: Infinity
      }
    );

    if (!uploadResponse.data || !uploadResponse.data.pdf_id) {
      console.error('[pdfOcr] ERROR: No pdf_id in upload response:', uploadResponse.data);
      throw new Error('Failed to upload PDF to Mathpix - no pdf_id returned');
    }

    pdfId = uploadResponse.data.pdf_id;
    console.log(`[pdfOcr] PDF uploaded successfully, pdf_id: ${pdfId}`);

    // Step 2: Poll for completion with adaptive intervals
    // Start fast (500ms) for small/simple PDFs, then back off for larger ones.
    // Total max wait: ~90 seconds (more generous than before, but faster for small PDFs)
    const maxAttempts = 30;
    const getInterval = (attempt) => Math.min(500 * Math.pow(1.3, attempt), 5000); // 500ms → 5s cap

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const interval = getInterval(attempt);
      await new Promise(resolve => setTimeout(resolve, interval));

      const statusResponse = await axios.get(
        `https://api.mathpix.com/v3/pdf/${pdfId}`,
        {
          headers: {
            app_id: process.env.MATHPIX_APP_ID,
            app_key: process.env.MATHPIX_APP_KEY
          }
        }
      );

      const { status, conversion_status } = statusResponse.data;
      console.log(`[pdfOcr] Poll attempt ${attempt + 1}/${maxAttempts} (${interval}ms), status: ${status}`);

      // Check if markdown conversion is complete
      if (status === 'completed' && conversion_status?.md?.status === 'completed') {
        // Step 3: Fetch the markdown file directly using pdf_id
        console.log(`[pdfOcr] Fetching markdown from: /v3/pdf/${pdfId}.md`);
        const textResponse = await axios.get(
          `https://api.mathpix.com/v3/pdf/${pdfId}.md`,
          {
            headers: {
              app_id: process.env.MATHPIX_APP_ID,
              app_key: process.env.MATHPIX_APP_KEY
            }
          }
        );
        const extractedText = textResponse.data;

        console.log(`[pdfOcr] Successfully extracted ${extractedText.length} characters from PDF`);
        return extractedText;
      } else if (status === 'error') {
        const errorDetails = statusResponse.data?.error || 'Unknown error';
        console.error(`[pdfOcr] PDF processing failed:`, statusResponse.data);
        throw new Error(`PDF processing failed: ${errorDetails}`);
      }
    }

    console.error(`[pdfOcr] PDF processing timeout after ${maxAttempts} polling attempts`);
    throw new Error(`PDF processing timed out. Please try a smaller PDF or contact support.`);

  } catch (err) {
    console.error("[pdfOcr] Error processing PDF:", {
      message: err.message,
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data,
      stack: err.stack
    });

    // Re-throw the error so it can be handled by the caller
    throw new Error(`PDF processing failed: ${err.message}`);
  } finally {
    // Whatever happened above, do not leave the student's document behind.
    if (pdfId) await deleteFromMathpix(pdfId);
  }
}

/**
 * Path-based variant for callers that hold the PDF on disk
 * (routes/teacherResources.js, utils/resourceDetector.js). Those callers
 * destructured `extractTextFromPDF` from this module before it existed, so
 * the call threw inside a try/catch and the upload silently indexed with no
 * text.
 */
async function extractTextFromPDF(filePath) {
  return processPDF(fs.readFileSync(filePath), path.basename(filePath));
}

module.exports = processPDF;
module.exports.extractTextFromPDF = extractTextFromPDF;
module.exports.deleteFromMathpix = deleteFromMathpix;
