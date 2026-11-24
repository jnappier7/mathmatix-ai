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

const { residualRatio, scaffoldBlankIsGiven, isUnsolvedEquation } = require('./pipeline/boardContinuity');
const { parseTileMat } = require('./workspace/tileMat');

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
    // Mr. Nappier methodology
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

    // Fall back to per-side match on equations. A side that is a bare number
    // has to be STATED as a value, not merely have its digits in the text:
    // "divide by 2" on 2x = 4 used to pass "x = 2" — the "x" from the problem
    // the student typed a message ago, the "2" from the move they named — and
    // that line is the answer.
    if (norm.includes('=')) {
        const parts = norm.split('=').map(p => p.trim()).filter(Boolean);
        return parts.every(p => p.length >= 1
            && (isBareNumber(p) ? statesNumber(p, studentText) : sNorm.includes(p)));
    }
    return false;
}

// A side that is nothing but a number ("7", "-2.5").
function isBareNumber(side) {
    return /^[-+]?\d+(?:\.\d+)?$/.test(side);
}

// Did the student state this number AS a value — "24", "it's 24", "= 24" —
// and not merely write its digits inside something else ("divide by 2",
// "12x", "2.5")? A substring test cannot tell those apart, and a bare number
// is exactly what an answer looks like.
function statesNumber(num, studentText) {
    const n = String(num).replace(/^\+/, '');
    const esc = n.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    const re = new RegExp(`(?:^|[^\\w.])${esc}(?![\\w.]|\\s*[a-z(])`, 'i');
    return String(studentText || '').split(/\n+/).some((line) => {
        const m = re.exec(line.replace(/[−–—]/g, '-'));
        if (!m) return false;
        // "divide by 2", "times 3", "subtract 7 from both sides": the number
        // there is the move's operand, not a result.
        const before = line.slice(0, m.index + m[0].length - n.length).toLowerCase();
        return !/\b(?:by|times|of|add|adding|plus|subtract|subtracting|minus|multiply|multiplying|divide|dividing|the)\s*$/.test(before);
    });
}

/**
 * THE UNCHANGED SIDE COMES FROM THE BOARD.
 *
 * A student who has just combined 12 and −5 says "6x + 7". The line that goes
 * on the board is "6x + 7 = 2x + 31", and its right side is not in their
 * message — it is the side they did not touch, sitting on the line above. The
 * per-side match in texMatchesStudentText only ever looked at the student's
 * last two messages, so the board kept up while the problem statement was
 * still inside that window and then stopped: the first step or two landed and
 * every later one was dropped (owner, on a preview account, 2026-11-24: "work
 * board stops updating after a couple of steps").
 *
 * So an equation line is the student's when EACH side is either something they
 * wrote this turn or a side already on the card in focus, and AT LEAST ONE
 * side is theirs. Nothing reaches the board that the student has not written
 * or is not already looking at. A bare number counts as theirs only when they
 * stated it as a value (statesNumber) — "x = 2" must not ride in on "divide
 * by 2".
 */
function lineFromStudentAndBoard(tex, ctx) {
    const norm = normalizeForMatch(tex);
    if (!norm || !norm.includes('=')) return false;
    const sides = norm.split('=').map(p => p.trim());
    if (sides.length !== 2 || sides.some(p => !p)) return false;
    const sNorm = normalizeForMatch(ctx.combinedText);
    const onBoard = ctx.boardSides || new Set();
    let fromStudent = 0;
    for (const side of sides) {
        const theirs = isBareNumber(side)
            ? statesNumber(side, ctx.combinedText)
            : (side.length >= 2 && !!sNorm && sNorm.includes(side));
        if (theirs) { fromStudent++; continue; }
        if (!onBoard.has(side)) return false;
    }
    return fromStudent >= 1;
}

// Did the student name a move in THIS message ("distribute the 3", "combine
// like terms", "subtract 2x from both sides")?
function namesAMove(text) {
    const t = String(text || '').toLowerCase();
    return !!t && OPERATION_KEYWORDS.some(kw => new RegExp(`\\b${kw.replace(/ /g, '\\s+')}`).test(t));
}

