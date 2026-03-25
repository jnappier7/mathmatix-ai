// utils/ragRetrieval.js
// Cosine similarity search over chapter chunks for textbook mode RAG
// Retrieves the most relevant passages from a chapter given a student query

const { generateEmbedding } = require('./openaiClient');

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity score (-1 to 1)
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Retrieve the most relevant chunks from a chapter for a given query
 * @param {Object} chapter - Chapter document with chunks (including embeddings)
 * @param {string} query - Student's message or query text
 * @param {number} topK - Number of top results to return (default 3)
 * @returns {Promise<Array<{text: string, score: number, conceptCardId: string, chunkIndex: number, pageRange: Object}>>}
 */
async function retrieveRelevantChunks(chapter, query, topK = 3) {
  if (!chapter || !chapter.chunks || chapter.chunks.length === 0) {
    return [];
  }

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    // No query — return first topK chunks (beginning of chapter) as fallback
    return chapter.chunks
      .slice(0, topK)
      .map(chunk => ({
        text: chunk.text,
        score: 0,
        conceptCardId: chunk.conceptCardId,
        chunkIndex: chunk.chunkIndex,
        pageRange: chunk.pageRange
      }));
  }

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Score all chunks
  const scored = chapter.chunks.map(chunk => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
    conceptCardId: chunk.conceptCardId,
    chunkIndex: chunk.chunkIndex,
    pageRange: chunk.pageRange,
    tokenCount: chunk.tokenCount || 0
  }));

  // Sort by descending similarity score
  scored.sort((a, b) => b.score - a.score);

  // Return top K results, filtering out very low scores
  const MIN_RELEVANCE_THRESHOLD = 0.1;
  return scored
    .filter(chunk => chunk.score >= MIN_RELEVANCE_THRESHOLD)
    .slice(0, topK);
}

/**
 * Retrieve chunks with a token budget (for fitting into context window)
 * @param {Object} chapter - Chapter document with chunks
 * @param {string} query - Student's message
 * @param {number} tokenBudget - Maximum tokens to return (default 1500)
 * @returns {Promise<Array>} Relevant chunks within token budget
 */
async function retrieveChunksWithBudget(chapter, query, tokenBudget = 1500) {
  // Get more candidates than we might need
  const candidates = await retrieveRelevantChunks(chapter, query, 10);

  const selected = [];
  let usedTokens = 0;

  for (const chunk of candidates) {
    const chunkTokens = chunk.tokenCount || Math.ceil(chunk.text.length / 4);
    if (usedTokens + chunkTokens > tokenBudget) break;
    selected.push(chunk);
    usedTokens += chunkTokens;
  }

  // Always return at least one chunk if available
  if (selected.length === 0 && candidates.length > 0) {
    selected.push(candidates[0]);
  }

  return selected;
}

module.exports = {
  cosineSimilarity,
  retrieveRelevantChunks,
  retrieveChunksWithBudget
};
