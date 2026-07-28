'use strict';
/* ============================================================
   growthSummary.js — ONE student-readable answer to "what did my
   Growth Check just tell me, and what should I do next?"

   Two flows finish a growth check (the FloatingScreener via
   routes/screener.js, and the standalone page via routes/growthCheck.js)
   and BOTH used to end on a generic results card with no comparison to
   the previous level, no named skills, and no next step — while the chat
   intercept promised "come back here and we'll pick up where we left
   off." This module is the shared closure: both routes build the same
   summary object here, return it in their completion responses, and
   stash it as learningProfile.pendingGrowthCheckDebrief so the tutor
   can deliver it in-voice back in chat.

   Levels are derived from theta on BOTH sides of the comparison
   (thetaToGradeLevel(previousTheta) vs thetaToGradeLevel(newTheta)) so
   the "previous vs new" story can never disagree with the ability
   estimate the way a stale stored level string could.
   ============================================================ */

const { thetaToGradeLevel } = require('./catConfig');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Growth-status thresholds. Single source of truth — utils/growthCheck.js
 * (the standalone CAT) delegates here so the two flows can never drift.
 */
function summarizeGrowthStatus(thetaChange) {
  if (thetaChange > 0.3) {
    return { growthStatus: 'significant-growth', growthMessage: "Great progress! You've clearly been learning." };
  }
  if (thetaChange > 0.1) {
    return { growthStatus: 'some-growth', growthMessage: "Nice! You're moving in the right direction." };
  }
  if (thetaChange > -0.1) {
    return { growthStatus: 'stable', growthMessage: 'Holding steady. Keep practicing!' };
  }
  return { growthStatus: 'review-needed', growthMessage: 'Looks like some topics need a refresher.' };
}

/**
 * Look up student-facing names for a list of skillIds.
 * Returns [{ skillId, name }] in the input order, skipping unknowns is NOT
 * an option — an id with no catalog entry falls back to the id itself so a
 * missing seed never silently drops a skill from the story.
 */
async function resolveSkillRefs(skillIds = []) {
  const ids = [...new Set(skillIds.filter(Boolean))];
  if (ids.length === 0) return [];
  let byId = new Map();
  try {
    const Skill = require('../models/skill');
    const docs = await Skill.find({ skillId: { $in: ids } })
      .select('skillId displayName studentLabel')
      .lean();
    byId = new Map(docs.map(d => [d.skillId, d.studentLabel || d.displayName || d.skillId]));
  } catch (err) {
    // Name lookup is decoration — never let it sink the completion response.
    console.warn('[growthSummary] skill name lookup failed:', err.message);
  }
  return ids.map(skillId => ({ skillId, name: byId.get(skillId) || humanizeSkillId(skillId) }));
}

