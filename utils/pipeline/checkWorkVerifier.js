// utils/pipeline/checkWorkVerifier.js
//
// Independent verification for "check my work" PHOTO uploads.
//
// Why this exists: when a student uploads a photo of their own handwritten work
// and asks "is this right?", the chat pipeline produces NO deterministic grade
// (observe classifies it CHECK_MY_WORK → answer=null → the LLM verifier and the
// solver never fire). The tutor ("Maya") then freehand-grades the raw image with
// nothing cross-checking her — so a vision misread (e.g. a correct 4−5=−1, a
// legible-but-ambiguous digit, "x=2 or x=3") gets reported as "a mistake." That
// false positive tells a correct student they're wrong.
//
// This module adds the missing independent check: a single structured vision
// call that re-derives the math and returns a conservative verdict. The verdict
// is injected into Maya's prompt as ground truth (see routes/chat.js), so she
// affirms verified-correct work instead of inventing an error.
//
// The verdict is PER PROBLEM. Students photograph whole homework sheets, and a
// single sheet-level verdict (one errorStep for the whole image) is what made
// the tutor check one problem and stop. `problems[]` carries every problem on
// the sheet (including blanks, which are never solved); the top-level fields
// are the roll-up, kept for the single-problem path.
//
// Fail-safe by design: any ambiguity, low confidence, or error → 'uncertain',
// never a fabricated 'has_error'. We would rather miss a real mistake than tell
// a correct student they got it wrong.

const { callLLMStructured } = require('../llmGateway');

// Below this confidence we refuse to assert an error (downgrade to 'uncertain').
const MIN_ERROR_CONFIDENCE = 0.6;
const DEFAULT_MODEL = 'gpt-4o'; // vision-capable grader

const SYSTEM_PROMPT = `You are a meticulous, conservative math grader. A student uploaded a PHOTO of their OWN handwritten work — often a whole homework sheet with many problems — and asked you to check it. Go through EVERY problem on the sheet, in the order it appears. For each one, independently re-derive the mathematics yourself, step by step, THEN compare it to what the student wrote.

RULES (bias hard against false positives):
- Report EVERY problem you can see, including ones the student left blank. Do not stop after the first problem, and do not summarize several problems into one entry.
- label: the problem's number or letter exactly as printed on the sheet ("1", "2b", "C"). If the problems are unnumbered, number them in reading order.
- status "blank": the student wrote no answer and no work. Do NOT solve it — leave studentAnswer, errorStep and correctedValue null.
- status "correct" is the default for attempted work. Only use "has_error" if you can (a) point to a SPECIFIC step that is genuinely mathematically wrong, AND (b) state the corrected value, AND (c) are confident it is a real error — not a different-but-equivalent form, notation choice, or an unclear-handwriting guess.
- Known false-positive traps you MUST NOT flag as wrong: correct negative results (4−5 = −1 is CORRECT), equivalent forms (0.5 = 1/2 = 2/4), multiple valid roots ("x=2 or x=3"), reordered-but-equivalent expressions, and simply reading the wrong line.
- status "uncertain": the handwriting is unreadable, or you cannot verify with confidence. Never guess an error.
- studentAnswer: the student's final answer as written (null if blank).
- whatIsRight: briefly name what the student did correctly on that problem ("" if blank).
- errorStep and correctedValue: fill ONLY when status is "has_error"; otherwise null.
- confidence: your calibrated confidence in that problem's status, 0..1.
Return ONLY the JSON object.`;

// Hard ceiling on problems carried into the prompt — a dense sheet should not
// blow the tutor's context budget, and 40 covers any real worksheet page.
const MAX_PROBLEMS = 40;
const PROBLEM_STATUSES = ['correct', 'has_error', 'uncertain', 'blank'];

const RESPONSE_FORMAT = {
    type: 'json_schema',
    json_schema: {
        name: 'check_work_sheet',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                problems: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            label: { type: 'string' },
                            status: { type: 'string', enum: PROBLEM_STATUSES },
                            studentAnswer: { type: ['string', 'null'] },
                            whatIsRight: { type: 'string' },
                            errorStep: { type: ['string', 'null'] },
                            correctedValue: { type: ['string', 'null'] },
                            confidence: { type: 'number' },
                        },
                        required: ['label', 'status', 'studentAnswer', 'whatIsRight', 'errorStep', 'correctedValue', 'confidence'],
                    },
                },
            },
            required: ['problems'],
        },
    },
};

function uncertain(reason) {
    return { verdict: 'uncertain', whatIsRight: '', errorStep: null, correctedValue: null, confidence: 0, problems: [], reason };
}

