// utils/chapterProcessor.js
// Background pipeline: PDF text extraction → AI concept card generation → chunking → embedding → store
// Processes teacher-uploaded chapter PDFs into RAG-ready data

const { callLLM } = require('./openaiClient');
const { generateEmbedding } = require('./openaiClient');
const ChapterContent = require('../models/chapterContent');
const logger = require('./logger');
const { createCanvas } = require('canvas');

// Rough token estimate: ~4 chars per token for English text
const CHARS_PER_TOKEN = 4;
const CHUNK_TARGET_TOKENS = 300;   // ~300 tokens per chunk
const CHUNK_OVERLAP_TOKENS = 50;   // ~50 token overlap between chunks

/**
 * Main processing pipeline for a chapter PDF
 * Runs as a background job — updates processingStatus as it progresses
 * @param {string} chapterContentId - The ChapterContent document ID
 * @param {Buffer} pdfBuffer - The raw PDF file buffer
 */
async function processChapter(chapterContentId, pdfBuffer) {
  const chapter = await ChapterContent.findById(chapterContentId);
  if (!chapter) {
    logger.error(`[ChapterProcessor] Chapter ${chapterContentId} not found`);
    return;
  }

  try {
    chapter.processingStatus = 'extracting';
    chapter.processingStartedAt = new Date();
    await chapter.save();

    // Step 1: Extract text from PDF
    logger.info(`[ChapterProcessor] Extracting text from PDF for chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`);
    const { text, pageCount } = await extractTextFromPDF(pdfBuffer);

    if (!text || text.trim().length < 100) {
      throw new Error('PDF text extraction yielded insufficient text. The PDF may be image-based or empty.');
    }

    chapter.pageCount = pageCount;

    // Step 1b: Extract image/diagram descriptions via vision model
    logger.info(`[ChapterProcessor] Scanning pages for diagrams and figures...`);
    let imageDescriptions = '';
    try {
      imageDescriptions = await extractImageDescriptions(pdfBuffer);
      if (imageDescriptions) {
        logger.info(`[ChapterProcessor] Extracted visual content descriptions (${imageDescriptions.length} chars)`);
      }
    } catch (imgErr) {
      logger.warn(`[ChapterProcessor] Image extraction failed (non-fatal): ${imgErr.message}`);
    }

    // Combine text + image descriptions for the full chapter content
    const fullText = imageDescriptions ? text + imageDescriptions : text;
    chapter.rawText = fullText;

    // Step 2: Generate concept cards via AI
    chapter.processingStatus = 'generating-cards';
    await chapter.save();

    logger.info(`[ChapterProcessor] Generating concept cards for chapter ${chapter.chapterNumber}`);
    const { conceptCards, outline } = await generateConceptCards(fullText, chapter.chapterTitle, chapter.chapterNumber);

    chapter.conceptCards = conceptCards;
    chapter.outline = outline;
    chapter.totalConceptCards = conceptCards.length;

    // Step 3: Chunk the text for RAG
    chapter.processingStatus = 'chunking';
    await chapter.save();

    logger.info(`[ChapterProcessor] Chunking text for chapter ${chapter.chapterNumber}`);
    const rawChunks = chunkText(fullText, CHUNK_TARGET_TOKENS, CHUNK_OVERLAP_TOKENS);

    // Step 4: Generate embeddings for each chunk
    chapter.processingStatus = 'embedding';
    await chapter.save();

    logger.info(`[ChapterProcessor] Generating embeddings for ${rawChunks.length} chunks`);
    const chunks = await embedChunks(rawChunks);

    chapter.chunks = chunks;
    chapter.totalChunks = chunks.length;
    chapter.totalTokens = chunks.reduce((sum, c) => sum + (c.tokenCount || 0), 0);

    // Done
    chapter.processingStatus = 'ready';
    chapter.processingCompletedAt = new Date();
    await chapter.save();

    logger.info(`[ChapterProcessor] Chapter ${chapter.chapterNumber} processing complete: ${conceptCards.length} concept cards, ${chunks.length} chunks`);

  } catch (error) {
    logger.error(`[ChapterProcessor] Failed to process chapter ${chapterContentId}: ${error.message}`);
    chapter.processingStatus = 'failed';
    chapter.processingError = error.message;
    await chapter.save();
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{text: string, pageCount: number}>}
 */
async function extractTextFromPDF(pdfBuffer) {
  let PDFParse;
  try {
    ({ PDFParse } = require('pdf-parse'));
  } catch {
    // Fallback: use pdfjs-dist if pdf-parse isn't installed
    return extractTextWithPdfjs(pdfBuffer);
  }

  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  const text = (result.pages || []).map(p => p.text).join('\n\n');
  return {
    text,
    pageCount: result.total || 0
  };
}

/**
 * Fallback PDF extraction using pdfjs-dist
 */
async function extractTextWithPdfjs(pdfBuffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pages.push(pageText);
  }

  return {
    text: pages.join('\n\n'),
    pageCount: doc.numPages
  };
}

