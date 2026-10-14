// utils/summaryText.js
//
// Post-checks for LLM-written session summaries, which parents read.
//
// The summary model is handed the tutoring transcript, and transcripts are
// written by the tutor in the first person — so summaries came back as "the
// student and I worked on…" and "we focused on…", a parent reading the tutor's
// diary. They also said "the student" where the child's name belongs, and an
// unset field interpolated upstream reached a parent as "a warm-up exercise on
// undefined concepts".
//
// Two entry points:
//   repairSummary   — light, always-safe rewrites. Used at DISPLAY time on
//                     stored summaries, which will never be regenerated.
//   sanitizeSummary — repair, then REJECT anything still in the tutor's voice
//                     in favour of a deterministic fallback. Used when a new
//                     summary is generated, where a fallback is available.

// "Session completed - 0 minutes of active learning" and its siblings are what
// the generators write when the summary call failed: no content, just a
// placeholder.
const PLACEHOLDER_RE = /^\s*session completed\b/i;

function isPlaceholderSummary(text) {
    if (typeof text !== 'string') return true;
    const t = text.trim();
    return t === '' || PLACEHOLDER_RE.test(t);
}

// Activity verbs that follow "we" in a tutor's recap. Only these are repaired;
// a "we" before anything else is left for sanitizeSummary to reject.
const WE_VERBS = 'worked|focused|practiced|practised|reviewed|covered|explored|discussed|went|started|began|spent|talked|looked|solved|tackled|moved|continued|did|finished|wrapped|revisited|checked|built';

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Light, conservative repairs. Never makes a summary worse; does not try to
 * catch every first-person phrasing.
 *
 * @param {string} text
 * @param {string} [name] the child's first name ('' → "Your child")
 */
function repairSummary(text, name) {
    if (typeof text !== 'string') return '';
    const who = (name && String(name).trim()) || 'your child';
    const Who = who.charAt(0).toUpperCase() + who.slice(1);
    let out = text;

    // Literal undefined/null from an upstream template ("on undefined concepts").
    out = out.replace(/\b(?:undefined|null|NaN)\b/g, '');

    // Placeholders the anonymizer should have restored.
    out = out.replace(/\[Student\]/gi, who);

    // Tutor first person, the shapes we can rewrite without guessing.
    const subject = `(the student|${escapeRegExp(who)})`;
    out = out.replace(new RegExp(`\\b${subject} and I\\b`, 'gi'), (_, s) => `${s} and the tutor`);
    out = out.replace(/\bwith me\b/gi, 'with the tutor');
    out = out.replace(/\b(?:our|my) (session|lesson|conversation|time together|work together|tutoring session)\b/gi, 'the $1');
    out = out.replace(new RegExp(`(^|[.!?]\\s+)We (${WE_VERBS})\\b`, 'g'), (_, lead, verb) => `${lead}${Who} ${verb}`);
    out = out.replace(new RegExp(`\\bwe (${WE_VERBS})\\b`, 'g'), (_, verb) => `${who} ${verb}`);
    // Any other mid-sentence "we" in a stored summary means the child and the
    // tutor together ("…, and we engaged in a warm-up") — "they" reads right.
    out = out.replace(/(?<![.!?]\s|^)\bwe\b/g, 'they').replace(/\bwe've\b/g, "they've");

    // "the student" → the child's name. Not "the students" (\b stops it) and
    // not when it is already the name.
    out = out.replace(/(^|[.!?]\s+)The student\b/g, (_, lead) => `${lead}${Who}`);
    out = out.replace(/\bThe student\b/g, Who);
    out = out.replace(/\bthe student\b/g, who);

    // Tidy the holes the deletions left.
    return out
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/\(\s*\)/g, '')
        .trim();
}

// Still in the tutor's voice after repair? "I" alone is ambiguous with Roman
// numerals ("Algebra I"), so those are exempted.
const FIRST_PERSON_RE = /\b(?:I'm|I've|I'd|I'll|me|my|mine|we|we're|we've|we'll|us|our|ours)\b/i;
const BARE_I_RE = /(?<!\b(?:Algebra|Geometry|Calculus|Math|Part|Unit|Level|Phase|Module|Chapter|Grade|Type|Stage|Book|Course)\s)\bI\b(?![IV])/;

function hasFirstPerson(text) {
    return FIRST_PERSON_RE.test(text) || BARE_I_RE.test(text);
}

/**
 * Repair, then reject what repair could not fix.
 *
 * @param {string} text the model's summary
 * @param {object} opts
 * @param {string} [opts.name] the child's first name
 * @param {string} opts.fallback deterministic summary to use on rejection
 * @returns {string}
 */
function sanitizeSummary(text, { name, fallback } = {}) {
    const repaired = repairSummary(text, name);
    if (!repaired || repaired.length < 12 || hasFirstPerson(repaired)) {
        return fallback || repaired;
    }
    return repaired;
}

/**
 * "answered 1 of 1 correctly (too few to judge accuracy)" vs "8 of 10 correct
 * (80%)". A percentage over a handful of problems is noise a parent reads as a
 * verdict — "scoring 100%" for one problem.
 */
const MIN_PROBLEMS_FOR_ACCURACY = 5;
function describeAccuracy(correct, attempted) {
    const c = Number(correct) || 0;
    const a = Number(attempted) || 0;
    if (a <= 0) return '';
    if (a < MIN_PROBLEMS_FOR_ACCURACY) {
        return `answered ${c} of ${a} correctly (too few to judge accuracy)`;
    }
    return `answered ${c} of ${a} correctly (${Math.round((c / a) * 100)}%)`;
}

module.exports = {
    isPlaceholderSummary,
    repairSummary,
    sanitizeSummary,
    hasFirstPerson,
    describeAccuracy,
    MIN_PROBLEMS_FOR_ACCURACY,
};
