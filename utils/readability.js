/**
 * READABILITY SCORING — IEP Reading Level Enforcement
 *
 * Uses the Coleman-Liau Index (CLI) to score AI responses.
 * CLI is character-based (not syllable-based), making it deterministic,
 * fast, and well-suited for scoring short AI-generated text.
 *
 * Formula: CLI = 0.0588 * L - 0.296 * S - 15.8
 *   L = avg number of letters per 100 words
 *   S = avg number of sentences per 100 words
 *
 * @module readability
 */

/**
 * Strip markdown formatting, math notation, IEP tags, and emoji from text
 * so readability scoring measures the actual prose the student reads.
 */
function stripForScoring(text) {
  let cleaned = text;

  // Remove IEP/system tags like <IEP_GOAL_PROGRESS:...>, <SKILL_MASTERED:...>, etc.
  cleaned = cleaned.replace(/<[A-Z_]+:[^>]*>/g, '');

  // Remove markdown images ![alt](url)
  cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Remove markdown links [text](url) → keep text
  cleaned = cleaned.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Remove markdown bold/italic markers
  cleaned = cleaned.replace(/[*_]{1,3}/g, '');

  // Remove markdown headers (# ## ###)
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Remove code blocks and inline code
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');

  // Remove LaTeX math notation ($...$ and $$...$$)
  cleaned = cleaned.replace(/\$\$[\s\S]*?\$\$/g, ' [math] ');
  cleaned = cleaned.replace(/\$[^$]+\$/g, ' [math] ');

  // Remove emoji (unicode ranges for common emoji)
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '');

  // Remove bullet points and list markers
  cleaned = cleaned.replace(/^[\s]*[-•*]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Split text into words (letters + apostrophes only).
 */
function getWords(text) {
  const words = text.match(/[a-zA-Z'][a-zA-Z']*/g);
  return words || [];
}

/**
 * Count sentences. Uses period, exclamation, question mark as terminators.
 * Handles abbreviations (Mr., Dr., etc.) by requiring the terminator
 * to be followed by a space + uppercase or end of string.
 */
function countSentences(text) {
  // Split on sentence-ending punctuation followed by space or end
  const sentenceEnders = text.match(/[.!?]+(?:\s|$)/g);
  return Math.max(sentenceEnders ? sentenceEnders.length : 1, 1);
}

/**
 * Count letters (a-z, A-Z) in text.
 */
function countLetters(text) {
  const letters = text.match(/[a-zA-Z]/g);
  return letters ? letters.length : 0;
}

/**
 * Calculate the Coleman-Liau Index for a passage of text.
 * Returns a grade level (e.g., 4.2 means ~4th grade reading level).
 *
 * @param {string} text - The text to analyze
 * @returns {{ gradeLevel: number, wordCount: number, sentenceCount: number, letterCount: number }}
 */
function colemanLiauIndex(text) {
  const cleaned = stripForScoring(text);
  const words = getWords(cleaned);
  const wordCount = words.length;

  // Need at least a few words for a meaningful score
  if (wordCount < 5) {
    return { gradeLevel: 0, wordCount, sentenceCount: 0, letterCount: 0 };
  }

  const letterCount = countLetters(cleaned);
  const sentenceCount = countSentences(cleaned);

  // L = average number of letters per 100 words
  const L = (letterCount / wordCount) * 100;

  // S = average number of sentences per 100 words
  const S = (sentenceCount / wordCount) * 100;

  // Coleman-Liau formula
  const gradeLevel = Math.max(0, 0.0588 * L - 0.296 * S - 15.8);

  return {
    gradeLevel: Math.round(gradeLevel * 10) / 10, // 1 decimal place
    wordCount,
    sentenceCount,
    letterCount
  };
}

/**
 * Convert a Lexile score to an approximate grade level.
 * Based on the MetaMetrics Lexile-to-grade correspondence table.
 *
 * @param {number} lexile - Lexile score (e.g., 650)
 * @returns {number} Approximate grade level
 */
function lexileToGrade(lexile) {
  if (lexile <= 190) return 1;
  if (lexile <= 420) return 2;
  if (lexile <= 520) return 3;
  if (lexile <= 740) return 4;
  if (lexile <= 830) return 5;
  if (lexile <= 925) return 6;
  if (lexile <= 970) return 7;
  if (lexile <= 1010) return 8;
  if (lexile <= 1050) return 9;
  if (lexile <= 1080) return 10;
  if (lexile <= 1130) return 11;
  return 12;
}

/**
 * Check whether an AI response exceeds a student's IEP reading level.
 *
 * @param {string} responseText - The AI's response text
 * @param {number} targetReadingLevel - The student's reading level (grade or Lexile)
 * @returns {{ passes: boolean, responseGrade: number, targetGrade: number, margin: number, detail: object }}
 */
function checkReadingLevel(responseText, targetReadingLevel) {
  if (!responseText || !targetReadingLevel) {
    return { passes: true, responseGrade: 0, targetGrade: 0, margin: 0, detail: null };
  }

  const isLexile = targetReadingLevel > 20;
  const targetGrade = isLexile ? lexileToGrade(targetReadingLevel) : targetReadingLevel;

  const detail = colemanLiauIndex(responseText);

  // Allow 2 grade levels of headroom. Readability formulas have inherent
  // variance (~1-2 grade levels), and math vocabulary naturally pushes scores
  // higher. A hard exact-grade cutoff would cause excessive re-prompts.
  const tolerance = 2;
  const passes = detail.gradeLevel <= targetGrade + tolerance;
  const margin = detail.gradeLevel - targetGrade;

  return { passes, responseGrade: detail.gradeLevel, targetGrade, margin, detail };
}

/**
 * Build a simplification prompt that asks the LLM to rewrite its own
 * response at a lower reading level. Used when checkReadingLevel fails.
 *
 * @param {string} originalResponse - The AI's original response
 * @param {number} targetGrade - Target grade level
 * @param {string} firstName - Student's first name
 * @returns {string} System instruction for the re-prompt
 */
function buildSimplificationPrompt(originalResponse, targetGrade, firstName) {
  return `Your previous response was written above ${firstName}'s reading level (IEP target: Grade ${targetGrade}).

Rewrite your EXACT same response — same math content, same teaching approach, same meaning — but simplified to a Grade ${targetGrade} reading level:
- Maximum sentence length: ${targetGrade <= 3 ? '8' : targetGrade <= 5 ? '12' : '15'} words
- Use only common, everyday vocabulary
- Replace multi-syllable words with simpler ones where possible
- Break compound sentences into separate short sentences
- Define any math term you must use in parentheses
- Keep the same encouraging tone

Your previous response to simplify:
"""
${originalResponse}
"""

Rewrite it now at Grade ${targetGrade} level. Do NOT add any commentary about the rewrite — just output the simplified version.`;
}

module.exports = {
  colemanLiauIndex,
  checkReadingLevel,
  buildSimplificationPrompt,
  lexileToGrade,
  stripForScoring
};
