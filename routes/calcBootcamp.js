// routes/calcBootcamp.js
// AP Calculus AB bootcamp weekly-diagnostic rail. Each week = 15 MC (auto-scored)
// + one 9-point FRQ (rubric-scored by the AI tutor). Completing a week projects
// an AP band, ranks weak skills by priority, commits a ≤3-topic plan, and seeds
// the student's tutorPlan so structured teaching targets those gaps.
//
// Mounted at /api/calc-bootcamp (see config/routes.js). Design:
// docs/APCALCAB_BOOTCAMP_DESIGN.md · scoring core: utils/calcBootcamp.js.

const express = require('express');
const router = express.Router();

const CalcBootcampSession = require('../models/calcBootcampSession');
const {
  weeklyComposite, projectBand, rankWeakSkills, buildWeeklyPlan,
} = require('../utils/calcBootcamp');
const { normalizeOptions, correctLabelOf } = require('../utils/mcOptions');

const ASSESSMENT_MAP = require('../seeds/calc-assessment-map.json');

// skillId → display name (for readable weak-skill / plan output).
const SKILL_NAMES = (() => {
  const map = {};
  try {
    const cat = require('../seeds/skills-ap-calculus-ab.json');
    const arr = Array.isArray(cat) ? cat : (cat.skills || []);
    for (const s of arr) map[s.skillId] = s.displayName || s.skillId;
  } catch { /* names optional */ }
  return map;
})();
const nameOf = (id) => SKILL_NAMES[id] || id;

// ── POST /start-week ────────────────────────────────────────
router.post('/start-week', async (req, res) => {
  try {
    const week = Number(req.body && req.body.week);
    if (!Number.isInteger(week) || week < 1 || week > 5) {
      return res.status(400).json({ message: 'week must be 1–5.' });
    }
    const wk = ASSESSMENT_MAP[String(week)];
    if (!wk) return res.status(404).json({ message: `Week ${week} not found.` });

    // Reuse an in-flight attempt for this week if one exists.
    const existing = await CalcBootcampSession.findOne({
      userId: req.user._id, week, status: { $in: ['in_progress', 'mc_submitted'] },
    }).sort({ createdAt: -1 });
    if (existing) return res.json(clientSession(existing));

    const Problem = require('../models/problem');
    const pids = wk.mc.map(m => m.problemId);
    const problems = await Problem.find({ problemId: { $in: pids } }).lean();
    const byId = Object.fromEntries(problems.map(p => [p.problemId, p]));

    const mcItems = wk.mc.map(m => {
      const p = byId[m.problemId] || {};
      return {
        n: m.n, problemId: m.problemId, unit: m.unit, skill: m.skill, skillId: m.skillId,
        practice: m.practice, calc: m.calc,
        content: p.prompt, svg: p.svg || undefined,
        // { label, text } only — the legacy banks carry `isCorrect` on every
        // option, and this array is echoed back to the browser via
        // clientSession(), which would ship the answer key with the questions.
        options: normalizeOptions(p.options),
      };
    });

    // Client-safe FRQ: prompt + rubric point descriptors, but NOT the solutions.
    const frq = {
      unit: wk.frq.unit, skill: wk.frq.skill, skillId: wk.frq.skillId, calc: wk.frq.calc,
      context: wk.frq.context, svg: wk.frq.svg || undefined,
      parts: (wk.frq.parts || []).map(p => ({
        label: p.label, prompt: p.prompt, points: p.points, rubric: p.rubric || [],
      })),
    };

    const session = await CalcBootcampSession.create({
      userId: req.user._id, week, title: wk.title,
      mcItems, frq,
      status: 'in_progress',
      mcTotal: mcItems.length,
      frqPossible: wk.frqPoints,
    });

    return res.json(clientSession(session));
  } catch (err) {
    console.error('[calcBootcamp] start-week error:', err.message);
    return res.status(500).json({ message: 'Could not start this week’s diagnostic.' });
  }
});

