// routes/actTest.js
// Fixed-form ACT Math practice-test delivery — a parallel rail to the Starting
// Point screener (routes/screener.js), mirroring its per-item request/response
// contract so the same item-render UI can drive it. The form is assembled once
// (utils/actTestAssembler.js) into an original parallel test and frozen on the
// session; grading re-fetches each Problem server-side.
//
// Free by design (the ACT boot camp is a conversion on-ramp): mounted with
// isAuthenticated only. Deterministic grading — no AI at request time.
//
// Endpoints (all /api/act-test):
//   POST /start            → assemble + freeze a form, return sessionId + meta
//   GET  /problem           → serve the item at any position (free navigation)
//   POST /save-answer       → record/replace an answer or flag — NOT graded
//   GET  /overview          → per-question answered/flagged state (palette, resume)
//   POST /complete          → grade everything, raw→scaled score + breakdown
//   GET  /next-problem      → legacy one-way rail (stale cached clients only)
//   POST /submit-answer     → legacy one-way rail (stale cached clients only)
//
// Navigation matches the real ACT: within the timed section a student can move
// back and forth, change answers, and flag questions for review — so grading
// happens ONCE, at /complete, never mid-test. Mid-test responses store only the
// answer; returning correctness from save-answer would put the answer key one
// network-tab peek away from a student who can still change their answer.

const express = require('express');
const router = express.Router();

const ActTestSession = require('../models/actTestSession');
const Problem = require('../models/problem');
const { assembleForm, rawToScaled, getBlueprint } = require('../utils/actTestAssembler');
const { buildActPlan, planStartModule, planSummary } = require('../utils/actBootcampPlan');
const { normalizeOptions } = require('../utils/mcOptions');
const CourseSession = require('../models/courseSession');

// skillId → human-readable name, so the report can name EXACT weak skills
// (e.g. "Quadratic Equations") rather than just the broad category.
const ACT_SKILL_NAMES = (() => {
  // Broad category names — fallback if an item lacks a fine sub-skill tag.
  const map = {
    'act-number-quantity': 'Number & Quantity',
    'act-algebra': 'Algebra',
    'act-functions': 'Functions',
    'act-geometry': 'Geometry',
    'act-statistics-probability': 'Statistics & Probability',
    'act-integrating-essential-skills': 'Integrating Essential Skills',
  };
  // Fine-grained skill names generated from the Fable bank's per-item `skill`
  // tags (scripts/ingestFableActItems.py) — e.g. act-quadratic-equations →
  // "Quadratic equations". Lets the report name EXACT weak skills.
  try {
    const fine = require('../seeds/act-skill-names.json');
    for (const [id, name] of Object.entries(fine)) map[id] = name;
  } catch { /* fine-grained names optional */ }
  // Legacy prep-skill catalog, if present (superset of names).
  try {
    const seed = require('../seeds/skills-act-math-prep.json');
    const arr = Array.isArray(seed) ? seed : (seed.skills || []);
    for (const s of arr) map[s.skillId] = s.displayName || s.skillId;
  } catch { /* optional */ }
  return map;
})();

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

// Seconds left on the section clock, anchored to startedAt — NOT to whenever
// the client happened to reopen the page. The real ACT has no pause; without
// this anchor, closing the tab and resuming restarted the full hour.
function secondsRemaining(session) {
  const elapsedMs = Date.now() - new Date(session.startedAt).getTime();
  return Math.max(0, Math.round((session.timeLimitMinutes * 60000 - elapsedMs) / 1000));
}

// ── POST /start ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  return res.status(404).json({ message: 'Use POST /api/act-test/start' });
});

