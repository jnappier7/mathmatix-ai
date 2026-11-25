/**
 * VISUAL TOKEN PARSER — the bracket grammar for inline visual commands.
 *
 * Extracted from inlineChatVisuals.js so the parsing rule that decides whether a
 * [NUMBER_LINE:...] token is captured whole is testable in node, with no DOM.
 *
 * THE BUG THIS FIXES: a token's params can nest ONE level of brackets —
 * "points=[-2,0,3]", "jumps=[(0,3),(3,7)]". The old param pattern was [^\]]+,
 * which stops at the FIRST inner "]", so it captured a truncated "points=[-2,0,3"
 * and left ",highlight=3]" as literal text. Every number line / plot WITH points
 * rendered nothing usable, and the tutor — seeing no visual appear — narrated
 * "let me draw that" turn after turn.
 *
 * The grammar here matches a run of non-bracket chars OR a complete "[...]"
 * group. It is a strict superset of the old behaviour: a token with no nested
 * brackets matches exactly as before.
 *
 * Loads as a browser global (window.VisualTokenParser) and a CommonJS module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisualTokenParser = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // One param char: a non-bracket, or a whole "[...]" group (one level of nesting).
  const PARAM = '(?:[^\\[\\]]|\\[[^\\]]*\\])';

  /**
   * A global regex that captures the FULL params of a [NAME:...] token, nested
   * brackets included.
   *
   * @param {string} name    the token name, e.g. "NUMBER_LINE"
   * @param {object} [opts]
   * @param {boolean} [opts.star]        allow empty params (UNIT_CIRCLE)
   * @param {boolean} [opts.optionalColon] allow "[NAME]" as well as "[NAME:...]"
   * @param {boolean} [opts.pad]         tolerate whitespace around name/colon (FUNCTION_GRAPH)
   */
  function tokenRegex(name, opts) {
    const o = opts || {};
    const quant = o.star ? '*' : '+';
    const colon = o.optionalColon ? ':?' : ':';
    const body = o.pad
      ? '\\[\\s*' + name + '\\s*' + colon + '\\s*(' + PARAM + quant + ')\\]'
      : '\\[' + name + colon + '(' + PARAM + quant + ')\\]';
    return new RegExp(body, 'g');
  }

  /**
   * Make an unquoted value run to the next top-level ",key=" instead of the
   * first space or comma. The old value pattern was [^\s,]+, so a graph sent
   * as fn=3*(x - 4) - (2*x + 5) arrived as "3*(x" and plotted nothing. Commas
   * inside (...) or [...] belong to the value — max(x,2), points=[1,2].
   *
   * Returns the param string with every such value quoted, so the key=value
   * matcher in inlineChatVisuals.parseParams reads it whole. Already-quoted
   * and bracketed values pass through untouched.
   */
  function quoteBareValues(paramStr) {
    const s = String(paramStr || '');
    const parts = [];
    let depth = 0; let quote = null; let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(' || c === '[') depth++;
      else if ((c === ')' || c === ']') && depth > 0) depth--;
      else if (c === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    }
    parts.push(s.slice(start));

    // A piece with no "key=" continues the previous value (fn=a,b is rare but
    // was never a key either).
    const merged = [];
    for (const piece of parts) {
      if (/^\s*\w+\s*=/.test(piece) || !merged.length) merged.push(piece);
      else merged[merged.length - 1] += ',' + piece;
    }
    return merged.map((piece) => {
      const m = piece.match(/^(\s*\w+)\s*=\s*([\s\S]*?)\s*$/);
      if (!m) return piece;
      const v = m[2];
      if (!/\s/.test(v) || /^["'[]/.test(v) || v.includes('"')) return piece;
      return m[1] + '="' + v + '"';
    }).join(',');
  }

  /**
   * The fractions named by a [FRACTION:compare=2/3,3/4] tag.
   *
   * The key=value matcher stops an unquoted value at the first comma, so
   * "compare=2/3,3/4" used to arrive as "2/3" alone: the comparison picture
   * drew ONE bar (2026-11-23 — the tutor said "notice the bars are split into
   * different numbers of pieces" over a single solid bar). This reads the list
   * straight from the raw params, quoted or bracketed or bare.
   *
   * Only what a bar model can show is returned (FRACTION_LIMITS, below):
   * whole-number parts, at most six fractions, a denominator of 1–20. A
   * fraction bigger than one whole is drawn as several whole bars (5/4 = one
   * full bar and a quarter of the next), up to three wholes — and then every
   * denominator in the list must be 12 or less, because each whole bar is a
   * third as wide. If ANY entry is something else the answer is [] — a picture
   * of some of the fractions the tutor named is a wrong picture.
   *
   * Until 2026-11-25 anything over one whole, and a fifth fraction, drew
   * nothing — in the signed-in chat too, where the tutor's "notice the bars…"
   * then stood over no bars. The limits are also stated to the tutor
   * (utils/visualCapabilities.js, pipeline/visualDirective.js): change them
   * there when they change here.
   *
   * @returns {Array<{num:number, denom:number}>}
   */
  const FRACTION_LIMITS = { count: 6, denom: 20, wholes: 3, improperDenom: 12 };

  function fractionList(paramStr) {
    const m = String(paramStr || '').match(/\bcompare\s*=\s*["'\[]?\s*([\d\s/,]+?)\s*["'\]]?\s*(?:,\s*[A-Za-z_]\w*\s*=|$)/);
    if (!m) return [];
    const items = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (items.length === 0 || items.length > FRACTION_LIMITS.count) return [];
    const out = [];
    let improper = false;
    for (let i = 0; i < items.length; i++) {
      const f = items[i].match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
      if (!f) return [];
      const num = Number(f[1]); const denom = Number(f[2]);
      if (denom < 1 || denom > FRACTION_LIMITS.denom || num > FRACTION_LIMITS.wholes * denom) return [];
      if (num > denom) improper = true;
      out.push({ num: num, denom: denom });
    }
    if (improper && out.some(function (f) { return f.denom > FRACTION_LIMITS.improperDenom; })) return [];
    return out;
  }

  return { PARAM: PARAM, tokenRegex: tokenRegex, quoteBareValues: quoteBareValues, fractionList: fractionList, FRACTION_LIMITS: FRACTION_LIMITS };
}));
