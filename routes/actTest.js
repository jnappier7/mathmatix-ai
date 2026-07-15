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

// skillId → human-readable name, so the report can name EXACT weak skills
// (e.g. "Quadratic Equations") rather than just the broad category.
const ACT_SKILL_NAMES = (() => {
  try {
    const seed = require('../seeds/skills-act-math-prep.json');
    const arr = Array.isArray(seed) ? seed : (seed.skills || []);
    const map = {};
    for (const s of arr) map[s.skillId] = s.displayName || s.skillId;
    return map;
  } catch { return {}; }
})();

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
    const form = await assembleForm({ seed });

    if (form.coverage.filled === 0) {
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
        options: item.options,
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

    session.status = 'completed';
    session.completedAt = new Date();
    session.rawScore = raw;
    session.scaledScore = scaled ? scaled.scaled : null;
    await session.save();

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

// ── helper: load a session the caller owns ──────────────────
async function loadOwnedSession(sessionId, userId, res) {
  if (!sessionId) { res.status(400).json({ message: 'sessionId is required.' }); return null; }
  const session = await ActTestSession.findById(sessionId);
  if (!session) { res.status(404).json({ message: 'Practice-test session not found.' }); return null; }
  if (String(session.userId) !== String(userId)) { res.status(403).json({ message: 'Not your session.' }); return null; }
  return session;
}

module.exports = router;
