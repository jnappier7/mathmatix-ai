// pdfOcr.js - Mathpix PDF processing using /v3/pdf endpoint

const axios = require("axios");
const FormData = require("form-data");

/**
 * Extract text from PDF using Mathpix /v3/pdf endpoint
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} filename - Original filename
 * @returns {Promise<string>} Extracted text
 */
module.exports = async function processPDF(pdfBuffer, filename) {
  try {
    console.log(`[pdfOcr] Starting PDF processing for: ${filename}`);

    // Step 1: Upload PDF to Mathpix
    const formData = new FormData();
    formData.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    formData.append('options_json', JSON.stringify({
      conversion_formats: { text: true }
    }));

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

    const pdfId = uploadResponse.data.pdf_id;
    console.log(`[pdfOcr] PDF uploaded, got pdf_id: ${pdfId}`);

    // Step 2: Poll for completion (max 60 seconds)
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const statusResponse = await axios.get(
        `https://api.mathpix.com/v3/pdf/${pdfId}`,
        {
          headers: {
            app_id: process.env.MATHPIX_APP_ID,
            app_key: process.env.MATHPIX_APP_KEY
          }
        }
      );

      const { status, text_url } = statusResponse.data;
      console.log(`[pdfOcr] Poll attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);

      if (status === 'completed' && text_url) {
        // Step 3: Fetch the extracted text
        const textResponse = await axios.get(text_url);
        const extractedText = textResponse.data;

        console.log(`[pdfOcr] Successfully extracted ${extractedText.length} characters from PDF`);
        return extractedText;
      } else if (status === 'error') {
        console.error(`[pdfOcr] PDF processing failed:`, statusResponse.data);
        return "";
      }
    }

    console.error(`[pdfOcr] PDF processing timeout after ${maxAttempts * pollInterval / 1000}s`);
    return "";

  } catch (err) {
    console.error("[pdfOcr] Error processing PDF:", err?.response?.data || err.message);
    return "";
  }
};
