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
// Fail-safe by design: any ambiguity, low confidence, or error → 'uncertain',
// never a fabricated 'has_error'. We would rather miss a real mistake than tell
// a correct student they got it wrong.

const { callLLMStructured } = require('../llmGateway');

// Below this confidence we refuse to assert an error (downgrade to 'uncertain').
const MIN_ERROR_CONFIDENCE = 0.6;
const DEFAULT_MODEL = 'gpt-4o'; // vision-capable grader

const SYSTEM_PROMPT = `You are a meticulous, conservative math grader. A student uploaded a PHOTO of their OWN handwritten work and asked you to check it. Independently re-derive the mathematics yourself, step by step, THEN compare it to what the student wrote.

RULES (bias hard against false positives):
- Default to "correct". Only return "has_error" if you can (a) point to a SPECIFIC step that is genuinely mathematically wrong, AND (b) state the corrected value, AND (c) are confident it is a real error — not a different-but-equivalent form, notation choice, or an unclear-handwriting guess.
- Known false-positive traps you MUST NOT flag as wrong: correct negative results (4−5 = −1 is CORRECT), equivalent forms (0.5 = 1/2 = 2/4), multiple valid roots ("x=2 or x=3"), reordered-but-equivalent expressions, and simply reading the wrong line.
- If the handwriting is unreadable, or you cannot verify with confidence, return "uncertain". Never guess an error.
- whatIsRight: always briefly name what the student did correctly.
- errorStep and correctedValue: fill ONLY when verdict is "has_error"; otherwise null.
- confidence: your calibrated confidence in the verdict, 0..1.
Return ONLY the JSON object.`;

const RESPONSE_FORMAT = {
    type: 'json_schema',
    json_schema: {
        name: 'check_work_verdict',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                verdict: { type: 'string', enum: ['correct', 'has_error', 'uncertain'] },
                whatIsRight: { type: 'string' },
                errorStep: { type: ['string', 'null'] },
                correctedValue: { type: ['string', 'null'] },
                confidence: { type: 'number' },
            },
            required: ['verdict', 'whatIsRight', 'errorStep', 'correctedValue', 'confidence'],
        },
    },
};

function uncertain(reason) {
    return { verdict: 'uncertain', whatIsRight: '', errorStep: null, correctedValue: null, confidence: 0, reason };
}

/**
 * Normalize / harden a raw model verdict. Enforces the conservative contract in
 * CODE (not just the prompt): a "has_error" with no specific step/corrected
 * value, or with low confidence, is downgraded to "uncertain" so it can never
 * drive a fabricated "you made a mistake."
 * @param {object} raw
 * @returns {{verdict:string, whatIsRight:string, errorStep:string|null, correctedValue:string|null, confidence:number}}
 */
function normalizeVerdict(raw) {
    if (!raw || typeof raw !== 'object') return uncertain('empty-verdict');
    const verdict = ['correct', 'has_error', 'uncertain'].includes(raw.verdict) ? raw.verdict : 'uncertain';
    const whatIsRight = typeof raw.whatIsRight === 'string' ? raw.whatIsRight.trim() : '';
    const errorStep = typeof raw.errorStep === 'string' && raw.errorStep.trim() ? raw.errorStep.trim() : null;
    const correctedValue = typeof raw.correctedValue === 'string' && raw.correctedValue.trim() ? raw.correctedValue.trim() : null;
    let confidence = typeof raw.confidence === 'number' && isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0;

    if (verdict === 'has_error') {
        // An error claim without specifics or confidence is not actionable and
        // is exactly the failure mode we're guarding against — downgrade it.
        if (!errorStep || !correctedValue || confidence < MIN_ERROR_CONFIDENCE) {
            return { verdict: 'uncertain', whatIsRight, errorStep: null, correctedValue: null, confidence };
        }
        return { verdict, whatIsRight, errorStep, correctedValue, confidence };
    }
    return { verdict, whatIsRight, errorStep: null, correctedValue: null, confidence };
}

/**
 * Independently verify a student's uploaded work.
 * @param {object} args
 * @param {Array} args.imageContents  OpenAI vision content blocks ({type:'image_url', image_url:{url}})
 * @param {string} [args.studentText]  the student's accompanying chat text
 * @param {string} [args.model]        override model (default gpt-4o)
 * @returns {Promise<{verdict:string, whatIsRight:string, errorStep:string|null, correctedValue:string|null, confidence:number, reason?:string}>}
 */
async function verifyStudentWork({ imageContents, studentText = '', model } = {}) {
    const images = (Array.isArray(imageContents) ? imageContents : [])
        .filter(c => c && c.type === 'image_url' && c.image_url && typeof c.image_url.url === 'string');
    if (!images.length) return uncertain('no-image');

    const trimmedText = String(studentText || '').slice(0, 500).trim();
    const userText = `The student wrote: "${trimmedText || '(no text — just the photo)'}"\n\nCheck the handwritten work shown in the image(s).`;
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: userText }, ...images] },
    ];

    try {
        const raw = await callLLMStructured(model || DEFAULT_MODEL, messages, RESPONSE_FORMAT, {
            temperature: 0,
            max_tokens: 600,
        });
        return normalizeVerdict(raw);
    } catch (err) {
        // Fail SAFE: verification unavailable must never become a fabricated error.
        return uncertain(`verify-failed: ${err && err.message ? err.message : 'unknown'}`);
    }
}

module.exports = {
    verifyStudentWork,
    normalizeVerdict,
    MIN_ERROR_CONFIDENCE,
    _internal: { SYSTEM_PROMPT, RESPONSE_FORMAT },
};
