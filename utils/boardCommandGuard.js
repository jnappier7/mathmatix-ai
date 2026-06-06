// ============================================================
// boardCommandGuard.js — pedagogy backstop for the <BOARD> tag
// protocol.
//
// The Mathmatix #1 product rule: the tutor must NEVER show the
// answer or worked solution to the student's own problem. The
// WorkBoard mirrors the starting problem and the moves the student
// has *stated*; it never previews a step the student hasn't said.
//
// utils/boardTagParser.js extracts tags permissively. This module
// enforces the rule by dropping any command that doesn't trace back
// to the student's recent message(s).
//
// Pure function, no Mongo / HTTP — easy to unit test.
// ============================================================

'use strict';

// Verbs that map to allowed `apply` operations. Match fuzzy: we only
// need ONE of these words to appear in the student's recent message
// somewhere near the tag's `op` string.
const OPERATION_KEYWORDS = [
    'subtract', 'subtracting',
    'add', 'adding',
    'divide', 'dividing', 'division',
    'multiply', 'multiplying', 'times',
    'combine', 'combining',
    'factor', 'factoring',
    'distribute', 'distributing',
    'expand', 'expanding',
    'simplify', 'simplifying',
    'isolate', 'isolating',
    'square', 'squaring', 'squared',
    'root', 'sqrt',
    'cancel', 'cancelling', 'canceling',
    'flip', 'reciprocal',
    'substitute', 'substituting', 'plug',
    'move', 'moving',
    // Mr. Napier methodology
    'box', 'opposite', 'opposites', 'zero pair', 'zero pairs',
];

// Words/phrases that signal the student wants a new problem. Used to
// gate the `clear` action.
const START_OVER_PATTERNS = [
    /\bnew\s+problem\b/i,
    /\bstart\s+over\b/i,
    /\bdifferent\s+one\b/i,
    /\bdifferent\s+problem\b/i,
    /\bnext\s+(?:one|problem)\b/i,
    /\blet'?s\s+try\s+another\b/i,
    /\btry\s+another\b/i,
    /\banother\s+(?:problem|one)\b/i,
    /\bclear\s+(?:the\s+)?board\b/i,
    /\bwipe\s+(?:the\s+)?board\b/i,
    /\breset\b/i,
    /\bskip\s+(?:this|it)\b/i,
    /\bmove\s+on\b/i,
];

/**
 * Normalize a math/tex string so we can do permissive substring
 * matching against the student's prose. Strips whitespace, common
 * LaTeX operators that have plain-text equivalents, dollar/paren
 * wrappers, and case.
 */
function normalizeForMatch(s) {
    if (!s || typeof s !== 'string') return '';
    return s
        .toLowerCase()
        // Multiplication: drop the operator entirely so "2 \cdot x" and
        // "2x" normalize to the same string.
        .replace(/\\cdot/g, '')
        .replace(/\\times/g, '')
        .replace(/[×·*]/g, '')
        .replace(/\\div/g, '/')
        .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '($1)/($2)')
        .replace(/[\\${}()\[\]]/g, '')        // strip latex/markup glyphs
        .replace(/[÷]/g, '/')
        .replace(/\s+/g, '')                    // strip all whitespace
        .trim();
}

/**
 * True if the student's text contains the tex string in any
 * order-preserving permissive form. We try the full normalized tex
 * first, then split on '=' so "2x = 16" can match prose containing
 * "2x" and "16" even when written as "I got 2x equals sixteen."
 */
function texMatchesStudentText(tex, studentText) {
    if (!tex) return false;
    const norm = normalizeForMatch(tex);
    const sNorm = normalizeForMatch(studentText);
    if (!norm || !sNorm) return false;
    if (sNorm.includes(norm)) return true;

    // Fall back to per-side match on equations.
    if (norm.includes('=')) {
        const parts = norm.split('=').map(p => p.trim()).filter(Boolean);
        return parts.every(p => p.length >= 1 && sNorm.includes(p));
    }
    return false;
}

/**
 * True if the student's text references the operation verb in `op`.
 * Permissive: any operation keyword in `op` that also appears in the
 * student's recent text counts as a match.
 */