function str(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function clampConfidence(v) {
    return typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Normalize one problem's verdict. The conservative contract is enforced in
 * CODE (not just the prompt): a "has_error" with no specific step/corrected
 * value, or with low confidence, is downgraded to "uncertain" so it can never
 * drive a fabricated "you made a mistake."
 */
function normalizeProblem(raw, index) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const label = str(p.label) || String(index + 1);
    let status = PROBLEM_STATUSES.includes(p.status) ? p.status : 'uncertain';
    const confidence = clampConfidence(p.confidence);
    const studentAnswer = status === 'blank' ? null : str(p.studentAnswer);
    const whatIsRight = status === 'blank' ? '' : (str(p.whatIsRight) || '');
    let errorStep = str(p.errorStep);
    let correctedValue = str(p.correctedValue);

    if (status === 'has_error' && (!errorStep || !correctedValue || confidence < MIN_ERROR_CONFIDENCE)) {
        status = 'uncertain';
    }
    if (status !== 'has_error') {
        errorStep = null;
        correctedValue = null;
    }
    return { label, status, studentAnswer, whatIsRight, errorStep, correctedValue, confidence };
}

/**
 * Roll per-problem results up into the sheet-level verdict callers already
 * branch on: any verified error → has_error; every attempted problem verified
 * correct → correct; anything else (nothing attempted, some unverifiable) →
 * uncertain. The first error is mirrored onto the top level for the
 * single-problem path.
 */
function aggregate(problems) {
    const attempted = problems.filter(p => p.status !== 'blank');
    const errors = problems.filter(p => p.status === 'has_error');
    const firstError = errors[0] || null;
    let verdict = 'uncertain';
    if (errors.length) verdict = 'has_error';
    else if (attempted.length && attempted.every(p => p.status === 'correct')) verdict = 'correct';

    const confidence = attempted.length ? Math.min(...attempted.map(p => p.confidence)) : 0;
    const whatIsRight = attempted.map(p => p.whatIsRight).filter(Boolean).join('; ');
    return {
        verdict,
        whatIsRight,
        errorStep: firstError ? firstError.errorStep : null,
        correctedValue: firstError ? firstError.correctedValue : null,
        confidence,
        problems,
    };
}

/**
 * Normalize / harden a raw model verdict. Accepts the per-problem sheet shape
 * ({ problems: [...] }) and, for back-compat, the older single-verdict shape.
 * @param {object} raw
 * @returns {{verdict:string, whatIsRight:string, errorStep:string|null, correctedValue:string|null, confidence:number, problems:Array}}
 */
function normalizeVerdict(raw) {
    if (!raw || typeof raw !== 'object') return uncertain('empty-verdict');

    if (Array.isArray(raw.problems)) {
        const problems = raw.problems.slice(0, MAX_PROBLEMS).map(normalizeProblem);
        if (!problems.length) return uncertain('no-problems');
        return aggregate(problems);
    }

    // Legacy single-verdict shape.
    const verdict = ['correct', 'has_error', 'uncertain'].includes(raw.verdict) ? raw.verdict : 'uncertain';
    const single = normalizeProblem({ ...raw, status: verdict, label: '1' }, 0);
    return {
        verdict: single.status,
        whatIsRight: single.whatIsRight,
        errorStep: single.errorStep,
        correctedValue: single.correctedValue,
        confidence: single.confidence,
        problems: [],
    };
}

/**
 * Independently verify a student's uploaded work.
 * @param {object} args
 * @param {Array} args.imageContents  OpenAI vision content blocks ({type:'image_url', image_url:{url}})
 * @param {string} [args.studentText]  the student's accompanying chat text
 * @param {string} [args.model]        override model (default gpt-4o)
 * @returns {Promise<{verdict:string, whatIsRight:string, errorStep:string|null, correctedValue:string|null, confidence:number, problems:Array, reason?:string}>}
 */
async function verifyStudentWork({ imageContents, studentText = '', model } = {}) {
    const images = (Array.isArray(imageContents) ? imageContents : [])
        .filter(c => c && c.type === 'image_url' && c.image_url && typeof c.image_url.url === 'string');
    if (!images.length) return uncertain('no-image');

    const trimmedText = String(studentText || '').slice(0, 500).trim();
    const userText = `The student wrote: "${trimmedText || '(no text — just the photo)'}"\n\nCheck EVERY problem in the handwritten work shown in the image(s).`;
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: userText }, ...images] },
    ];

    try {
        const raw = await callLLMStructured(model || DEFAULT_MODEL, messages, RESPONSE_FORMAT, {
            temperature: 0,
            // A full sheet is ~40-80 tokens per problem.
            max_tokens: 3000,
        });
        return normalizeVerdict(raw);
    } catch (err) {
        // Fail SAFE: verification unavailable must never become a fabricated error.
        return uncertain(`verify-failed: ${err && err.message ? err.message : 'unknown'}`);
    }
}