router.post('/start', async (req, res) => {
  try {
    const userId = req.user._id;
    const { restart } = req.body || {};

    // Resume an in-progress test unless restarting.
    if (!restart) {
      const active = await ActTestSession.getActiveSession(userId);
      if (active && active.items.length > 0) {
        return res.json({
          sessionId: active._id,
          resumed: true,
          totalItems: active.items.length,
          answered: active.responses.length,
          timeLimitMinutes: active.timeLimitMinutes,
          remainingSeconds: secondsRemaining(active),
        });
      }
    }

    // Abandon any stale in-progress sessions before starting fresh.
    await ActTestSession.updateMany(
      { userId, status: 'in_progress' },
      { $set: { status: 'abandoned' } }
    );

    const blueprint = getBlueprint();
    const seed = `${userId}-${Date.now()}`;
    // Every re-test must be FRESH — no item this student has already been served
    // (any prior session) may reappear, or the re-test measures memory of the
    // question, not the skill. Exclude their whole seen-history.
    const excludeIds = await seenProblemIdsForUser(userId);
    const form = await assembleForm({ seed, excludeIds });

    if (form.coverage.filled === 0) {
      if (excludeIds.length > 0) {
        // Not empty — EXHAUSTED. This student has now seen every item the bank
        // can offer for the blueprint. Honest signal, distinct from "unseeded",
        // so the UI can say "you've worked through everything" and content gen
        // can be prioritized. Never silently re-serve seen items.
        return res.status(409).json({
          message: "You've worked through every ACT practice question we have — nice. Fresh questions are being added.",
          exhausted: true,
          seenCount: excludeIds.length,
          coverage: form.coverage,
        });
      }
      // Honest failure: the ACT item bank isn't populated yet. The gaps array
      // is the generation worklist (skill + difficulty per missing slot).
      return res.status(503).json({
        message: 'The ACT practice-test item bank is not populated yet.',
        coverage: form.coverage,
        needsGeneration: form.gaps.length,
      });
    }

    const session = await ActTestSession.create({
      userId,
      testId: blueprint.testId,
      seed: form.meta.seed,
      items: form.items,
      timeLimitMinutes: blueprint.timeLimitMinutes,
      coverage: form.coverage,
    });

    return res.json({
      sessionId: session._id,
      started: true,
      totalItems: form.items.length,
      timeLimitMinutes: blueprint.timeLimitMinutes,
      remainingSeconds: blueprint.timeLimitMinutes * 60,
      coverage: form.coverage,           // surfaces partial coverage honestly
    });
  } catch (err) {
    console.error('[actTest] start error:', err.message);
    return res.status(500).json({ message: 'Could not start the practice test.' });
  }
});

// ── GET /next-problem?sessionId= ────────────────────────────
router.get('/next-problem', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    if (session.currentIndex >= session.items.length) {
      return res.json({ nextAction: 'complete' });
    }

    const item = session.items[session.currentIndex];
    return res.json({
      problem: {
        problemId: item.problemId,
        content: item.content,
        svg: item.svg,
        skillId: item.skillId,
        category: item.category,
        answerType: item.answerType,
        // The assembler already normalizes, but sessions started before it did
        // hold raw options — and serving those stored labels while compareAnswer
        // resolves positionally is exactly the disagreement that misgrades.
        options: normalizeOptions(item.options),
        questionNumber: item.position,
        progress: {
          current: session.currentIndex + 1,
          total: session.items.length,
          percentComplete: Math.round(((session.currentIndex) / session.items.length) * 100),
        },
      },
    });
  } catch (err) {
    console.error('[actTest] next-problem error:', err.message);
    return res.status(500).json({ message: 'Could not load the next question.' });
  }
});

// ── GET /problem?sessionId=&position= ───────────────────────
// Serve the item at ANY position (1-based), plus the student's saved response
// for it, so revisiting a question shows their current selection. This is what
// makes back-navigation and answer review possible.
router.get('/problem', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    const position = parseInt(req.query.position, 10);
    if (!Number.isInteger(position) || position < 1 || position > session.items.length) {
      return res.status(400).json({ message: 'position must be between 1 and ' + session.items.length + '.' });
    }
    const item = session.items.find((it) => it.position === position) || session.items[position - 1];
    const saved = session.responses.find((r) => r.position === item.position);

    return res.json({
      problem: {
        problemId: item.problemId,
        content: item.content,
        svg: item.svg,
        skillId: item.skillId,
        category: item.category,
        answerType: item.answerType,
        options: normalizeOptions(item.options),
        questionNumber: item.position,
      },
      response: saved ? { answer: saved.answer || null, flagged: !!saved.flagged } : null,
      total: session.items.length,
      remainingSeconds: secondsRemaining(session),
    });
  } catch (err) {
    console.error('[actTest] problem error:', err.message);
    return res.status(500).json({ message: 'Could not load that question.' });
  }
});

