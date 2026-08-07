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
//   GET  /next-problem      → serve the current item
//   POST /submit-answer     → grade one item, advance
//   POST /complete          → raw→scaled score + per-category breakdown

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
          const prevRound = (cs.bootcamp && cs.bootcamp.round) || 0;
          cs.bootcamp = queue.length
            ? { phase: 'review', round: prevRound + 1, testSessionId: String(session._id), queue, index: 0 }
            : { phase: 'reassess', round: prevRound + 1, testSessionId: String(session._id), queue: [], index: 0 };
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