/**
 * THE STUDENT CHOSE THE MOVE; THE TUTOR MAY WRITE WHERE IT LANDS.
 *
 * "Distribute the 3." "Combine like terms." "Subtract 2x from both sides."
 * A student working at that level is doing the algebra — choosing the move is
 * the skill — and a tutor at a whiteboard writes the line the move produces.
 * The guard used to keep the label ("↳ distribute the 3") and drop the line,
 * every turn, so a whole solve could pass with nothing on the board but the
 * problem (owner: "or maybe doesn't understand simplification and
 * distribution as a step").
 *
 * Narrow on purpose:
 *   • the student named a move in THIS message;
 *   • the line is the same equation as the last line on the card (their
 *     residuals are proportional — exactly what a move does), and not that
 *     line again;
 *   • it is still an unsolved line. The ANSWER ("x = 6") never lands this
 *     way: that the student must state;
 *   • one landing per turn — one move, one line.
 * Equations in one variable only; anything this cannot prove stays under the
 * strict rule.
 */
function landsNamedMove(tex, ctx) {
    if (!ctx.state || ctx.state.landed) return false;
    if (!namesAMove(ctx.currentText)) return false;
    const prev = ctx.state.lastLine;
    if (!prev) return false;
    if (normalizeForMatch(prev) === normalizeForMatch(tex)) return false;
    if (!isUnsolvedEquation(tex)) return false;
    if (ctx.pinnedAnswer && texMatchesEither(tex, ctx.pinnedAnswer)) return false;
    return residualRatio(prev, tex) !== null;
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

// A side of an equation that is NOTHING but one blank ("\\boxed{}").
function isWholeBlank(side) {
    const t = String(side || '').trim();
    return /^\\boxed\s*\{\s*(?:\\(?:[;,:!\s]|quad|qquad)\s*)*\}$/.test(t)
        || /^\\square$/.test(t) || /^_{3,}$/.test(t) || /^(?:\\_){3,}$/.test(t);
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
// Symmetric tex match — does either string contain the other (normalized)?
function texMatchesEither(a, b) {
    return texMatchesStudentText(a, b) || texMatchesStudentText(b, a);
}

// WORKED-EXAMPLE LEAK BACKSTOP.
// The worked-example relaxation trusts the model to demonstrate on a PARALLEL
// problem, never the student's own. This is the deterministic safety net for
// when it doesn't: a worked-example step that matches the student's pinned
// problem expression OR its known answer is the model solving the graded
// problem under cover of "example" — block it regardless of the relaxation, so
// WORKED_EXAMPLE_BOARD is safe to enable even if the model occasionally slips.
function revealsPinnedProblem(text, ctx) {
    if (!text) return false;
    if (ctx.pinnedProblemTex) {
        if (texMatchesEither(text, ctx.pinnedProblemTex)) return true;
        // Also match the bare expression (the pinned problem minus a trailing
        // "= 0"), so a step/op that names the student's expression is caught
        // even when it omits the "= 0" — e.g. op "factor 3x^2 + 4x - 7".
        const expr = String(ctx.pinnedProblemTex).replace(/\s*=\s*0\s*$/, '');
        if (expr !== ctx.pinnedProblemTex && texMatchesEither(text, expr)) return true;
    }
    if (ctx.pinnedAnswer && texMatchesEither(text, ctx.pinnedAnswer)) return true;
    return false;
}

// Scrub a LaTeX/text field of leaked JSON structure. A fallback parser upstream
// can capture a board_commands array boundary into a field — e.g. tex = "3x = 21},{"
// — which would then render as a red KaTeX error on the board. A real math
// expression never contains an UNescaped  } , {  or  " , "  (LaTeX braces are
// \{ \}), so cut at that boundary and drop the residue. Mirrors the client-side
// guard in public/js/boardCommandHandler.js (defense in depth).
function cleanField(s) {
    if (typeof s !== 'string') return s;
    // Stray wrapping JSON quotes.
    s = s.replace(/^\s*["']+|["']+\s*$/g, '');
    // Truncate at a leaked JSON object/array boundary.
    const cut = s.search(/[}\]"]\s*,\s*["{[]/);
    if (cut !== -1) s = s.slice(0, cut + 1);
    s = s.trim();
    // Drop a trailing unbalanced } left over from the cut (LaTeX braces pair up;
    // a lone trailing close is residue). Count unescaped braces only.
    const opens = (s.match(/(?:^|[^\\])\{/g) || []).length;
    let closes = (s.match(/(?:^|[^\\])\}/g) || []).length;
    while (closes > opens && /\}\s*$/.test(s)) {
        s = s.replace(/\}\s*$/, '').trim();
        closes--;
    }
    // A trailing unescaped { opens nothing — the cut left the next object's
    // brace behind ("2x - 3 = 4 + x{" reached the board, 2026-11-03).
    while (/(?:^|[^\\])\{\s*$/.test(s)) s = s.replace(/\{\s*$/, '').trim();
    return s;
}

// Return a copy of the command with its math/text fields scrubbed. Cheap no-op
// (returns the same ref) when nothing needed cleaning.
function sanitizeCommand(command) {
    if (!command || typeof command !== 'object') return command;
    let out = command;
    for (const k of ['tex', 'check', 'op', 'caption']) {
        if (typeof command[k] === 'string') {
            const cleaned = cleanField(command[k]);
            if (cleaned !== command[k]) {
                if (out === command) out = { ...command };
                out[k] = cleaned;
            }
        }
    }
    return out;
}

// Detect the backwards evaluation scaffold: exactly one "=", blanks confined
// to one side, and the blank-free side a bare numeric literal that nobody has
// stated yet (neither the student's recent text nor the tutor's current
// reply). Abstains (returns false) on anything more structured — multi-step
// algebra scaffolds like "x^2 + 4x + \boxed{} = 12 + \boxed{}" have blanks on
// both sides or a non-numeric far side and are untouched.
function scaffoldShowsUnstatedResult(tex, ctx) {
    const parts = String(tex).split('=');
    if (parts.length !== 2) return false;
    const [left, right] = parts.map(s => s.trim());
    const leftHasBlank = /\\boxed/.test(left);
    const rightHasBlank = /\\boxed/.test(right);
    if (leftHasBlank === rightHasBlank) return false;    // both or neither → not this shape
    const shownSide = leftHasBlank ? right : left;
    // Bare numeric literal (allow $ %, spacing macros, commas in thousands)?
    const literal = shownSide.replace(/\\[,;!\s]|[\s$]/g, '').replace(/\\%/g, '');
    if (!/^-?\d[\d,]*(?:\.\d+)?$/.test(literal)) return false;
    const num = literal.replace(/,/g, '');
    const haystack = `${ctx.combinedText || ''}\n${ctx.tutorReplyText || ''}`;
    // The number counts as "stated" only as a standalone value, not as a
    // digit-run inside a longer number (300 inside 3000 doesn't count).
    const stated = new RegExp(`(?<![\\d.])${num.replace(/\./g, '\\.')}(?![\\d.])`).test(haystack.replace(/,/g, ''));
    return !stated;
}

function enforcePedagogyRule({
    commands,
    userMessage,
    recentUserMessages = [],
    lastBoardActionInConversation = null,
    workedExample = false,
    pinnedProblemTex = null,
    pinnedAnswer = null,
    tutorReplyText = null,
    // The problem the card in focus holds (conversation.boardLedger.current).
    // Survives a verify, which drops the pin — a restart scaffold arriving
    // after the answer must still be judged against the problem it restates.
    // Used only by the scaffold-blank and example checks.
    focusProblemTex = null,
    // Lines the student has MADE on the board with their own hands — what
    // their tile mat now shows (ledger tiles card → mat.now.tex, written by
    // utils/workspace/tileMatState.js from tile counts). A line built on the
    // mat is the student's line exactly as a typed one is, so the tutor may
    // mirror it onto the card; without this a student who cancelled their way
    // to "2x = 4" got no line for it until they also typed it.
    studentBoardLines = [],
    // The equation lines already on the card in focus, oldest first: the
    // problem, then each resolved line (boardLedger.current). What the student
    // is looking at — the unchanged side of their next line comes from here,
    // and a named move lands on the last of them.
    boardLines = [],
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
    // Matched as WHOLE lines, never folded into the prose haystack: the prose
    // matcher accepts an equation when each side appears somewhere in the text,
    // and "x = 2" has both its sides inside a mat reading "2x = 4".
    const handLines = new Set((Array.isArray(studentBoardLines) ? studentBoardLines : [])
        .filter(t => typeof t === 'string' && t.trim())
        .map(normalizeForMatch).filter(Boolean));

    // Track the running last-action across commands within this batch
    // so a `pose` followed by an immediate `apply` in the same response
    // is judged against the student's message, not the in-batch pose.
    let runningLastAction = lastBoardActionInConversation;
    // The problem the student is answering once this batch lands: the newest
    // pose in the batch, else the pin. A posed problem IS the graded problem
    // (the PROBLEM card and the grading pin both follow it), so an example
    // card deriving it is a solve — even on the turn it is posed, when the pin
    // is still empty (production 2026-10-05: the pose turn carried example
    // cards "5(x+2) - 3x = 26" and "x = 8", the answer above the first step).
    let activeProblemTex = pinnedProblemTex || focusProblemTex;

    // The card's lines as this batch finds them, kept current as it lands more.
    const boardSides = new Set();
    const state = { lastLine: null, landed: false };
    const noteLine = (tex) => {
        if (typeof tex !== 'string' || !tex.trim()) return;
        const norm = normalizeForMatch(tex);
        if (!norm.includes('=')) return;
        norm.split('=').map(p => p.trim()).filter(Boolean).forEach(p => boardSides.add(p));
        state.lastLine = tex;
    };
    [activeProblemTex].concat(Array.isArray(boardLines) ? boardLines : []).forEach(noteLine);
    // An apply whose wording the student did not use, waiting to see whether
    // the line it labels is theirs (see below).
    let heldApply = null;

    for (let i = 0; i < commands.length; i++) {
        const original = commands[i];
        // Scrub leaked JSON/garbage out of the math fields FIRST, so the clean
        // command is what we judge, allow, and pass downstream (board + stored
        // history + voice all get the cleaned tex).
        const command = sanitizeCommand(original);
        // If a tex that was present scrubbed away to nothing, it was pure garbage
        // — drop it rather than paint a blank/wrong card ("cannot display wrong
        // math", the board's #1 guarantee).
        if (typeof original.tex === 'string' && original.tex.trim() && !(command.tex || '').trim()) {
            dropped.push({ command: original, reason: 'malformed_tex' });
            runningLastAction = original.action;
            continue;
        }
        const nextAction = commands[i + 1] ? commands[i + 1].action : null;
        const decision = evaluate(command, {
            currentText,
            combinedText,
            runningLastAction,
            nextAction,
            workedExample,
            pinnedProblemTex,
            pinnedAnswer,
            tutorReplyText,
            activeProblemTex,
            handLines,
            boardSides,
            state,
        });

        // A LABEL FOLLOWS ITS LINE. "6x + 12 - 5", says the student, and the
        // tutor's cards are apply "distribute the 3" + resolve of that line.
        // The student never typed "distribute", so the label used to be
        // dropped and the line arrived bare. But the label only names what the
        // student just did: if the line it introduces is theirs, so is it.
        if (!decision.allowed && decision.reason === 'apply_op_not_in_student_message'
                && nextAction === 'resolve') {
            heldApply = command;
            runningLastAction = command.action;
            continue;
        }
        if (heldApply) {
            if (decision.allowed && command.action === 'resolve') allowed.push(heldApply);
            else dropped.push({ command: heldApply, reason: 'apply_op_not_in_student_message' });
            heldApply = null;
        }

        if (decision.allowed) {
            if (decision.reason === 'lands_named_move') state.landed = true;
            if (command.action === 'pose') { boardSides.clear(); state.lastLine = null; }
            if (command.action === 'pose' || command.action === 'resolve' || command.action === 'verify') noteLine(command.tex);
            // A tiles card leaves the guard as the mat it was read into, with
            // NO top-level tex: every later stage that walks the board's
            // equation lines (continuity, the ledger's step count, the pin)
            // would otherwise count the picture as a line of the solve.
            if (decision.mat) {
                const tiles = { action: 'tiles', mat: decision.mat };
                if (command.caption) tiles.caption = command.caption;
                allowed.push(tiles);
            } else {
                allowed.push(command);
            }
            if (command.action === 'pose' && command.tex) activeProblemTex = command.tex;
        } else {
            dropped.push({ command, reason: decision.reason });
            // An apply that only introduced this scaffold ("distribute 5 …"
            // over "5(x) + 5(2) - 3x = \boxed{}") names a move the board no
            // longer asks for. Alone it renders as a stray label — after the
            // answer, in production 2026-10-05 — and on a reload it glues onto
            // the next turn's line instead. It goes with its scaffold.
            const prev = allowed[allowed.length - 1];
            if (command.action === 'scaffold' && prev && prev.action === 'apply'
                    && commands[i - 1] && commands[i - 1].action === 'apply') {
                dropped.push({ command: allowed.pop(), reason: 'apply_orphaned_by_scaffold' });
            }
        }
        runningLastAction = command.action;
    }
    if (heldApply) dropped.push({ command: heldApply, reason: 'apply_op_not_in_student_message' });

    return { allowed, dropped };
}

// Is this exactly a line the student built on the board with their hands?
function madeByHand(tex, ctx) {
    const norm = normalizeForMatch(tex);
    return !!(norm && ctx.handLines && ctx.handLines.has(norm));
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
            if (revealsPinnedProblem(command.op, ctx)) {
                return { allowed: false, reason: 'worked_example_reveals_active_problem' };
            }
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
            if (revealsPinnedProblem(command.tex, ctx)) {
                return { allowed: false, reason: 'worked_example_reveals_active_problem' };
            }
            return { allowed: true, reason: 'worked_example_step' };
        }
        if (texMatchesStudentText(command.tex, ctx.combinedText) || madeByHand(command.tex, ctx)) {
            return { allowed: true };
        }
        if (lineFromStudentAndBoard(command.tex, ctx)) {
            return { allowed: true, reason: 'unchanged_side_from_board' };
        }
        if (landsNamedMove(command.tex, ctx)) {
            return { allowed: true, reason: 'lands_named_move' };
        }
        return { allowed: false, reason: 'resolve_tex_not_in_student_message' };
    }

    if (action === 'verify') {
        if (!command.tex) {
            return { allowed: false, reason: 'verify_missing_tex' };
        }
        if (ctx.workedExample) {
            if (revealsPinnedProblem(command.tex, ctx)) {
                return { allowed: false, reason: 'worked_example_reveals_active_problem' };
            }
            return { allowed: true, reason: 'worked_example_step' };
        }
        if (texMatchesStudentText(command.tex, ctx.combinedText)) {
            return { allowed: true };
        }
        return { allowed: false, reason: 'verify_tex_not_in_student_message' };
    }

    // Worked-example derivation step (read-only). Unlike apply/resolve/verify,
    // an `example` card has NO student-mirror fallback: it carries the tutor's
    // own derivation, so it is admitted ONLY in teaching mode (ctx.workedExample,
    // established by runPipeline from an I-do decision + WORKED_EXAMPLE_BOARD).
    // Outside teaching mode it is always dropped — the strict default is
    // unchanged. Even in teaching mode, the pinned-problem backstop stands: a
    // step that names the student's graded problem or its answer is the model
    // solving the homework under cover of "example", and is blocked.
    if (action === 'example') {
        if (!command.tex) {
            return { allowed: false, reason: 'example_missing_tex' };
        }
        if (!ctx.workedExample) {
            return { allowed: false, reason: 'example_outside_worked_example_mode' };
        }
        const active = { ...ctx, pinnedProblemTex: ctx.activeProblemTex || ctx.pinnedProblemTex };
        if (revealsPinnedProblem(command.tex, active)) {
            return { allowed: false, reason: 'worked_example_reveals_active_problem' };
        }
        // Any line equivalent to the active problem — "x = 8" for
        // 5(x+2) - 3x = 26 — is a step of solving it, worded or not.
        if (active.pinnedProblemTex && residualRatio(active.pinnedProblemTex, command.tex) !== null) {
            return { allowed: false, reason: 'worked_example_reveals_active_problem' };
        }
        return { allowed: true, reason: 'worked_example_step' };
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
        // A raw "?" as the unknown marker means the blanks are on the wrong
        // things: the model wrote the value it wants ("0 + \boxed{} +
        // \boxed{} = ?") with boxes over ALREADY-KNOWN terms and the actual
        // unknown as a question mark. The empty box IS the unknown — a card
        // that needs "?" has its blanks backwards. Drop it; a missing card
        // beats a nonsensical one (production transcript, 2026-07-29).
        if (/\?/.test(command.tex)) {
            return { allowed: false, reason: 'scaffold_question_mark_unknown' };
        }
        // Backwards evaluation scaffold: "<expr with blanks> = <bare number>"
        // displays the RESULT while hiding givens ("0.3 \times \boxed{} = 300"
        // emitted while the chat asks "what's 0.3 × 1000?" — it leaks the
        // very answer being asked for AND quizzes the student on a given).
        // A shown result is only legitimate when that number is already on
        // the table — stated by the student or by the tutor's own reply
        // (missing-factor problems: "what times 0.3 gives 300?").
        if (scaffoldShowsUnstatedResult(command.tex, ctx)) {
            return { allowed: false, reason: 'scaffold_reveals_unstated_result' };
        }
        // A blank whose only consistent value is a number the problem already
        // gives — "5(x) + 5(2) - 3x = \\boxed{}" under 5(x+2) - 3x = 26 —
        // quizzes the student on copying the 26, and the filled-in "26" then
        // reads to the tutor like a worked step (production 2026-10-05).
        if (scaffoldBlankIsGiven(command.tex, ctx.activeProblemTex || ctx.pinnedProblemTex, isWholeBlank)) {
            return { allowed: false, reason: 'scaffold_blank_is_given' };
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

    // Deterministic geometry diagram (JSXGraph). Like graph/image it's a
    // teaching aid, not a transcription of the student's steps — so the
    // student-text rule doesn't apply here. Leak-safety for the student's OWN
    // problem is handled by the diagram spec's redact mode (omits the unknown's
    // value) under the visual gate, not by dropping the card. We only validate
    // that a known type is present.
    if (action === 'diagram') {
        if (!command.diagramType) {
            return { allowed: false, reason: 'diagram_missing_type' };
        }
        return { allowed: true };
    }

    if (action === 'image') {
        if (!command.query) {
            return { allowed: false, reason: 'image_missing_query' };
        }
        return { allowed: true };
    }

    // Interactive concept model (JSXGraph, gated behind CONCEPT_MODELS). Like
    // graph/diagram it's a teaching aid summoned with intent, not a transcription
    // of the student's steps — and it's correct by construction (the engine
    // measures; the spec never asserts a value), so it cannot leak the student's
    // answer. The #1-rule student-text match doesn't apply; we only require an
    // identity: a curated catalog name OR a generated spec (the long-tail path).
    // The spec's structural validity is enforced separately, before the guard, by
    // utils/conceptModelCommand.js.
    if (action === 'model') {
        if (!command.model && !command.spec) {
            return { allowed: false, reason: 'model_missing_name' };
        }
        return { allowed: true };
    }

    // Algebra tiles. The tutor names a line; utils/workspace/tileMat.js reads
    // it into tiles, so the picture cannot disagree with the line. Two gates:
    //   1. it must be drawable with certainty (one variable, whole numbers,
    //      nothing above x², a plain sum) — otherwise no card;
    //   2. on the student's own problem it must be a line ALREADY theirs: the
    //      problem in focus, or something they have stated. Tiles for the next
    //      line of the solve are that line, shown early — the same thing the
    //      resolve rule exists to stop. In a worked example the tutor's own
    //      lines are fine, never the student's graded problem or its answer.
    if (action === 'tiles') {
        // Already read by an earlier pass of this guard.
        if (command.mat && !command.tex) return { allowed: true };
        if (!command.tex) {
            return { allowed: false, reason: 'tiles_missing_tex' };
        }
        const mat = parseTileMat(command.tex);
        if (!mat) {
            return { allowed: false, reason: 'tiles_not_drawable' };
        }
        if (ctx.workedExample) {
            if (revealsPinnedProblem(command.tex, ctx)) {
                return { allowed: false, reason: 'worked_example_reveals_active_problem' };
            }
            return { allowed: true, reason: 'worked_example_step', mat };
        }
        const line = normalizeForMatch(command.tex);
        const onBoard = [ctx.activeProblemTex, ctx.pinnedProblemTex]
            .some(t => t && normalizeForMatch(t) === line);
        if (onBoard || texMatchesStudentText(command.tex, ctx.combinedText) || madeByHand(command.tex, ctx)) {
            return { allowed: true, mat };
        }
        return { allowed: false, reason: 'tiles_line_not_on_board' };
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
    isWholeBlank,
    cleanField,
    sanitizeCommand,
};