// ── POST /submit-mc ─────────────────────────────────────────
// body: { sessionId, answers: { [problemId]: 'A'|'B'|'C'|'D' } }
router.post('/submit-mc', async (req, res) => {
  try {
    const { sessionId, answers } = req.body || {};
    const session = await loadOwned(sessionId, req.user._id, res);
    if (!session) return;
    const picks = answers || {};

    const Problem = require('../models/problem');
    const pids = session.mcItems.map(i => i.problemId);
    // `options` is part of the key here: the label the student sees is the
    // option's POSITION, which correctLabelOf translates the stored letter into.
    const keyDocs = await Problem.find({ problemId: { $in: pids } },
      'problemId correctOption explanation options').lean();
    const keyById = Object.fromEntries(keyDocs.map(p => [p.problemId, p]));

    const responses = [];
    const results = [];
    for (const item of session.mcItems) {
      const answer = picks[item.problemId] || null;
      const key = keyById[item.problemId] || {};
      // Was `answer === key.correctOption`, a hand-rolled compare against the
      // STORED letter (CLAUDE.md §12 says not to hand-roll these). That is only
      // right while the client happens to echo stored labels back; the moment a
      // surface serves positional labels — as they all now do — a stale stored
      // letter marks a wrong pick correct.
      // With no options to position against, the stored letter stands — never
      // fall through to "no correct label", which would mark a right pick wrong.
      const correctLabel = correctLabelOf(key)
        || (key.correctOption ? String(key.correctOption).trim().toUpperCase() : null);
      const correct = !!answer && !!correctLabel && String(answer).trim().toUpperCase() === correctLabel;
      responses.push({
        problemId: item.problemId, n: item.n, unit: item.unit, skillId: item.skillId,
        practice: item.practice, calc: item.calc, answer, correct,
      });
      results.push({
        problemId: item.problemId, n: item.n, answer, correct,
        correctOption: correctLabel,   // the label the student saw, not the stored one
        explanation: correct ? undefined : key.explanation, // teach only on a miss
      });
    }

    session.mcResponses = responses;
    session.mcCorrect = responses.filter(r => r.correct).length;
    session.status = 'mc_submitted';
    await session.save();

    return res.json({
      success: true,
      mcCorrect: session.mcCorrect,
      mcTotal: session.mcTotal,
      byUnit: tally(responses, r => r.unit),
      byPractice: tally(responses, r => r.practice),
      byCalc: tally(responses, r => (r.calc ? 'calculator' : 'no-calculator')),
      results,
      frq: clientFrq(session.frq),   // hand the FRQ back so the student can attempt it
    });
  } catch (err) {
    console.error('[calcBootcamp] submit-mc error:', err.message);
    return res.status(500).json({ message: 'Could not score the multiple-choice section.' });
  }
});

// ── POST /submit-frq ────────────────────────────────────────
// body: { sessionId, response: '<student work>' }  → AI rubric-scores it
router.post('/submit-frq', async (req, res) => {
  try {
    const { sessionId, response } = req.body || {};
    const session = await loadOwned(sessionId, req.user._id, res);
    if (!session) return;
    if (!response || !String(response).trim()) {
      return res.status(400).json({ message: 'Enter your FRQ work to be scored.' });
    }

    const wk = ASSESSMENT_MAP[String(session.week)];
    const partScores = await gradeFrq(wk.frq, String(response), req.user);
    const totalEarned = partScores.reduce((a, p) => a + p.pointsEarned, 0);
    const totalPossible = partScores.reduce((a, p) => a + p.pointsPossible, 0);

    session.frqResponse = {
      submitted: String(response), partScores,
      totalEarned, totalPossible, scoredBy: 'ai', scoredAt: new Date(),
    };
    session.frqEarned = totalEarned;
    await session.save();

    return res.json({ success: true, partScores, totalEarned, totalPossible });
  } catch (err) {
    console.error('[calcBootcamp] submit-frq error:', err.message);
    return res.status(500).json({ message: 'Could not score your free-response answer.' });
  }
});

