// utils/anthropicClient.js — Anthropic (Claude) adapter for the LLM gateway.
//
// This module is a DROP-IN for openaiClient's callLLM / callLLMStream /
// callLLMStructured. It normalizes Claude's request/response/stream shapes
// into the exact OpenAI shapes the rest of the app already consumes, so the
// tutor pipeline (generate.js), the structuredChatStreamExtractor, and every
// route stay provider-agnostic. openaiClient dispatches here when the model
// id starts with "claude".
//
// Deliberately does NOT import openaiClient (no cycle). Only depends on the
// Anthropic SDK. Vision grading is intentionally not routed here — it calls
// the OpenAI SDK directly in llmGateway and stays on OpenAI.

const Anthropic = require('@anthropic-ai/sdk');

// Match the ANTHROPIC_API_KEY_PROD / _DEV convention documented in
// .env.example, with the legacy ANTHROPIC_API_KEY as a fallback.
function resolveApiKey() {
  const isProd = process.env.NODE_ENV === 'production';
  return (
    (isProd ? process.env.ANTHROPIC_API_KEY_PROD : process.env.ANTHROPIC_API_KEY_DEV) ||
    process.env.ANTHROPIC_API_KEY ||
    null
  );
}

let _client = null;
function client() {
  if (_client) return _client;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(
      'anthropicClient: no API key. Set ANTHROPIC_API_KEY_DEV / _PROD (or ANTHROPIC_API_KEY).'
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

const DEFAULT_MAX_TOKENS = 1500;

// Anthropic requires minor-facing API products to run a child-safety system
// prompt (see the "Responsible Use ... Guidelines for Organizations Serving
// Minors" help-center article). Mathmatix serves K-12 students, so we prepend
// this to every Claude request. It is provider-scoped on purpose — the OpenAI
// path is unchanged.
//
// ⚠️ REPLACE with Anthropic's official/updated child-safety prompt text from
// their guidelines page before relying on this for compliance; the wording
// below captures the intent but is not a substitute for their published copy.
const CHILD_SAFETY_PROMPT = [
  'You are assisting in an educational math-tutoring product used by children and teenagers.',
  'Keep all content strictly age-appropriate and educational. Never produce sexual, violent, self-harm, hateful, or otherwise harmful content, and never solicit personal or identifying information from the student.',
  'You are an AI tutor, not a human; if asked, say so plainly. If a student expresses distress or describes being in danger, respond with care and direct them to a trusted adult or appropriate help resource rather than attempting to counsel them yourself.',
  'Stay on the topic of math learning.',
].join(' ');

function isClaudeModel(model) {
  return typeof model === 'string' && model.toLowerCase().startsWith('claude');
}

// ── Content translation (vision) ────────────────────────────────────
// OpenAI vision blocks are {type:'image_url', image_url:{url}}; Claude wants
// {type:'image', source:{...}}. Passing an image_url block straight through
// 400s the whole call ("Input tag 'image_url' ... does not match any of the
// expected tags"), which is what broke tutor turns that carry an uploaded
// image. Convert here; text blocks and plain strings pass through untouched.
const CLAUDE_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

// Turn an OpenAI image_url `url` into a Claude image `source`, or null if it
// can't be represented (non-base64 data URL, or a media type Claude vision
// doesn't accept — e.g. HEIC/SVG). Callers drop unconvertible images rather
// than fail the request.
function imageUrlToClaudeSource(url) {
  if (typeof url !== 'string' || !url) return null;
  const dataMatch = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(url);
  if (dataMatch) {
    if (!dataMatch[2]) return null; // Claude needs base64 for inline data: images
    let mediaType = (dataMatch[1] || '').toLowerCase();
    if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
    if (!CLAUDE_IMAGE_MEDIA_TYPES.has(mediaType)) return null;
    const data = dataMatch[3] || '';
    if (!data) return null;
    return { type: 'base64', media_type: mediaType, data };
  }
  if (/^https?:\/\//i.test(url)) {
    return { type: 'url', url };
  }
  return null;
}

// Normalize a message's `content` (string | OpenAI block[]) to what Claude's
// Messages API accepts. Strings pass through; arrays are mapped block-by-block.
function toAnthropicContent(content) {
  if (typeof content === 'string' || !Array.isArray(content)) return content;
  const out = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      out.push({ type: 'text', text: block.text });
    } else if (block.type === 'image_url') {
      const source = imageUrlToClaudeSource(block.image_url && block.image_url.url);
      if (source) out.push({ type: 'image', source }); // else drop, don't 400 the call
    } else if (block.type === 'image' && block.source) {
      out.push(block); // already Claude-shaped
    }
    // unknown block types are dropped
  }
  // Claude rejects an empty content array — fall back to a single space so a
  // turn that was nothing but an unconvertible image still keeps the slot.
  return out.length ? out : ' ';
}