// ── POST /save-answer ───────────────────────────────────────
// Record (or replace) an answer and/or flag for one question. Deliberately
// ungraded — see the header note. Answers stay editable until time is called
// or the test is submitted, exactly like the real ACT within a section.
router.post('/save-answer', async (req, res) => {
  try {
    const { sessionId, problemId, position, answer, flagged, responseTime } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    if (session.status !== 'in_progress') {
      return res.status(409).json({ message: 'This test is already finished.' });
    }
    // Pencils down: once the section clock runs out no answer may change.
    // 10s grace absorbs client-tick vs server-clock skew on the final answer.
    if (secondsRemaining(session) === 0) {
      const overMs = Date.now() - new Date(session.startedAt).getTime() - session.timeLimitMinutes * 60000;
      if (overMs > 10000) return res.status(409).json({ message: 'Time is up.', timeUp: true });
    }

    const pos = parseInt(position, 10);
    const item = session.items.find((it) => it.position === pos);
    if (!item || item.problemId !== problemId) {
      return res.status(409).json({ message: 'Question mismatch; refetch the question.' });
    }

    const existing = session.responses.find((r) => r.position === item.position);
    const row = existing || {
      position: item.position,
      problemId: item.problemId,
      skillId: item.skillId,
      category: item.category,
    };
    row.answer = (answer === null || answer === undefined || answer === '') ? null : String(answer);
    row.flagged = !!flagged;
    row.skipped = row.answer === null;
    if (responseTime) row.responseTime = responseTime;
    row.answeredAt = new Date();
    if (!existing) session.responses.push(row);
    session.markModified('responses');
    await session.save();

    return res.json({
      saved: true,
      answered: session.responses.filter((r) => r.answer != null).length,
      total: session.items.length,
      remainingSeconds: secondsRemaining(session),
    });
  } catch (err) {
    console.error('[actTest] save-answer error:', err.message);
    return res.status(500).json({ message: 'Could not save your answer.' });
  }
});

// ── GET /overview?sessionId= ────────────────────────────────
// Answered/flagged state for every question — drives the question palette and
// lets a resumed session pick up exactly where it left off. Never includes
// correctness (nothing is graded yet).
router.get('/overview', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    const byPos = new Map(session.responses.map((r) => [r.position, r]));
    return res.json({
      total: session.items.length,
      status: session.status,
      timeLimitMinutes: session.timeLimitMinutes,
      remainingSeconds: secondsRemaining(session),
      items: session.items.map((it) => {
        const r = byPos.get(it.position);
        return {
          position: it.position,
          answered: !!(r && r.answer != null),
          flagged: !!(r && r.flagged),
        };
      }),
    });
  } catch (err) {
    console.error('[actTest] overview error:', err.message);
    return res.status(500).json({ message: 'Could not load the test overview.' });
  }
});

// ── POST /submit-answer ─────────────────────────────────────
router.post('/submit-answer', async (req, res) => {
  try {
    const { sessionId, problemId, answer, responseTime, skipped } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    const item = session.items[session.currentIndex];
    if (!item || item.problemId !== problemId) {
      return res.status(409).json({ message: 'Out-of-order submission; refetch the current question.' });
    }

    // Grade by re-fetching the Problem (answer key never leaves the server).
    let correct = false;
    if (!skipped) {
      const problem = await Problem.findOne({ problemId });
      correct = problem ? !!problem.checkAnswer(answer) : false;
    }

    session.responses.push({
      position: item.position,
      problemId,
      skillId: item.skillId,
      category: item.category,
      answer: skipped ? null : String(answer),
      correct,
      skipped: !!skipped,
      responseTime: responseTime || null,
    });
    session.currentIndex += 1;
    await session.save();

    const done = session.currentIndex >= session.items.length;
    return res.json({
      nextAction: done ? 'complete' : 'continue',
      correct,
      progress: {
        current: Math.min(session.currentIndex + 1, session.items.length),
        total: session.items.length,
        percentComplete: Math.round((session.currentIndex / session.items.length) * 100),
      },
    });
  } catch (err) {
    console.error('[actTest] submit-answer error:', err.message);
    return res.status(500).json({ message: 'Could not record your answer.' });
  }
});

