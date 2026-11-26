/**
 * Chat-template control tokens a model sometimes emits as literal text.
 *
 * Live, 2026-11-26: a tutor reply ended "…inside the parentheses? <|im_end|>"
 * — streamed to the student, stored, and re-rendered on reload. These tokens
 * mark turn boundaries inside the model; they are never content.
 *
 * @module utils/pipeline/templateTokens
 */

const TEMPLATE_TOKEN = /\s*<\|(?:im_start|im_end|im_sep|endoftext|endofprompt|eot_id|start_header_id|end_header_id|begin_of_text|end_of_text)\|>\s*(?:assistant|user|system)?/gi;

/** `text` without template tokens. Strings only; anything else is returned as is. */
function stripTemplateTokens(text) {
  if (typeof text !== 'string' || text.indexOf('<|') === -1) return text;
  return text.replace(TEMPLATE_TOKEN, (m) => (/^\s/.test(m) && /\s$/.test(m) ? ' ' : '')).replace(/[ \t]+$/gm, '');
}

module.exports = { stripTemplateTokens };