/** "alg1-solving-two-step-equations" → "solving two step equations" */
function humanizeSkillId(skillId) {
  return String(skillId)
    .replace(/^[a-z0-9]{1,6}-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || String(skillId);
}

/**
 * The three skill lists behind the completion moment, derived from what the
 * student actually did in this check plus what the new ability estimate opens
 * up. Shared by both growth-check flows so they tell the same story.
 *
 * confirmed      — tested and never missed
 * needsReview    — tested and missed at least once (skips don't count as misses)
 * newlyReachable — in the catalog band the new theta just unlocked, not already
 *                  mastered, not tested in this check
 *
 * @param {Object} o
 * @param {Array}  o.responses      session responses [{ skillId, correct, skipped }]
 * @param {Number} o.previousTheta
 * @param {Number} o.newTheta
 * @param {Iterable} [o.masteredSkillIds] skills to exclude from "newly reachable"
 * @param {Number} [o.limit] max skills per list (default 3)
 */
async function deriveSkillHighlights({
  responses = [],
  previousTheta = 0,
  newTheta = 0,
  masteredSkillIds = [],
  limit = 3,
}) {
  const perSkill = new Map();
  for (const r of responses) {
    if (!r || !r.skillId || r.skipped) continue;
    const cur = perSkill.get(r.skillId) || { attempts: 0, misses: 0 };
    cur.attempts++;
    if (!r.correct) cur.misses++;
    perSkill.set(r.skillId, cur);
  }

  const confirmedIds = [];
  const needsReviewIds = [];
  for (const [skillId, s] of perSkill) {
    if (s.misses > 0) needsReviewIds.push(skillId);
    else if (s.attempts > 0) confirmedIds.push(skillId);
  }

  // The band the new estimate just opened. When the student grew, that's
  // everything between the old and new ability; when they held steady it's the
  // stretch just past where they are now.
  const grew = newTheta - previousTheta > 0.05;
  const lower = grew ? previousTheta : newTheta - 0.5;
  const upper = newTheta + 0.3;

  const excluded = new Set([...masteredSkillIds, ...perSkill.keys()]);
  let reachableIds = [];
  try {
    const Skill = require('../models/skill');
    const docs = await Skill.find({
      isActive: true,
      irtDifficulty: { $gt: lower, $lte: upper },
      skillId: { $nin: [...excluded] },
    })
      .select('skillId irtDifficulty')
      .sort({ irtDifficulty: 1 })
      .limit(limit)
      .lean();
    reachableIds = docs.map(d => d.skillId);
  } catch (err) {
    console.warn('[growthSummary] reachable-skill lookup failed:', err.message);
  }

  const [confirmedSkills, needsReviewSkills, newlyReachableSkills] = await Promise.all([
    resolveSkillRefs(confirmedIds.slice(0, limit)),
    resolveSkillRefs(needsReviewIds.slice(0, limit)),
    resolveSkillRefs(reachableIds),
  ]);

  return { confirmedSkills, needsReviewSkills, newlyReachableSkills };
}

/**
 * Exactly ONE concrete next step, phrased as a suggestion the student can
 * take or leave (open chat is fully the student's lead — the tutor may
 * suggest, never launch).
 *
 * Priority: refresh what wobbled when the check says review-needed; else
 * step into newly-reachable territory; else patch the single miss; else a
 * stretch past what was confirmed.
 */
function pickSuggestedNextStep({ growthStatus, newLevel, confirmedSkills, needsReviewSkills, newlyReachableSkills }) {
  if (growthStatus === 'review-needed' && needsReviewSkills.length > 0) {
    const s = needsReviewSkills[0];
    return {
      kind: 'review',
      skillId: s.skillId,
      skillName: s.name,
      text: `Spend a few minutes brushing up on ${s.name} — that's the one that wobbled today.`,
    };
  }
  if (newlyReachableSkills.length > 0) {
    const s = newlyReachableSkills[0];
    return {
      kind: 'advance',
      skillId: s.skillId,
      skillName: s.name,
      text: `You're ready to try ${s.name} — say the word next time you're here and we'll take a crack at it.`,
    };
  }
  if (needsReviewSkills.length > 0) {
    const s = needsReviewSkills[0];
    return {
      kind: 'review',
      skillId: s.skillId,
      skillName: s.name,
      text: `One solid practice round on ${s.name} should lock it in — worth a revisit next session.`,
    };
  }
  if (confirmedSkills.length > 0) {
    const s = confirmedSkills[confirmedSkills.length - 1];
    return {
      kind: 'stretch',
      skillId: s.skillId,
      skillName: s.name,
      text: `You've got ${s.name} down cold — ask me for a challenge problem one notch harder next time.`,
    };
  }
  return {
    kind: 'continue',
    skillId: null,
    skillName: null,
    text: `Keep doing what you're doing — steady practice at the ${newLevel} level is exactly right.`,
  };
}

/**
 * The completion-moment payload. All skill lists are [{ skillId, name }].
 *
 * @param {Object} o
 * @param {Number} o.previousTheta  ability BEFORE this check (resolveTheta(user), read before any writes)
 * @param {Number} o.newTheta       ability the check converged on
 * @param {Number} o.accuracy       0-100
 * @param {Number} o.questionsAnswered
 * @param {Number} [o.durationMs]
 * @param {Array}  [o.confirmedSkills]      demonstrated correctly during the check
 * @param {Array}  [o.needsReviewSkills]    missed during the check
 * @param {Array}  [o.newlyReachableSkills] at/just past the new edge (frontier, ready, untested picks)
 */
function buildGrowthCheckSummary({
  previousTheta,
  newTheta,
  accuracy,
  questionsAnswered,
  durationMs = null,
  sessionId = null,
  rawNewTheta = null,
  levelHeld = false,
  confirmedSkills = [],
  needsReviewSkills = [],
  newlyReachableSkills = [],
}) {
  const thetaChange = round2(newTheta - previousTheta);
  const prev = thetaToGradeLevel(previousTheta);
  const next = thetaToGradeLevel(newTheta);

  // `newTheta` is what we ACT on — the guard (utils/growthGuard.js) may have
  // held back part of a drop. The STATUS, though, comes from what the check
  // actually measured: if the student struggled we say so and point at the
  // right skills, even while their level is protected. Damping the level must
  // not also mute the feedback.
  const statusChange = Number.isFinite(rawNewTheta)
    ? round2(rawNewTheta - previousTheta)
    : thetaChange;
  const { growthStatus, growthMessage } = summarizeGrowthStatus(statusChange);

  return {
    type: 'growth-check',
    sessionId,
    previousTheta: round2(previousTheta),
    newTheta: round2(newTheta),
    thetaChange,
    previousLevel: prev.gradeLevel,
    newLevel: next.gradeLevel,
    newLevelDescription: next.description,
    levelChanged: prev.gradeLevel !== next.gradeLevel,
    // The guard kept them at their level despite a measured drop. Student-
    // facing copy must not imply a fall that didn't happen.
    levelHeld: !!levelHeld,
    growthStatus,
    growthMessage,
    accuracy,
    questionsAnswered,
    durationMs,
    skillsConfirmed: confirmedSkills,
    needsReview: needsReviewSkills,
    newlyReachable: newlyReachableSkills,
    suggestedNextStep: pickSuggestedNextStep({
      growthStatus,
      newLevel: next.gradeLevel,
      confirmedSkills,
      needsReviewSkills,
      newlyReachableSkills,
    }),
  };
}

/** One human sentence for "where you were → where you are". */
function levelStoryLine(summary) {
  if (summary.levelChanged && summary.thetaChange > 0) {
    return `Last check you were working at the ${summary.previousLevel} level — you've moved up to ${summary.newLevel}.`;
  }
  if (summary.levelHeld) {
    return `You're staying at the ${summary.newLevel} level — today looked like an off day more than anything, so we'll shore a couple of things up rather than move you.`;
  }
  if (summary.levelChanged) {
    return `You're working at the ${summary.newLevel} level right now (down a step from ${summary.previousLevel} — totally normal, it just tells us where to focus).`;
  }
  if (summary.growthStatus === 'review-needed') {
    return `You're holding at the ${summary.newLevel} level — a couple of topics could use a refresher.`;
  }
  return `You're solid at the ${summary.newLevel} level — right where you should be.`;
}

/**
 * System-prompt instruction for the tutor's in-voice debrief (used by the
 * dedicated debrief turn AND by the greeting when the student finished the
 * check outside chat). The numbers are handed over verbatim with hard rules:
 * deliver, don't invent; suggest, don't launch.
 */
function buildDebriefInstruction(summary, { viaGreeting = false } = {}) {
  const confirmed = summary.skillsConfirmed.slice(0, 2).map(s => s.name).join(' and ');
  const opening = viaGreeting
    ? 'The student finished a Growth Check since you last spoke and is just arriving in chat. Fold the debrief below into your greeting — it IS the greeting. Skip any warm-up question this time.'
    : 'The student just finished their Growth Check and came straight back to chat. Deliver the debrief below now.';

  // The guard held their level despite a measured dip: the tutor must not
  // announce a drop that was never applied, and must not turn an off day into
  // a verdict about the student.
  const heldNote = summary.levelHeld
    ? `\n- IMPORTANT: they stayed at ${summary.newLevel}. Today read as an off day, not a real slide. Do NOT say they dropped, went down, or lost a level, and do NOT mention any lower level. Say they're holding steady and you want to shore up a couple of things.`
    : '';

  return `${opening}

GROWTH CHECK RESULTS (facts — use them as-is, do not alter or invent numbers or skills):
- Where they were: ${summary.previousLevel}. Where they are now: ${summary.newLevel}.${summary.levelChanged ? ' (level changed)' : ' (level unchanged)'}${heldNote}
- Read on progress: ${summary.growthStatus} — "${summary.growthMessage}"
- ${summary.questionsAnswered} questions, ${summary.accuracy}% correct.
- Skills they showed they've got: ${summary.skillsConfirmed.map(s => s.name).join(', ') || 'none recorded'}.
- Skills that wobbled: ${summary.needsReview.map(s => s.name).join(', ') || 'none'}.
- Now within reach: ${summary.newlyReachable.map(s => s.name).join(', ') || 'none recorded'}.
- THE one suggested next step: ${summary.suggestedNextStep.text}

How to deliver it, in YOUR voice:
1. Open with the result like a coach reading a race time — concrete and warm, not a report. Say where they were and where they are now (${summary.previousLevel} → ${summary.newLevel}${summary.levelChanged ? '' : ', holding steady'}).
2. Name ${confirmed ? `what they proved (${confirmed})` : 'what the check confirmed'} in one clause.
3. End with EXACTLY ONE suggested next step — the one above, rephrased naturally. It is a suggestion: offer it, then make clear they're in the driver's seat (e.g. "...or we can work on whatever you brought today"). Do NOT start that activity yourself, do NOT ask them a math question now, and do NOT list multiple options.
Keep the whole thing to 3-4 sentences. No percentile, no theta, no "the system". Never scold about a level drop — frame it as knowing where to focus.`;
}

/**
 * Deterministic fallback if the LLM call fails — the closure moment still
 * happens, just without persona flavor.
 */
function fallbackDebriefText(summary, firstName = null) {
  const name = firstName ? `${firstName}, that's` : "That's";
  const confirmed = summary.skillsConfirmed.length
    ? ` You showed me you've got ${summary.skillsConfirmed.slice(0, 2).map(s => s.name).join(' and ')}.`
    : '';
  return `${name} your Growth Check done — ${summary.questionsAnswered} questions, ${summary.accuracy}% correct. ${levelStoryLine(summary)}${confirmed} ${summary.suggestedNextStep.text} Or we can work on whatever you want — your call.`;
}

module.exports = {
  summarizeGrowthStatus,
  deriveSkillHighlights,
  resolveSkillRefs,
  humanizeSkillId,
  pickSuggestedNextStep,
  buildGrowthCheckSummary,
  levelStoryLine,
  buildDebriefInstruction,
  fallbackDebriefText,
};
