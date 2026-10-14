// utils/pipeline/activeProblem.js — the problem the student is working on,
// and which of its answers they have supplied.
//
// The answer boundary is "the student supplies the answer first". verify §3a
// enforced it only where the pipeline happened to hold an answer THIS turn:
// diagnose's correctAnswer on a graded-wrong attempt, or an equation the
// student typed in their last three messages. Every other turn — a question,
// "I don't know", frustration, a dispute, an attempt the solver couldn't
// grade, a proposed step ("add 4?" → "right, so x = 10") — had no answer to
// protect, so nothing could be leaked by value because nothing was known.
//
// This module keeps that answer across turns, per requested part:
//
//   conversation.activeProblem = {
//     posedBy: 'tutor' | 'student',
//     text,                       // what was posed, for logs
//     parts: [{ label, variable, values: number[], expr: string|null,
//               credited: number[], solved: boolean }],
//     posedAt, touchedAt,         // message counts — liveness
//     updatedAt,
//   }
//
// A part unlocks ONLY when the student states its answer. A wrong guess
// credits nothing ("x = 1 or 8 or 20" fishing credits nothing either — the
// valueLeak rule), and each root of a multi-root part is credited on its own.
//
// Deliberately conservative about what it ADOPTS, because a wrong record
// rewrites good replies:
//   • tutor-posed: the reply must pose (a question or a solve/find verb), and
//     must not reveal its own answer — that is a worked example, not a task;
//   • student-posed: only problem-bringing turns, never an answer attempt or
//     a step, and never an equation that is a step of the current problem;
//   • only what mathSolver actually solves. No solve, no record.
// And about what it GUARDS: a record goes quiet 12 messages after the student
// last engaged with it, or 3 hours after it was last touched.

const { parseCleanProblem } = require('../mathSolver');
const { normalizeMathOperators } = require('../mathUnicodeNormalizer');
const {
  extractPosedEquations,
  creditStudentStatements,
  findKnownValueReveal,
} = require('./valueLeak');
const { MESSAGE_TYPES } = require('./observe');

const LIVE_WINDOW_MESSAGES = 12;
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

// Turns on which the student is engaging with the problem in front of them.
const ENGAGED_TYPES = new Set([
  MESSAGE_TYPES.ANSWER_ATTEMPT,
  MESSAGE_TYPES.PROPOSED_STEP,
  MESSAGE_TYPES.IDK,
  MESSAGE_TYPES.GIVE_UP,
  MESSAGE_TYPES.HELP_REQUEST,
  MESSAGE_TYPES.FRUSTRATION,
  MESSAGE_TYPES.QUESTION,
].filter(Boolean));

// Turns on which a student BRINGS a problem.
const POSING_TYPES = new Set([
  MESSAGE_TYPES.GENERAL_MATH,
  MESSAGE_TYPES.QUESTION,
  MESSAGE_TYPES.HELP_REQUEST,
  MESSAGE_TYPES.GIVE_UP,
  MESSAGE_TYPES.IDK,
].filter(Boolean));

const POSES = /\?|\b(?:solve|find|simplify|evaluate|calculate|compute|factor|what(?:'s| is| do you get)|your turn|try (?:this|it|one)|give (?:this|it) a (?:try|shot))\b/i;

// Multi-part markers: "(a) …  (b) …", "a) …", "Part A: …", "1. … 2. …".
const PART_SPLIT = /(?:^|\n|\s)(?:\(([a-h])\)|([a-h])\)|part\s+([a-h])\b[:.)]?|(?<![\d.])([1-9])[.)](?!\d))\s+/gi;

function parseNumber(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s+/g, '');
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = parseFloat(frac[2]);
    return d === 0 ? null : parseFloat(frac[1]) / d;
  }
  return /^-?\d+(?:\.\d+)?$/.test(t) ? parseFloat(t) : null;
}

function flat(s) {
  return normalizeMathOperators(String(s || ''))
    .toLowerCase()
    .replace(/\\[()[\]]|\$/g, '')
    .replace(/\s+/g, '')
    .replace(/[.!?]+$/, '');
}

const same = (a, b) => Math.abs(a - b) < 1e-9;