// ── Message translation ─────────────────────────────────────────────
// OpenAI carries the system prompt as a role:"system" message in the array.
// Claude takes it as a top-level `system` string. Pull all system messages
// out, concatenate them, and pass the rest through. Merge consecutive
// same-role turns (Claude is stricter about alternation than OpenAI).
// Coerce any translated content (string | block[]) to a block array so two
// same-role turns can always be merged.
function toBlocks(content) {
  if (Array.isArray(content)) return content;
  const text = typeof content === 'string' ? content : String(content ?? '');
  return [{ type: 'text', text: text || ' ' }];
}

function splitSystemAndMessages(messages) {
  const systemParts = [];
  const convo = [];
  for (const m of messages || []) {
    if (!m || !m.role) continue;
    if (m.role === 'system') {
      systemParts.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
      continue;
    }

    let role;
    let content;
    if (m.role === 'tool') {
      // OpenAI tool-result turn → Claude tool_result block in a user turn
      // (the tool-narration re-prompt sends these back after tool_calls).
      role = 'user';
      content = [{
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      }];
    } else {
      role = m.role === 'assistant' ? 'assistant' : 'user';
      content = toAnthropicContent(m.content);
      // Assistant turn that carried tool_calls → append Claude tool_use blocks
      // so the follow-up tool_result turns have ids to reference.
      if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const blocks = (content == null || (typeof content === 'string' && !content.trim()))
          ? []
          : toBlocks(content);
        for (const call of m.tool_calls) {
          let input = {};
          try { input = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch {}
          blocks.push({ type: 'tool_use', id: call.id, name: call.function?.name, input });
        }
        content = blocks;
      }
    }

    const last = convo[convo.length - 1];
    if (last && last.role === role && typeof last.content === 'string' && typeof content === 'string') {
      last.content += `\n\n${content}`;
    } else if (last && last.role === role && Array.isArray(last.content) && Array.isArray(content)) {
      // e.g. consecutive tool_result turns → one user turn with all results
      last.content.push(...content);
    } else {
      convo.push({ role, content });
    }
  }
  // Claude requires the first message to be a user turn.
  if (convo.length > 0 && convo[0].role !== 'user') {
    convo.unshift({ role: 'user', content: '(continuing)' });
  }
  return { system: systemParts.join('\n\n'), messages: convo };
}

// ── Structured output translation ───────────────────────────────────
// Claude's structured-output JSON Schema does not support numeric/length
// constraints. Strip the unsupported keywords recursively so the schema
// is accepted; the app validates semantics downstream anyway.
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  'minLength', 'maxLength', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties',
]);

function sanitizeSchema(node) {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(k)) continue;
    out[k] = sanitizeSchema(v);
  }
  return out;
}

// OpenAI response_format { type:'json_schema', json_schema:{ schema } }
// → Claude output_config { format:{ type:'json_schema', schema } }
function toClaudeOutputConfig(responseFormat) {
  const schema = responseFormat?.json_schema?.schema;
  if (!schema) return null;
  return { format: { type: 'json_schema', schema: sanitizeSchema(schema) } };
}

