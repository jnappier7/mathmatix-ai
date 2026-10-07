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
//   POST /claim             → attach a finished GUEST test to the signed-in user
//
// Guest rail (exported as `guestRouter`, mounted PUBLIC at /api/act-practice):
// the same runner with no account — the public practice test at
// /act-practice-test. Ownership is a bearer token (X-Act-Guest-Token) minted
// by /start and stored only as a hash. /problem, /save-answer and /overview are
// the SAME handlers as the signed-in rail; /start and /complete differ:
// a guest result is the score and category breakdown only. Which questions
// were missed — the report the signed-in /complete returns — unlocks on
// /claim, after signup. No per-item correctness ever reaches a guest.
//
// Navigation matches the real ACT: within the timed section a student can move
// back and forth, change answers, and flag questions for review — so grading
// happens ONCE, at /complete, never mid-test. Mid-test responses store only the
// answer; returning correctness from save-answer would put the answer key one
// network-tab peek away from a student who can still change their answer.

const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const guestRouter = express.Router();

const ActTestSession = require('../models/actTestSession');
const { GUEST_TTL_MS } = require('../models/actTestSession');
const Problem = require('../models/problem');
const { assembleForm, rawToScaled, scaledRange, getBlueprint } = require('../utils/actTestAssembler');
const { buildActPlan } = require('../utils/actBootcampPlan');
const { normalizeOptions, frozenPickForGrading, LABELS: MC_LABELS } = require('../utils/mcOptions');
const CourseSession = require('../models/courseSession');
const {
  answeredCount, overdueMs, shouldAbandonOnExpiry, isIncompleteAttempt, buildComparison,
} = require('../utils/actProgress');
const { seenProblemIdsForUser, seedBootcampFromTest } = require('../utils/actBootcampSeed');
const { recordConversionEvent } = require('../utils/conversionEvents');

// Who owns the session a request is about. The signed-in rail is owned by the
// user; the guest rail by the bearer token. Set per router so a signed-in
// browser hitting the guest rail is still treated as a guest — and can only
// reach a guest session with its token.
router.use((req, _res, next) => { req.actOwner = { userId: req.user && req.user._id }; next(); });
guestRouter.use((req, _res, next) => {
  req.actOwner = { guestToken: String(req.get('X-Act-Guest-Token') || '') };
  next();
});

function hashGuestToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function guestTokenMatches(token, storedHash) {
  if (!token || !storedHash || token.length < 32) return false;
  const a = Buffer.from(hashGuestToken(token), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// How far past the deadline a final answer (or the submitted answer sheet) is
// still accepted — absorbs client-tick vs server-clock skew on the last click.
const DEADLINE_GRACE_MS = 10000;

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

// Seconds left on the section clock, anchored to startedAt — NOT to whenever
// the client happened to reopen the page. The real ACT has no pause; without
// this anchor, closing the tab and resuming restarted the full hour.
function secondsRemaining(session) {
  const elapsedMs = Date.now() - new Date(session.startedAt).getTime();
  return Math.max(0, Math.round((session.timeLimitMinutes * 60000 - elapsedMs) / 1000));
}

function normalizeAnswer(answer) {
  return (answer === null || answer === undefined || answer === '') ? null : String(answer);
}

/**
 * Record one question's answer/flag with a single atomic, sequence-guarded
 * update. Returns { written: boolean }.
 *
 * `seq` is the client's per-question change counter. A save whose seq is not
 * newer than the stored row's is stale — it left the browser BEFORE the one
 * already on file — and is dropped. Saves from clients that send no seq (the
 * previous runner, still cached in some browsers) keep last-arrival semantics
 * against each other but can never overwrite a sequenced row.
 */
async function writeResponse(session, item, { answer, flagged, responseTime, seq }) {
  const value = normalizeAnswer(answer);
  const seqNum = Number.isFinite(Number(seq)) ? Number(seq) : null;
  const fields = {
    'responses.$.answer': value,
    'responses.$.flagged': !!flagged,
    'responses.$.skipped': value === null,
    'responses.$.answeredAt': new Date(),
    'responses.$.seq': seqNum === null ? 0 : seqNum,
  };
  if (responseTime) fields['responses.$.responseTime'] = responseTime;

  // Newer-or-equal-sequence guard on the existing row. An unsequenced save
  // (seq null) may only replace an unsequenced row.
  const newerThanStored = seqNum === null
    ? [{ seq: { $exists: false } }, { seq: null }, { seq: 0 }]
    : [{ seq: { $exists: false } }, { seq: null }, { seq: { $lte: seqNum } }];

  const updateExisting = () => ActTestSession.updateOne(
    { _id: session._id, status: 'in_progress', responses: { $elemMatch: { position: item.position, $or: newerThanStored } } },
    { $set: fields }
  );

  let r = await updateExisting();
  if (r.matchedCount > 0) return { written: true };

  // No row (or only a newer one). Push a fresh row — guarded so two first
  // saves racing each other cannot both insert one.
  const pushed = await ActTestSession.updateOne(
    { _id: session._id, status: 'in_progress', 'responses.position': { $ne: item.position } },
    {
      $push: {
        responses: {
          position: item.position,
          problemId: item.problemId,
          skillId: item.skillId,
          category: item.category,
          answer: value,
          flagged: !!flagged,
          skipped: value === null,
          responseTime: responseTime || null,
          answeredAt: new Date(),
          seq: seqNum === null ? 0 : seqNum,
        },
      },
    }
  );
  if (pushed.matchedCount > 0) return { written: true };

  // Lost the push race to a concurrent first-save: the row exists now, so
  // apply the sequence rule against it.
  r = await updateExisting();
  return { written: r.matchedCount > 0 };
}

/**
 * The ONE grading pass. Marks every answered row right/wrong against the
 * Problem key, synthesizes rows for never-visited questions (wrong on the real
 * ACT too), tallies by category and skill, and stamps the session completed.
 * Mutates `session`; the caller saves it.
 */
async function gradeSession(session) {
  const answeredRows = session.responses.filter((r) => r.answer != null && r.answer !== '');
  const keyByProblemId = new Map();
  if (answeredRows.length) {
    const probs = await Problem.find({ problemId: { $in: answeredRows.map((r) => r.problemId) } });
    probs.forEach((p) => keyByProblemId.set(p.problemId, p));
  }
  const itemByPos = new Map(session.items.map((it) => [it.position, it]));
  for (const r of session.responses) {
    if (r.answer != null && r.answer !== '') {
      const p = keyByProblemId.get(r.problemId);
      // The pick is a letter on the choices FROZEN into this test. Grade the
      // choice the student saw, even if the bank has reordered or edited it since.
      const item = itemByPos.get(r.position);
      r.correct = p ? !!p.checkAnswer(frozenPickForGrading(r.answer, item && item.options, p.options)) : false;
      r.skipped = false;
    } else {
      r.correct = false;
      r.skipped = true;
    }
  }
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

  const tally = tallyResponses(session);
  session.status = 'completed';
  session.completedAt = new Date();
  session.rawScore = tally.raw;
  session.scaledScore = tally.scaled ? tally.scaled.scaled : null;
  return tally;
}

/**
 * Raw/scaled score plus per-category and per-skill tallies from a session whose
 * responses are already graded. Pure read — used by the grading pass and by
 * /claim, which reports on a test graded earlier (as a guest).
 */
function tallyResponses(session) {
  const raw = session.responses.filter((r) => r.correct).length;
  const total = session.items.length;
  // Scale against the length of the form THIS student actually sat. A thin
  // bank (or a deep seen-ledger on a re-test) fills fewer than the blueprint's
  // 45 slots, and indexing the 45-row table with a short form's raw count caps
  // the student at whatever that form could physically return — a perfect
  // 28-item form used to score 24. Forms shrink as the ledger grows, so that
  // capped the re-test harder than the baseline and turned real improvement
  // into a downward trend line.
  const scaled = rawToScaled(raw, undefined, total);

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
  return { raw, total, scaled, byCategory, bySkill };
}

/**
 * Apply the answer sheet the runner submits with /complete.
 *
 * The browser's state IS the answer sheet the student saw. Every click saved
 * as it happened, but a save can fail or arrive out of order (see
 * writeResponse), and the student has no way to know — the screen still shows
 * their pick. So on submit the runner sends the whole sheet and the server
 * takes it as final for every question where it is newer than (or as new as)
 * what is stored. Only positional option labels the item actually has (or
 * null for "cleared") are accepted, and only while the section clock, plus
 * grace, allows changes — a sheet is never a way to answer after time.
 */
function applyAnswerSheet(session, sheet) {
  if (!Array.isArray(sheet) || !sheet.length) return 0;
  if (overdueMs(session) > DEADLINE_GRACE_MS) return 0;
  const byPos = new Map(session.items.map((it) => [it.position, it]));
  let applied = 0;
  for (const entry of sheet) {
    if (!entry || typeof entry !== 'object') continue;
    const pos = parseInt(entry.position, 10);
    const item = byPos.get(pos);
    if (!item) continue;
    if (entry.problemId && entry.problemId !== item.problemId) continue;
    const value = normalizeAnswer(entry.answer);
    if (value !== null) {
      const label = value.toUpperCase();
      const optionCount = Array.isArray(item.options) ? item.options.length : 0;
      const idx = MC_LABELS.indexOf(label);
      if (idx === -1 || (optionCount && idx >= optionCount)) continue;   // not a choice on this item
    }
    const seq = Number.isFinite(Number(entry.seq)) ? Number(entry.seq) : 0;
    const existing = session.responses.find((r) => r.position === pos);
    if (existing) {
      const storedSeq = Number(existing.seq) || 0;
      if (storedSeq > seq) continue;                                 // server holds something newer
      if (existing.answer === value && !!existing.flagged === !!entry.flagged) continue;
      existing.answer = value;
      existing.flagged = !!entry.flagged;
      existing.skipped = value === null;
      existing.seq = seq;
      existing.answeredAt = new Date();
    } else {
      session.responses.push({
        position: pos,
        problemId: item.problemId,
        skillId: item.skillId,
        category: item.category,
        answer: value,
        flagged: !!entry.flagged,
        skipped: value === null,
        seq,
        answeredAt: new Date(),
      });
    }
    applied += 1;
  }
  if (applied) session.markModified('responses');
  return applied;
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
      // A test whose clock ran out while nobody was here is NOT resumed. It
      // used to be: the runner reopened it, saw 0:00, and auto-submitted a form
      // with 1, 3 or 6 answers as a completed attempt — scores of 3, 7 and 10
      // on the student's trend line (owner report, 2026-09-09). A fully
      // answered sheet is graded (they only skipped pressing Submit); anything
      // less is abandoned, unscored, and a fresh test starts below.
      if (active && active.items.length > 0 && shouldAbandonOnExpiry(active)) {
        active.status = 'abandoned';
        active.abandonedReason = 'expired';
        await active.save();
      } else if (active && active.items.length > 0 && overdueMs(active) > DEADLINE_GRACE_MS) {
        await gradeSession(active);
        await active.save();
      } else if (active && active.items.length > 0) {
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
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
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
        figureAlt: item.figureAlt,
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
async function serveProblem(req, res) {
  try {
    const { sessionId } = req.query;
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
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
        figureAlt: item.figureAlt,
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
}
router.get('/problem', serveProblem);
guestRouter.get('/problem', serveProblem);

// ── POST /save-answer ───────────────────────────────────────
// Record (or replace) an answer and/or flag for one question. Deliberately
// ungraded — see the header note. Answers stay editable until time is called
// or the test is submitted, exactly like the real ACT within a section.
//
// Writes are ATOMIC and ORDERED. The runner fires saves without waiting (a
// timed test must never block on the network), so two saves for one question
// can be in flight together — the mis-tap and the correction a second later.
// This used to load the document, mutate the row, and write the whole array
// back, so whichever request the server finished LAST won, regardless of
// which the student clicked last. Production graded a student on "B" for two
// questions where the screen showed D and A selected (owner report,
// 2026-09-09). Now each save carries the client's per-question sequence number
// and the write is a single guarded update: a stale save can no longer
// overwrite a newer one, and two first-saves can no longer both push a row.
async function saveAnswer(req, res) {
  try {
    const { sessionId, problemId, position, answer, flagged, responseTime, seq } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
    if (!session) return;

    if (session.status !== 'in_progress') {
      return res.status(409).json({ message: 'This test is already finished.' });
    }
    // Pencils down: once the section clock runs out no answer may change.
    // The grace absorbs client-tick vs server-clock skew on the final answer.
    if (overdueMs(session) > DEADLINE_GRACE_MS) {
      return res.status(409).json({ message: 'Time is up.', timeUp: true });
    }

    const pos = parseInt(position, 10);
    const item = session.items.find((it) => it.position === pos);
    if (!item || item.problemId !== problemId) {
      return res.status(409).json({ message: 'Question mismatch; refetch the question.' });
    }

    const result = await writeResponse(session, item, {
      answer, flagged, responseTime, seq,
    });
    // Reload the counts from what is actually stored, not from the copy we
    // loaded before the write.
    const fresh = await ActTestSession.findById(session._id).select('responses items timeLimitMinutes startedAt').lean();

    return res.json({
      saved: result.written,
      stale: !result.written,            // a newer save for this question already landed
      answered: answeredCount(fresh),
      total: (fresh.items || []).length,
      remainingSeconds: secondsRemaining(fresh),
    });
  } catch (err) {
    console.error('[actTest] save-answer error:', err.message);
    return res.status(500).json({ message: 'Could not save your answer.' });
  }
}
router.post('/save-answer', saveAnswer);
guestRouter.post('/save-answer', saveAnswer);

// ── GET /overview?sessionId= ────────────────────────────────
// Answered/flagged state for every question — drives the question palette and
// lets a resumed session pick up exactly where it left off. Never includes
// correctness (nothing is graded yet).
async function serveOverview(req, res) {
  try {
    const { sessionId } = req.query;
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
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
}
router.get('/overview', serveOverview);
guestRouter.get('/overview', serveOverview);

// ── POST /submit-answer ─────────────────────────────────────
router.post('/submit-answer', async (req, res) => {
  try {
    const { sessionId, problemId, answer, responseTime, skipped } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
    if (!session) return;

    const item = session.items[session.currentIndex];
    if (!item || item.problemId !== problemId) {
      return res.status(409).json({ message: 'Out-of-order submission; refetch the current question.' });
    }

    // Grade by re-fetching the Problem (answer key never leaves the server).
    let correct = false;
    if (!skipped) {
      const problem = await Problem.findOne({ problemId });
      correct = problem ? !!problem.checkAnswer(frozenPickForGrading(answer, item.options, problem.options)) : false;
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

// ── Report pieces shared by /complete and /claim ─────────────

// Exact weak skills (by name), worst first — the precise remediation targets.
function weakSkillsFrom(bySkill) {
  return Object.entries(bySkill)
    .filter(([, v]) => v.correct < v.total)
    .map(([skillId, v]) => ({
      skillId,
      name: ACT_SKILL_NAMES[skillId] || skillId,
      missed: v.total - v.correct,
      total: v.total,
    }))
    .sort((a, b) => (b.missed / b.total) - (a.missed / a.total) || b.missed - a.missed);
}

// ── What you missed, question by question ──
// "Take the test, see your score and what you missed" — the results screen
// showed the scaled score and six category bars and stopped there, so the
// only place a student could find out WHICH questions they got wrong was
// the review panel in chat, after they had already left the test. Beats 2
// and 3 were fused; this un-fuses them. Grouped the same way review runs
// (by skill), so the list the student reads here is the list they then work.
function missedGroupsFrom(session) {
  const byKey = new Map();
  const order = [];
  for (const r of session.responses) {
    if (!r || !(r.correct === false || r.skipped === true)) continue;
    const key = r.skillId || r.category || 'unknown';
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: ACT_SKILL_NAMES[r.skillId] || ACT_SKILL_NAMES[r.category] || 'Other',
        category: r.category || null,
        positions: [],
      });
      order.push(key);
    }
    byKey.get(key).positions.push({ position: r.position != null ? r.position : null, skipped: !!r.skipped });
  }
  return order
    .map((k) => byKey.get(k))
    .map((g) => ({ ...g, positions: g.positions.sort((a, b) => (a.position || 0) - (b.position || 0)), count: g.positions.length }))
    // Biggest cluster first: the pattern is the headline, not the order
    // the questions happened to appear in.
    .sort((a, b) => b.count - a.count || (a.positions[0].position || 0) - (b.positions[0].position || 0));
}

/**
 * Everything a scored test does to the student's account beyond the score:
 * credit proven skills, retarget an active ACT-prep course (and build its
 * missed-items review), seed the tutor plan with the weak skills. Each step is
 * additive and non-fatal — never cost the student their result over
 * bookkeeping. Returns { plannedSkills, actPrepSessionId }.
 */
async function applyCompletionEffects(req, session, { bySkill, weakSkills, plan }) {
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
  const creditedSkills = [];
  const clearedFromBaseline = [];
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
  // If the student is enrolled in the ACT course, open it on the
  // highest-leverage weak domain (prereq-aware), stash the plan so the greeting
  // can recap it, and turn their misses into the bootcamp review queue
  // (utils/actBootcampSeed.js). A student who is NOT enrolled yet gets the same
  // seeding when they enroll — see routes/courseSession.js /enroll.
  let actPrepSessionId = null;
  try {
    const cs = await CourseSession.findOne({ userId: req.user._id, courseId: 'act-prep', status: 'active' });
    if (cs) {
      await seedBootcampFromTest(cs, session, { userId: req.user._id, plan });
      await cs.save();
      actPrepSessionId = String(cs._id);
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
    const tutorPlan = await loadOrCreatePlan(req.user._id, { user: req.user });
    for (const s of weakSkills.slice(0, 8)) {
      addSkillToFocus(tutorPlan, {
        skillId: s.skillId,
        displayName: s.name,
        reason: 'assessment-identified',
        familiarity: 'developing',                              // seen it, missed it → guided mode
        priority: Math.min(10, 6 + Math.round((s.missed / s.total) * 3)), // 6–9 by miss rate
      });
      plannedSkills += 1;
    }
    if (plannedSkills > 0) await tutorPlan.save();
  } catch (planErr) {
    console.error('[actTest] plan seed error (non-fatal):', planErr.message);
  }

  return { plannedSkills, actPrepSessionId };
}

/** The full (signed-in) results report. */
function buildFullReport(session, { raw, total, scaled, byCategory, weakSkills, plan }, extras = {}) {
  return {
    rawScore: raw,
    totalItems: total,
    scaledScore: scaled ? scaled.scaled : null,
    // The likely band around it — one sitting is an estimate, not a verdict.
    scaledRange: scaledRange(raw, total),
    scaledApproximate: true,
    // The bank could not fill the whole blueprint for this student, so the
    // estimate is projected from fewer questions. Say so rather than
    // presenting it as an equal comparison to a full-length attempt.
    shortForm: !!(scaled && scaled.shortForm),
    blueprintItems: scaled ? scaled.blueprintLength : null,
    accuracy: total ? Math.round((raw / total) * 100) : 0,
    byCategory,
    weakSkills,
    missedByGroup: missedGroupsFrom(session),
    plan,
    durationMinutes: session.startedAt && session.completedAt
      ? Math.round((session.completedAt - session.startedAt) / 60000)
      : null,
    ...extras,
  };
}

/**
 * The GUEST results report — the hook. Score, accuracy and the six category
 * bars (where they stand), plus HOW MANY they missed. Deliberately absent:
 * weakSkills, missedByGroup, bySkill and anything per question. Those are the
 * "what you missed" that signing up unlocks, and a field merely hidden by CSS
 * would be one devtools click from the answer, so it never leaves the server.
 */
function buildGuestReport(session, { raw, total, scaled, byCategory }) {
  const missed = session.responses.filter((r) => r && !r.correct);
  return {
    rawScore: raw,
    totalItems: total,
    scaledScore: scaled ? scaled.scaled : null,
    // The likely band around it — one sitting is an estimate, not a verdict.
    scaledRange: scaledRange(raw, total),
    scaledApproximate: true,
    shortForm: !!(scaled && scaled.shortForm),
    blueprintItems: scaled ? scaled.blueprintLength : null,
    accuracy: total ? Math.round((raw / total) * 100) : 0,
    byCategory,
    missedCount: missed.length,
    skippedCount: missed.filter((r) => r.skipped).length,
    durationMinutes: session.startedAt && session.completedAt
      ? Math.round((session.completedAt - session.startedAt) / 60000)
      : null,
    locked: true,
  };
}

/**
 * Shared front half of both /complete routes: abandon an expired-while-away
 * session, otherwise apply the submitted answer sheet and grade. Returns
 * { abandoned: true } (response already sent) or { tally, sheetApplied }.
 */
async function finishSession(session, answers, res) {
  // A test that expired while the student was away is not an attempt. The
  // runner used to reach here on resume and score a 3-answer form; the
  // response tells it to offer a fresh test instead. Fully answered sheets
  // still grade (only the Submit click was missed).
  if (session.status === 'in_progress' && shouldAbandonOnExpiry(session)) {
    session.status = 'abandoned';
    session.abandonedReason = 'expired';
    await session.save();
    res.json({
      success: false,
      abandoned: true,
      reason: 'expired',
      answered: answeredCount(session),
      totalItems: session.items.length,
      message: "That test's clock ran out while you were away, so it wasn't scored. Start a fresh one when you're ready.",
    });
    return { abandoned: true };
  }

  // The submitted answer sheet is final (see applyAnswerSheet). Only an
  // in-progress test takes one — a completed test's record does not change.
  let sheetApplied = 0;
  if (session.status === 'in_progress') {
    sheetApplied = applyAnswerSheet(session, answers);
  }

  // ── Final grading pass — the ONE place correctness is decided ──
  // Free navigation means an answer can change right up to submission, so
  // grade the final state here in a single batch. Legacy sessions (graded at
  // submit time) regrade to the identical verdict, so both rails share this.
  const tally = await gradeSession(session);
  await session.save();
  return { tally, sheetApplied };
}

// ── POST /complete ──────────────────────────────────────────
router.post('/complete', async (req, res) => {
  try {
    const { sessionId, answers } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
    if (!session) return;

    const done = await finishSession(session, answers, res);
    if (done.abandoned) return;
    const { raw, total, scaled, byCategory, bySkill } = done.tally;

    const weakSkills = weakSkillsFrom(bySkill);
    // "Great tutor" triage: skip mastered domains, rank the rest by leverage
    // (weakness x ACT exam-weight), and pick a prerequisite-aware starting module.
    // This is the plan the course opening + module ordering consume.
    const plan = buildActPlan(byCategory);
    const { plannedSkills, actPrepSessionId } = await applyCompletionEffects(req, session, { bySkill, weakSkills, plan });

    return res.json({
      success: true,
      // The student's ACT course session, when they are enrolled: "Review with
      // my tutor" opens THAT chat, where the review queue this test just
      // seeded is waiting. Dropping it sent the button to the open tutoring
      // chat, which knew nothing of the misses (external audit, 2026-10-07).
      actPrepSessionId: actPrepSessionId || null,
      report: buildFullReport(session, { raw, total, scaled, byCategory, weakSkills, plan }, {
        plannedSkills,
        sheetApplied: done.sheetApplied,   // answers the submitted sheet corrected on the server
      }),
    });
  } catch (err) {
    console.error('[actTest] complete error:', err.message);
    return res.status(500).json({ message: 'Could not score the practice test.' });
  }
});

// ── POST /claim ─────────────────────────────────────────────
// The other half of the public test's hook: a visitor took the test with no
// account, saw their score, and signed up (or logged in) to see what they
// missed. The runner on chat.html sends the guest token it kept in
// localStorage; this attaches that finished test to the account and returns
// the FULL report.
//
// Treated as the student's own completed attempt from here on: it joins their
// history and trend line, its items join the seen-ledger (so their next test
// never repeats a question they already saw), and the same completion effects
// as a signed-in /complete run — skill credit, tutor-plan seeding, and the
// bootcamp review queue if they are already in ACT prep.
//
// The attach is ONE conditional update keyed on the token hash and a null
// userId, so two tabs claiming at once cannot both win, and a token cannot be
// replayed onto a second account once claimed. Re-claiming your own test is a
// harmless no-op that returns the report again.
router.post('/claim', async (req, res) => {
  try {
    const { sessionId, guestToken } = req.body || {};
    if (!sessionId || !mongoose.isValidObjectId(sessionId) || !guestToken) {
      return res.status(400).json({ message: 'sessionId and guestToken are required.' });
    }
    const userId = req.user._id;
    const tokenHash = hashGuestToken(guestToken);

    // The conditional update IS the claim: only one request can match a
    // document that still carries this token hash and no owner.
    const upd = await ActTestSession.updateOne(
      { _id: sessionId, guestTokenHash: tokenHash, userId: null, status: 'completed' },
      { $set: { userId, claimedAt: new Date() }, $unset: { guestTokenHash: 1, guestExpiresAt: 1 } }
    );
    const firstClaim = upd.modifiedCount === 1;
    // Either we just claimed it, or this same account already had (a second
    // tab, a reload) — a no-op that returns the report again.
    const session = await ActTestSession.findOne({ _id: sessionId, userId, claimedAt: { $ne: null } });
    if (!session) {
      // Not completed yet, expired by TTL, someone else's, or a bad token.
      // One answer for all of them — the browser should forget the claim.
      return res.status(404).json({ message: 'That practice test is no longer available to claim.', gone: true });
    }

    const { raw, total, scaled, byCategory, bySkill } = tallyResponses(session);
    const weakSkills = weakSkillsFrom(bySkill);
    const plan = buildActPlan(byCategory);
    let effects = { plannedSkills: 0, actPrepSessionId: null };
    if (firstClaim) {
      effects = await applyCompletionEffects(req, session, { bySkill, weakSkills, plan });
      recordConversionEvent('act_guest_claimed', {
        userId,
        sessionKey: String(session._id),
        context: { scaledScore: session.scaledScore, totalItems: total },
      });
    } else {
      const cs = await CourseSession.findOne({ userId, courseId: 'act-prep', status: 'active' }).select('_id').lean();
      effects.actPrepSessionId = cs ? String(cs._id) : null;
    }

    return res.json({
      success: true,
      claimed: firstClaim,
      sessionId: String(session._id),
      actPrepSessionId: effects.actPrepSessionId,
      report: buildFullReport(session, { raw, total, scaled, byCategory, weakSkills, plan }, {
        plannedSkills: effects.plannedSkills,
      }),
    });
  } catch (err) {
    console.error('[actTest] claim error:', err.message);
    return res.status(500).json({ message: 'Could not load your practice test.' });
  }
});

// Questions this browser's earlier guest tests already showed. `previous` is
// [{ sessionId, token }] from the browser; at most GUEST_HISTORY_MAX are read,
// and only entries whose token matches an unclaimed guest session count.
const GUEST_HISTORY_MAX = 5;
async function guestSeenProblemIds(previous) {
  if (!Array.isArray(previous) || !previous.length) return [];
  const entries = previous
    .filter((p) => p && typeof p === 'object' && mongoose.isValidObjectId(p.sessionId) && typeof p.token === 'string')
    .slice(0, GUEST_HISTORY_MAX);
  if (!entries.length) return [];
  try {
    const docs = await ActTestSession.find({ _id: { $in: entries.map((e) => e.sessionId) }, userId: null })
      .select('+guestTokenHash items.problemId').lean();
    const seen = new Set();
    for (const d of docs) {
      const e = entries.find((x) => String(x.sessionId) === String(d._id));
      if (!e || !guestTokenMatches(e.token, d.guestTokenHash)) continue;
      (d.items || []).forEach((it) => it && it.problemId && seen.add(it.problemId));
    }
    return [...seen];
  } catch (err) {
    console.error('[actTest] guest history lookup failed (non-fatal, no exclusion):', err.message);
    return [];
  }
}

// ── Guest rail: POST /start ─────────────────────────────────
// Resume the caller's in-progress guest test (sessionId + its token) or
// assemble a fresh one. No seen-ledger — a guest has no history to exclude —
// and no burn: the items join a seen-ledger only if the test is claimed.
guestRouter.post('/start', async (req, res) => {
  try {
    const { sessionId, restart, previous } = req.body || {};
    const token = req.actOwner.guestToken;

    if (!restart && sessionId && token && mongoose.isValidObjectId(sessionId)) {
      const active = await ActTestSession.findById(sessionId).select('+guestTokenHash');
      if (active && !active.userId && active.status === 'in_progress' && active.items.length > 0
        && guestTokenMatches(token, active.guestTokenHash)) {
        // Same rules as the signed-in resume (see /start above): an expired
        // partial sheet is abandoned, an expired full sheet is graded, and a
        // live test resumes on the clock it started with.
        if (shouldAbandonOnExpiry(active)) {
          active.status = 'abandoned';
          active.abandonedReason = 'expired';
          await active.save();
        } else if (overdueMs(active) <= DEADLINE_GRACE_MS) {
          return res.json({
            sessionId: active._id,
            resumed: true,
            totalItems: active.items.length,
            answered: active.responses.length,
            timeLimitMinutes: active.timeLimitMinutes,
            remainingSeconds: secondsRemaining(active),
          });
        }
        // Otherwise (expired with a full sheet) fall through to a fresh test;
        // the runner's /complete on the old id still grades it.
      }
    }

    const blueprint = getBlueprint();
    // A guest has no account to keep a seen-ledger on, so the browser sends
    // the tests it took before (id + token, last few). Their questions are
    // excluded, so a retake is fresh — the same promise a signed-in student
    // gets. Each entry must prove ownership with its token; anything else is
    // ignored rather than refused.
    const excludeIds = await guestSeenProblemIds(previous);
    const form = await assembleForm({
      seed: `guest-${crypto.randomBytes(8).toString('hex')}-${Date.now()}`,
      excludeIds,
    });
    if (form.coverage.filled === 0) {
      return res.status(503).json({
        message: 'The ACT practice test is not available right now. Please try again later.',
        coverage: form.coverage,
        needsGeneration: form.gaps.length,
      });
    }

    // 256-bit bearer token. Only its hash is stored; the raw token goes back
    // to this browser once and lives in its localStorage.
    const guestToken = crypto.randomBytes(32).toString('hex');
    const session = await ActTestSession.create({
      testId: blueprint.testId,
      seed: form.meta.seed,
      items: form.items,
      timeLimitMinutes: blueprint.timeLimitMinutes,
      coverage: form.coverage,
      guestTokenHash: hashGuestToken(guestToken),
      guestExpiresAt: new Date(Date.now() + GUEST_TTL_MS),
    });
    recordConversionEvent('act_guest_started', {
      sessionKey: String(session._id),
      context: { totalItems: form.items.length },
    });

    return res.json({
      sessionId: session._id,
      guestToken,
      started: true,
      totalItems: form.items.length,
      timeLimitMinutes: blueprint.timeLimitMinutes,
      remainingSeconds: blueprint.timeLimitMinutes * 60,
      coverage: form.coverage,
    });
  } catch (err) {
    console.error('[actTest] guest start error:', err.message);
    return res.status(500).json({ message: 'Could not start the practice test.' });
  }
});

// ── Guest rail: POST /complete ──────────────────────────────
// Grades exactly like the signed-in rail (same finishSession), but runs no
// account effects — there is no account — and returns the locked report.
// Calling it again on a finished test returns the same locked report.
guestRouter.post('/complete', async (req, res) => {
  try {
    const { sessionId, answers } = req.body || {};
    const session = await loadOwnedSession(sessionId, req.actOwner, res);
    if (!session) return;
    if (session.status === 'abandoned') {
      return res.json({ success: false, abandoned: true, message: 'That test was not scored. Start a fresh one when you are ready.' });
    }
    // Already scored (a double-submit, a reload of the results): report what
    // is on file. Re-grading would restamp completedAt and stretch the time.
    if (session.status === 'completed') {
      return res.json({ success: true, report: buildGuestReport(session, tallyResponses(session)) });
    }

    const done = await finishSession(session, answers, res);
    if (done.abandoned) return;

    recordConversionEvent('act_guest_completed', {
      sessionKey: String(session._id),
      context: { scaledScore: session.scaledScore, totalItems: done.tally.total },
    });
    return res.json({ success: true, report: buildGuestReport(session, done.tally) });
  } catch (err) {
    console.error('[actTest] guest complete error:', err.message);
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
        answered: answeredCount(s),
        // Auto-submitted after expiring while away, with under half the form
        // answered: kept in the list (it happened) but off the trend line.
        incomplete: isIncompleteAttempt(s),
        byCategory,
        bySkill,
      };
    });

    // First → latest, computed HERE so both clients (the runner's progress
    // screen and the bootcamp card) read one answer: same-form attempts only,
    // and no category delta on a handful of items.
    const comparison = buildComparison(attempts);

    return res.json({ count: attempts.length, attempts, comparison });
  } catch (err) {
    console.error('[actTest] history error:', err.message);
    return res.status(500).json({ message: 'Could not load your test history.' });
  }
});

// ── helper: load a session the caller owns ──────────────────
// `owner` is req.actOwner: { userId } on the signed-in rail, { guestToken } on
// the guest rail. A guest can only reach an UNCLAIMED guest session whose token
// hash matches; a signed-in user can only reach sessions with their userId — so
// neither rail can read the other's tests, and a claimed test leaves the guest
// rail for good.
async function loadOwnedSession(sessionId, owner, res) {
  if (!sessionId) { res.status(400).json({ message: 'sessionId is required.' }); return null; }
  if (!mongoose.isValidObjectId(sessionId)) { res.status(404).json({ message: 'Practice-test session not found.' }); return null; }
  owner = owner || {};
  if (owner.guestToken !== undefined) {
    const session = await ActTestSession.findById(sessionId).select('+guestTokenHash');
    // 404 either way: a guest probing ids learns nothing about which exist.
    if (!session || session.userId || !guestTokenMatches(owner.guestToken, session.guestTokenHash)) {
      res.status(404).json({ message: 'Practice-test session not found.' });
      return null;
    }
    return session;
  }
  const session = await ActTestSession.findById(sessionId);
  if (!session) { res.status(404).json({ message: 'Practice-test session not found.' }); return null; }
  if (!owner.userId || String(session.userId) !== String(owner.userId)) { res.status(403).json({ message: 'Not your session.' }); return null; }
  return session;
}

module.exports = router;
module.exports.guestRouter = guestRouter;
module.exports._internals = { hashGuestToken, guestTokenMatches, tallyResponses, buildGuestReport };