function opMatchesStudentText(op, studentText) {
    if (!op || !studentText) return false;
    const opLower = op.toLowerCase();
    const sLower = studentText.toLowerCase();

    // Direct substring match handles "subtract 4 from both sides" being
    // restated near-verbatim by the student.
    if (sLower.includes(opLower)) return true;

    // Keyword match — the student doesn't have to recite the full op
    // string, just confirm the verb. "I'd subtract 4" is enough to
    // permit "subtract 4 from both sides".
    for (const kw of OPERATION_KEYWORDS) {
        if (opLower.includes(kw) && sLower.includes(kw)) return true;
    }
    return false;
}

function hasStartOverIntent(text) {
    if (!text) return false;
    return START_OVER_PATTERNS.some(p => p.test(text));
}

/**
 * True if a scaffold's tex contains at least one *empty* slot for the
 * student to fill. This is the anti-cheat property for scaffold cards:
 * scaffolding shows structure with holes; a "scaffold" with every term
 * filled in is just an answer dump on the student's own problem and must
 * be rejected. Recognized blanks:
 *   - an empty (or whitespace/spacing-only) \boxed{...}  e.g. \boxed{}, \boxed{\;\;}
 *   - \square                                            the open-box glyph
 *   - a run of 3+ underscores                            e.g. _____ or \_\_\_
 */
function texHasBlank(tex) {
    if (!tex || typeof tex !== 'string') return false;
    // \boxed{...} whose contents are only LaTeX spacing macros / whitespace.
    const EMPTY_BOXED = /\\boxed\s*\{\s*(?:\\(?:[;,:!\s]|quad|qquad|phantom\s*\{[^}]*\}|hspace\s*\{[^}]*\}|,|;)\s*)*\}/;
    if (EMPTY_BOXED.test(tex)) return true;
    if (/\\square\b/.test(tex)) return true;
    if (/_{3,}/.test(tex)) return true;          // raw underscores
    if (/(?:\\_){3,}/.test(tex)) return true;    // escaped underscores
    return false;
}

/**
 * Enforce the #1-rule guard on a parsed list of board commands.
 *
 * @param {Object}   input
 * @param {Array}    input.commands - from parseBoardTags()
 * @param {string}   input.userMessage - the student's most recent message
 * @param {Array<{role:string, content:string}>} [input.recentUserMessages]
 *        - last few student turns. The immediate predecessor is used
 *          to cover "I'm subtracting 4" + "yes" confirmations.
 * @param {string|null} [input.lastBoardActionInConversation]
 *        - the last action our pipeline emitted in this conversation
 *          ("pose"|"apply"|"resolve"|"verify"|"clear"|null). Required
 *          to allow `clear` after a `verify` even without a start-over
 *          signal.
 *
 * @returns {{ allowed: Array, dropped: Array<{command, reason}> }}
 */
function enforcePedagogyRule({
    commands,
    userMessage,
    recentUserMessages = [],
    lastBoardActionInConversation = null,
    workedExample = false,
} = {}) {
    const allowed = [];
    const dropped = [];

    if (!Array.isArray(commands) || commands.length === 0) {
        return { allowed, dropped };
    }

    // Build the "look here for student intent" haystack. The current
    // message dominates; the immediate predecessor is appended so
    // "yes" / "ok do it" confirmations after a stated move still count.
    const currentText = userMessage || '';
    const priorText = (recentUserMessages || [])
        .filter(m => m && (m.role === 'user' || m.role === 'student'))
        .map(m => m.content || '')
        .slice(-1)
        .join(' ');
    const combinedText = `${currentText}\n${priorText}`.trim();

    // Track the running last-action across commands within this batch
    // so a `pose` followed by an immediate `apply` in the same response
    // is judged against the student's message, not the in-batch pose.
    let runningLastAction = lastBoardActionInConversation;

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const nextAction = commands[i + 1] ? commands[i + 1].action : null;
        const decision = evaluate(command, {
            currentText,
            combinedText,
            runningLastAction,
            nextAction,
            workedExample,
        });

        if (decision.allowed) {
            allowed.push(command);
        } else {
            dropped.push({ command, reason: decision.reason });
        }
        runningLastAction = command.action;
    }

    return { allowed, dropped };
}