// ── Response-side helpers (used by pipeline/verify.js) ──────────────────────
//
// verify.js's upload anti-answer-key filter regenerates any reply that walks
// through 2+ numbered problems into "pick one problem." That is right for a
// student fishing for an answer key, and exactly wrong for a sheet-wide check
// of work the student already did — which is what collapsed "check my work" to
// one problem. These helpers let verify tell the two apart and enforce the
// guardrail that actually matters on a check: the corrected value for a wrong
// problem is not handed over.

/**
 * Is this a sheet the student actually worked? A mostly-blank sheet sent with
 * "check my work" is the answer-key fishing case, and keeps the strict filter.
 * @param {Array} problems  normalized problems[] from verifyStudentWork
 */
function isSheetCheckable(problems) {
    if (!Array.isArray(problems) || !problems.length) return false;
    const blank = problems.filter(p => p.status === 'blank').length;
    const attempted = problems.length - blank;
    return attempted > 0 && attempted >= blank;
}

function normalizeMath(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[−–—]/g, '-')
        .replace(/\\[()[\]]|\$/g, '')
        .replace(/\\left|\\right/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Which verified-error problems' corrected values appear in the reply?
 * A bare number ("6", "-1") is only counted when it is stated as a result
 * (after "=", "is", "be", "get", "→") so "2 of 5 are right" or "#6" can't
 * trip it; anything richer ("x = 3/4", "2x+6") is matched as written.
 * @returns {Array<{label:string, correctedValue:string}>}
 */
function findRevealedCorrections(text, problems) {
    if (!text || !Array.isArray(problems)) return [];
    const body = normalizeMath(text);
    const squashed = body.replace(/\s+/g, '');
    const revealed = [];
    for (const p of problems) {
        if (p.status !== 'has_error' || !p.correctedValue) continue;
        let value = normalizeMath(p.correctedValue);
        // "x = 6" → "6": the value is what follows the last "=".
        if (value.includes('=')) value = value.slice(value.lastIndexOf('=') + 1).trim();
        if (!value) continue;
        // The student's own (wrong) answer can't be a leak — don't let a
        // corrected value that normalizes to it trip the gate.
        if (p.studentAnswer && normalizeMath(p.studentAnswer).replace(/\s+/g, '') === value.replace(/\s+/g, '')) continue;

        let hit;
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            const re = new RegExp(`(?:=|\\bis|\\bbe|\\bget|\\bgives|→)\\s*${escapeRegExp(value)}(?!\\d|\\.\\d)`);
            hit = re.test(body);
        } else {
            hit = squashed.includes(value.replace(/\s+/g, ''));
        }
        if (hit) revealed.push({ label: p.label, correctedValue: p.correctedValue });
    }
    return revealed;
}

/**
 * Last-resort sheet check built from the verifier's results alone — used when
 * the tutor's reply leaked a correction and the in-voice rewrite failed. Covers
 * every problem, never contains a corrected value.
 */
function buildSheetCheckFallback(problems) {
    const attempted = problems.filter(p => p.status !== 'blank');
    const correct = problems.filter(p => p.status === 'correct').length;
    const lines = problems.map(p => {
        if (p.status === 'correct') return `✅ #${p.label} — correct${p.whatIsRight ? `: ${p.whatIsRight}` : ''}.`;
        if (p.status === 'has_error') return `🔍 #${p.label} — take another look at this step: ${p.errorStep}. What do you get when you redo it?`;
        if (p.status === 'blank') return `⬜ #${p.label} — not started yet.`;
        return `❓ #${p.label} — I couldn't quite read this one. Can you tell me what you got?`;
    });
    return `I checked your sheet — ${correct} of ${attempted.length} are right.\n\n${lines.join('\n')}\n\nRework the 🔍 ones and send them back — I'll check them again.`;
}

module.exports = {
    verifyStudentWork,
    normalizeVerdict,
    MIN_ERROR_CONFIDENCE,
    MAX_PROBLEMS,
    isSheetCheckable,
    findRevealedCorrections,
    buildSheetCheckFallback,
    _internal: { SYSTEM_PROMPT, RESPONSE_FORMAT },
};
