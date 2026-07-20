/**
 * The mastery ladder: learn it -> prove it -> teach it.
 *
 * WHY THIS FILE IS THE ONLY WRITER
 * --------------------------------
 * Rung state was previously spread across masteryEngine, the pipeline persist
 * stages and several routes, and no single place owned the transition. The
 * visible symptom: `masteryEngine.updateSkillMastery` updates the four pillars
 * and the score but never assigns `status`, so the UI invented a "mastered"
 * label off ~5 problems in one week and rendered "100% mastered" beside a
 * "Continue" button for a skill the tutor then offered to teach.
 *
 * So: every rung change goes through `advanceRung` or `demoteRung`, every change
 * records the evidence that justified it, and the gates live here rather than in
 * the caller. A rung we cannot produce a receipt for is a claim we should not be
 * making to a student or a parent.
 *
 * THE RUNGS
 *   none    - not started, or knocked back down
 *   learned - worked through with the tutor (I-do / we-do / you-do)
 *   proved  - demonstrated independently: a challenge run, a fluency run, or
 *             enough accumulated practice to constitute the same evidence.
 *             A student may skip `learned` entirely and go straight here — that
 *             is the test-out path, for skills they already own.
 *   taught  - explained it back while the tutor played the confused student.
 *
 * INFERENCE IS NOT AN ACHIEVEMENT
 * `proved` may also be granted by prerequisite closure, recorded as
 * provenBy: 'inference'. That clears the skill and fills the board — it does not
 * earn the top rung, because the student never demonstrated anything. Hence
 * `canAdvance(entry, 'taught')` is false while provenBy === 'inference'.
 */

const RUNGS = ['none', 'learned', 'proved', 'taught'];

// Evidence gates. Deliberately aligned with the existing pillar thresholds in
// models/user.js so the two systems cannot drift into disagreeing.
const GATES = {
  PROVE_MIN_ACCURACY: 0.9,   // pillars.accuracy.threshold
  PROVE_MIN_ATTEMPTS: 4,     // a "5 problems, no hints" run, allowing one miss
  PROVE_MAX_HINTS: 3,        // pillars.independence.hintThreshold
  // Practice proves by accumulation rather than by a single run, so it must also
  // show transfer — the same bar the four-pillar model always intended, minus
  // retention, which is now decay rather than a gate.
  PRACTICE_MIN_CONTEXTS: 3,  // pillars.transfer.contextsRequired
  // Ambient practice needs MORE evidence than a challenge run, not less. A
  // challenge is controlled: opt-in, five problems, no hints, one shot. Practice
  // is noisy — mixed difficulty, repeats, help available — so four clean
  // attempts is not the same claim. The production bug lived at exactly this
  // size ("4 first-try wins · 5 practiced this week").
  PRACTICE_MIN_ATTEMPTS: 6,
  TEACH_MIN_RUBRIC: 3,       // on the 0-4 teach-back rubric
  TEACH_RUBRIC_MAX: 4
};

const rungIndex = (rung) => {
  const i = RUNGS.indexOf(rung);
  return i === -1 ? 0 : i;
};

/** The rung an entry is currently on, tolerant of legacy entries with no `rung`. */
function currentRung(entry) {
  if (!entry) return 'none';
  if (entry.rung && RUNGS.includes(entry.rung)) return entry.rung;
  // Legacy entries predate the ladder. Read their old status conservatively:
  // 'mastered' becomes 'proved', anything in progress becomes 'learned'. We
  // never infer 'taught' from legacy data — nothing in the old model recorded it.
  if (entry.status === 'mastered') return 'proved';
  if (['learning', 'practicing', 'needs-review', 're-fragile'].includes(entry.status)) return 'learned';
  return 'none';
}

/** True when a rung clears prerequisites for the skills above it. */
function clearsPrerequisites(entry) {
  return rungIndex(currentRung(entry)) >= rungIndex('proved');
}

/** True when the rung was granted by closure rather than demonstrated. */
function isInferred(entry) {
  return !!entry && entry.provenBy === 'inference';
}

/**
 * Is `to` a legal next rung for this entry, given how it would be earned?
 * Returns { ok, reason } so callers can surface why a challenge was refused.
 */