// ── POST /complete ──────────────────────────────────────────
router.post('/complete', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.user._id, res);
    if (!session) return;

    // ── Final grading pass — the ONE place correctness is decided ──
    // Free navigation means an answer can change right up to submission, so
    // grade the final state here in a single batch. Legacy sessions (graded at
    // submit time) regrade to the identical verdict, so both rails share this.
    const answeredRows = session.responses.filter((r) => r.answer != null && r.answer !== '');
    const keyByProblemId = new Map();
    if (answeredRows.length) {
      const probs = await Problem.find({ problemId: { $in: answeredRows.map((r) => r.problemId) } });
      probs.forEach((p) => keyByProblemId.set(p.problemId, p));
    }
    for (const r of session.responses) {
      if (r.answer != null && r.answer !== '') {
        const p = keyByProblemId.get(r.problemId);
        r.correct = p ? !!p.checkAnswer(r.answer) : false;
        r.skipped = false;
      } else {
        r.correct = false;
        r.skipped = true;
      }
    }
    // A question never visited is wrong on the real ACT too — synthesize its
    // row so the per-skill diagnostics and the review queue can see it.
    const respondedPositions = new Set(session.responses.map((r) => r.position));
    for (const item of session.items) {
      if (!respondedPositions.has(item.position)) {
        session.responses.push({
          position: item.position,
          problemId: item.problemId,
          skillId: item.skillId,
          category: item.category,
          answer: null,
          correct: false,
          skipped: true,
        });
      }
    }
    session.responses.sort((a, b) => (a.position || 0) - (b.position || 0));
    session.markModified('responses');

    const raw = session.responses.filter(r => r.correct).length;
    const total = session.items.length;
    const scaled = rawToScaled(raw);

    // Per-category breakdown — the diagnostic signal that drives the boot-camp plan.
    const byCategory = {};
    const bySkill = {};
    for (const r of session.responses) {
      const c = r.category || 'unknown';
      byCategory[c] = byCategory[c] || { correct: 0, total: 0 };
      byCategory[c].total += 1;
      if (r.correct) byCategory[c].correct += 1;

      const s = r.skillId || 'unknown';
      bySkill[s] = bySkill[s] || { correct: 0, total: 0 };
      bySkill[s].total += 1;
      if (r.correct) bySkill[s].correct += 1;
    }

    // Exact weak skills (by name), worst first — the precise remediation targets.
    const weakSkills = Object.entries(bySkill)
      .filter(([, v]) => v.correct < v.total)
      .map(([skillId, v]) => ({
        skillId,
        name: ACT_SKILL_NAMES[skillId] || skillId,
        missed: v.total - v.correct,
        total: v.total,
      }))
      .sort((a, b) => (b.missed / b.total) - (a.missed / a.total) || b.missed - a.missed);

    // "Great tutor" triage: skip mastered domains, rank the rest by leverage
    // (weakness x ACT exam-weight), and pick a prerequisite-aware starting module.
    // This is the plan the course opening + module ordering consume (next step).
    const plan = buildActPlan(byCategory);

    session.status = 'completed';
    session.completedAt = new Date();
    session.rawScore = raw;
    session.scaledScore = scaled ? scaled.scaled : null;
    await session.save();

    // ── Credit what the baseline PROVED ──
    // The pretest already knows which skills the student answered cleanly, but
    // only the weak ones were ever used. A baseline that establishes strength and
    // then throws it away makes the student re-earn skills they just demonstrated
    // on a full timed test — the exact re-grinding the skill map exists to stop.
    // Credited skills are proved at rung 2 (provenBy 'placement') and cascade to
    // clear their prerequisites, same as a course pre-assessment.
    //
    // ⚠️ LIMITED UNTIL THE ACT CROSSWALK LANDS. ACT items carry legacy `act-*`
    // skill ids and seeds/unified-taxonomy/ has no act-crosswalk.json, so
    // canonicalSkillId passes them through unchanged. The credit is real and
    // carries a receipt, but it is stored under an act-* key and will NOT light
    // up the unified skill map until that crosswalk is added — at which point
    // this starts working with no code change (skillCanonicalizer auto-discovers
    // crosswalks).
    let creditedSkills = [];
    let clearedFromBaseline = [];
    try {
      const { creditFromTallies } = require('../utils/coursePreAssessment');
      const { mergeTalliesToCourse } = require('../utils/actCrosswalk');
      const { advanceRung } = require('../utils/skillRung');
      const { getSkillMasteryEntry, setSkillMasteryEntry, decodedMasteryMap } = require('../utils/masteryGuard');
      const { buildGraph, applyProofCascade } = require('../utils/skillClosure');
      const { configCache } = require('../utils/cache');
      const Skill = require('../models/skill');
      const User = require('../models/user');

      // Credit under COURSE skill ids, not the baseline's finer ids: the ACT
      // course teaches by course ids, so mastery stored under a baseline id it
      // never references would be invisible ("skip what you aced" would silently
      // do nothing). mergeTalliesToCourse re-keys + sums via seeds/act-crosswalk
      // .json; a course skill is credited only if every baseline item under it
      // was correct. Unmapped baseline ids fall away (no course home yet).
      const courseBySkill = mergeTalliesToCourse(bySkill);
      const { credited } = creditFromTallies(courseBySkill);
      if (credited.length) {
        const user = await User.findById(req.user._id);
        credited.forEach((skillId) => {
          const entry = getSkillMasteryEntry(user, skillId) || {};
          advanceRung(entry, 'proved', { via: 'placement' });
          const changed = entry.__rungResult && entry.__rungResult.changed;
          delete entry.__rungResult;
          if (changed) {
            entry.status = 'mastered';
            setSkillMasteryEntry(user, skillId, entry);
            creditedSkills.push(skillId);
          }
        });

        const allSkills = await configCache.getOrSet(
          'skills:unified',
          () => Skill.find({ isActive: true, source: 'unified-taxonomy' }).lean(),
          3600
        );
        if (allSkills.length && creditedSkills.length) {
          const graph = buildGraph(allSkills);
          const decoded = decodedMasteryMap(user);
          creditedSkills.forEach((skillId) => {
            applyProofCascade(graph, decoded, skillId).cleared.forEach((id) => {
              if (clearedFromBaseline.indexOf(id) === -1) clearedFromBaseline.push(id);
              setSkillMasteryEntry(user, id, decoded.get(id));
            });
          });
        }
        await user.save();
      }
    } catch (creditErr) {
      // Never cost the student their test result over a bookkeeping failure.
      console.error('[actTest] baseline credit error (non-fatal):', creditErr.message);
    }

    // ── Retarget the ACT course from the pretest ──
    // If the student is enrolled in the ACT course and hasn't started a module
    // yet, open it on the highest-leverage weak domain (prereq-aware) and stash
    // the plan so the greeting can recap it. Additive and non-fatal.
    try {
      const cs = await CourseSession.findOne({ userId: req.user._id, courseId: 'act-prep', status: 'active' });
      if (cs) {
        const jumpTo = planStartModule(cs, plan);
        if (jumpTo) cs.currentModuleId = jumpTo;
        cs.diagnosticPlan = planSummary(plan, session.completedAt);

        // ── Build the missed-items review queue (bootcamp "work" phase) ──
        // The student's misses become the material: the course now walks them
        // through each wrong/skipped question — diagnose, reteach if needed,
        // strategy — instead of a fixed scaffold. Look up the correct answer +
        // explanation for each missed problem, build the ranked queue, and store
        // it so the chat prompt can present one miss at a time and advance.
        try {
          const { buildReviewQueue } = require('../utils/actReview');
          const missedIds = (session.responses || [])
            .filter((r) => r && r.problemId && (r.correct === false || r.skipped === true))
            .map((r) => r.problemId);
          const problemsById = {};
          if (missedIds.length) {
            const probs = await Problem.find({ problemId: { $in: missedIds } })
              .select('problemId correctOption answer explanation prompt options').lean();
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
            const { pickTransferItems } = require('../utils/actReview');
            const skills = [...new Set(queue.map((q) => q.skillId).filter(Boolean))];
            if (skills.length) {
              const seen = new Set(await seenProblemIdsForUser(req.user._id));
              const pool = await Problem.find({
                skillId: { $in: skills },
                isActive: true,
                problemId: { $nin: [...seen] },
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
            const completed = await ActTestSession.countDocuments({ userId: req.user._id, status: 'completed' });
            if (completed > 0) round = completed;   // this session is already saved as completed
          } catch (_countErr) { /* keep the increment fallback */ }
          cs.bootcamp = queue.length
            ? { phase: 'review', round, testSessionId: String(session._id), queue, index: 0 }
            : { phase: 'reassess', round, testSessionId: String(session._id), queue: [], index: 0 };
          cs.markModified('bootcamp');
        } catch (reviewErr) {
          console.error('[actTest] review-queue build error (non-fatal):', reviewErr.message);
        }

        await cs.save();
      }
    } catch (retargetErr) {
      console.error('[actTest] course retarget error (non-fatal):', retargetErr.message);
    }

    // ── Personalize from the pretest ──
    // Seed the exact weak skills into the student's tutor plan (worst first), so
    // structured teaching automatically targets THIS student's gaps. Additive
    // and non-fatal. resolveSkill tolerates act-* skills not yet in the catalog.
    let plannedSkills = 0;
    try {
      const { loadOrCreatePlan, addSkillToFocus } = require('../utils/tutorPlanManager');
      const plan = await loadOrCreatePlan(req.user._id, { user: req.user });
      for (const s of weakSkills.slice(0, 8)) {
        addSkillToFocus(plan, {
          skillId: s.skillId,
          displayName: s.name,
          reason: 'assessment-identified',
          familiarity: 'developing',                              // seen it, missed it → guided mode
          priority: Math.min(10, 6 + Math.round((s.missed / s.total) * 3)), // 6–9 by miss rate
        });
        plannedSkills += 1;
      }
      if (plannedSkills > 0) await plan.save();
    } catch (planErr) {
      console.error('[actTest] plan seed error (non-fatal):', planErr.message);
    }

    return res.json({
      success: true,
      report: {
        rawScore: raw,
        totalItems: total,
        scaledScore: scaled ? scaled.scaled : null,
        scaledApproximate: true,
        accuracy: total ? Math.round((raw / total) * 100) : 0,
        byCategory,
        weakSkills,
        plannedSkills,
        plan,
        durationMinutes: session.startedAt
          ? Math.round((session.completedAt - session.startedAt) / 60000)
          : null,
      },
    });
  } catch (err) {
    console.error('[actTest] complete error:', err.message);
    return res.status(500).json({ message: 'Could not score the practice test.' });
  }
});

