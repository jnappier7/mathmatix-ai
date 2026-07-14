/* ============================================================
   studentMoveClient.js — P7: close the loop.

   The proof of the product concept (spec §4, P7):
     student manipulates tiles → server understands → tutor reacts,
   with a TWO-LAYER response (spec §3.4):
     Layer 1 (instant): render the student's INTENDED result optimistically,
       marked provisional (dashed "?") so the board never asserts unverified
       math as fact.
     Layer 2 (authoritative): POST the move to /api/student-moves; the server
       (workspaceStateService + algebraTileVerifier) is the authority. On a
       committed verdict → commit (drop the "?", reconcile to the server's
       resulting state). On a non-commit (misconception / invalid) → snap
       back to the previous state; the tutor's coaching arrives in the same
       round-trip (?tutor=true).

   The client PROPOSES; the server DISPOSES. Note operation carries only
   `tileRefs` (ids) — the server rebuilds operands from ITS OWN snapshot, so
   a forged operand value can't change the verdict.

   UMD-lite: require() in jest, window.LWS.StudentMoveClient in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).StudentMoveClient = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cloneTiles(tiles) {
    return (tiles || []).map(function (t) { return { id: t.id, coefficient: t.coefficient, variable: t.variable }; });
  }

  // Compute the student's INTENDED result for the optimistic layer. Mirrors
  // only what the tile element can emit (combine / zero-pair / reposition) —
  // it is NOT the authority (the server verifier is); it just shows intent.
  function applyOptimistic(tiles, op) {
    var list = cloneTiles(tiles);
    if (!op || !Array.isArray(op.tileRefs)) return list;
    var a = op.tileRefs[0], b = op.tileRefs[1];
    if (op.type === 'combine_like_terms') {
      var ta = list.find(function (t) { return t.id === a; });
      var tb = list.find(function (t) { return t.id === b; });
      if (!ta || !tb) return list;
      var sum = ta.coefficient + tb.coefficient;
      var out = list
        .filter(function (t) { return t.id !== b; })
        .map(function (t) { return t.id === a ? { id: a, coefficient: sum, variable: ta.variable } : t; });
      return out.filter(function (t) { return t.coefficient !== 0; }); // a true zero drops out
    }
    if (op.type === 'remove_zero_pair') {
      return list.filter(function (t) { return t.id !== a && t.id !== b; });
    }
    return list; // move_group / anything else → no math change
  }

  var seq = 0;
  function rand() { try { return Math.random().toString(36).slice(2); } catch (_) { return String(++seq); } }
  function uid(prefix) { return prefix + '-' + rand() + '-' + (++seq); }
  function nowIso() { try { return new Date().toISOString(); } catch (_) { return null; } }

  // Build a schema-valid StudentMove (fills the client-declared fields; never
  // the serverOnly verdict fields).
  function buildMove(p) {
    var op = p.operation || {};
    var isReposition = op.type === 'move_group';
    var t = p.now || nowIso();
    var prev = p.previousTiles || [];
    return {
      schemaVersion: 1,
      moveId: p.moveId || uid('mv'),
      conversationId: p.conversationId,
      workspaceId: p.workspaceId,
      elementId: p.elementId,
      elementType: p.elementType || 'algebra_tiles',
      source: p.source || 'gesture',
      intent: op.type,
      mode: isReposition ? 'reposition' : 'attempt',
      previousState: { tiles: cloneTiles(prev) },
      proposedState: { tiles: p.proposedTiles || applyOptimistic(prev, op) },
      operation: { type: op.type, tileRefs: op.tileRefs || [] },
      interaction: {
        gestureType: p.gestureType || (p.source === 'keyboard' ? 'tap' : 'drop'),
        pointerType: p.pointerType || (p.source === 'keyboard' ? 'keyboard' : 'mouse'),
        startedAt: p.startedAt || t,
        completedAt: t,
      },
      clientSequence: p.clientSequence != null ? p.clientSequence : (++seq),
      idempotencyKey: p.idempotencyKey || uid('idem'),
    };
  }

  // POST the move. `opts.fetch` is injectable (window.csrfFetch in chat, a
  // stub in tests). ?tutor=true also runs the tutor reaction in one trip.
  function sendMove(p, opts) {
    opts = opts || {};
    var doFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return Promise.reject(new Error('no fetch available'));
    var move = buildMove(p);
    var url = '/api/student-moves' + (opts.withTutor === false ? '' : '?tutor=true');
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return Promise.resolve(doFetch(url, {
      method: 'POST', headers: headers, credentials: 'include', body: JSON.stringify(move),
    })).then(function (res) {
      return Promise.resolve(res.json ? res.json() : null).catch(function () { return null; }).then(function (data) {
        return { ok: !!res.ok, status: res.status, move: move, verifiedMove: data && data.verifiedMove, response: data };
      });
    });
  }

  // The full two-layer loop against a mounted shell.
  //   cfg: { shell, element, operation, ctx, source, fetch, headers, onReaction }
  function runTileMove(cfg) {
    var shell = cfg.shell, element = cfg.element, op = cfg.operation;
    var prevTiles = cloneTiles(element.semantic && element.semantic.tiles);
    var proposed = applyOptimistic(prevTiles, op);

    // Layer 1 — optimistic provisional render.
    shell.updateElement(element.id, { semantic: { tiles: proposed, selection: [] }, provisional: true });

    function revert() { shell.updateElement(element.id, { semantic: { tiles: prevTiles, selection: [] }, provisional: false }); }

    return sendMove(
      Object.assign({}, cfg.ctx, {
        elementId: element.id, elementType: 'algebra_tiles',
        previousTiles: prevTiles, proposedTiles: proposed, operation: op, source: cfg.source,
      }),
      { fetch: cfg.fetch, headers: cfg.headers }
    ).then(function (result) {
      var vm = result.verifiedMove;
      if (vm && vm.committed) {
        var finalTiles = (vm.resultingState && vm.resultingState.tiles) || proposed;
        // Layer 2 — commit: reconcile to the server's authoritative state.
        shell.updateElement(element.id, { semantic: { tiles: finalTiles, selection: [] }, provisional: false });
      } else {
        revert(); // misconception / invalid_interaction → snap back
      }
      if (cfg.onReaction && result.response && result.response.text) cfg.onReaction(result.response.text, vm);
      return result;
    }).catch(function (err) {
      revert(); // network failure → the surface stays truthful
      return { error: err && err.message };
    });
  }

  return { applyOptimistic, buildMove, sendMove, runTileMove };
});