/** One part from a mathSolver solution, or null if it has no usable answer. */
function partFromSolution(label, problem, solution) {
  if (!solution || !solution.success) return null;
  const answer = String(solution.answer ?? '');
  const varMatch = answer.match(/^\s*([a-z])\s*=/i);
  const variable = (varMatch && varMatch[1].toLowerCase())
    || (problem && typeof problem.variable === 'string' && problem.variable.length === 1 ? problem.variable.toLowerCase() : null);
  let values = [];
  if (Array.isArray(solution.roots) && solution.roots.length) {
    values = solution.roots.filter((r) => typeof r === 'number' && Number.isFinite(r));
  } else {
    const n = parseNumber(answer.replace(/^\s*[a-z]\s*=\s*/i, ''));
    if (n !== null) values = [n];
  }
  const expr = values.length ? null : (answer.trim() || null);
  if (!values.length && !expr) return null;
  return { label, variable, values, expr, credited: [], solved: false };
}

/** Render a part's still-open answer the way findKnownValueReveal reads it. */
function openAnswer(part) {
  if (part.solved) return null;
  if (part.values.length) {
    const open = part.values.filter((v) => !part.credited.some((c) => same(c, v)));
    if (!open.length) return null;
    return part.variable ? open.map((v) => `${part.variable} = ${v}`).join(', ') : open.join(', ');
  }
  return part.expr;
}

function settle(part) {
  if (part.values.length) part.solved = part.values.every((v) => part.credited.some((c) => same(c, v)));
  return part;
}

/**
 * Credit what the student stated in `messages` against `problem`'s parts.
 * Mutates a copy; returns it.
 */
function creditStatements(problem, messages, studentAnswer) {
  if (!problem || !Array.isArray(problem.parts)) return problem;
  const said = (messages || []).filter((m) => typeof m === 'string' && m.trim());
  const next = { ...problem, parts: problem.parts.map((p) => ({ ...p, credited: [...(p.credited || [])] })) };
  for (const part of next.parts) {
    if (part.solved) continue;
    if (part.values.length) {
      // Bound to the variable ("x = 10", "x is ten"), all-or-nothing per message.
      if (part.variable) {
        const { open } = creditStudentStatements(
          [{ equation: next.text || '', variable: part.variable, values: part.values, coefficients: [] }],
          said,
        );
        const stillOpen = open.length ? open[0].values : [];
        for (const v of part.values) {
          if (!stillOpen.some((o) => same(o, v)) && !part.credited.some((c) => same(c, v))) part.credited.push(v);
        }
      }
      // A bare answer ("10", "-3/4") — observe's extracted answer value.
      const n = parseNumber(String(studentAnswer ?? '').replace(/^\s*[a-z]\s*=\s*/i, ''));
      if (n !== null) {
        const hit = part.values.find((v) => same(v, n));
        if (hit !== undefined && !part.credited.some((c) => same(c, hit))) part.credited.push(hit);
      }
      settle(part);
    } else if (part.expr) {
      const target = flat(part.expr).replace(/^[a-z]=/, '');
      const forms = [studentAnswer, ...said].filter(Boolean).map((s) => flat(s).replace(/^[a-z]=/, ''));
      if (target && forms.some((f) => f === target)) part.solved = true;
    }
  }
  return next;
}

/** Is the record still one the student is working on? */
function isLive(problem, messageCount, now = Date.now()) {
  if (!problem || !Array.isArray(problem.parts) || !problem.parts.length) return false;
  if (problem.parts.every((p) => p.solved)) return false;
  const touched = Number.isFinite(problem.touchedAt) ? problem.touchedAt : problem.posedAt;
  if (Number.isFinite(touched) && messageCount - touched > LIVE_WINDOW_MESSAGES) return false;
  const updated = problem.updatedAt ? new Date(problem.updatedAt).getTime() : null;
  if (updated && now - updated > LIVE_WINDOW_MS) return false;
  return true;
}

/**
 * The answers verify must not reveal this turn: every part the student has
 * not fully supplied, as strings findKnownValueReveal reads ("x = 10").
 * @returns {string[]}
 */
function guardedAnswers(problem, messageCount, now) {
  if (!isLive(problem, messageCount, now)) return [];
  return problem.parts.map(openAnswer).filter(Boolean);
}

/** Do two value lists name the same set? */
function sameValues(a, b) {
  return a.length === b.length && a.every((v) => b.some((w) => same(v, w)));
}

/**
 * A problem the student brought this turn replaces the record. Not on an
 * attempt or a step, and not when the equation is a step of the problem
 * already open (its solutions are the open part's).
 */
