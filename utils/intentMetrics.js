// utils/intentMetrics.js
//
// Observability for the onboarding-intent classifier (utils/onboardingIntent.js).
//
// The classifier is a regex chain over one free-text answer. It shipped with no
// way to tell whether it was right, which is how it carried an ordering bug —
// speaker identity outranking subject matter, so "my mom said I should try this
// for my ACT" classified as parent_support — for as long as it did. Nobody could
// see it because nothing counted.
//
// There is no labelled ground truth here and there never will be: nobody is
// going to hand-annotate what a kid meant at signup. So this measures the two
// things that ARE observable, and is careful not to claim they are accuracy.
//
//   1. COVERAGE — the share of answers that land in `unknown`, and how the rest
//      distribute. A rising unknown rate means real phrasings are falling
//      through the regexes. A category that never fires is a dead branch; one
//      that swallows everything is over-matching. Both are visible here and
//      nowhere else.
//
//   2. AGREEMENT — what the student SAID at signup versus what they later DID.
//      When utils/onboardingIntent.js derives an intent from behaviour (a
//      worksheet upload, an ACT mention), that observation is compared against
//      the stated category. A student who said "just exploring" and then uploads
//      a worksheet every session is evidence the stated category was wrong or
//      has gone stale. This is a proxy, not a verdict — disagreement is also
//      what legitimate change of purpose looks like — so it is reported as
//      `agreementRate` and the mismatched PAIRS are ranked, because the pair is
//      the diagnostic. `just_exploring -> student_homework` at the top of that
//      list is a specific, fixable claim about the regexes.
//
// Ring buffer, in-memory, resets on restart — mirrors utils/verifyMetrics.js.
// Surfaced read-only on GET /api/admin/structured-tutor-metrics.
//
// No student text is ever stored. Both rings hold schema-enum category labels,
// a capture channel and a length; the answer itself is not retained anywhere
// (see routes/onboarding.js, which stopped persisting intentText).

const logger = require('./logger').child({ module: 'intentMetrics' });
const { ALLOWED_CATEGORIES } = require('./onboardingIntent');

const RING_SIZE = 500;

/* ── Classification ring ─────────────────────────────────────────────────── */

const classRing = new Array(RING_SIZE);
let classCursor = 0;
let classTotal = 0;

/**
 * Record one classification of a signup answer.
 *
 * @param {Object} args
 * @param {string} args.category - the resulting enum category
 * @param {string} [args.capturedVia] - 'voice' | 'text' | 'choice'
 * @param {number} [args.textLength] - length of the answer, NOT the answer
 * @returns {Object} the stored record
 */
function recordClassification({ category, capturedVia = null, textLength = 0 } = {}) {
  const rec = {
    t: Date.now(),
    category: category || 'unknown',
    capturedVia,
    // Bucketed, because the exact length of one kid's answer is closer to
    // content than a count needs to be. Three buckets is enough to tell a
    // one-word answer from a paragraph, which is the only thing it's for.
    length: textLength >= 120 ? 'long' : textLength >= 20 ? 'medium' : 'short',
  };
  classRing[classCursor] = rec;
  classCursor = (classCursor + 1) % RING_SIZE;
  classTotal += 1;
  logger.info('onboarding_intent_classified', rec);
  return rec;
}

/* ── Agreement ring ──────────────────────────────────────────────────────── */

const agreeRing = new Array(RING_SIZE);
let agreeCursor = 0;
let agreeTotal = 0;

// buildIntentContext runs on EVERY tutoring turn, so an unguarded record would
// count one long session hundreds of times and make the agreement rate a
// measure of session length. One record per student per (stated, observed)
// pair is the honest unit: it says "this student, once, did X having said Y".
const seen = new Set();
const SEEN_MAX = 5000;   // bounded; a restart clears it anyway

