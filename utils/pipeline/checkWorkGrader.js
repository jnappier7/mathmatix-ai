// utils/pipeline/checkWorkGrader.js
//
// Read-then-grade pipeline for "check my work" photo uploads.
//
// The old grader was ONE vision call that read the handwriting, solved every
// problem and judged the student — so a misread digit or a model arithmetic
// slip became "you made a mistake" with nothing independent to catch it.
// This splits the three jobs and gives each an independent check:
//
//   1. READ    A vision call TRANSCRIBES each problem (problem, the student's
//              lines, final answer, legibility) and grades nothing. Mathpix
//              reads the same photos in parallel; a final answer it can't
//              find is an UNCONFIRMED reading.
//   2. CODE    utils/mathSolver solves the problem and the answer is compared
//              exactly (equivalent forms accepted). checkWorkSteps finds the
//              first line that doesn't follow, or a false arithmetic line.
//   3. JUDGES  Two models from different providers grade the TRANSCRIPTION
//              (text, not pixels), blind to each other.
//
// Combining is asymmetric, like the rest of grading: a solver match is enough
// to call a problem right, but calling it WRONG takes two independent
// witnesses (solver mismatch, broken step, judge A, judge B). An error on an
// unconfirmed reading becomes "couldn't verify — I read it as …" so the tutor
// asks instead of accusing. Anything short of that is 'uncertain'.
//
// Any failure in the READ stage returns null and the caller falls back to the
// single-pass grader; judge failures just remove a witness.

const { callLLMStructured } = require('../llmGateway');
const { detectMathProblem, solveProblem, verifyAnswer } = require('../mathSolver');
const { checkSteps } = require('./checkWorkSteps');

const READ_MODEL = 'gpt-4o';           // vision transcription
const JUDGE_MODELS = ['gpt-4o', 'claude-haiku-4-5'];  // cross-provider, like llmVerifier
const MAX_PROBLEMS = 40;
const MIN_JUDGE_ERROR_CONFIDENCE = 0.6;

// ── 1. READ ────────────────────────────────────────────────────────────────

const READ_PROMPT = `You transcribe a student's handwritten math homework. You do NOT grade it and you do NOT solve anything.

For EVERY problem on the sheet, in order, including ones the student left blank:
- label: the problem's number or letter exactly as printed ("1", "2b"). Unnumbered problems: number them in reading order.
- problem: the problem as printed, in plain one-line math (use * / ^ sqrt() and parentheses; write fractions as (a)/(b)). Keep instructions like "Solve" or "Simplify".
- steps: each line of the STUDENT'S work, top to bottom, exactly as they wrote it — including mistakes. Never correct anything. Plain one-line math, same notation.
- answer: the student's final answer exactly as written, or null if there is none.
- legibility: "clear" if you can read every character of the work, "unsure" if any digit, sign or symbol could be something else, "blank" if the student wrote nothing.
Return ONLY the JSON object.`;

const READ_FORMAT = {
    type: 'json_schema',
    json_schema: {
        name: 'check_work_transcription',
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
                            problem: { type: 'string' },
                            steps: { type: 'array', items: { type: 'string' } },
                            answer: { type: ['string', 'null'] },
                            legibility: { type: 'string', enum: ['clear', 'unsure', 'blank'] },
                        },
                        required: ['label', 'problem', 'steps', 'answer', 'legibility'],
                    },
                },
            },
            required: ['problems'],
        },
    },
};

async function transcribe(images, deps) {
    const messages = [
        { role: 'system', content: READ_PROMPT },
        { role: 'user', content: [{ type: 'text', text: 'Transcribe every problem on this sheet.' }, ...images] },
    ];
    const raw = await deps.callLLMStructured(READ_MODEL, messages, READ_FORMAT, { temperature: 0, max_tokens: 4000 });
    if (!raw || !Array.isArray(raw.problems) || !raw.problems.length) return null;
    return raw.problems.slice(0, MAX_PROBLEMS).map((p, i) => {
        const steps = Array.isArray(p.steps) ? p.steps.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [];
        const answer = typeof p.answer === 'string' && p.answer.trim() ? p.answer.trim() : null;
        const legibility = ['clear', 'unsure', 'blank'].includes(p.legibility) ? p.legibility : 'unsure';
        return {
            label: (typeof p.label === 'string' && p.label.trim()) || String(i + 1),
            problem: typeof p.problem === 'string' ? p.problem.trim() : '',
            steps,
            answer,
            legibility: (!answer && !steps.length) ? 'blank' : legibility,
        };
    });
}