/**
 * Render PDF pages as images and use GPT-4o-mini vision to describe
 * diagrams, figures, charts, and other visual content.
 * @param {Buffer} pdfBuffer - The raw PDF file buffer
 * @returns {Promise<string>} Text descriptions of all visual content found
 */
async function extractImageDescriptions(pdfBuffer) {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  const descriptions = [];
  const RENDER_SCALE = 1.5; // Balance quality vs. size
  const BATCH_SIZE = 3;     // Pages per vision API call

  logger.info(`[ChapterProcessor] Extracting images from ${doc.numPages} pages`);

  // Render each page to a base64 PNG
  const pageImages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      const base64 = pngBuffer.toString('base64');
      pageImages.push({ pageNum: i, base64 });
    } catch (renderErr) {
      logger.warn(`[ChapterProcessor] Failed to render page ${i}: ${renderErr.message}`);
    }
  }

  if (pageImages.length === 0) return '';

  // Send pages in batches to vision model
  for (let i = 0; i < pageImages.length; i += BATCH_SIZE) {
    const batch = pageImages.slice(i, i + BATCH_SIZE);
    const pageNums = batch.map(p => p.pageNum).join(', ');

    try {
      const content = [
        {
          type: 'text',
          text: `You are analyzing textbook pages for a biology course. Look at the page(s) and describe ONLY the visual content: diagrams, figures, charts, graphs, illustrations, labeled images, flowcharts, and microscopy images. For each visual element found:

1. State what type of visual it is (diagram, chart, microscope image, etc.)
2. Describe what it shows in detail — labels, arrows, processes depicted, organisms shown
3. Explain what biological concept it illustrates

If a page has NO visual content (just text), respond with "No visual content on this page." for that page.

Format each as:
[Figure on page X]: <description>

Be thorough — students who cannot see these images depend on your descriptions.`
        },
        ...batch.map(p => ({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${p.base64}`, detail: 'low' }
        }))
      ];

      const response = await callLLM('gpt-4o-mini', [{ role: 'user', content }], {
        temperature: 0.2,
        max_tokens: 1500
      });

      const desc = response.choices?.[0]?.message?.content?.trim();
      if (desc && !desc.includes('No visual content')) {
        descriptions.push(desc);
        logger.info(`[ChapterProcessor] Found visual content on pages ${pageNums}`);
      }
    } catch (visionErr) {
      logger.warn(`[ChapterProcessor] Vision API failed for pages ${pageNums}: ${visionErr.message}`);
    }

    // Brief pause between batches
    if (i + BATCH_SIZE < pageImages.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (descriptions.length === 0) return '';

  return '\n\n--- FIGURES AND DIAGRAMS ---\n\n' + descriptions.join('\n\n');
}

/**
 * Use AI to generate concept cards and outline from chapter text
 * @param {string} text - Full chapter text
 * @param {string} chapterTitle - Chapter title
 * @param {number} chapterNumber - Chapter number
 * @returns {Promise<{conceptCards: Array, outline: Array}>}
 */
async function generateConceptCards(text, chapterTitle, chapterNumber) {
  // Truncate to fit in context window (~12K tokens of chapter text)
  const maxChars = 48000;
  const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '\n\n[Text truncated...]' : text;

  const prompt = `You are a curriculum expert. Analyze this textbook chapter and produce structured learning data.

CHAPTER ${chapterNumber}: "${chapterTitle}"

TEXT:
${truncatedText}

Respond with VALID JSON only (no markdown code fences). Use this exact structure:
{
  "conceptCards": [
    {
      "title": "Concept name",
      "summary": "2-3 sentence explanation of the concept",
      "keyTerms": ["term1", "term2"],
      "orderIndex": 0,
      "depthLevel": "intro|core|advanced"
    }
  ],
  "outline": [
    {
      "sectionTitle": "Section name",
      "sectionNumber": "5.1",
      "orderIndex": 0,
      "conceptCardIndexes": [0, 1]
    }
  ]
}

Rules:
- Extract 5-15 concept cards depending on chapter length
- Order concepts as they appear in the chapter
- Each concept card should be self-contained (understandable without reading the chapter)
- Key terms should include scientific vocabulary introduced in that concept
- The outline should reflect the chapter's actual section structure
- depthLevel: "intro" for foundational/review, "core" for main concepts, "advanced" for extension material`;

  const messages = [{ role: 'user', content: prompt }];
  const response = await callLLM('gpt-4o-mini', messages, {
    temperature: 0.3,
    max_tokens: 4000
  });

  const responseText = response.choices[0].message.content.trim();

  // Parse JSON (handle potential markdown fences)
  let parsed;
  try {
    const jsonStr = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    logger.error(`[ChapterProcessor] Failed to parse concept card JSON: ${parseError.message}`);
    // Return minimal fallback
    return {
      conceptCards: [{
        title: chapterTitle,
        summary: `Chapter ${chapterNumber} content`,
        keyTerms: [],
        orderIndex: 0,
        depthLevel: 'core'
      }],
      outline: [{
        sectionTitle: chapterTitle,
        sectionNumber: `${chapterNumber}.1`,
        orderIndex: 0,
        conceptCardIndexes: [0]
      }]
    };
  }

  // Map outline conceptCardIndexes to actual concept card IDs (will be set after save)
  const conceptCards = (parsed.conceptCards || []).map((card, idx) => ({
    title: card.title,
    summary: card.summary,
    keyTerms: card.keyTerms || [],
    orderIndex: card.orderIndex ?? idx,
    depthLevel: card.depthLevel || 'core'
  }));

  const outline = (parsed.outline || []).map((section, idx) => ({
    sectionTitle: section.sectionTitle,
    sectionNumber: section.sectionNumber || `${chapterNumber}.${idx + 1}`,
    orderIndex: section.orderIndex ?? idx,
    conceptCardIds: [] // Will be populated after concept cards are saved with _ids
  }));

  return { conceptCards, outline };
}

/**
 * Split text into overlapping chunks for RAG
 * @param {string} text - Full chapter text
 * @param {number} targetTokens - Target tokens per chunk
 * @param {number} overlapTokens - Overlap between consecutive chunks
 * @returns {Array<{text: string, chunkIndex: number, tokenCount: number}>}
 */
function chunkText(text, targetTokens = CHUNK_TARGET_TOKENS, overlapTokens = CHUNK_OVERLAP_TOKENS) {
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const chunks = [];

  // Split by paragraphs first for natural boundaries
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();

    // If adding this paragraph exceeds target, save current chunk and start new one
    if (currentChunk.length + trimmedParagraph.length > targetChars && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        chunkIndex: chunkIndex++,
        tokenCount: Math.ceil(currentChunk.length / CHARS_PER_TOKEN)
      });

      // Start new chunk with overlap from end of previous
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = overlapText + '\n\n' + trimmedParagraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      chunkIndex: chunkIndex,
      tokenCount: Math.ceil(currentChunk.length / CHARS_PER_TOKEN)
    });
  }

  return chunks;
}

/**
 * Generate embeddings for an array of text chunks
 * Processes in batches to respect rate limits
 * @param {Array<{text: string, chunkIndex: number, tokenCount: number}>} rawChunks
 * @returns {Promise<Array>} Chunks with embeddings added
 */
async function embedChunks(rawChunks) {
  const BATCH_SIZE = 5; // Process 5 at a time to avoid rate limits
  const results = [];

  for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
    const batch = rawChunks.slice(i, i + BATCH_SIZE);

    const embeddedBatch = await Promise.all(
      batch.map(async (chunk) => {
        const embedding = await generateEmbedding(chunk.text);
        return {
          text: chunk.text,
          embedding,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount
        };
      })
    );

    results.push(...embeddedBatch);

    // Brief pause between batches to be kind to rate limits
    if (i + BATCH_SIZE < rawChunks.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

module.exports = {
  processChapter,
  extractTextFromPDF,
  extractImageDescriptions,
  generateConceptCards,
  chunkText,
  embedChunks
};
