/**
 * MULTIPLE-CHOICE OPTIONS — one canonical shape, one place.
 *
 * The item bank stores MC options in at least four different shapes, because
 * they were written by different generators at different times:
 *
 *   { label: 'A', text: '100' }                     seeds/*.generated.json
 *   { letter: 'A', text: '100', isCorrect: true }   scripts/generateProblems.js
 *   { id: 'A', text: '100', isCorrect: true }       scripts/convertToMC.js
 *   '100'                                           templatesGrade67.js
 *
 * `models/problem.js` only declares `{ label, text }`, so everything else is
 * either stripped or — for the `$set`-based backfills, which Mongoose does not
 * strip — stored verbatim with no `label` at all. A client keying off `label`
 * then rendered "undefined. 100" on every choice and submitted the string
 * "undefined" as the answer, which graded 0 of 5 on a run where the student had
 * picked every correct option. That was the owner-hit bug on the skill-map
 * "Prove it" quiz.
 *
 * Two rules follow, and both live here so no surface can drift from them:
 *
 *   1. A label is POSITIONAL. It is whatever slot the option occupies in the
 *      array the student sees — never trusted from the stored doc, which may
 *      carry a stale letter from before a shuffle. Grading resolves the same
 *      way, so serve and grade agree by construction.
 *   2. Serving projects to `{ label, text }` and NOTHING else. The legacy
 *      shapes carry `isCorrect` on every option; passing the stored array
 *      through hands the answer key to the browser.
 */

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Read the text out of an option in any of the stored shapes.
 * @param {*} opt
 * @returns {string}
 */
function optionText(opt) {
  if (opt === null || opt === undefined) return '';
  if (typeof opt === 'object') {
    const t = opt.text ?? opt.value ?? opt.label ?? '';
    return String(t);
  }
  return String(opt);
}

/**
 * The letter an option carries in the DB, under whichever key its generator
 * used — or null when it carries none. Distinct from its POSITION, and the two
 * genuinely disagree: `scripts/generate-all-pattern-problems.js` shuffles the
 * options with their labels still attached, so a doc can hold
 * `[{label:'C',…},{label:'A',…}]` with `correctOption:'C'` pointing at slot 0.
 * @param {*} opt
 * @returns {string|null}
 */
function storedLabel(opt) {
  if (!opt || typeof opt !== 'object') return null;
  const raw = opt.label ?? opt.letter ?? opt.id;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toUpperCase();
  return LABELS.includes(s) ? s : null;
}

/**
 * Project stored options onto the client-safe `{ label, text }` shape.
 *
 * Labels are assigned positionally, so a doc whose stored letters were left
 * stale by a shuffle still lines up with what the student reads.
 *
 * Nothing is dropped, not even a blank option: `correctOption` is a letter
 * against the STORED positions, so compacting the array would re-index it and
 * point the key at the wrong choice. A blank option is a bad item, and it stays
 * visible as one rather than becoming a silently mis-keyed card.
 *
 * @param {Array} options raw `problem.options` in any stored shape
 * @returns {Array<{label: string, text: string}>}
 */
function normalizeOptions(options) {
  if (!Array.isArray(options) || !options.length) return [];
  return options
    .slice(0, LABELS.length)
    .map((opt, i) => ({ label: LABELS[i], text: optionText(opt) }));
}

/**
 * Resolve what the student actually picked.
 *
 * Accepts either the label ('C') or the option text ('100'), because the two
 * live surfaces disagree: the skill-map runner submits the label, while older
 * clients and the voice path submit the text. Returns null when the submission
 * matches nothing — the caller decides whether that is wrong or ungradable, and
 * a null must never be treated as a match.
 *
 * @param {Array} options raw or normalized options
 * @param {*} submitted what the client sent
 * @returns {{label: string, text: string}|null}
 */
function resolveChoice(options, submitted) {
  const norm = normalizeOptions(options);
  if (!norm.length) return null;
  const sub = String(submitted ?? '').trim();
  if (!sub) return null;

  const byLabel = norm.find((o) => o.label.toLowerCase() === sub.toLowerCase());
  if (byLabel) return byLabel;

  const byText = norm.find((o) => o.text.trim().toLowerCase() === sub.toLowerCase());
  return byText || null;
}

/**
 * The POSITIONAL label of the correct option — i.e. the label the student
 * actually sees on it after `normalizeOptions`.
 *
 * `correctOption` names the option's STORED letter, which is not always its
 * slot: the pattern-problem generator shuffles options with their labels
 * attached and then reads the correct letter off the shuffled array, so
 * `correctOption:'C'` can mean slot 0. Resolve through the stored letter first
 * and only read `correctOption` as a position when the options carry no letters
 * at all — reversing that order marks correct picks wrong on the shuffled bank.
 *
 * Returns null when the item has no `correctOption` (the whole convertToMC
 * population) so the caller falls back to `answer` rather than guessing.
 *
 * @param {Object} problem
 * @returns {string|null}
 */
function correctLabelOf(problem) {
  const raw = problem && problem.correctOption;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const want = String(raw).trim().toUpperCase();
  if (!LABELS.includes(want)) return null;

  const stored = (Array.isArray(problem.options) ? problem.options : []).slice(0, LABELS.length);
  const idx = stored.findIndex((opt) => storedLabel(opt) === want);
  if (idx !== -1) return LABELS[idx];

  // No option carries that letter. If none carries a letter at all, the stored
  // order IS the lettering, so read `correctOption` positionally.
  if (stored.some((opt) => storedLabel(opt) !== null)) return null;
  const pos = LABELS.indexOf(want);
  return pos !== -1 && pos < stored.length ? LABELS[pos] : null;
}

// The real ACT alternates answer letters by question number: odd questions are
// lettered A–D(–E), even questions F–G–H–J(–K) — no "I". Storage, the wire
// protocol, and grading all stay on positional A–D; this alias is applied ONLY
// at the surfaces that echo letters to the student (test runner, review card,
// review prompt), so the letters they see match a real ACT form.
const ACT_EVEN_LABELS = { A: 'F', B: 'G', C: 'H', D: 'J', E: 'K' };
function actDisplayLabel(position, label) {
  const pos = Number(position);
  // Positions are 1-based; null/undefined coerce to 0 (which is "even"), so a
  // legacy position-less queue item must fall through to the stored letters.
  if (!Number.isFinite(pos) || pos < 1 || pos % 2 !== 0) return label;
  return ACT_EVEN_LABELS[String(label || '').toUpperCase()] || label;
}

module.exports = { LABELS, optionText, storedLabel, normalizeOptions, resolveChoice, correctLabelOf, actDisplayLabel };