function adoptFromStudent(problem, { message, messageType, isBareProblemDrop, messageCount }) {
  if (!message) return problem;
  if (!isBareProblemDrop && !POSING_TYPES.has(messageType)) return problem;
  const posed = extractPosedEquations(message);
  if (!posed.length) return problem;
  const { open } = creditStudentStatements(posed, [message]);
  // The student stated a value for every equation — that is an answer, not a problem.
  if (!open.length) return problem;
  if (problem && Array.isArray(problem.parts)
      && open.every((e) => problem.parts.some((p) => p.values.length && sameValues(p.values, e.values)))) {
    return problem;
  }
  const parts = open.map((e, i) => ({
    label: open.length > 1 ? String(i + 1) : null,
    variable: e.variable,
    values: e.values,
    expr: null,
    credited: [],
    solved: false,
  }));
  return {
    posedBy: 'student',
    text: open.map((e) => e.equation).join('; ').slice(0, 300),
    parts,
    posedAt: messageCount,
    touchedAt: messageCount,
    updatedAt: new Date(),
  };
}

/**
 * The part a stretch of tutor text poses. mathSolver's prose-aware parse
 * first; the single-variable equation reader (any letter) supplies the
 * variable, or the whole answer when the parse can't ("3y = 12").
 */
function partFromText(label, text) {
  let parsed = null;
  try { parsed = parseCleanProblem(text); } catch { parsed = null; }
  const eqs = extractPosedEquations(text);
  const eq = eqs.length === 1 ? eqs[0] : null;
  if (parsed && parsed.hasMath) {
    const part = partFromSolution(label, parsed.problem, parsed.solution);
    if (part) {
      if (!part.variable && eq && part.values.length && sameValues(part.values, eq.values)) part.variable = eq.variable;
      return part;
    }
  }
  if (eq) return { label, variable: eq.variable, values: eq.values, expr: null, credited: [], solved: false };
  return null;
}

/** Split a reply into its lettered/numbered parts, if it has 2+. */
function splitParts(text) {
  const marks = [...String(text).matchAll(PART_SPLIT)];
  if (marks.length < 2) return null;
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const label = (marks[i][1] || marks[i][2] || marks[i][3] || marks[i][4]).toLowerCase();
    out.push({ label, body: text.slice(start, end) });
  }
  return out;
}

/**
 * A problem the tutor posed in `reply` replaces the record — unless the reply
 * reveals its own answer (a worked example), or it is the problem already
 * open (keep its credits).
 */
function adoptFromTutor(problem, { reply, recentUserMessages, messageCount }) {
  if (!reply || !POSES.test(reply)) return problem;
  const parts = [];
  const segments = splitParts(reply);
  if (segments) {
    for (const seg of segments) {
      const part = partFromText(seg.label, seg.body);
      if (part) parts.push(part);
    }
  }
  // A part the solver can't read is simply not guarded; the ones it can are.
  if (!parts.length) {
    const part = partFromText(null, reply);
    if (!part) return problem;
    parts.push(part);
  }

  // A reply that hands over its own answer is demonstrating, not posing.
  if (parts.some((p) => findKnownValueReveal(reply, openAnswer(p)))) return problem;

  // Same problem still open — keep the record and its credits.
  if (problem && Array.isArray(problem.parts) && problem.parts.length === parts.length
      && parts.every((p, i) => {
        const q = problem.parts[i];
        return p.values.length ? sameValues(p.values, q.values || []) : flat(p.expr) === flat(q.expr);
      })) {
    return problem;
  }

  const fresh = {
    posedBy: 'tutor',
    text: String(reply).slice(0, 300),
    parts,
    posedAt: messageCount,
    touchedAt: messageCount,
    updatedAt: new Date(),
  };
  // The student may already have said it (the tutor re-posing their own pick).
  return creditStatements(fresh, (recentUserMessages || []).slice(-1), null);
}

/**
 * This turn's update, BEFORE verify: adopt a problem the student brought,
 * credit what they stated, and mark the record touched if they engaged.
 */
function beforeReply(problem, { message, messageType, isBareProblemDrop, studentAnswer, messageCount }) {
  let next = adoptFromStudent(problem || null, { message, messageType, isBareProblemDrop, messageCount });
  if (!next) return null;
  next = creditStatements(next, [message], studentAnswer);
  if (ENGAGED_TYPES.has(messageType) || next !== problem) {
    next = { ...next, touchedAt: messageCount, updatedAt: new Date() };
  }
  return next;
}

module.exports = {
  beforeReply,
  adoptFromTutor,
  adoptFromStudent,
  creditStatements,
  guardedAnswers,
  isLive,
  LIVE_WINDOW_MESSAGES,
};