function evaluate(command, ctx) {
    const { action } = command;

    if (action === 'pose') {
        // The tutor always poses the starting problem. Always allowed.
        return { allowed: true };
    }

    // WORKED-EXAMPLE RELAXATION (ctx.workedExample):
    // In the I_DO phase the tutor DEMONSTRATES on a teaching example that is
    // NOT the student's graded problem ("teacher models with 2-3 examples").
    // Showing the full steps of an example is teaching, not cheating — the same
    // reason worked steps on PARALLEL problems are allowed under the #1 rule.
    // So apply/resolve/verify may carry tutor-authored steps here without the
    // student-text-match. We still require the field to be present (a malformed
    // command is still dropped), and this ONLY applies when the caller has
    // established an I_DO worked-example context (see runPipeline). Everywhere
    // else — homework help, WE_DO, YOU_DO — the strict student-mirror rule
    // stands, so the student's own problem is never solved for them.
    if (action === 'apply') {
        if (!command.op) {
            return { allowed: false, reason: 'apply_missing_op' };
        }
        if (ctx.workedExample) {
            return { allowed: true, reason: 'worked_example_step' };
        }
        if (opMatchesStudentText(command.op, ctx.combinedText)) {
            return { allowed: true };
        }
        return { allowed: false, reason: 'apply_op_not_in_student_message' };
    }

    if (action === 'resolve') {
        if (!command.tex) {
            return { allowed: false, reason: 'resolve_missing_tex' };
        }
        if (ctx.workedExample) {
            return { allowed: true, reason: 'worked_example_step' };
        }
        if (texMatchesStudentText(command.tex, ctx.combinedText)) {
            return { allowed: true };
        }
        return { allowed: false, reason: 'resolve_tex_not_in_student_message' };
    }

    if (action === 'verify') {
        if (!command.tex) {
            return { allowed: false, reason: 'verify_missing_tex' };
        }
        if (ctx.workedExample) {
            return { allowed: true, reason: 'worked_example_step' };
        }
        if (texMatchesStudentText(command.tex, ctx.combinedText)) {
            return { allowed: true };
        }
        return { allowed: false, reason: 'verify_tex_not_in_student_message' };
    }

    if (action === 'clear') {
        if (hasStartOverIntent(ctx.currentText)) {
            return { allowed: true };
        }
        if (ctx.runningLastAction === 'verify') {
            return { allowed: true };
        }
        // A clear immediately followed by a pose is a board reset for a
        // new problem (auto-advance). The pose itself is always allowed,
        // so the reset that precedes it is too.
        if (ctx.nextAction === 'pose') {
            return { allowed: true };
        }
        return { allowed: false, reason: 'clear_without_start_over_or_completed_problem' };
    }

    // Scaffold: the tutor shows the next step's STRUCTURE with empty slots
    // for the student to fill (e.g. "x^2 + 4x + \boxed{} = 12 + \boxed{}").
    // A blank reveals nothing, so this does not violate the #1 rule even on
    // the student's own problem — it's a hint, not the answer. But we DO
    // require a real blank: a "scaffold" with everything filled in is an
    // answer dump wearing the wrong label, so reject it.
    if (action === 'scaffold') {
        if (!command.tex) {
            return { allowed: false, reason: 'scaffold_missing_tex' };
        }
        if (!texHasBlank(command.tex)) {
            return { allowed: false, reason: 'scaffold_has_no_blank' };
        }
        return { allowed: true };
    }

    // Tutor-emitted reference content: graph/image cards are teaching aids,
    // not the student's worked steps. They can't reveal the solution, so
    // the #1-rule guard doesn't apply — we only validate required attrs.
    if (action === 'graph') {
        if (!command.fn) {
            return { allowed: false, reason: 'graph_missing_fn' };
        }
        return { allowed: true };
    }

    if (action === 'image') {
        if (!command.query) {
            return { allowed: false, reason: 'image_missing_query' };
        }
        return { allowed: true };
    }

    return { allowed: false, reason: 'unknown_action' };
}

module.exports = {
    enforcePedagogyRule,
    // Exposed for tests + symmetry with the parser.
    normalizeForMatch,
    texMatchesStudentText,
    opMatchesStudentText,
    hasStartOverIntent,
    texHasBlank,
};
