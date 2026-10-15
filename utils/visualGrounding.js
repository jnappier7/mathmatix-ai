'use strict';
/* ============================================================
   visualGrounding.js — a plotted point must come from the conversation.

   Student audit, 2026-10-15: the student submitted five correct solutions to
   five systems ((9/5,33/5), (6,−2), …). The tutor model called its
   render_points_plot tool FIVE times with the same five INVENTED points —
   (1.8,3.6) for (1.8,6.6), (1.5,−2) for (6,−2), y-values from dropped
   constants — at 16-digit precision, and the server turned every call into a
   [POINTS] card. A wrong plot of a student's correct answer is worse than no
   plot: it tells them they're wrong.

   So before a points plot is shown:
     • identical tool calls in one turn collapse to one;
     • every point must be GROUNDED in the recent conversation — the pair
       written out ("(9/5, 33/5)", "x = 9/5, y = 33/5"), or satisfying an
       equation in x and y that appears there ("y = 2x + 3"). Ungrounded points
       are dropped; a plot left with none is dropped entirely;
     • coordinates are rounded for legible labels (1.2857142857142858 → 1.286).

   Grounding is deliberately generous (decimals, fractions, \frac, ±0.005):
   it exists to stop invented points, not to second-guess a real plot.
   ============================================================ */

const math = require('mathjs');
const { latexToExpr } = require('./pipeline/symbolicVerifier');

const TOL = 0.005;
const NUM = String.raw`(-?\s*(?:\\d?frac\s*\{\s*-?\d+(?:\.\d+)?\s*\}\s*\{\s*\d+(?:\.\d+)?\s*\}|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?|\d*\.\d+|\d+))`;

function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/\s+/g, '').replace(/−/g, '-');
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let v;
  const fr = s.match(/^\\d?frac\{(-?[\d.]+)\}\{([\d.]+)\}$/);
  if (fr) v = Number(fr[1]) / Number(fr[2]);
  else if (/^[\d.]+\/[\d.]+$/.test(s)) { const [a, b] = s.split('/'); v = Number(a) / Number(b); }
  else v = Number(s);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

const near = (a, b) => Math.abs(a - b) <= TOL + 1e-9 * Math.max(1, Math.abs(b));

/** Ordered pairs written in the text: "(a, b)" and "x = a … y = b". */
function extractPairs(text) {
  const t = String(text || '').replace(/\\left|\\right/g, '').replace(/−/g, '-');
  const pairs = [];
  const paren = new RegExp(String.raw`\(\s*${NUM}\s*,\s*${NUM}\s*\)`, 'g');
  for (const m of t.matchAll(paren)) pairs.push([toNumber(m[1]), toNumber(m[2])]);
  const xy = new RegExp(String.raw`\bx\s*=\s*${NUM}[^xy=]{0,30}?\by\s*=\s*${NUM}`, 'g');
  for (const m of t.matchAll(xy)) pairs.push([toNumber(m[1]), toNumber(m[2])]);
  return pairs.filter(([a, b]) => a != null && b != null);
}

/** Equations in x and y written in the text, compiled for evaluation. */
function extractEquations(text) {
  const t = String(text || '')
    .replace(/&/g, '')
    .replace(/\\\\/g, '\n')
    .replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, '\n');
  const out = [];
  const seen = new Set();
  // A run of math-ish characters on each side of a single "=".
  const re = /([0-9xy+\-−*/^().\s{}\\a-z]{1,60})=([0-9xy+\-−*/^().\s{}\\a-z]{1,60})/gi;
  for (const line of t.split(/[\n;,]|\band\b/)) {
    for (const m of line.matchAll(re)) {
      const lhs = latexToExpr(m[1].replace(/^[^0-9xy(\\-]*/i, ''));
      const rhs = latexToExpr(m[2].replace(/[^0-9xy)}]*$/i, ''));
      if (!lhs || !rhs) continue;
      const key = `${lhs}=${rhs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const f = math.compile(`(${lhs}) - (${rhs})`);
        const vars = new Set();
        math.parse(`(${lhs}) - (${rhs})`).traverse((n) => { if (n.isSymbolNode && typeof math[n.name] !== 'function') vars.add(n.name); });
        // Only equations that relate y to x (or x and y together) can place a
        // point; "x = 6" alone would ground (6, anything).
        if (!vars.has('y') || [...vars].some((v) => v !== 'x' && v !== 'y')) continue;
        out.push(f);
      } catch (_) { /* not an equation we can evaluate */ }
    }
  }
  return out;
}

function buildContext(texts) {
  const all = (Array.isArray(texts) ? texts : [texts]).filter(Boolean).join('\n');
  return { pairs: extractPairs(all), equations: extractEquations(all) };
}

function isGrounded([x, y], ctx) {
  if (ctx.pairs.some(([a, b]) => near(x, a) && near(y, b))) return true;
  return ctx.equations.some((f) => {
    try { const v = f.evaluate({ x, y }); return typeof v === 'number' && Math.abs(v) <= 0.01; } catch (_) { return false; }
  });
}

const round3 = (v) => Number(Number(v).toFixed(3));

function parseArgs(call) {
  const raw = call && call.function && call.function.arguments;
  if (raw && typeof raw === 'object') return raw;
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return null; }
}

/**
 * Screen a turn's visual tool calls. Returns { calls, dropped } where `calls`
 * keep their original shape (arguments rewritten when points were filtered
 * or rounded) and `dropped` lists { name, reason } for logging.
 *
 * @param {Object[]} calls  OpenAI-shaped tool calls
 * @param {Object}   opts
 * @param {string[]} opts.texts  recent conversation text + this turn's prose
 */
function screenVisualCalls(calls, { texts = [] } = {}) {
  const dropped = [];
  const kept = [];
  const seen = new Set();
  let ctx = null;

  for (const call of Array.isArray(calls) ? calls : []) {
    const name = call && call.function && call.function.name;
    const args = parseArgs(call);
    const sig = `${name}:${JSON.stringify(args)}`;
    if (seen.has(sig)) { dropped.push({ name, reason: 'duplicate' }); continue; }
    seen.add(sig);

    if (name !== 'render_points_plot' || !args || !Array.isArray(args.points)) { kept.push(call); continue; }

    ctx = ctx || buildContext(texts);
    const points = args.points
      .filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
      .map((p) => [Number(p[0]), Number(p[1])]);
    const grounded = points.filter((p) => isGrounded(p, ctx));
    if (grounded.length < points.length) {
      dropped.push({ name, reason: `ungrounded points: ${points.filter((p) => !grounded.includes(p)).map((p) => `(${round3(p[0])},${round3(p[1])})`).join(' ')}` });
    }
    if (grounded.length === 0) continue;
    const nextArgs = { ...args, points: grounded.map(([x, y]) => [round3(x), round3(y)]) };
    kept.push({ ...call, function: { ...call.function, arguments: JSON.stringify(nextArgs) } });
  }
  return { calls: kept, dropped };
}

/** Plain text of chat messages (string content or content parts). */
function messageTexts(messages, limit = 8) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role !== 'system')
    .slice(-limit)
    .map((m) => (typeof m.content === 'string' ? m.content
      : Array.isArray(m.content) ? m.content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join(' ') : ''));
}

module.exports = { screenVisualCalls, messageTexts, extractPairs, extractEquations, isGrounded, buildContext, toNumber };