// ── Tool translation ────────────────────────────────────────────────
// OpenAI tools [{type:'function', function:{name, description, parameters}}]
// → Claude tools [{name, description, input_schema}]. Schemas share the same
// unsupported-keyword constraints as structured output, so reuse the
// sanitizer. Without this translation, options.tools was silently dropped —
// tool calling was a no-op whenever TUTOR_MODEL pointed at Claude.
function toClaudeTools(tools) {
  if (!Array.isArray(tools)) return null;
  const out = [];
  for (const t of tools) {
    const fn = t?.type === 'function' ? t.function : null;
    if (!fn || !fn.name) continue;
    out.push({
      name: fn.name,
      description: fn.description || '',
      input_schema: sanitizeSchema(fn.parameters || { type: 'object', properties: {} }),
    });
  }
  return out.length ? out : null;
}

// OpenAI tool_choice → Claude tool_choice. parallel_tool_calls:false becomes
// disable_parallel_tool_use on the choice object (Claude's location for it).
function toClaudeToolChoice(toolChoice, parallelToolCalls) {
  let choice;
  if (toolChoice == null || toolChoice === 'auto') choice = { type: 'auto' };
  else if (toolChoice === 'required') choice = { type: 'any' };
  else if (toolChoice === 'none') choice = { type: 'none' };
  else if (toolChoice?.type === 'function' && toolChoice.function?.name) {
    choice = { type: 'tool', name: toolChoice.function.name };
  } else choice = { type: 'auto' };
  if (parallelToolCalls === false && choice.type !== 'none') {
    choice.disable_parallel_tool_use = true;
  }
  return choice;
}

