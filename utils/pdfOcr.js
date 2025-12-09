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

    // Validate API credentials
    if (!process.env.MATHPIX_APP_ID || !process.env.MATHPIX_APP_KEY) {
      console.error('[pdfOcr] ERROR: Mathpix API credentials not configured');
      throw new Error('Mathpix API credentials not configured. Please contact support.');
    }

    // Step 1: Upload PDF to Mathpix
    const formData = new FormData();
    formData.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    formData.append('options_json', JSON.stringify({
      conversion_formats: { md: true }  // Use 'md' (Markdown) format
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

    const pdfId = uploadResponse.data.pdf_id;
    console.log(`[pdfOcr] PDF uploaded successfully, pdf_id: ${pdfId}`);

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

      const { status, md: mdUrl } = statusResponse.data;
      console.log(`[pdfOcr] Poll attempt ${attempt + 1}/${maxAttempts}, status: ${status}`);

      // Debug: Log the full response when completed
      if (status === 'completed') {
        console.log(`[pdfOcr] Completed response data:`, JSON.stringify(statusResponse.data, null, 2));
      }

      if (status === 'completed' && mdUrl) {
        // Step 3: Fetch the extracted text (in Markdown format)
        const textResponse = await axios.get(mdUrl);
        const extractedText = textResponse.data;

        console.log(`[pdfOcr] Successfully extracted ${extractedText.length} characters from PDF`);
        return extractedText;
      } else if (status === 'error') {
        const errorDetails = statusResponse.data?.error || 'Unknown error';
        console.error(`[pdfOcr] PDF processing failed:`, statusResponse.data);
        throw new Error(`PDF processing failed: ${errorDetails}`);
      }
    }

    console.error(`[pdfOcr] PDF processing timeout after ${maxAttempts * pollInterval / 1000}s`);
    throw new Error(`PDF processing timed out after ${maxAttempts * pollInterval / 1000} seconds. Please try a smaller PDF or contact support.`);

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
  }
};
