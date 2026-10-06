// utils/actBootcampSeed.js
//
// Turn a SCORED ACT practice test into the ACT-prep course's starting state:
// open on the highest-leverage weak domain, stash the plan, and build the
// missed-items review queue (the bootcamp "work" phase) with transfer practice.
//
// This used to live inline in routes/actTest.js /complete, which meant the
// queue was built only when the student was ALREADY enrolled at the moment
// they submitted. A test taken first and an enrollment made second (now the
// normal path for anyone who takes the public no-account test and then signs
// up) satisfied the course's baseline gate but left the bootcamp empty: the
// course skipped the baseline and had nothing to review. One function, three
// callers — /complete, /claim, and a fresh act-prep enrollment — so they
// cannot drift apart.

const ActTestSession = require('../models/actTestSession');
const Problem = require('../models/problem');
const { buildActPlan, planStartModule, planSummary } = require('./actBootcampPlan');
const { isIncompleteAttempt } = require('./actProgress');

// Every problemId this student has ever been served, across ALL their ACT test
// sessions (any status — an item shown in an abandoned test still "burns" it).
// This is the seen-ledger the assembler excludes so no re-test ever repeats an
// item. Computed on the fly from the sessions themselves — no separate store to
// drift out of sync.
async function seenProblemIdsForUser(userId) {
  try {
    const sessions = await ActTestSession.find({ userId }).select('items.problemId').lean();
    const seen = new Set();
    for (const s of sessions) {
      for (const it of (s.items || [])) if (it && it.problemId) seen.add(it.problemId);
    }
    return [...seen];
  } catch (err) {
    console.error('[actTest] seen-ledger lookup failed (non-fatal, no exclusion):', err.message);
    return [];   // fail open: better a possible repeat than a blocked test
  }
}

/** Per-category correct/total from a graded session's responses. */
function categoryTally(session) {
  const byCategory = {};
  for (const r of ((session && session.responses) || [])) {
    const c = (r && r.category) || 'unknown';
    byCategory[c] = byCategory[c] || { correct: 0, total: 0 };
    byCategory[c].total += 1;
    if (r && r.correct) byCategory[c].correct += 1;
  }
  return byCategory;
}

/**
 * Point an act-prep CourseSession at a scored test. Mutates `cs` (the caller
 * saves it). Never throws for a review-queue problem — the jump and plan are
 * still worth keeping without one.
 *
 * @param {Object} cs       act-prep CourseSession document
 * @param {Object} session  completed ActTestSession (items + graded responses)
 * @param {Object} opts     { userId, plan? } — plan defaults to one built from the session
 */