function canAdvance(entry, to, via) {
  if (!RUNGS.includes(to) || to === 'none') {
    return { ok: false, reason: `not a target rung: ${to}` };
  }
  const from = currentRung(entry);
  if (rungIndex(to) <= rungIndex(from)) {
    return { ok: false, reason: `already at ${from}` };
  }

  if (to === 'learned') {
    if (via !== 'lesson') return { ok: false, reason: 'learned is earned by working through the lesson' };
    return { ok: true };
  }

  if (to === 'proved') {
    if (!['challenge', 'fluency', 'practice', 'inference'].includes(via)) {
      return { ok: false, reason: `cannot prove a skill via ${via}` };
    }
    return { ok: true };
  }

  // to === 'taught'
  if (via !== 'teachback') return { ok: false, reason: 'taught is earned by teaching it back' };
  if (from !== 'proved') return { ok: false, reason: 'prove it before you teach it' };
  if (isInferred(entry)) {
    // The board shows this skill as cleared, but nothing was demonstrated. Ask
    // for the demonstration before handing over the top rung.
    return { ok: false, reason: 'this skill was cleared from above — prove it directly first' };
  }
  return { ok: true };
}

/**
 * Does the supplied evidence actually support the claim? Separate from
 * `canAdvance` (which governs ordering) so a caller can tell a student
 * "you may attempt this" and "you did not clear the bar" as different things.
 */
function evidenceSupports(to, via, evidence = {}) {
  if (to === 'learned' || via === 'inference') return { ok: true };

  if (to === 'proved' && via === 'challenge') {
    const { correct = 0, total = 0, hintsUsed = 0 } = evidence;
    if (total < GATES.PROVE_MIN_ATTEMPTS) {
      return { ok: false, reason: `a challenge run needs at least ${GATES.PROVE_MIN_ATTEMPTS} problems` };
    }
    if (hintsUsed > GATES.PROVE_MAX_HINTS) {
      return { ok: false, reason: `used ${hintsUsed} hints; proving allows ${GATES.PROVE_MAX_HINTS}` };
    }
    if (total === 0 || correct / total < GATES.PROVE_MIN_ACCURACY) {
      return { ok: false, reason: `accuracy below ${Math.round(GATES.PROVE_MIN_ACCURACY * 100)}%` };
    }
    return { ok: true };
  }

  if (to === 'proved' && via === 'practice') {
    // The accumulated pillar record IS the evidence. Stricter than a single
    // challenge run because practice naturally spans representations, so it is
    // fair to require the transfer the four-pillar model always asked for.
    const { correct = 0, total = 0, hintsUsed = 0, contexts = 0 } = evidence;
    if (total < GATES.PRACTICE_MIN_ATTEMPTS) {
      return { ok: false, reason: `only ${total} attempts so far` };
    }
    if (correct / total < GATES.PROVE_MIN_ACCURACY) {
      return { ok: false, reason: `accuracy below ${Math.round(GATES.PROVE_MIN_ACCURACY * 100)}%` };
    }
    if (hintsUsed > GATES.PROVE_MAX_HINTS) {
      return { ok: false, reason: `used ${hintsUsed} hints; proving allows ${GATES.PROVE_MAX_HINTS}` };
    }
    if (contexts < GATES.PRACTICE_MIN_CONTEXTS) {
      return { ok: false, reason: `seen in ${contexts} context(s); needs ${GATES.PRACTICE_MIN_CONTEXTS}` };
    }
    return { ok: true };
  }

  if (to === 'proved' && via === 'fluency') {
    // Speed is measured against the student's OWN baseline (see
    // utils/adaptiveFluency.js) — a negative z-score is faster than expected.
    // This is deliberately not an absolute time: the fluency engine exists so a
    // dyslexic student is not locked out of a rung by reading speed.
    const { fluencyZScore, accuracy } = evidence;
    if (typeof fluencyZScore !== 'number') return { ok: false, reason: 'no fluency measurement' };
    if (fluencyZScore > 0) return { ok: false, reason: 'slower than your own baseline' };
    if (typeof accuracy === 'number' && accuracy < GATES.PROVE_MIN_ACCURACY) {
      return { ok: false, reason: 'fast but not accurate enough' };
    }
    return { ok: true };
  }

  if (to === 'taught') {
    const { rubricScore } = evidence;
    if (typeof rubricScore !== 'number') return { ok: false, reason: 'teach-back was not scored' };
    if (rubricScore < GATES.TEACH_MIN_RUBRIC) {
      return { ok: false, reason: `explanation scored ${rubricScore}/${GATES.TEACH_RUBRIC_MAX}` };
    }
    return { ok: true };
  }

  return { ok: false, reason: `no evidence rule for ${via} -> ${to}` };
}

