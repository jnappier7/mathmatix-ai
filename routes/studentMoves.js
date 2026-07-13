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
const { runStudentTurn } = require('./chat');

// POST /api/student-moves
router.post('/', async (req, res) => {
  try {
    const result = processStudentMove(req.body);

    if (!result.ok) {
      return res.status(result.status).json({ error: 'invalid_student_move', details: result.errors });
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
