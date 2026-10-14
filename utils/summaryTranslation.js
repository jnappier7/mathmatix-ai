'use strict';
/* ============================================================
   summaryTranslation.js — session summaries in the parent's language.

   Summaries are generated once, in English, when a session ends (they also feed
   teachers). A parent who reads Spanish got everything else on the dashboard in
   Spanish and the session list in English. This translates the rows a parent is
   about to see, caches each translation on its conversation
   (summaryTranslations[lang] = { h, text }, h = hash of the English source, so
   an edited summary re-translates), and never blocks the dashboard: any failure
   or a slow model leaves the English text in place.

   Through the gateway with the child's name anonymized (the summaries carry it).
   ============================================================ */

const crypto = require('crypto');
const { normalizeLanguage } = require('./parentReportText');

const TIMEOUT_MS = 8000;

const hashOf = (text) => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16);

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('translation timeout')), ms); }),
  ]);
}

/**
 * Translate a batch of short texts. Returns an array aligned with `texts`
 * (null where a translation didn't come back).
 */
async function translateTexts(texts, language, { childFirstName = '' } = {}) {
  const { callLLM } = require('./llmGateway');
  const { createAnonymizationContext } = require('./piiAnonymizer');
  const anonContext = createAnonymizationContext({ firstName: childFirstName || '', lastName: '' });

  const payload = JSON.stringify({ texts });
  const response = await callLLM('gpt-4o-mini', [
    {
      role: 'system',
      content: `You translate short summaries of a child's math tutoring sessions into ${language} for the child's parent. ` +
        'Translate faithfully and naturally; do not add, drop or soften anything. Keep names, placeholders in [brackets], ' +
        'numbers and math notation exactly as written. Reply with JSON only: {"translations": [...]} — one string per input, same order.',
    },
    { role: 'user', content: payload },
  ], {
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    anonContext,
  });

  const raw = response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content : '';
  let out;
  try {
    out = JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (_) {
    return texts.map(() => null);
  }
  const list = Array.isArray(out && out.translations) ? out.translations : [];
  return texts.map((_, i) => (typeof list[i] === 'string' && list[i].trim()
    ? anonContext.rehydrate(list[i].trim())
    : null));
}

/**
 * Replace each session's `summary` with the parent-language version when one
 * exists or can be made in time. Mutates and returns `sessions`.
 *
 * @param {Object[]} sessions  rows from utils/parentSessionList (with conversationId)
 * @param {Object}   opts
 * @param {string}   opts.language        the parent's language
 * @param {string}   [opts.childFirstName]
 * @param {Object}   [opts.Conversation]  model (injectable for tests)
 * @param {Function} [opts.translate]     translateTexts (injectable for tests)
 */
async function localizeSessionSummaries(sessions, {
  language, childFirstName = '', Conversation = require('../models/conversation'),
  translate = translateTexts, timeoutMs = TIMEOUT_MS,
} = {}) {
  const lang = normalizeLanguage(language);
  if (lang === 'English' || !Array.isArray(sessions) || sessions.length === 0) return sessions;

  const rows = sessions.filter((s) => s && typeof s.summary === 'string' && s.summary.trim());
  const cacheable = rows.filter((s) => !s.isActive && s.conversationId);

  // 1. Cached translations whose English source hasn't changed.
  let cached = new Map();
  if (cacheable.length) {
    try {
      const docs = await Conversation.find({ _id: { $in: cacheable.map((s) => s.conversationId) } })
        .select('summaryTranslations').lean();
      cached = new Map(docs.map((d) => [String(d._id), d.summaryTranslations && d.summaryTranslations[lang]]));
    } catch (_) { /* no cache → translate */ }
  }
  const pending = [];
  for (const s of rows) {
    const hit = s.conversationId && cached.get(s.conversationId);
    if (hit && hit.h === hashOf(s.summary) && hit.text) s.summary = hit.text;
    else pending.push(s);
  }
  if (!pending.length) return sessions;

  // 2. Translate the rest in one call; English stays on any failure.
  let translated;
  try {
    translated = await withTimeout(translate(pending.map((s) => s.summary), lang, { childFirstName }), timeoutMs);
  } catch (err) {
    console.warn('[summaryTranslation] kept English:', err.message);
    return sessions;
  }

  // 3. Apply, and cache the completed sessions' translations.
  const writes = [];
  pending.forEach((s, i) => {
    const text = translated[i];
    if (!text) return;
    const source = s.summary;
    s.summary = text;
    if (!s.isActive && s.conversationId) {
      writes.push(Conversation.updateOne(
        { _id: s.conversationId },
        { $set: { [`summaryTranslations.${lang}`]: { h: hashOf(source), text } } },
      ).catch(() => {}));
    }
  });
  await Promise.all(writes);
  return sessions;
}

module.exports = { localizeSessionSummaries, translateTexts, hashOf };
