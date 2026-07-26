/* ============================================================
   ledgerReplay.js — turn a persisted board ledger back into turns.

   The server folds every turn's board commands into
   conversation.boardLedger (utils/pipeline/boardLedger.js):

     { current:   { problemTex, posedAt, steps:[boardCommand] } | null,
       completed: [ { problemTex, steps, solved, completedAt } ] }

   This module converts that ledger into an ordered list of command
   ARRAYS ("turns") that chat-workspace.js feeds through the normal
   render path (P5 adapter → DerivationView.apply). Replaying through
   the live path — rather than poking view internals — reproduces the
   exact board the student last saw: each completed problem renders and
   is then archived to the rail by an explicit `clear` (the same signal
   a live session uses), and the in-progress problem lands in focus
   last, with its scaffold blanks editable again.

   The explicit `clear` between completed problems (instead of relying
   on the next pose to archive) matters for one edge: the same problem
   solved twice back-to-back. Pose-triggered archiving compares tex and
   skips identical math; `clear` archives unconditionally.

   Pure and headless-testable. UMD-lite like the rest of core/.
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) {
    (root.LWS = root.LWS || {}).ledgerToTurns = mod.ledgerToTurns;
    root.LWS.ledgerMeta = mod.ledgerMeta;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function problemTurn(entry) {
    if (!entry || !entry.problemTex) return null;
    var steps = Array.isArray(entry.steps) ? entry.steps : [];
    return [{ action: 'pose', tex: entry.problemTex }].concat(steps);
  }

  // The completed entries that will actually replay — ledgerToTurns and
  // ledgerMeta MUST filter identically, or the metadata (assistance level
  // etc.) zips onto the wrong rail thumbnails after hydration.
  function replayableCompleted(ledger) {
    if (!ledger || typeof ledger !== 'object') return [];
    return (Array.isArray(ledger.completed) ? ledger.completed : [])
      .filter(function (entry) { return !!problemTurn(entry); });
  }

  function ledgerToTurns(ledger) {
    var turns = [];

    replayableCompleted(ledger).forEach(function (entry) {
      turns.push(problemTurn(entry));
      turns.push([{ action: 'clear' }]);   // park it on the rail
    });

    var cur = ledger && typeof ledger === 'object' ? problemTurn(ledger.current) : null;
    if (cur) turns.push(cur);              // back in focus, still open

    return turns;
  }

  // Per-problem metadata the replayed COMMANDS can't carry (recorded by the
  // server per turn, not per card): the §12 assistance level, plus solved /
  // completedAt. Ordered oldest-first, aligned 1:1 with the rail entries the
  // replay produces — DerivationView.annotateArchive zips them together.
  function ledgerMeta(ledger) {
    return replayableCompleted(ledger).map(function (entry) {
      return {
        assistance: entry.assistance || null,
        solved: !!entry.solved,
        completedAt: entry.completedAt || null,
        sourceRef: entry.sourceRef || null,
      };
    });
  }

  return { ledgerToTurns: ledgerToTurns, ledgerMeta: ledgerMeta };
});
