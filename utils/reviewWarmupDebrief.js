// THE WARM-UP'S CLOSING LINE, in the tutor's voice.
//
// The review warm-up (public/js/floating-review.js) runs in a widget on top of
// the transcript: the tutor's greeting offers it, the student does three quick
// problems, a results card appears — and then nothing. The widget closed with
// `classList.remove('active')` and the tutor who had just said "want a quick
// warm-up?" never said another word until the student typed. Same silence the
// Growth Check used to end on (utils/growthSummary.js); same fix — a debrief
// the client asks for on hand-back, delivered as a normal tutor message.
//
// The results arrive from the client, so this module also decides what the
// server will believe: a bounded list of {skillId, correct, skipped}, names
// resolved on the server (utils/studentLabels.js), never text the browser sent.
// Open chat is the student's lead, so the debrief suggests ONE next step and
// starts nothing.

const { studentLabel } = require('./studentLabels');

const MAX_RESULTS = 10;
const SKILL_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

/**
 * Reduce whatever the client posted to the facts the tutor may speak about.
 * Unknown shapes are dropped, not guessed at; an empty list means "nothing
 * was answered", which the caller treats as nothing owed.
 *
 * @param {unknown} raw  req.body.reviewWarmupDebrief
 * @returns {{ total:number, answered:number, correct:number, skipped:number,
 *             held:string[], rusty:string[], skippedNames:string[], stoppedEarly:boolean } | null}
 */
function normalizeWarmupResults(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const list = Array.isArray(raw.results) ? raw.results.slice(0, MAX_RESULTS) : [];

  const held = [];
  const rusty = [];
  const skippedNames = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const skillId = typeof r.skillId === 'string' && SKILL_ID_RE.test(r.skillId) ? r.skillId : null;
    // A row with no usable id still counts toward the score, but the tutor
    // can't name it — "one of them" is what the fallback text says.
    const name = skillId ? studentLabel(skillId) : null;
    if (r.skipped === true) {
      if (name) skippedNames.push(name);
      continue;
    }
    if (r.correct === true) { if (name) held.push(name); }
    else if (r.correct === false) { if (name) rusty.push(name); }
  }

  const answeredRows = list.filter(r => r && typeof r === 'object' && r.skipped !== true
    && (r.correct === true || r.correct === false));
  const skippedRows = list.filter(r => r && typeof r === 'object' && r.skipped === true);
  const answered = answeredRows.length;
  const correct = answeredRows.filter(r => r.correct === true).length;
  const total = answered + skippedRows.length;
  if (total === 0) return null;

  const planned = Number.isInteger(raw.planned) && raw.planned > total && raw.planned <= MAX_RESULTS * 2
    ? raw.planned
    : total;

  return {
    total,
    planned,
    answered,
    correct,
    skipped: skippedRows.length,
    held: dedupe(held),
    rusty: dedupe(rusty),
    skippedNames: dedupe(skippedNames),
    stoppedEarly: planned > total,
  };
}

function dedupe(names) {
  return [...new Set(names)];
}

function listNames(names, fallback) {
  if (!names.length) return fallback;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The system instruction that turns the facts into the tutor's line.
 */
function buildWarmupDebriefInstruction(summary) {
  const rustyLine = summary.rusty.length
    ? `- Got rusty (answered wrong): ${summary.rusty.join(', ')}.`
    : '- Got rusty: none.';
  const heldLine = summary.held.length
    ? `- Still solid (answered right): ${summary.held.join(', ')}.`
    : '- Still solid: none recorded.';
  const skippedLine = summary.skippedNames.length
    ? `- Skipped: ${summary.skippedNames.join(', ')}.`
    : '';
  const earlyNote = summary.stoppedEarly
    ? `\n- They stopped after ${summary.total} of ${summary.planned} problems. That is fine — do NOT guilt them or ask them to finish.`
    : '';

  const nextStep = summary.rusty.length
    ? `offer to shore up ${listNames(summary.rusty, 'the rusty one')} right now`
    : summary.answered === 0
      ? 'offer to come back to those skills another day'
      : 'offer to pick up whatever they came here to work on';

  return `The student just finished a quick spaced-review warm-up in the practice widget, outside this chat, and is back in the conversation. Close the loop now — you offered the warm-up, so react to how it went.

WARM-UP RESULTS (facts — use them as-is, do not alter or invent numbers or skills):
- ${summary.correct} of ${summary.answered} answered correctly${summary.skipped ? `, ${summary.skipped} skipped` : ''}.
${heldLine}
${rustyLine}${skippedLine ? `\n${skippedLine}` : ''}${earlyNote}

How to deliver it, in YOUR voice:
1. React to the result specifically and warmly — name the skill(s), not the score. If something got rusty, say so plainly and without drama; a skill fading is normal and is exactly why the warm-up exists.
2. End with EXACTLY ONE suggested next step: ${nextStep}. It is a suggestion — offer it, then make clear they're in the driver's seat (e.g. "...or we can jump into whatever you brought today"). Do NOT start that activity yourself, do NOT ask a math question now, and do NOT list multiple options.
Keep it to 2-3 sentences. No "the system", no "the widget", no percentages.`;
}

/**
 * Deterministic fallback when the LLM is unavailable.
 */
function fallbackWarmupDebriefText(summary, firstName) {
  const name = firstName ? `${firstName}, ` : '';
  if (summary.answered === 0) {
    return `${name}no problem — we'll come back to those another day. What do you want to work on now?`;
  }
  if (summary.rusty.length === 0) {
    return `Nice, ${name}${listNames(summary.held, 'everything')} held up — still solid. Want to keep going with something new, or pick up what you came here for?`;
  }
  const rusty = listNames(summary.rusty, 'one of them');
  const heldClause = summary.held.length ? `${listNames(summary.held, '')} held up, but ` : '';
  return `${name}${heldClause}${rusty} got a little rusty — totally normal, that's what the warm-up is for. Want to shore that up right now, or jump into whatever you brought today?`;
}

module.exports = {
  normalizeWarmupResults,
  buildWarmupDebriefInstruction,
  fallbackWarmupDebriefText,
  MAX_RESULTS,
};
