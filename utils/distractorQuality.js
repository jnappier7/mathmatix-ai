/* ============================================================
   distractorQuality.js — detect broken multiple-choice options
   before they reach a student.

   Motivated by QA P0-3: the Starting Point screener served
   questions whose distractors were never authored, so they
   fell back to placeholder text ("Wrong 1", "Wrong 2", "Wrong
   3") or were the wrong type entirely (integer distractors for
   a sub-1 fraction answer, so the one fraction option gave it
   away). A test-savvy student could place well without knowing
   the math.

   Same discipline as the JSON-envelope leak (P0-1): never render
   an un-authored placeholder to the user. This module is the
   shared detector used in three places:
     - routes/screener.js  — skip a broken question at serve time
     - scripts/checkDistractorQuality.js — read-only bank audit
     - scripts/fixPlaceholderDistractors.js — backfill/deactivate

   It is intentionally HIGH-PRECISION: every check flags a defect
   a human would agree is broken, so the serve-time guard can act
   on it without wrongly dropping good questions. "Answer-
   revealing option text" (e.g. an option written as "0/n = 0")
   is NOT auto-detected here — it needs content/LLM review — so we
   don't risk false positives on it.
   ============================================================ */

'use strict';

// "Wrong", "Wrong 1", "Wrong 3", "wrong  2 " — the un-authored
// distractor placeholder. Anchored so it never matches a real
// answer that merely contains the word "wrong".
const PLACEHOLDER_RE = /^\s*wrong\s*\d*\s*$/i;

function optionText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'object') return String(opt.text ?? '').trim();
  return String(opt).trim();
}

function isPlaceholderOption(opt) {
  return PLACEHOLDER_RE.test(optionText(opt));
}

// Integer literal: "12", "-3".
function looksInteger(s) {
  return /^-?\d+$/.test(String(s).trim());
}

// A value that is genuinely fractional (not an integer in disguise):
// a proper fraction "11/20" or a decimal with a fractional part "0.05".
function looksFractionalOrDecimal(s) {
  const t = String(s).trim();
  const frac = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const n = parseInt(frac[1], 10);
    const d = parseInt(frac[2], 10);
    return d !== 0 && n % d !== 0; // proper (non-integer) fraction
  }
  if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t) % 1 !== 0;
  return false;
}

// Which option index is correct — prefer the stored letter, fall
// back to matching option text against the answer value.
function correctOptionIndex(problem) {
  const options = Array.isArray(problem.options) ? problem.options : [];
  const co = problem.correctOption;
  if (typeof co === 'string' && /^[a-fA-F]$/.test(co.trim())) {
    const idx = co.trim().toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  const answerValue = String(problem.answer?.value ?? problem.answer ?? '').trim().toLowerCase();
  if (answerValue) {
    for (let i = 0; i < options.length; i++) {
      if (optionText(options[i]).toLowerCase() === answerValue) return i;
    }
  }
  return null;
}

/**
 * Assess the multiple-choice options of a problem.
 *
 * @param {object} problem - a Problem doc or plain object with
 *   { answerType, options:[{label,text}], answer:{value}, correctOption }
 * @returns {{ ok: boolean, issues: Array<{code:string, detail?:string}> }}
 *   `ok` is true when nothing is wrong. For non-MC problems with no
 *   options, always `ok` (nothing to assess).
 */
function assessOptions(problem) {
  const issues = [];
  const options = Array.isArray(problem.options) ? problem.options : [];
  const isMC = problem.answerType === 'multiple-choice' || options.length > 0;

  if (!isMC) return { ok: true, issues };

  if (options.length < 2) {
    issues.push({ code: 'too_few_options', detail: `${options.length} option(s)` });
    return { ok: false, issues };
  }

  const texts = options.map(optionText);

  // 1) Un-authored placeholder distractors.
  const placeholders = texts.filter((t) => PLACEHOLDER_RE.test(t));
  if (placeholders.length) {
    issues.push({ code: 'placeholder_option', detail: placeholders.join(', ') });
  }

  // 2) Structural defects.
  if (texts.some((t) => t === '')) issues.push({ code: 'blank_option' });
  const lowered = texts.map((t) => t.toLowerCase());
  if (new Set(lowered).size < lowered.length) {
    issues.push({ code: 'duplicate_option' });
  }

  // 3) Wrong-type distractors: the correct answer is a proper
  //    fraction/decimal but EVERY distractor is a plain integer, so
  //    the odd-one-out is trivially identifiable without the math.
  const correctIdx = correctOptionIndex(problem);
  if (correctIdx != null) {
    const correctText = texts[correctIdx];
    const distractors = texts.filter((_, i) => i !== correctIdx);
    if (
      looksFractionalOrDecimal(correctText) &&
      distractors.length > 0 &&
      distractors.every(looksInteger)
    ) {
      issues.push({
        code: 'wrong_type_distractors',
        detail: `fraction/decimal answer "${correctText}" among integer-only distractors [${distractors.join(', ')}]`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// Convenience predicate for hot paths.
function hasBadDistractors(problem) {
  return !assessOptions(problem).ok;
}

module.exports = {
  PLACEHOLDER_RE,
  assessOptions,
  isPlaceholderOption,
  hasBadDistractors,
  // exported for tests / scripts
  correctOptionIndex,
  looksFractionalOrDecimal,
  looksInteger,
};
