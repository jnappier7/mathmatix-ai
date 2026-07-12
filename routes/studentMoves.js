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

   STATUS: the deterministic verdict path is live. The tutor-reaction
   path (delegating into the shared chat turn so it reuses the SAME
   per-user lock + runPipeline) is gated behind a small chat.js
   extraction — see the integration doc. Until that lands, request
   the verdict alone (default) or ?tutor=true to opt into the
   (not-yet-wired) reaction and get a 501 rather than a silent no-op.
   ============================================================ */

const express = require('express');
const router = express.Router();

const { processStudentMove } = require('../services/workspace/studentMoveService');

// POST /api/student-moves
router.post('/', async (req, res) => {
  try {
    const result = processStudentMove(req.body);

    if (!result.ok) {
      return res.status(result.status).json({ error: 'invalid_student_move', details: result.errors });
    }

    // Opt-in tutor reaction is not wired yet — fail loud, never silent.
    if (req.query.tutor === 'true') {
      return res.status(501).json({
        error: 'tutor_reaction_not_wired',
        message: 'Delegation into the shared chat turn (lock + runPipeline) is pending the chat.js runStudentTurn extraction. See docs/BOARD_STUDENT_MOVES_INTEGRATION.md.',
        verifiedMove: result.verifiedMove,
        normalized: result.normalized,
      });
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