// ── POST /complete-week ─────────────────────────────────────
router.post('/complete-week', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = await loadOwned(sessionId, req.user._id, res);
    if (!session) return;
    if (!session.mcResponses || session.mcResponses.length === 0) {
      return res.status(400).json({ message: 'Submit the multiple-choice section first.' });
    }

    // Only weight the FRQ into the composite if it was actually scored; otherwise
    // fall back to MC-only (don't penalize an un-submitted FRQ as 0/9).
    const frqScored = session.frqEarned != null;
    const composite = weeklyComposite(
      session.mcCorrect || 0, session.mcTotal || 0,
      frqScored ? session.frqEarned : 0,
      frqScored ? (session.frqPossible || 0) : 0,
    );
    const { band } = projectBand(composite);

    // Per-skill accuracy from this week's MC → priority-ranked weak skills.
    const bySkill = {};
    for (const r of session.mcResponses) {
      const id = r.skillId || 'unknown';
      bySkill[id] = bySkill[id] || { correct: 0, total: 0, unit: r.unit, name: nameOf(id) };
      bySkill[id].total += 1;
      if (r.correct) bySkill[id].correct += 1;
    }
    const weak = rankWeakSkills(bySkill);

    // Retrospective: a still-relevant weak skill from an earlier completed week.
    const priorWeak = await priorWeakSkills(req.user._id, session.week);
    const plan = buildWeeklyPlan(weak, priorWeak).map(s => ({
      skillId: s.skillId, name: s.name, unit: s.unit, kind: s.kind,
      accuracy: s.accuracy, priority: s.priority,
    }));

    session.composite = composite;
    session.apBand = band;
    session.plannedSkills = plan;
    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();

    // Seed the tutor plan with the weekly targets (worst first) — non-fatal.
    let seeded = 0;
    try {
      const { loadOrCreatePlan, addSkillToFocus } = require('../utils/tutorPlanManager');
      const tPlan = await loadOrCreatePlan(req.user._id, { user: req.user });
      for (const s of plan) {
        addSkillToFocus(tPlan, {
          skillId: s.skillId, displayName: s.name,
          reason: 'assessment-identified', familiarity: 'developing',
          priority: Math.min(10, 6 + Math.round((1 - (s.accuracy || 0)) * 3)),
        });
        seeded += 1;
      }
      if (seeded > 0) await tPlan.save();
    } catch (planErr) {
      console.error('[calcBootcamp] plan seed error (non-fatal):', planErr.message);
    }

    return res.json({
      success: true,
      report: {
        week: session.week, title: session.title,
        mcCorrect: session.mcCorrect, mcTotal: session.mcTotal,
        frqEarned: session.frqEarned || 0, frqPossible: session.frqPossible || 0,
        frqScored: session.frqEarned != null,
        composite, apBand: band, apBandApproximate: true,
        plannedSkills: plan, seededToTutorPlan: seeded,
        byUnit: tally(session.mcResponses, r => r.unit),
      },
    });
  } catch (err) {
    console.error('[calcBootcamp] complete-week error:', err.message);
    return res.status(500).json({ message: 'Could not complete this week.' });
  }
});

// ── GET /progress — trajectory across the 5 weeks ───────────
router.get('/progress', async (req, res) => {
  try {
    const done = await CalcBootcampSession.find({ userId: req.user._id, status: 'completed' })
      .sort({ week: 1, completedAt: 1 }).lean();

    // Latest completion per week (a week can be retaken).
    const byWeek = {};
    for (const s of done) byWeek[s.week] = s;
    const trajectory = Object.values(byWeek)
      .sort((a, b) => a.week - b.week)
      .map(s => ({
        week: s.week, title: s.title, composite: s.composite, apBand: s.apBand,
        mcCorrect: s.mcCorrect, mcTotal: s.mcTotal,
        frqEarned: s.frqEarned, frqPossible: s.frqPossible,
        plannedSkills: s.plannedSkills || [],
        completedAt: s.completedAt,
      }));

    const latest = trajectory[trajectory.length - 1];
    return res.json({
      weeksCompleted: trajectory.length,
      currentBand: latest ? latest.apBand : null,
      bandApproximate: true,
      trajectory,
    });
  } catch (err) {
    console.error('[calcBootcamp] progress error:', err.message);
    return res.status(500).json({ message: 'Could not load your bootcamp progress.' });
  }
});

// ── helpers ─────────────────────────────────────────────────

async function loadOwned(sessionId, userId, res) {
  if (!sessionId) { res.status(400).json({ message: 'sessionId is required.' }); return null; }
  const session = await CalcBootcampSession.findById(sessionId);
  if (!session) { res.status(404).json({ message: 'Bootcamp session not found.' }); return null; }
  if (String(session.userId) !== String(userId)) { res.status(403).json({ message: 'Not your session.' }); return null; }
  return session;
}

