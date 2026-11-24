'use strict';
/* ============================================================
   routes/studentMoves.js — POST /api/student-moves

   Accepts a gesture-derived StudentMove, VERIFIES it server-side
   (authoritative), and returns a VerifiedMove. See the spec
   (docs/BOARD_LIVING_WORKSPACE_SPEC.md §3.4) and the integration
   plan (docs/BOARD_STUDENT_MOVES_INTEGRATION.md).

   Registration (config/routes.js — mirror /api/chat but student-only):
     const studentMovesRoutes = require('../routes/studentMoves');
     app.use('/api/student-moves', isAuthenticated, isStudent,
             aiEndpointLimiter, usageGate, studentMovesRoutes);

   STATUS: both paths are live.
     • default            → returns the server-authoritative VerifiedMove alone.
     • ?tutor=true        → ALSO runs the tutor reaction by delegating the
                            normalized stated step into the shared chat turn
                            (runStudentTurn), so it reuses the SAME per-user
                            lock + runPipeline as a typed message. The tile
                            verdict rides back in the same response.
   ============================================================ */

const express = require('express');
const router = express.Router();

const { processStudentMove } = require('../services/workspace/studentMoveService');
const { runStudentTurn, acquireUserLock } = require('./chat');
const Conversation = require('../models/conversation');
const { isWorkBoardEnabled } = require('../utils/featureFlags');
const { recordStudentMat } = require('../utils/workspace/tileMatState');
const { recordInteractiveEvidence } = require('../utils/workspace/interactiveEvidence');

// POST /api/student-moves/tiles — "make the tutor see" (2026-11-24).
//
// The tile mat reports what the student has done to it: the tile COUNTS on each
// side and the kinds of move that got there. utils/workspace/tileMatState.js
// turns that into the line the mat shows and stores it on the tiles card in the
// board ledger, where the tutor's per-turn board block reads it and a reload
// restores it. No tutor turn runs here and nothing is graded — the tutor sees
// it on the student's next message (or at once, when the mat's "Show my tutor"
// button sends one).
//
// It takes the SAME per-user lock as a chat turn: a turn rewrites the whole
// ledger from the copy it loaded, so an unlocked write here could be lost under
// it (or lose the turn's cards).
router.post('/tiles', async (req, res) => {
  if (!isWorkBoardEnabled()) return res.status(404).json({ error: 'not_found' });
  const convoId = req.user && req.user.activeConversationId;
  if (!convoId) return res.status(409).json({ error: 'no_conversation' });
  let release = null;
  try {
    release = await acquireUserLock(req.user._id);
    const conversation = await Conversation.findOne({ _id: convoId, userId: req.user._id }).select('boardLedger');
    if (!conversation || !conversation.boardLedger) return res.status(409).json({ error: 'no_board' });
    const result = recordStudentMat(conversation.boardLedger, req.body || {});
    if (!result.ok) {
      const status = result.reason === 'bad_sides' ? 400 : 409;
      return res.status(status).json({ error: result.reason });
    }
    conversation.markModified('boardLedger');
    await conversation.save();
    return res.status(200).json({ ok: true, tex: result.now.tex, same: result.now.same });
  } catch (err) {
    return res.status(500).json({ error: 'tiles_report_failed' });
  } finally {
    if (release) release();
  }
});

// POST /api/student-moves
router.post('/', async (req, res) => {
  try {
    const result = processStudentMove(req.body);

    if (!result.ok) {
      return res.status(result.status).json({ error: 'invalid_student_move', details: result.errors });
    }

    // Verified-meaningful model exploration → transfer-pillar evidence
    // (spec §6.9). Fire-and-forget: evidence must never block or fail a move.
    if (result.modelEvidence && req.user) {
      recordInteractiveEvidence(req.user._id, result.modelEvidence.context)
        .catch((err) => console.error('[StudentMoves] interactive evidence failed (non-fatal):', err.message));
    }

    // Opt-in tutor reaction: delegate into the SHARED chat turn.
    // Only moves that carry a mathematical claim (mode: 'attempt', which is
    // the only path that yields a normalized stated step) get a tutor
    // reaction. reposition / exploration return normalized: null — they carry
    // NO claim, so there is nothing to grade and, crucially, nothing that
    // could leak an answer. Those fall through to the verdict-only response,
    // which is how the anti-leak gate stays structurally closed on
    // exploration: the pipeline (and its answer-injection site) never runs.
    if (req.query.tutor === 'true' && result.normalized && result.normalized.pipelineMessage) {
      // Rewrite the request as the canonical stated step and hand it to the
      // extracted chat handler. It acquires acquireUserLock, builds the ctx,
      // runs runPipeline, and writes the response — we NEVER hand-inject the
      // correctAnswer; the move simply classifies as an ANSWER_ATTEMPT so the
      // tutor reacts to the student's own step (see the integration doc).
      req.body = { ...req.body, message: result.normalized.pipelineMessage };
      // Surfaced back into the chat response so the client gets BOTH the
      // authoritative tile verdict and the tutor's reaction in one round-trip.
      req.studentMove = { verifiedMove: result.verifiedMove, normalized: result.normalized };
      return runStudentTurn(req, res);
    }

    return res.status(200).json({
      verifiedMove: result.verifiedMove,
      normalized: result.normalized,
    });
  } catch (err) {
    // never leak internals; log server-side via the app's error tracking
    return res.status(500).json({ error: 'student_move_failed' });
  }
});

module.exports = router;