// Mathpix on every photo, concatenated. Best-effort: null = no second reading.
async function mathpixRead(images, deps) {
    if (!deps.ocrDetailed || process.env.CHECK_WORK_MATHPIX === 'false') return null;
    try {
        const reads = await Promise.all(images.map(img => deps.ocrDetailed(img.image_url.url)));
        const text = reads.map(r => r && r.text ? r.text : '').join('\n');
        if (!text.trim()) return null;
        const confs = reads.map(r => r && r.confidence).filter(c => typeof c === 'number');
        return { text, confidence: confs.length ? Math.min(...confs) : null };
    } catch {
        return null;
    }
}

function squashMath(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
        .replace(/\\left|\\right|\\,|\\;|\\!|\$/g, '')
        .replace(/\\cdot|\\times|[×·]/g, '*')
        .replace(/[−–—]/g, '-')
        .replace(/[{}\s]/g, '')
        .replace(/\(([0-9a-z.]+)\)\/\(([0-9a-z.]+)\)/g, '$1/$2');
}

/**
 * Does Mathpix's reading of the page contain the student's final answer?
 * 'confirmed' | 'unconfirmed' | 'unknown' (no Mathpix reading / nothing to confirm).
 */
function confirmReading(problem, mathpix) {
    if (!mathpix || !problem.answer) return 'unknown';
    let answer = squashMath(problem.answer);
    if (answer.includes('=')) answer = answer.slice(answer.lastIndexOf('=') + 1);
    if (!answer) return 'unknown';
    const page = squashMath(mathpix.text);
    return page.includes(answer) ? 'confirmed' : 'unconfirmed';
}

// ── 2. CODE ────────────────────────────────────────────────────────────────

function stripAssignment(answer) {
    const m = /^\s*[a-z]\s*=\s*([^=]+)$/i.exec(answer || '');
    return m ? m[1].trim() : null;
}

// 'match' | 'mismatch' | null (solver couldn't do this problem)
function solverCheck(problem) {
    if (!problem.problem || !problem.answer) return { result: null, solverAnswer: null };
    let solved;
    try {
        const detected = detectMathProblem(problem.problem);
        solved = detected ? solveProblem(detected) : null;
    } catch {
        solved = null;
    }
    if (!solved || !solved.success || solved.answer === undefined || solved.answer === null) {
        return { result: null, solverAnswer: null };
    }
    const solverAnswer = String(solved.answer);
    const tries = [problem.answer];
    const rhs = stripAssignment(problem.answer);
    if (rhs && !solverAnswer.includes('=')) tries.push(rhs);
    for (const t of tries) {
        try {
            if (verifyAnswer(t, solverAnswer).isCorrect) return { result: 'match', solverAnswer };
        } catch { /* treat as no match */ }
    }
    return { result: 'mismatch', solverAnswer };
}