// Weak skills from earlier completed weeks, ranked — the retrospective pool.
async function priorWeakSkills(userId, currentWeek) {
  const prior = await CalcBootcampSession.find({
    userId, status: 'completed', week: { $lt: currentWeek },
  }).lean();
  const bySkill = {};
  for (const s of prior) {
    for (const r of (s.mcResponses || [])) {
      const id = r.skillId || 'unknown';
      bySkill[id] = bySkill[id] || { correct: 0, total: 0, unit: r.unit, name: nameOf(id) };
      bySkill[id].total += 1;
      if (r.correct) bySkill[id].correct += 1;
    }
  }
  return rankWeakSkills(bySkill);
}

function clientSession(session) {
  return {
    sessionId: session._id,
    week: session.week,
    title: session.title,
    timeLimitMinutes: session.timeLimitMinutes,
    status: session.status,
    mcItems: session.mcItems,           // already key-free
    frq: clientFrq(session.frq),
  };
}

function clientFrq(frq) {
  if (!frq) return null;
  return {
    unit: frq.unit, skill: frq.skill, calc: frq.calc,
    context: frq.context, svg: frq.svg || undefined,
    parts: (frq.parts || []).map(p => ({
      label: p.label, prompt: p.prompt, points: p.points, rubric: p.rubric || [],
    })),
  };
}

function tally(responses, keyFn) {
  const out = {};
  for (const r of responses) {
    const k = keyFn(r) || 'unknown';
    out[k] = out[k] || { correct: 0, total: 0 };
    out[k].total += 1;
    if (r.correct) out[k].correct += 1;
  }
  return out;
}

/**
 * AI rubric-scores an FRQ against its point-by-point rubric (and reference
 * solution), through the LLM gateway (PII anonymized). Returns one entry per
 * part with earned points clamped to the part's max and a one-line rationale.
 * Falls back to 0 points (with a note) if the model output can't be parsed, so
 * the week can still complete on an MC-weighted band.
 */
async function gradeFrq(frq, studentText, user) {
  const parts = frq.parts || [];
  const fallback = () => parts.map(p => ({
    label: p.label, pointsEarned: 0, pointsPossible: p.points || 0,
    feedback: 'Not scored automatically — ask your tutor to review this part.',
  }));

  const rubricBlock = parts.map(p => (
    `Part (${p.label}) — ${p.points} points\n`
    + `Prompt: ${p.prompt}\n`
    + `Reference solution: ${p.solution || '(none)'}\n`
    + `Rubric:\n${(p.rubric || []).map(r => `  - ${r}`).join('\n')}`
  )).join('\n\n');

  const prompt = `You are an AP Calculus AB reader scoring one free-response question against its official rubric. Award each rubric point strictly: give the point only if the student's work earns it. Partial credit follows the rubric exactly.\n\n`
    + `FRQ context: ${frq.context || ''}\n\n${rubricBlock}\n\n`
    + `STUDENT RESPONSE:\n${studentText}\n\n`
    + `Return ONLY valid JSON, no prose, of the form:\n`
    + `{"parts":[{"label":"a","pointsEarned":<int>,"feedback":"<one sentence>"}, ...]}\n`
    + `Include every part. pointsEarned must be an integer between 0 and that part's maximum.`;

  try {
    const { reason } = require('../utils/llmGateway');
    const raw = await reason(prompt, { user, temperature: 0, maxTokens: 700 });
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonStr);
    const byLabel = Object.fromEntries((parsed.parts || []).map(p => [String(p.label), p]));
    return parts.map(p => {
      const g = byLabel[String(p.label)] || {};
      const max = p.points || 0;
      const earned = Math.max(0, Math.min(max, Math.round(Number(g.pointsEarned) || 0)));
      return { label: p.label, pointsEarned: earned, pointsPossible: max, feedback: g.feedback || '' };
    });
  } catch (err) {
    console.error('[calcBootcamp] FRQ grading fell back:', err.message);
    return fallback();
  }
}

module.exports = router;