async function seedBootcampFromTest(cs, session, { userId, plan } = {}) {
  const actPlan = plan || buildActPlan(categoryTally(session));
  const jumpTo = planStartModule(cs, actPlan);
  if (jumpTo) cs.currentModuleId = jumpTo;
  cs.diagnosticPlan = planSummary(actPlan, session.completedAt);

  // ── Build the missed-items review queue (bootcamp "work" phase) ──
  // The student's misses become the material: the course now walks them
  // through each wrong/skipped question — diagnose, reteach if needed,
  // strategy — instead of a fixed scaffold. Look up the correct answer +
  // explanation for each missed problem, build the ranked queue, and store
  // it so the chat prompt can present one miss at a time and advance.
  try {
    const { buildReviewQueue, pickTransferItems, keepGroupFinalTransfersOnly } = require('./actReview');
    const missedIds = (session.responses || [])
      .filter((r) => r && r.problemId && (r.correct === false || r.skipped === true))
      .map((r) => r.problemId);
    const problemsById = {};
    if (missedIds.length) {
      const probs = await Problem.find({ problemId: { $in: missedIds } })
        .select('problemId correctOption answer explanation prompt options svg figureAlt').lean();
      probs.forEach((p) => { problemsById[p.problemId] = p; });
    }
    const queue = buildReviewQueue(session, problemsById);

    // ── Transfer practice: 2 FRESH items per missed skill ──
    // Reviewing the missed question teaches that question. Attempting new
    // problems on the same skill is what shows the gap actually closed —
    // without it a student agrees with the explanation and misses the same
    // skill on the re-test. Chosen here (once) rather than per turn so the
    // practice does not reshuffle mid-conversation, and excluded against
    // the same seen-ledger the assembler uses so practice is never a
    // question they have already been served.
    try {
      const skills = [...new Set(queue.map((q) => q.skillId).filter(Boolean))];
      if (skills.length) {
        const seen = new Set(await seenProblemIdsForUser(userId));
        const pool = await Problem.find({
          skillId: { $in: skills },
          isActive: true,
          problemId: { $nin: [...seen] },
          // Practice is posed in chat, as text. An item answered from a
          // figure cannot be posed there, so it is never chosen as practice.
          svg: { $in: [null, ''] },
        }).select('problemId skillId difficulty').lean();
        const bySkill = {};
        pool.forEach((p) => { (bySkill[p.skillId] = bySkill[p.skillId] || []).push(p); });
        // One item serves one miss: claim as we go so two misses on the
        // same skill do not both hand out the same practice problem.
        const claimed = new Set();
        queue.forEach((q) => {
          const cands = (bySkill[q.skillId] || []).filter((c) => !claimed.has(c.problemId));
          q.transferIds = pickTransferItems(cands, q, 2);
          q.transferIds.forEach((id) => claimed.add(id));
        });
        // The queue is grouped by skill, so practice fires once at the END
        // of each group. Selecting per miss first is deliberate: the last
        // miss in a group carries the practice matched to ITS difficulty,
        // and the ids claimed by earlier misses are released rather than
        // handed out as six problems on one skill.
        keepGroupFinalTransfersOnly(queue).forEach((m, i) => { queue[i].transferIds = m.transferIds; });
      }
    } catch (transferErr) {
      // Practice is an enhancement to review, never a precondition for it.
      console.error('[actTest] transfer-item selection error (non-fatal):', transferErr.message);
    }
    // Round = which completed attempt this is, counted from the tests
    // themselves — NOT bootcamp.round + 1. A test taken before enrolling
    // scores and shows in /history but never touched cs.bootcamp, so the
    // old increment under-counted: "Round 1" sitting next to a
    // two-attempt score trend on the bootcamp card.
    let round = ((cs.bootcamp && cs.bootcamp.round) || 0) + 1;
    try {
      // Only real attempts count — a legacy auto-submitted 3-answer form
      // is not a round of the bootcamp.
      const completedDocs = await ActTestSession.find({ userId, status: 'completed' })
        .select('status startedAt completedAt timeLimitMinutes items.position responses.answer').lean();
      const completed = completedDocs.filter((s) => !isIncompleteAttempt(s)).length;
      if (completed > 0) round = completed;   // this session is already saved as completed
    } catch (_countErr) { /* keep the increment fallback */ }
    cs.bootcamp = queue.length
      ? { phase: 'review', round, testSessionId: String(session._id), queue, index: 0 }
      : { phase: 'reassess', round, testSessionId: String(session._id), queue: [], index: 0 };
    cs.markModified('bootcamp');
  } catch (reviewErr) {
    console.error('[actTest] review-queue build error (non-fatal):', reviewErr.message);
  }
  return cs;
}

/**
 * A NEW act-prep enrollment by a student who already has a scored test: seed
 * the bootcamp from their latest real attempt, so the course opens on
 * reviewing those misses instead of on an empty loop. Returns true when it
 * seeded. No-op (false) when there is no qualifying test or the bootcamp
 * already has a phase.
 */
async function seedBootcampFromLatestTest(cs, userId) {
  if (!cs || (cs.bootcamp && cs.bootcamp.phase)) return false;
  const completed = await ActTestSession.find({ userId, status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(5);
  const latest = completed.find((s) => !isIncompleteAttempt(s));
  if (!latest) return false;
  await seedBootcampFromTest(cs, latest, { userId });
  return true;
}

module.exports = {
  seenProblemIdsForUser,
  categoryTally,
  seedBootcampFromTest,
  seedBootcampFromLatestTest,
};