/**
 * Record that observed behaviour did or did not match the stated intent.
 * Silently ignores repeats of the same (student, stated, observed) triple.
 *
 * @param {Object} args
 * @param {string} args.stated - category from signup
 * @param {string} args.observed - category derived from behaviour
 * @param {string} [args.userKey] - opaque per-student dedupe key (an id)
 * @param {number} [args.sessionCount]
 * @returns {Object|null} the stored record, or null if deduped/incomplete
 */
function recordObservation({ stated, observed, userKey = null, sessionCount = 0 } = {}) {
  if (!stated || !observed) return null;

  const key = `${userKey || 'anon'}:${stated}:${observed}`;
  if (seen.has(key)) return null;
  if (seen.size >= SEEN_MAX) seen.clear();
  seen.add(key);

  const rec = {
    t: Date.now(),
    stated,
    observed,
    agreed: stated === observed,
    sessionCount: Number(sessionCount) || 0,
  };
  agreeRing[agreeCursor] = rec;
  agreeCursor = (agreeCursor + 1) % RING_SIZE;
  agreeTotal += 1;
  logger.info('onboarding_intent_observed', rec);
  return rec;
}

/* ── Read side ───────────────────────────────────────────────────────────── */

function readRing(ring, cursor, total, limit) {
  const out = [];
  const count = Math.min(total, RING_SIZE);
  for (let i = 1; i <= count && out.length < limit; i++) {
    const idx = (cursor - i + RING_SIZE) % RING_SIZE;
    if (ring[idx]) out.push(ring[idx]);
  }
  return out;
}

/** Most-recent classifications, newest first. */
function snapshot(limit = 50) {
  return readRing(classRing, classCursor, classTotal, limit);
}

/** Most-recent stated-vs-observed comparisons, newest first. */
function snapshotObservations(limit = 50) {
  return readRing(agreeRing, agreeCursor, agreeTotal, limit);
}

/**
 * Aggregate both rings.
 *
 * `unknownRate` is the headline: the share of signup answers the classifier
 * could not place at all. Every one of those is a student the tutor learns
 * nothing about from a question we made them answer.
 */
function aggregate() {
  const classifications = snapshot(RING_SIZE);
  const byCategory = {};
  const byCapture = {};
  for (const r of classifications) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.capturedVia) byCapture[r.capturedVia] = (byCapture[r.capturedVia] || 0) + 1;
  }

  const observations = snapshotObservations(RING_SIZE);
  const pairs = new Map();
  let agreed = 0;
  for (const r of observations) {
    if (r.agreed) { agreed += 1; continue; }
    const key = `${r.stated} -> ${r.observed}`;
    const b = pairs.get(key) || { stated: r.stated, observed: r.observed, count: 0 };
    b.count += 1;
    pairs.set(key, b);
  }

  const n = classifications.length;
  const m = observations.length;
  const rate = (x, d) => (d > 0 ? Number((x / d).toFixed(4)) : 0);

  return {
    classification: {
      sampleSize: n,
      totalEver: classTotal,
      byCategory,
      byCapture,
      unknownRate: rate(byCategory.unknown || 0, n),
      // A category the classifier has never once produced. Either the phrasings
      // that should hit it don't, or it's dead weight — either way it's a
      // decision someone should make rather than a silence.
      neverProduced: ALLOWED_CATEGORIES.filter((c) => !byCategory[c]),
    },
    agreement: {
      sampleSize: m,
      totalEver: agreeTotal,
      // Read this as "how often the signup answer still described the student
      // by the time we watched them work", not as classifier accuracy.
      agreementRate: rate(agreed, m),
      // Ranked by absolute count: the top row is the single change to the
      // classifier that would buy the most correct prompts.
      topMismatches: [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    },
  };
}

/** Test/maintenance hook — clears both rings and the dedupe set. */
function reset() {
  classRing.fill(undefined);
  classCursor = 0;
  classTotal = 0;
  agreeRing.fill(undefined);
  agreeCursor = 0;
  agreeTotal = 0;
  seen.clear();
}

module.exports = {
  recordClassification,
  recordObservation,
  snapshot,
  snapshotObservations,
  aggregate,
  reset,
};