// Claude tool_use content blocks → OpenAI message.tool_calls shape
// (arguments as a JSON string, which generate.js re-parses).
function extractToolCalls(contentBlocks) {
  const calls = (contentBlocks || [])
    .filter((b) => b && b.type === 'tool_use')
    .map((b) => ({
      id: b.id,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  return calls.length ? calls : null;
}

function mapStopReason(claudeStop) {
  // Normalize to the OpenAI finish_reason vocabulary callers may check.
  switch (claudeStop) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    case 'refusal':
      return 'content_filter';
    default:
      return claudeStop || 'stop';
  }
}

function extractText(contentBlocks) {
  return (contentBlocks || [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

// Build the Claude request body shared by stream and non-stream paths.
// Notes:
//  - temperature is intentionally omitted — Sonnet 5 rejects non-default
//    sampling params.
//  - thinking is disabled to keep latency low and the stream a pure text
//    stream (so structured JSON deltas aren't interleaved with thinking
//    blocks). Revisit if we want reasoning depth later.
function buildBody(model, messages, options) {
  const { system, messages: claudeMessages } = splitSystemAndMessages(messages);
  const body = {
    model,
    max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
    messages: claudeMessages,
    thinking: { type: 'disabled' },
  };
  // Child-safety prompt leads; the app's tutor system prompt follows.
  body.system = system ? `${CHILD_SAFETY_PROMPT}\n\n${system}` : CHILD_SAFETY_PROMPT;
  if (options.response_format) {
    const oc = toClaudeOutputConfig(options.response_format);
    if (oc) body.output_config = oc;
  }
  const claudeTools = toClaudeTools(options.tools);
  if (claudeTools) {
    body.tools = claudeTools;
    body.tool_choice = toClaudeToolChoice(options.tool_choice, options.parallel_tool_calls);
  }
  return body;
}

function requestOptions(options) {
  const ro = { maxRetries: 0 };
  if (options.timeoutMs) ro.timeout = options.timeoutMs;
  if (options.signal) ro.signal = options.signal;
  return ro;
}

// ── callLLM (non-streaming) — OpenAI-shaped completion ──────────────
async function callLLM(model, messages, options = {}) {
  console.log(`LOG: Calling Anthropic model (${model})`);
  const body = buildBody(model, messages, options);
  const msg = await client().messages.create(body, requestOptions(options));
  const toolCalls = extractToolCalls(msg.content);
  const message = { role: 'assistant', content: extractText(msg.content) };
  if (toolCalls) message.tool_calls = toolCalls;
  return {
    id: msg.id,
    model: msg.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapStopReason(msg.stop_reason),
      },
    ],
    usage: msg.usage
      ? {
          prompt_tokens: msg.usage.input_tokens,
          completion_tokens: msg.usage.output_tokens,
          total_tokens: (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0),
        }
      : undefined,
  };
}

// ── callLLMStructured — parsed JSON, same contract as openaiClient ──
async function callLLMStructured(model, messages, responseFormat, options = {}) {
  if (!responseFormat || typeof responseFormat !== 'object') {
    throw new Error('callLLMStructured: responseFormat is required');
  }
  const completion = await callLLM(model, messages, { ...options, response_format: responseFormat });
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    const finishReason = completion?.choices?.[0]?.finish_reason || 'unknown';
    throw new Error(`callLLMStructured(anthropic): empty content (finish_reason=${finishReason})`);
  }
  try {
    return JSON.parse(content);
  } catch (parseErr) {
    const preview = content.slice(0, 200).replace(/\n/g, '\\n');
    throw new Error(`callLLMStructured(anthropic): JSON.parse failed (${parseErr.message}). Preview: ${preview}`);
  }
}

// ── callLLMStream — async-iterable of OpenAI-shaped chunks ──────────
// Downstream code reads chunk.choices[0].delta.content (a string), accumulates
// delta.tool_calls keyed by index, and checks the final chunk's finish_reason.
// We map Claude text deltas and tool_use/input_json_delta blocks to that shape.
//
// Exported as a pure generator over any Claude event iterable so the mapping
// is unit-testable without the SDK.
async function* openAiChunksFromClaudeEvents(claudeEvents) {
  let finish = 'stop';
  // Claude indexes content blocks per message; OpenAI indexes tool calls
  // 0..n-1 across the response. Map block index → ordinal tool index.
  const toolOrdinalByBlockIndex = new Map();
  let nextToolOrdinal = 0;

  for await (const event of claudeEvents) {
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const ordinal = nextToolOrdinal++;
      toolOrdinalByBlockIndex.set(event.index, ordinal);
      yield {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: ordinal,
              id: event.content_block.id,
              type: 'function',
              function: { name: event.content_block.name, arguments: '' },
            }],
          },
          finish_reason: null,
        }],
      };
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield { choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }] };
    } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
      const ordinal = toolOrdinalByBlockIndex.get(event.index);
      if (ordinal != null && event.delta.partial_json) {
        yield {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{ index: ordinal, function: { arguments: event.delta.partial_json } }],
            },
            finish_reason: null,
          }],
        };
      }
    } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
      finish = mapStopReason(event.delta.stop_reason);
    }
  }
  // Terminal chunk carrying finish_reason (mirrors OpenAI's last chunk).
  yield { choices: [{ index: 0, delta: {}, finish_reason: finish }] };
}

async function callLLMStream(model, messages, options = {}) {
  console.log(`LOG: Calling Anthropic streaming (${model})`);
  const body = buildBody(model, messages, options);
  const claudeStream = client().messages.stream(body, requestOptions(options));
  return openAiChunksFromClaudeEvents(claudeStream);
}

module.exports = {
  isClaudeModel,
  callLLM,
  callLLMStructured,
  callLLMStream,
  // exposed for unit tests
  splitSystemAndMessages,
  toAnthropicContent,
  sanitizeSchema,
  toClaudeOutputConfig,
  mapStopReason,
  toClaudeTools,
  toClaudeToolChoice,
  extractToolCalls,
  openAiChunksFromClaudeEvents,
};
