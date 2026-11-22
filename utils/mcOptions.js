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

/** Text compared the way a student reads it: spacing, case and minus signs aside. */
function sameText(a, b) {
  const n = (v) => String(v ?? '').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  return n(a) !== '' && n(a) === n(b);
}

/**
 * WHICH OPTION IS RIGHT — decided once, from the whole item, for every grader.
 *
 * An item can say what its answer is in three places: `answer.value` (the value
 * or, on some banks, the letter), `answer.equivalents`, and `correctOption`.
 * Each grader used to read them its own way, and on the live bank (2026-11-22,
 * 18,226 multiple-choice items) that went wrong in three ways:
 *
 *  1. `correctOption` CONTRADICTS the item's own answer on 72 items — the
 *     options were shuffled after the letter was written. "Multiply 5/3 × 4/5",
 *     answer "4/3", options A) 5 B) 6 C) 3 D) 4/3, correctOption "C". One
 *     grader trusted the letter and marked 4/3 wrong; the other accepted both.
 *     In every case read by hand the VALUE was right, and it is what the
 *     generator computed, so the value wins.
 *  2. A letter key with its text as an equivalent ("D", "2/5 < 3/5") was
 *     compared by value, where "2/5 > 3/5" and "2/5 = 3/5" also "matched":
 *     three of four options graded correct.
 *  3. A distractor EQUAL IN VALUE to the key graded correct: "What is 81 in
 *     expanded form?" accepted "81" as well as "80 + 1".
 *
 * The key is, in order: the one option whose text IS `answer.value`; else the
 * option `answer.value` names by letter; else `correctOption`; else the one
 * option equal in value to the answer (`matches`, the caller's comparator — a
 * key of "97/3" against an option "32.333333333333"). `also` lists other
 * options the item's author declared equivalent by writing their text in
 * `equivalents` ("1" beside a key of "2/2"): picking one of those is right too.
 * Nothing else is — equal in value is not enough.
 *
 * @returns {{label: string, also: string[], conflict: boolean}|null} null when
 *   the item does not say which option is right; the caller falls back.
 */
function resolveKey({ options, value, equivalents, correctOption }, matches) {
  const opts = normalizeOptions(options);
  if (!opts.length) return null;
  const val = value === undefined || value === null ? '' : String(value).trim();

  let byValue = null;
  if (val) {
    const exact = opts.filter((o) => sameText(o.text, val));
    if (exact.length === 1) byValue = exact[0].label;
    else if (!exact.length && /^[A-Ha-h]$/.test(val)) {
      byValue = correctLabelOf({ options, correctOption: val });
    }
  }
  const byLetter = correctLabelOf({ options, correctOption });

  let label = byValue || byLetter;
  if (!label && val && typeof matches === 'function') {
    const equal = opts.filter((o) => { try { return matches(o.text, val); } catch { return false; } });
    if (equal.length === 1) label = equal[0].label;
  }
  if (!label) return null;

  const declared = (Array.isArray(equivalents) ? equivalents : []).filter((e) => !/^[A-Ha-h]$/.test(String(e).trim()));
  const also = opts
    .filter((o) => o.label !== label && declared.some((e) => sameText(o.text, e)))
    .map((o) => o.label);

  return { label, also, conflict: !!(byValue && byLetter && byValue !== byLetter) };
}

/** The label of the option that is right, read from a Problem (or a lean doc of one). */
function keyLabelOf(problem) {
  const answer = (problem && problem.answer) || {};
  const key = resolveKey({
    options: problem && problem.options, value: answer.value, equivalents: answer.equivalents,
    correctOption: problem && problem.correctOption,
  });
  return key ? key.label : null;
}

/**
 * Carry a picked letter from one copy of an item's choices to another, by the
 * choice's TEXT. A test freezes its items' choices when it is assembled; the
 * bank can later reorder them (scripts/sortActNumericChoices.js put 120 items'
 * numeric choices in ascending order). Grading a frozen pick against the
 * reordered bank by letter would mark the wrong choice, so the letter is
 * translated first. Returns null when the text is not found in `to`.
 */
function relabelByText(label, from, to) {
  const a = normalizeOptions(from);
  const b = normalizeOptions(to);
  const i = LABELS.indexOf(String(label == null ? '' : label).trim().toUpperCase());
  if (i < 0 || i >= a.length) return null;
  const want = String(a[i].text).trim();
  const j = b.findIndex((o) => String(o.text).trim() === want);
  return j >= 0 ? LABELS[j] : null;
}

/**
 * What to hand problem.checkAnswer() for a pick made on a test's FROZEN
 * choices. The bank letter when the picked text is still in the bank (the bank
 * may only have reordered it). Otherwise the choice was edited after the test
 * was built, and its old letter would now name whatever moved into that slot —
 * a replaced distractor's letter can be the new key's — so grade the picked
 * TEXT instead: right only if it is the key's value or a stored equivalent.
 * With no frozen choices (legacy sessions) the pick already is a bank letter.
 */
function frozenPickForGrading(pick, frozenOptions, bankOptions) {
  const label = relabelByText(pick, frozenOptions, bankOptions);
  if (label) return label;
  const frozen = normalizeOptions(frozenOptions);
  const i = LABELS.indexOf(String(pick == null ? '' : pick).trim().toUpperCase());
  if (frozen.length && i >= 0 && i < frozen.length) return String(frozen[i].text).trim();
  return pick;
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

module.exports = { LABELS, optionText, storedLabel, normalizeOptions, resolveChoice, correctLabelOf, resolveKey, keyLabelOf, sameText, relabelByText, frozenPickForGrading, actDisplayLabel };