// ── GET /history — completed attempts for the growth report ──
router.get('/history', async (req, res) => {
  try {
    const sessions = await ActTestSession.find({ userId: req.user._id, status: 'completed' })
      .sort({ completedAt: 1 })
      .lean();

    const attempts = sessions.map(s => {
      const byCategory = {};
      const bySkill = {};
      for (const r of (s.responses || [])) {
        const c = r.category || 'unknown';
        byCategory[c] = byCategory[c] || { correct: 0, total: 0 };
        byCategory[c].total += 1;
        if (r.correct) byCategory[c].correct += 1;

        const sk = r.skillId || 'unknown';
        bySkill[sk] = bySkill[sk] || { correct: 0, total: 0, name: ACT_SKILL_NAMES[sk] || sk };
        bySkill[sk].total += 1;
        if (r.correct) bySkill[sk].correct += 1;
      }
      return {
        completedAt: s.completedAt,
        rawScore: s.rawScore,
        scaledScore: s.scaledScore,
        totalItems: (s.items || []).length || (s.responses || []).length,
        byCategory,
        bySkill,
      };
    });

    return res.json({ count: attempts.length, attempts });
  } catch (err) {
    console.error('[actTest] history error:', err.message);
    return res.status(500).json({ message: 'Could not load your test history.' });
  }
});

// ── helper: load a session the caller owns ──────────────────
async function loadOwnedSession(sessionId, userId, res) {
  if (!sessionId) { res.status(400).json({ message: 'sessionId is required.' }); return null; }
  const session = await ActTestSession.findById(sessionId);
  if (!session) { res.status(404).json({ message: 'Practice-test session not found.' }); return null; }
  if (String(session.userId) !== String(userId)) { res.status(403).json({ message: 'Not your session.' }); return null; }
  return session;
}

module.exports = router;
