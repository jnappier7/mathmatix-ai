
const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();

async function extractTextFromImageOrPDF(base64Image) {
  try {
    const [result] = await client.documentTextDetection({
      image: { content: base64Image }
    });

    const text = result.fullTextAnnotation?.text || "";
    return text;
  } catch (error) {
    console.error("OCR extraction error:", error);
    return "";
  }
}

module.exports = { extractTextFromImageOrPDF };