function stepCheck(problem) {
    // The printed equation is the student's line 0 when they didn't copy it.
    const lines = problem.steps.slice();
    if (problem.problem && problem.problem.includes('=') && lines[0] !== problem.problem) {
        const printed = problem.problem.replace(/^[^=]*?:\s*/, '').replace(/^(solve|simplify|evaluate)\b[^0-9a-z(-]*/i, '').trim();
        if (printed.includes('=')) lines.unshift(printed);
    }
    if (problem.answer && lines[lines.length - 1] !== problem.answer) lines.push(problem.answer);
    const res = checkSteps(lines);
    if (res.status === 'broken') {
        // Report the line the student actually wrote (not the prepended prompt).
        return { ...res, badLine: lines[res.badIndex] };
    }
    return res;
}

// ── 3. JUDGES ──────────────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are a conservative math grader. Below is a TRANSCRIPTION of a student's homework: each problem, the student's own lines of work, and their final answer. Independently solve each problem yourself, then judge the student's work.

For each problem label:
- verdict "correct" is the default for attempted work. Use "has_error" only when a SPECIFIC line is genuinely mathematically wrong and you can say what it should be.
- NOT mistakes: correct negative results (4-5=-1), equivalent forms (0.5 = 1/2), multiple valid roots ("x=2 or x=3"), reordered-but-equivalent expressions, skipped steps.
- verdict "uncertain" when you can't tell.
- errorStep: the student's line that is wrong, copied exactly (null unless has_error).
- correctedValue: what that line or the final answer should be (null unless has_error).
- whatIsRight: a few words naming what the student did well.
- confidence: 0..1.
Return ONLY the JSON object.`;

const JUDGE_FORMAT = {
    type: 'json_schema',
    json_schema: {
        name: 'check_work_judgement',
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
                            verdict: { type: 'string', enum: ['correct', 'has_error', 'uncertain'] },
                            errorStep: { type: ['string', 'null'] },
                            correctedValue: { type: ['string', 'null'] },
                            whatIsRight: { type: 'string' },
                            confidence: { type: 'number' },
                        },
                        required: ['label', 'verdict', 'errorStep', 'correctedValue', 'whatIsRight', 'confidence'],
                    },
                },
            },
            required: ['problems'],
        },
    },
};

function transcriptText(problems) {
    return problems.map(p => [
        `Problem ${p.label}: ${p.problem || '(not legible)'}`,
        ...p.steps.map((s, i) => `  line ${i + 1}: ${s}`),
        `  final answer: ${p.answer || '(none)'}`,
    ].join('\n')).join('\n\n');
}

// "#2", "2.", "2)", "Problem 2" and "2" are the same problem.
function labelKey(label) {
    return String(label || '').toLowerCase().replace(/^\s*(problem|prob\.?|question|q)\s*/, '').replace(/[#.):\s]/g, '');
}

// → Map(labelKey → normalized judgement) or null when this judge is unavailable.
async function judge(model, attempted, studentText, deps) {
    const messages = [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: `${studentText ? `The student wrote: "${studentText}"\n\n` : ''}${transcriptText(attempted)}` },
    ];
    try {
        const raw = await deps.callLLMStructured(model, messages, JUDGE_FORMAT, { temperature: 0, max_tokens: 3000 });
        if (!raw || !Array.isArray(raw.problems)) return null;
        const out = new Map();
        for (const j of raw.problems) {
            if (!j || typeof j.label !== 'string') continue;
            let verdict = ['correct', 'has_error', 'uncertain'].includes(j.verdict) ? j.verdict : 'uncertain';
            const confidence = typeof j.confidence === 'number' && isFinite(j.confidence) ? Math.min(1, Math.max(0, j.confidence)) : 0;
            const errorStep = typeof j.errorStep === 'string' && j.errorStep.trim() ? j.errorStep.trim() : null;
            if (verdict === 'has_error' && (!errorStep || confidence < MIN_JUDGE_ERROR_CONFIDENCE)) verdict = 'uncertain';
            out.set(labelKey(j.label), {
                verdict,
                errorStep: verdict === 'has_error' ? errorStep : null,
                correctedValue: verdict === 'has_error' && typeof j.correctedValue === 'string' && j.correctedValue.trim() ? j.correctedValue.trim() : null,
                whatIsRight: typeof j.whatIsRight === 'string' ? j.whatIsRight.trim() : '',
                confidence,
            });
        }
        return out;
    } catch {
        return null;
    }
}

// ── Combine ───────────────────────────────────────────────────────────────

/**
 * Decide one problem from its independent signals.
 * @param {object} p  transcribed problem
 * @param {object} s  { solver, steps, judges: [judgement|null...], reading }
 */
function decide(p, s) {
    const base = {
        label: p.label,
        studentAnswer: p.answer,
        readAs: p.problem || null,
        reading: s.reading,
        whatIsRight: '',
        errorStep: null,
        correctedValue: null,
        confidence: 0,
        evidence: [],
    };
    if (p.legibility === 'blank') return { ...base, status: 'blank', studentAnswer: null };

    const judges = s.judges.filter(Boolean);
    const whatIsRight = (judges.find(j => j.whatIsRight) || {}).whatIsRight || '';
    const stepBroken = s.steps && s.steps.status === 'broken';
    const evidence = [];
    if (s.solver.result) evidence.push(`solver:${s.solver.result}`);
    if (s.steps && s.steps.status !== 'unknown') evidence.push(`steps:${s.steps.status}`);
    judges.forEach((j, i) => evidence.push(`judge${i + 1}:${j.verdict}`));

    // A solver match settles it: the answer IS right.
    if (s.solver.result === 'match') {
        return { ...base, status: 'correct', whatIsRight, confidence: 1, evidence, source: 'solver' };
    }

    const errorWitnesses = [
        s.solver.result === 'mismatch',
        stepBroken,
        ...judges.map(j => j.verdict === 'has_error'),
    ].filter(Boolean).length;

    if (errorWitnesses >= 2) {
        const judgeErr = judges.find(j => j.verdict === 'has_error');
        const errorStep = stepBroken ? s.steps.badLine : (judgeErr && judgeErr.errorStep);
        if (errorStep) {
            // Can't trust an error on a line we may have misread: ask instead.
            if (s.reading === 'unconfirmed' || p.legibility === 'unsure') {
                return { ...base, status: 'uncertain', whatIsRight, evidence: [...evidence, 'reading:unconfirmed'], source: 'reading' };
            }
            return {
                ...base,
                status: 'has_error',
                whatIsRight,
                errorStep,
                correctedValue: s.solver.solverAnswer || (judgeErr && judgeErr.correctedValue) || null,
                confidence: Math.min(1, 0.5 + 0.2 * errorWitnesses),
                evidence,
                source: stepBroken ? 'steps' : (s.solver.result === 'mismatch' ? 'solver+judge' : 'judges'),
            };
        }
    }

    // Correct without a solver: every available judge says so and nothing
    // deterministic disagrees.
    if (judges.length && judges.every(j => j.verdict === 'correct') && !stepBroken && s.solver.result !== 'mismatch') {
        const confidence = Math.min(...judges.map(j => j.confidence));
        return { ...base, status: 'correct', whatIsRight, confidence, evidence, source: 'judges' };
    }

    return { ...base, status: 'uncertain', whatIsRight, evidence, source: 'split' };
}

/**
 * Run the read-then-grade pipeline.
 * @param {object} args
 * @param {Array}  args.images       OpenAI vision content blocks
 * @param {string} [args.studentText]
 * @param {object} [deps]            injectable for tests
 * @returns {Promise<Array|null>}    normalized problems[], or null → caller falls back
 */
async function gradeSheet({ images, studentText = '' } = {}, deps = {}) {
    const d = {
        callLLMStructured: deps.callLLMStructured || callLLMStructured,
        ocrDetailed: deps.ocrDetailed !== undefined ? deps.ocrDetailed : safeOcrDetailed(),
    };
    const [transcription, mathpix] = await Promise.all([
        transcribe(images, d).catch(() => null),
        mathpixRead(images, d),
    ]);
    if (!transcription) return null;

    const attempted = transcription.filter(p => p.legibility !== 'blank');
    const trimmedText = String(studentText || '').slice(0, 500).trim();
    const judgements = attempted.length
        ? await Promise.all(JUDGE_MODELS.map(m => judge(m, attempted, trimmedText, d)))
        : [];

    return transcription.map(p => decide(p, {
        solver: p.legibility === 'blank' ? { result: null, solverAnswer: null } : solverCheck(p),
        steps: p.legibility === 'blank' ? null : stepCheck(p),
        judges: judgements.map(m => (m ? m.get(labelKey(p.label)) || null : null)),
        reading: confirmReading(p, mathpix),
    }));
}

function safeOcrDetailed() {
    try { return require('../ocr').ocrDetailed; } catch { return null; }
}

module.exports = {
    gradeSheet,
    _internal: { labelKey, transcribe, confirmReading, solverCheck, stepCheck, decide, squashMath, JUDGE_MODELS, READ_PROMPT, JUDGE_PROMPT },
};