/**
 * Move a skill up the ladder. Mutates and returns the entry.
 * Result is reported on `entry.__rungResult` so callers can branch without a
 * second lookup; nothing persists that field.
 */
function advanceRung(entry, to, { via, evidence = {}, sourceSkillId, now = new Date() } = {}) {
  const target = entry || {};
  const from = currentRung(target);

  const legal = canAdvance(target, to, via);
  if (!legal.ok) {
    target.__rungResult = { changed: false, from, to, ...legal };
    return target;
  }
  const supported = evidenceSupports(to, via, evidence);
  if (!supported.ok) {
    target.__rungResult = { changed: false, from, to, ...supported };
    return target;
  }

  target.rung = to;
  target.provenBy = via;
  if (via === 'inference') {
    target.masteryType = 'inferred';
    target.inferredFrom = sourceSkillId;
    target.inferredDate = now;
  } else {
    target.masteryType = 'verified';
  }
  if (to === 'proved' || to === 'taught') {
    target.masteredDate = target.masteredDate || now;
  }
  if (to === 'learned' && !target.learningStarted) {
    target.learningStarted = now;
  }

  target.rungHistory = target.rungHistory || [];
  target.rungHistory.push({
    from,
    to,
    via,
    at: now,
    evidence: sourceSkillId ? { ...evidence, sourceSkillId } : evidence
  });

  target.__rungResult = { changed: true, from, to };
  return target;
}

/**
 * Knock a skill back down. Two callers matter:
 *   - retention decay (FSRS says it has gone stale)
 *   - contradiction (the student missed a skill we had cleared from above)
 *
 * Retention is decay, NOT a gate: proving grants the rung immediately and this
 * takes it away later if it does not hold. The previous model demanded a passed
 * retention check *before* mastery, which is why almost nothing legitimately
 * reached it.
 */
function demoteRung(entry, { to, reason, now = new Date() } = {}) {
  const target = entry || {};
  const from = currentRung(target);
  // Captured before anything is cleared — `provenBy` is wiped below, so asking
  // isInferred() afterwards would always say no.
  const wasInferred = isInferred(target);
  // An inference-granted rung is the cheapest claim we hold, so a contradiction
  // clears it entirely rather than leaving a half-truth on the board.
  const landing = to || (wasInferred ? 'none' : 'learned');

  if (rungIndex(landing) >= rungIndex(from)) {
    target.__rungResult = { changed: false, from, to: landing, reason: 'not a demotion' };
    return target;
  }

  target.rung = landing;
  target.provenBy = landing === 'none' ? undefined : target.provenBy;
  if (wasInferred) {
    // Flags the skill so a later inference pass knows this one has been wrong once.
    target.masteryType = 'fragile-inferred';
  }
  target.rungHistory = target.rungHistory || [];
  target.rungHistory.push({ from, to: landing, via: 'demotion', at: now, reason });
  target.__rungResult = { changed: true, from, to: landing, reason };
  return target;
}

/** Record that a student directly failed a skill, so inference cannot re-grant it. */
function markExplicitFailure(entry, { context, now = new Date() } = {}) {
  const target = entry || {};
  target.explicitlyFailed = true;
  target.failureDate = now;
  if (context !== undefined) target.failureContext = context;
  return demoteRung(target, { reason: 'missed it in live work', now });
}

module.exports = {
  RUNGS,
  GATES,
  currentRung,
  clearsPrerequisites,
  isInferred,
  canAdvance,
  evidenceSupports,
  advanceRung,
  demoteRung,
  markExplicitFailure
};
